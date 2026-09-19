import 'dart:typed_data';

/// Tipo de evento transportado por un bundle.
enum BundleEventType {
  created,
  updated,
  cancelled,
  receipt,
}

/// Tipo lógico de mensaje. Mapea a categoría de incidente.
enum BundleMessageType {
  sos,
  medical,
  person,
  hazard,
  coordination,
  control,
  receipt,
}

/// Payload encriptado de un bundle.
///
/// El payload contiene la información de dominio que sólo el destinatario
/// autorizado puede leer. Nunca viaja en claro por un enlace.
class BundlePayload {
  const BundlePayload({
    required this.categoryIndex,
    required this.priorityIndex,
    this.peopleCount,
    this.shortNote,
    this.latitude,
    this.longitude,
    this.accuracyMeters,
    required this.locationSourceIndex,
    required this.identityAssuranceIndex,
    this.attachmentManifest = const [],
    this.replacesMessageId,
    this.stellarPubkey,
  });

  final int categoryIndex;
  final int priorityIndex;
  final int? peopleCount;
  final String? shortNote;
  final double? latitude;
  final double? longitude;
  final double? accuracyMeters;
  final int locationSourceIndex;
  final int identityAssuranceIndex;
  final List<BundleAttachmentManifestEntry> attachmentManifest;
  final String? replacesMessageId;

  /// Pubkey Stellar testnet del reportante. Viaja dentro del payload
  /// cifrado y autenticado: permite que el servidor cree claimable
  /// balances dirigidos al receptor cuando su señal se promueve a Vaquita.
  final String? stellarPubkey;

  BundlePayload copyWith({
    List<BundleAttachmentManifestEntry>? attachmentManifest,
  }) =>
      BundlePayload(
        categoryIndex: categoryIndex,
        priorityIndex: priorityIndex,
        peopleCount: peopleCount,
        shortNote: shortNote,
        latitude: latitude,
        longitude: longitude,
        accuracyMeters: accuracyMeters,
        locationSourceIndex: locationSourceIndex,
        identityAssuranceIndex: identityAssuranceIndex,
        attachmentManifest: attachmentManifest ?? this.attachmentManifest,
        replacesMessageId: replacesMessageId,
        stellarPubkey: stellarPubkey,
      );

  Map<String, dynamic> toJson() => {
        'categoryIndex': categoryIndex,
        'priorityIndex': priorityIndex,
        'peopleCount': peopleCount,
        'shortNote': shortNote,
        'latitude': latitude,
        'longitude': longitude,
        'accuracyMeters': accuracyMeters,
        'locationSourceIndex': locationSourceIndex,
        'identityAssuranceIndex': identityAssuranceIndex,
        'attachmentManifest':
            attachmentManifest.map((e) => e.toJson()).toList(),
        'replacesMessageId': replacesMessageId,
        'stellarPubkey': stellarPubkey,
      };

  factory BundlePayload.fromJson(Map<String, dynamic> json) => BundlePayload(
        categoryIndex: json['categoryIndex'] as int,
        priorityIndex: json['priorityIndex'] as int,
        peopleCount: json['peopleCount'] as int?,
        shortNote: json['shortNote'] as String?,
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        accuracyMeters: (json['accuracyMeters'] as num?)?.toDouble(),
        locationSourceIndex: json['locationSourceIndex'] as int,
        identityAssuranceIndex: json['identityAssuranceIndex'] as int,
        attachmentManifest: (json['attachmentManifest'] as List<dynamic>?)
                ?.map(
                  (e) => BundleAttachmentManifestEntry.fromJson(
                    e as Map<String, dynamic>,
                  ),
                )
                .toList() ??
            const [],
        replacesMessageId: json['replacesMessageId'] as String?,
        stellarPubkey: json['stellarPubkey'] as String?,
      );
}

/// Entrada del manifesto de adjuntos (sin contenido).
class BundleAttachmentManifestEntry {
  const BundleAttachmentManifestEntry({
    required this.contentHash,
    required this.sizeBytes,
    required this.kindIndex,
  });

