import 'dart:convert';
import 'dart:typed_data';

import 'package:cbor/cbor.dart';
import 'package:crypto/crypto.dart';
import 'package:uuid/uuid.dart';

import '../../data/local/enums.dart';
import '../../features/identity/domain/identity_profile.dart';
import '../../features/incident/domain/incident.dart';
import '../result/result.dart';
import 'bundle_cipher.dart';
import 'bundle_models.dart';
import 'bundle_signer.dart';

/// Codifica y decodifica bundles canónicos con CBOR.
///
/// Responsabilidades:
/// - Genera `messageId` únicos.
/// - Deriva `messageType`, `priority` y `expiresAt` a partir del incidente.
/// - Cifra el payload con [AesGcmBundleCipher].
/// - Firma la cabecera protegida + hash del payload con [BundleSigner].
/// - Codifica/decodifica a CBOR en orden canónico determinista.
/// - Rechaza versiones desconocidas, bundles truncados o con hash inválido.
class BundleCodec {
  BundleCodec({
    required AesGcmBundleCipher cipher,
    required BundleSigner signer,
    required String destination,
    this.defaultHopLimit = 8,
    this.defaultCopyBudget = 3,
    this.defaultTtlSeconds = 86400,
    this.maxPayloadBytes = 65536,
  })  : _cipher = cipher,
        _signer = signer,
        _destination = destination;

  final AesGcmBundleCipher _cipher;
  final BundleSigner _signer;
  final String _destination;
  final int defaultHopLimit;
  final int defaultCopyBudget;
  final int defaultTtlSeconds;
  final int maxPayloadBytes;

  static const int protocolVersion = 2;

  /// Crea un bundle desde un incidente y su perfil de identidad.
  Future<Result<Bundle>> createBundle(
    UserIncident incident,
    UserIdentityProfile profile, {
    String? keyId,
    EventType eventType = EventType.created,
    int? hopLimit,
    String? replacesMessageId,
    List<BundleAttachmentManifestEntry> attachmentManifest = const [],
    String? stellarPubkey,
  }) async {
    final effectiveKeyId = keyId ?? _destination;
    final messageId = const Uuid().v4();
    final incidentId = incident.id;

    final payload = BundlePayload(
      categoryIndex: incident.category.index,
      priorityIndex: incident.priority.index,
      peopleCount: incident.peopleCount,
      shortNote: incident.shortNote,
      latitude: incident.latitude,
      longitude: incident.longitude,
      accuracyMeters: incident.accuracyMeters,
      locationSourceIndex: incident.locationSource.index,
      identityAssuranceIndex: incident.identityAssurance.index,
      attachmentManifest: attachmentManifest,
      replacesMessageId: replacesMessageId,
      stellarPubkey: stellarPubkey,
    );

    final payloadJson = jsonEncode(payload.toJson());
    final payloadBytes = Uint8List.fromList(utf8.encode(payloadJson));

    if (payloadBytes.length > maxPayloadBytes) {
      return const Failure(
        VacaError(
          code: 'bundle_oversized',
          message: 'Payload excede el límite de bytes.',
        ),
      );
    }

    final sealed = await _cipher.seal(payloadBytes, effectiveKeyId);
    if (sealed.isFailure) {
      return Failure((sealed as Failure<BundleSealedPayload>).error);
    }
    final sealedValue = sealed.valueOrNull!;

    final payloadHash = Uint8List.fromList(sha256.convert(payloadBytes).bytes);
    final createdAt = incident.createdAt;
    final expiresAt = createdAt.add(Duration(seconds: defaultTtlSeconds));

    final bundleEventType = _mapEventType(eventType);
    final messageType = _mapMessageType(incident.category);
    final priority = _mapPriority(incident.priority);

    final originCredentialRef = Uint8List.fromList(
      utf8.encode(profile.opaqueSubjectId ?? 'unverified'),
    );

    final header = BundleHeader(
      protocolVersion: protocolVersion,
      messageId: messageId,
      incidentId: incidentId,
      eventType: bundleEventType,
      originCredentialRef: originCredentialRef,
      destination: _destination,
      messageType: messageType,
      priority: priority,
      createdAt: createdAt,
      expiresAt: expiresAt,
      hopLimit: hopLimit ?? defaultHopLimit,
      payloadLength: sealedValue.ciphertext.length,
      payloadHash: payloadHash,
      fragmentIndex: 0,
      fragmentCount: 1,
      keyId: effectiveKeyId,
      nonce: sealedValue.nonce,
      wrapNonce: sealedValue.wrapNonce,
      ephemeralPublicKey: sealedValue.ephemeralPublicKey,
      signature: Uint8List(0),
    );

    final signature = await _signHeader(header, payloadHash);
    if (signature.isFailure) {
      return Failure((signature as Failure<Uint8List>).error);
    }

    final signedHeader = header.copyWith(signature: signature.valueOrNull!);

    return Success(
      Bundle(
        header: signedHeader,
        ciphertext: sealedValue.ciphertext,
        wrappedKey: sealedValue.wrappedKey,
      ),
    );
  }

