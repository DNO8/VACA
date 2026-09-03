import 'dart:convert';
import 'dart:typed_data';

import 'package:cbor/cbor.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/bundle/bundle_cipher.dart';
import 'package:vaca_app/core/bundle/bundle_codec.dart';
import 'package:vaca_app/core/bundle/bundle_signer.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/identity_key_source.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:vaca_app/data/local/enums.dart';
import 'package:vaca_app/features/identity/domain/identity_profile.dart';
import 'package:vaca_app/features/incident/domain/incident.dart';

/// SecureStorage en memoria para tests.
class _InMemorySecureStorage implements SecureStorage {
  final _map = <String, String>{};

  @override
  Future<Result<String?>> read(String key) async => Success(_map[key]);

  @override
  Future<Result<void>> write(String key, String value) async {
    _map[key] = value;
    return const Success(null);
  }

  @override
  Future<Result<void>> delete(String key) async {
    _map.remove(key);
    return const Success(null);
  }

  @override
  Future<Result<void>> deleteAll() async {
    _map.clear();
    return const Success(null);
  }
}

void main() {
  late SecureStorage storage;
  late IdentityKeySource keySource;
  late DeviceBundleSigner signer;
  late AesGcmBundleCipher cipher;
  late BundleCodec codec;

  setUp(() {
    storage = _InMemorySecureStorage();
    keySource = IdentityKeySource(storage);
    signer = DeviceBundleSigner(keySource);

    final testKey = Uint8List.fromList(List.filled(32, 0x2a));
    cipher = AesGcmBundleCipher(StaticBundleKeySource(testKey));

    codec = BundleCodec(
      cipher: cipher,
      signer: signer,
      destination: 'vaca:server:v1',
    );
  });

  group('BundleCodec round-trip', () {
    test('encode and decode a created bundle', () async {
      final profile = _profile();
      final incident = _incident();

      final bundleResult = await codec.createBundle(
        incident,
        profile,
      );
      expect(bundleResult.isSuccess, isTrue);
      final bundle = bundleResult.valueOrNull!;

      final encoded = await codec.encodeBundle(bundle);
      expect(encoded.isSuccess, isTrue);

      final pair = await keySource.getOrCreateKeyPair();
      final publicKey = base64Decode(pair.valueOrNull!.publicKey);

      final decoded = await codec.decodeBundle(
        encoded.valueOrNull!,
        originPublicKey: publicKey,
      );
      expect(decoded.isSuccess, isTrue);
      final decodedBundle = decoded.valueOrNull!;

      expect(decodedBundle.header.messageId, bundle.header.messageId);
      expect(decodedBundle.header.incidentId, bundle.header.incidentId);
      expect(decodedBundle.header.priority, bundle.header.priority);

      final payloadResult = await codec.decryptPayload(decodedBundle);
      expect(payloadResult.isSuccess, isTrue);
      final payload = payloadResult.valueOrNull!;

      expect(payload.categoryIndex, incident.category.index);
      expect(payload.priorityIndex, incident.priority.index);
      expect(payload.peopleCount, incident.peopleCount);
      expect(payload.shortNote, incident.shortNote);
      expect(payload.latitude, incident.latitude);
      expect(payload.longitude, incident.longitude);
    });
  });

  group('BundleCodec integrity', () {
    test('detects tampered ciphertext', () async {
      final bundleResult = await codec.createBundle(
        _incident(),
        _profile(),
      );
      final bundle = bundleResult.valueOrNull!;

      final tampered = bundle.copyWith(
        ciphertext: Uint8List.fromList(List.filled(bundle.ciphertext.length, 0)),
      );
      final encoded = await codec.encodeBundle(tampered);

      final pair = await keySource.getOrCreateKeyPair();
      final publicKey = base64Decode(pair.valueOrNull!.publicKey);

      final decoded = await codec.decodeBundle(
        encoded.valueOrNull!,
        originPublicKey: publicKey,
      );
      expect(decoded.isFailure, isTrue);
      expect(
        decoded.errorOrNull?.code,
        anyOf('bundle_payload_hash_invalid', 'bundle_cipher_unseal'),
      );
    });

    test('detects wrong version', () async {
      final bundleResult = await codec.createBundle(
        _incident(),
        _profile(),
      );
      final bundle = bundleResult.valueOrNull!;
      final encoded = await codec.encodeBundle(bundle);

      final decodedValue = cborDecode(encoded.valueOrNull!) as CborMap;
      decodedValue[CborString('v')] = const CborSmallInt(99);
      final forged = Uint8List.fromList(cborEncode(decodedValue));

      final decoded = await codec.decodeBundle(forged);
      expect(decoded.isFailure, isTrue);
      expect(decoded.errorOrNull?.code, 'bundle_version');
    });

    test('deterministic protected header encoding', () async {
      final bundle1 = await codec.createBundle(_incident(), _profile());
      final bundle2 = await codec.createBundle(
        _incident().copyWith(status: IncidentStatus.queued),
        _profile(),
      );

      final bytes1 = await codec.encodeBundle(bundle1.valueOrNull!);
      final bytes2 = await codec.encodeBundle(bundle2.valueOrNull!);

      expect(bytes1.valueOrNull, isNot(bytes2.valueOrNull));
    });
  });

  group('AesGcmBundleCipher', () {
    test('round-trips payload and rejects tampering', () async {
      final key = Uint8List.fromList(List.filled(32, 0xab));
      final localCipher = AesGcmBundleCipher(StaticBundleKeySource(key));
      final payload = Uint8List.fromList(utf8.encode('payload de prueba'));

      final sealed = await localCipher.seal(payload, 'test-key');
      expect(sealed.isSuccess, isTrue);
      final sealedValue = sealed.valueOrNull!;

      final unsealed = await localCipher.unseal(
        sealedValue.ciphertext,
        sealedValue.wrappedKey,
        sealedValue.nonce,
        'test-key',
      );
      expect(unsealed.valueOrNull, payload);

      final tampered = Uint8List.fromList(sealedValue.ciphertext);
      tampered[0] ^= 0xff;
      final tamperedResult = await localCipher.unseal(
        tampered,
        sealedValue.wrappedKey,
        sealedValue.nonce,
        'test-key',
      );
      expect(tamperedResult.isFailure, isTrue);
    });

    test('fails closed with missing key', () async {
      const localCipher2 = AesGcmBundleCipher(FailClosedBundleKeySource());
      final payload = Uint8List.fromList(utf8.encode('payload'));

      final sealed = await localCipher2.seal(payload, 'missing');
      expect(sealed.isFailure, isTrue);
      expect(sealed.errorOrNull?.code, 'bundle_key_missing');
    });
  });

  group('IdentityKeySource', () {
    test('generates real Ed25519 key pair and signs/verifies', () async {
      final pair = await keySource.getOrCreateKeyPair();
      expect(pair.isSuccess, isTrue);

      final publicKey = base64Decode(pair.valueOrNull!.publicKey);
      final message = Uint8List.fromList(utf8.encode('mensaje de prueba'));

      final signature = await keySource.sign(message);
      expect(signature.isSuccess, isTrue);
      expect(signature.valueOrNull!.length, 64);

      final verify = await keySource.verify(message, signature.valueOrNull!);
      expect(verify.valueOrNull, isTrue);

      final signerVerify = await signer.verify(
        message,
        signature.valueOrNull!,
        publicKey,
      );
      expect(signerVerify.valueOrNull, isTrue);

      final tampered = Uint8List.fromList(message);
      tampered[0] ^= 0xff;
      final badVerify = await signer.verify(
        tampered,
        signature.valueOrNull!,
        publicKey,
      );
      expect(badVerify.valueOrNull, isFalse);
    });
  });
}

UserIdentityProfile _profile() => UserIdentityProfile(
      id: 'profile-1',
      identityAssurance: IdentityAssurance.unverified,
      devicePublicKey: 'test-public-key',
      consentVersion: '1.0.0',
      createdAt: _utc,
      updatedAt: _utc,
    );

UserIncident _incident() => UserIncident(
      id: 'incident-1',
      reporterProfileId: 'profile-1',
      category: IncidentCategory.sos,
      priority: IncidentPriority.p0,
      peopleCount: 2,
      shortNote: 'Necesito ayuda medica',
      latitude: -33.45,
      longitude: -70.66,
      accuracyMeters: 12.5,
      locationSource: LocationSource.gps,
      createdAt: _utc,
      updatedAt: _utc,
      status: IncidentStatus.savedLocally,
      identityAssurance: IdentityAssurance.unverified,
    );

final _utc = DateTime.utc(2026, 9, 1, 12, 0, 0);
