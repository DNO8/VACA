import 'package:drift/drift.dart';

import 'enums.dart';

/// Definicion de tablas Drift (SQLite) para la app publica VACA.
/// Reemplaza el modelo orientado a formularios oficiales por incidentes
/// genericos, adjuntos, bundles de transporte y estados de entrega.
///
/// Convenciones:
/// - Todos los id son UUID v4 en texto, generados en el dispositivo.
/// - Enums se persisten con intEnum (por indice; ver enums.dart).

/// Perfil de identidad del usuario, verificado o no.
class IdentityProfiles extends Table {
  TextColumn get id => text()();
  TextColumn get opaqueSubjectId => text().nullable()();
  IntColumn get identityAssurance => intEnum<IdentityAssurance>()();
  TextColumn get credential => text().nullable()();
  DateTimeColumn get credentialExpiresAt => dateTime().nullable()();
  TextColumn get devicePublicKey => text()();
  TextColumn get consentVersion => text()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Incidente o señal generada localmente.
class Incidents extends Table {
  TextColumn get id => text()();
  TextColumn get reporterProfileId =>
      text().references(IdentityProfiles, #id)();
  IntColumn get category => intEnum<IncidentCategory>()();
  IntColumn get priority => intEnum<IncidentPriority>()();
  IntColumn get peopleCount => integer().nullable()();
  TextColumn get shortNote => text().nullable()();
  RealColumn get latitude => real().nullable()();
  RealColumn get longitude => real().nullable()();
  RealColumn get accuracyMeters => real().nullable()();
  IntColumn get locationSource => intEnum<LocationSource>()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  IntColumn get status => intEnum<IncidentStatus>()();
  IntColumn get identityAssurance => intEnum<IdentityAssurance>()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Evento append-only sobre un incidente (create/update/cancel/receipt).
class IncidentEvents extends Table {
  TextColumn get id => text()();
  TextColumn get incidentId => text().references(Incidents, #id)();
  IntColumn get eventType => intEnum<EventType>()();
  TextColumn get signer => text()();
  TextColumn get signature => text()();
  DateTimeColumn get timestamp => dateTime()();
  TextColumn get payloadHash => text()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Archivo adjunto a un incidente (foto, thumbnail).
class Attachments extends Table {
  TextColumn get id => text()();
  TextColumn get incidentId => text().references(Incidents, #id)();
  IntColumn get kind => intEnum<AttachmentKind>()();
  TextColumn get localPath => text()();
  TextColumn get sha256 => text()();
  IntColumn get sizeBytes => integer()();
  DateTimeColumn get capturedAt => dateTime()();
  IntColumn get syncStatus => intEnum<AttachmentSyncStatus>()();
  TextColumn get remoteUrl => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Bundle canonico generado por el origen y puesto en cola de entrega.
class OriginBundles extends Table {
  TextColumn get id => text()();
  TextColumn get incidentId => text().references(Incidents, #id)();
  TextColumn get eventId => text().references(IncidentEvents, #id)();
  IntColumn get priority => intEnum<IncidentPriority>()();
  TextColumn get canonicalHeader => text()();
  TextColumn get ciphertextPath => text().nullable()();
  BlobColumn get ciphertextBytes => blob().nullable()();
  TextColumn get payloadHash => text()();
  DateTimeColumn get expiresAt => dateTime()();
  IntColumn get state => intEnum<DeliveryState>()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();
  TextColumn get serverReceiptId => text().nullable()();
  IntColumn get hopLimit => integer().withDefault(const Constant(8))();
  IntColumn get copyBudget => integer().withDefault(const Constant(3))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Intento de entrega de un bundle por un enlace.
class DeliveryAttempts extends Table {
  TextColumn get id => text()();
  TextColumn get messageId => text().references(OriginBundles, #id)();
  TextColumn get linkId => text()();
  TextColumn get peerIdHash => text().nullable()();
  DateTimeColumn get startedAt => dateTime()();
  DateTimeColumn get finishedAt => dateTime().nullable()();
  IntColumn get outcome => intEnum<DeliveryOutcome>()();
  IntColumn get bytesTransferred => integer().withDefault(const Constant(0))();
  TextColumn get errorCode => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Recibo firmado por el servidor autorizado.
class ServerReceipts extends Table {
  TextColumn get id => text()();
  TextColumn get receiptId => text()();
  TextColumn get messageId => text().references(OriginBundles, #id)();
  TextColumn get payloadHash => text()();
  DateTimeColumn get serverReceivedAt => dateTime()();
  TextColumn get serverKeyId => text()();
  TextColumn get signature => text()();
  DateTimeColumn get verifiedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Tumba de un bundle entregado para evitar duplicados.
class Tombstones extends Table {
  TextColumn get messageId => text()();
  DateTimeColumn get expiresAt => dateTime()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {messageId};
}