  /// Decodifica un bundle desde CBOR y verifica firma + integridad.
  ///
  /// Si [verifySignature] es true (default) requiere la clave pública del
  /// origin. Si es false, sólo verifica hash y estructura.
  Future<Result<Bundle>> decodeBundle(
    Uint8List bytes, {
    bool verifySignature = true,
    Uint8List? originPublicKey,
  }) async {
    try {
      final decoded = cborDecode(bytes);
      final map = decoded.toObject() as Map<dynamic, dynamic>;

      final version = map['v'] as int? ?? map['protocolVersion'] as int? ?? -1;
      if (version != protocolVersion) {
        return Failure(
          VacaError(
            code: 'bundle_version',
            message: 'Versión de bundle no soportada: $version',
          ),
        );
      }

      final headerMap = map['h'] as Map<dynamic, dynamic>?;
      if (headerMap == null) {
        return const Failure(
          VacaError(code: 'bundle_header_missing', message: 'Falta cabecera.'),
        );
      }

      final ciphertextList = map['c'];
      final wrappedKeyList = map['w'];
      if (ciphertextList == null || wrappedKeyList == null) {
        return const Failure(
          VacaError(
            code: 'bundle_body_missing',
            message: 'Faltan ciphertext o wrapped key.',
          ),
        );
      }

      final header = _headerFromMap(headerMap);
      final ciphertext =
          Uint8List.fromList(List<int>.from(ciphertextList as List));
      final wrappedKey =
          Uint8List.fromList(List<int>.from(wrappedKeyList as List));

      if (ciphertext.length != header.payloadLength) {
        return const Failure(
          VacaError(
            code: 'bundle_length_mismatch',
            message: 'Longitud de payload no coincide.',
          ),
        );
      }

      if (verifySignature) {
        if (originPublicKey == null || originPublicKey.isEmpty) {
          return const Failure(
            VacaError(
              code: 'bundle_public_key_missing',
              message: 'Se requiere clave pública para verificar firma.',
            ),
          );
        }
        final protected = encodeProtectedHeader(header);
        final signedMessage =
            _buildSignedMessage(protected, header.payloadHash);
        final verify = await _signer.verify(
          signedMessage,
          header.signature,
          originPublicKey,
        );
        if (verify.isFailure) {
          return Failure((verify as Failure<bool>).error);
        }
        if (!verify.valueOrNull!) {
          return const Failure(
            VacaError(
              code: 'bundle_signature_invalid',
              message: 'Firma del bundle inválida.',
            ),
          );
        }
      }

      final payloadRead = await _cipher.unseal(
        ciphertext,
        wrappedKey,
        header.nonce,
        header.wrapNonce,
        header.ephemeralPublicKey,
        header.keyId,
      );
      if (payloadRead.isFailure) {
        return Failure((payloadRead as Failure<Uint8List>).error);
      }
      final payloadBytes = payloadRead.valueOrNull!;
      final computedHash =
          Uint8List.fromList(sha256.convert(payloadBytes).bytes);
      if (!_constantTimeEquals(computedHash, header.payloadHash)) {
        return const Failure(
          VacaError(
            code: 'bundle_payload_hash_invalid',
            message: 'Hash del payload no coincide.',
          ),
        );
      }

      return Success(
        Bundle(
          header: header,
          ciphertext: ciphertext,
          wrappedKey: wrappedKey,
        ),
      );
    } catch (e) {
      return Failure(
        VacaError(
          code: 'bundle_decode',
          message: 'No se pudo decodificar el bundle.',
          cause: e,
        ),
      );
    }
  }