  final String contentHash;
  final int sizeBytes;
  final int kindIndex;

  Map<String, dynamic> toJson() => {
        'contentHash': contentHash,
        'sizeBytes': sizeBytes,
        'kindIndex': kindIndex,
      };

  factory BundleAttachmentManifestEntry.fromJson(Map<String, dynamic> json) =>
      BundleAttachmentManifestEntry(
        contentHash: json['contentHash'] as String,
        sizeBytes: json['sizeBytes'] as int,
        kindIndex: json['kindIndex'] as int,
      );
}

/// Cabecera canónica de un bundle.
///
/// Contiene los metadatos visibles en la red (ofuscados o no sensibles) y
/// la firma del origen sobre los campos protegidos más el hash del payload.
class BundleHeader {
  const BundleHeader({
    required this.protocolVersion,
    required this.messageId,
    required this.incidentId,
    required this.eventType,
    required this.originCredentialRef,
    required this.destination,
    required this.messageType,
    required this.priority,
    required this.createdAt,
    required this.expiresAt,
    required this.hopLimit,
    required this.payloadLength,
    required this.payloadHash,
    required this.fragmentIndex,
    required this.fragmentCount,
    required this.keyId,
    required this.nonce,
    required this.wrapNonce,
    required this.ephemeralPublicKey,
    required this.signature,
  });

  final int protocolVersion;
  final String messageId;
  final String incidentId;
  final BundleEventType eventType;
  final Uint8List originCredentialRef;
  final String destination;
  final BundleMessageType messageType;
  final int priority;
  final DateTime createdAt;
  final DateTime expiresAt;
  final int hopLimit;
  final int payloadLength;
  final Uint8List payloadHash;
  final int fragmentIndex;
  final int fragmentCount;
  final String keyId;
  final Uint8List nonce;
  final Uint8List wrapNonce;
  final Uint8List ephemeralPublicKey;
  final Uint8List signature;

  BundleHeader copyWith({
    Uint8List? signature,
  }) =>
      BundleHeader(
        protocolVersion: protocolVersion,
        messageId: messageId,
        incidentId: incidentId,
        eventType: eventType,
        originCredentialRef: originCredentialRef,
        destination: destination,
        messageType: messageType,
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
        signature: signature ?? this.signature,
      );

  /// Campos protegidos que entran en la firma.
  ///
  /// Excluye la firma y fragmentación cuando no aplica.
  Map<String, dynamic> toProtectedFields() => {
        'protocolVersion': protocolVersion,
        'messageId': messageId,
        'incidentId': incidentId,
        'eventType': eventType.index,
        'originCredentialRef': originCredentialRef,
        'destination': destination,
        'messageType': messageType.index,
        'priority': priority,
        'createdAt': createdAt.millisecondsSinceEpoch,
        'expiresAt': expiresAt.millisecondsSinceEpoch,
        'hopLimit': hopLimit,
        'payloadLength': payloadLength,
        'payloadHash': payloadHash,
        'keyId': keyId,
        'nonce': nonce,
        'wrapNonce': wrapNonce,
        'ephemeralPublicKey': ephemeralPublicKey,
      };
}

/// Bundle canónico completo.
class Bundle {
  const Bundle({
    required this.header,
    required this.ciphertext,
    required this.wrappedKey,
  });

  final BundleHeader header;
  final Uint8List ciphertext;
  final Uint8List wrappedKey;

  Bundle copyWith({
    BundleHeader? header,
    Uint8List? ciphertext,
    Uint8List? wrappedKey,
  }) =>
      Bundle(
        header: header ?? this.header,
        ciphertext: ciphertext ?? this.ciphertext,
        wrappedKey: wrappedKey ?? this.wrappedKey,
      );
}

/// Referencia a un bundle para ofrecerlo por un enlace.
class BundleReference {
  const BundleReference({
    required this.messageId,
    required this.payloadHash,
    required this.priority,
    required this.expiresAt,
    required this.fragmentCount,
  });

  final String messageId;
  final Uint8List payloadHash;
  final int priority;
  final DateTime expiresAt;
  final int fragmentCount;
}