  /// Codifica un bundle a CBOR canónico.
  Future<Result<Uint8List>> encodeBundle(Bundle bundle) async {
    try {
      final headerMap = _headerToCborMap(bundle.header);
      final value = CborMap.fromIterables(
        [
          CborString('v'),
          CborString('h'),
          CborString('c'),
          CborString('w'),
        ],
        [
          CborSmallInt(bundle.header.protocolVersion),
          headerMap,
          CborBytes(bundle.ciphertext),
          CborBytes(bundle.wrappedKey),
        ],
      );
      return Success(Uint8List.fromList(cborEncode(value)));
    } catch (e) {
      return Failure(
        VacaError(
          code: 'bundle_encode',
          message: 'No se pudo codificar el bundle.',
          cause: e,
        ),
      );
    }
  }

  Future<Result<BundlePayload>> decryptPayload(Bundle bundle) async {
    final payloadRead = await _cipher.unseal(
      bundle.ciphertext,
      bundle.wrappedKey,
      bundle.header.nonce,
      bundle.header.wrapNonce,
      bundle.header.ephemeralPublicKey,
      bundle.header.keyId,
    );
    if (payloadRead.isFailure) {
      return Failure((payloadRead as Failure<Uint8List>).error);
    }
    try {
      final payloadJson = utf8.decode(payloadRead.valueOrNull!);
      final payloadMap = jsonDecode(payloadJson) as Map<String, dynamic>;
      return Success(BundlePayload.fromJson(payloadMap));
    } catch (e) {
      return Failure(
        VacaError(
          code: 'bundle_payload_decode',
          message: 'No se pudo decodificar el payload.',
          cause: e,
        ),
      );
    }
  }

  Future<Result<Uint8List>> _signHeader(
    BundleHeader header,
    Uint8List payloadHash,
  ) async {
    final protected = encodeProtectedHeader(header);
    final signedMessage = _buildSignedMessage(protected, payloadHash);
    return _signer.sign(signedMessage);
  }

  Uint8List _buildSignedMessage(
    Uint8List protectedCbor,
    Uint8List payloadHash,
  ) {
    final combined = Uint8List(protectedCbor.length + payloadHash.length);
    combined.setAll(0, protectedCbor);
    combined.setAll(protectedCbor.length, payloadHash);
    return combined;
  }

  /// Codifica los campos protegidos de la cabecera en CBOR canónico.
  ///
  /// Excluye la firma para evitar circularidad al verificar.
  Uint8List encodeProtectedHeader(BundleHeader header) {
    final map = _protectedHeaderToCborMap(header);
    return Uint8List.fromList(cborEncode(map));
  }

  CborMap _headerToCborMap(BundleHeader header) {
    final map = _protectedHeaderToCborMap(header);
    map[CborString('s')] = CborBytes(header.signature);
    return map;
  }

  CborMap _protectedHeaderToCborMap(BundleHeader header) {
    return CborMap({
      CborString('v'): CborSmallInt(header.protocolVersion),
      CborString('m'): CborString(header.messageId),
      CborString('i'): CborString(header.incidentId),
      CborString('e'): CborSmallInt(header.eventType.index),
      CborString('o'): CborBytes(header.originCredentialRef),
      CborString('d'): CborString(header.destination),
      CborString('t'): CborSmallInt(header.messageType.index),
      CborString('p'): CborSmallInt(header.priority),
      CborString('c'): CborSmallInt(header.createdAt.millisecondsSinceEpoch),
      CborString('x'): CborSmallInt(header.expiresAt.millisecondsSinceEpoch),
      CborString('h'): CborSmallInt(header.hopLimit),
      CborString('l'): CborSmallInt(header.payloadLength),
      CborString('H'): CborBytes(header.payloadHash),
      CborString('f'): CborSmallInt(header.fragmentIndex),
      CborString('F'): CborSmallInt(header.fragmentCount),
      CborString('k'): CborString(header.keyId),
      CborString('n'): CborBytes(header.nonce),
      CborString('N'): CborBytes(header.wrapNonce),
      CborString('K'): CborBytes(header.ephemeralPublicKey),
    });
  }

  BundleHeader _headerFromMap(Map<dynamic, dynamic> map) {
    final int protocolVersion = _readInt(map, 'v', 'protocolVersion')!;
    final messageId = _readString(map, 'm', 'messageId')!;
    final incidentId = _readString(map, 'i', 'incidentId')!;
    final eventTypeIndex = _readInt(map, 'e', 'eventType')!;
    final originCredentialRef = _readBytes(map, 'o', 'originCredentialRef')!;
    final destination = _readString(map, 'd', 'destination')!;
    final messageTypeIndex = _readInt(map, 't', 'messageType')!;
    final priority = _readInt(map, 'p', 'priority')!;
    final createdAt = _readDate(map, 'c', 'createdAt')!;
    final expiresAt = _readDate(map, 'x', 'expiresAt')!;
    final hopLimit = _readInt(map, 'h', 'hopLimit')!;
    final payloadLength = _readInt(map, 'l', 'payloadLength')!;
    final payloadHash = _readBytes(map, 'H', 'payloadHash')!;
    final fragmentIndex = _readInt(map, 'f', 'fragmentIndex')!;
    final fragmentCount = _readInt(map, 'F', 'fragmentCount')!;
    final keyId = _readString(map, 'k', 'keyId')!;
    final nonce = _readBytes(map, 'n', 'nonce')!;
    final wrapNonce = _readBytes(map, 'N', 'wrapNonce')!;
    final ephemeralPublicKey = _readBytes(map, 'K', 'ephemeralPublicKey')!;
    final signature = _readBytes(map, 's', 'signature')!;

    return BundleHeader(
      protocolVersion: protocolVersion,
      messageId: messageId,
      incidentId: incidentId,
      eventType: BundleEventType.values[eventTypeIndex],
      originCredentialRef: originCredentialRef,
      destination: destination,
      messageType: BundleMessageType.values[messageTypeIndex],
      priority: priority,
      createdAt: createdAt,
      expiresAt: expiresAt,
      hopLimit: hopLimit,
      payloadLength: payloadLength,
      payloadHash: payloadHash,
      fragmentIndex: fragmentIndex,
      fragmentCount: fragmentCount,
      keyId: keyId,
      nonce: nonce,
      wrapNonce: wrapNonce,
      ephemeralPublicKey: ephemeralPublicKey,
      signature: signature,
    );
  }

  BundleEventType _mapEventType(EventType eventType) {
    switch (eventType) {
      case EventType.created:
        return BundleEventType.created;
      case EventType.updated:
        return BundleEventType.updated;
      case EventType.cancelled:
        return BundleEventType.cancelled;
      case EventType.receipt:
        return BundleEventType.receipt;
    }
  }

  BundleMessageType _mapMessageType(IncidentCategory category) {
    switch (category) {
      case IncidentCategory.sos:
        return BundleMessageType.sos;
      case IncidentCategory.medical:
        return BundleMessageType.medical;
      case IncidentCategory.person:
        return BundleMessageType.person;
      case IncidentCategory.hazard:
        return BundleMessageType.hazard;
      case IncidentCategory.coordination:
        return BundleMessageType.coordination;
    }
  }

  int _mapPriority(IncidentPriority priority) {
    switch (priority) {
      case IncidentPriority.p0:
      case IncidentPriority.p1:
      case IncidentPriority.p2:
      case IncidentPriority.p3:
      case IncidentPriority.p4:
      case IncidentPriority.p5:
        return priority.index;
    }
  }

  int? _readInt(Map<dynamic, dynamic> map, String short, String long) {
    final value = map[short] ?? map[long];
    if (value == null) return null;
    if (value is int) return value;
    if (value is CborInt) return value.toObject() as int;
    if (value is CborSmallInt) return value.toObject() as int;
    if (value is CborValue) return value.toObject() as int;
    return null;
  }

  String? _readString(Map<dynamic, dynamic> map, String short, String long) {
    final value = map[short] ?? map[long];
    if (value == null) return null;
    if (value is String) return value;
    if (value is CborString) return value.toObject() as String;
    if (value is CborValue) return value.toObject() as String?;
    return null;
  }

  Uint8List? _readBytes(Map<dynamic, dynamic> map, String short, String long) {
    final value = map[short] ?? map[long];
    if (value == null) return null;
    if (value is Uint8List) return value;
    if (value is List<int>) return Uint8List.fromList(value);
    if (value is CborBytes) {
      return Uint8List.fromList(value.toObject() as List<int>);
    }
    if (value is CborValue) {
      final object = value.toObject();
      if (object is List<int>) return Uint8List.fromList(object);
    }
    return null;
  }

  DateTime? _readDate(Map<dynamic, dynamic> map, String short, String long) {
    final value = _readInt(map, short, long);
    if (value == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(value, isUtc: true);
  }

  bool _constantTimeEquals(Uint8List a, Uint8List b) {
    if (a.length != b.length) return false;
    var result = 0;
    for (var i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result == 0;
  }
}
