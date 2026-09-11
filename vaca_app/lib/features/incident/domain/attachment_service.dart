import 'package:uuid/uuid.dart';

import '../../../data/local/database.dart';
import '../../../data/local/enums.dart';

/// Registra un archivo de evidencia adjunto a un incidente.
class AttachmentService {
  const AttachmentService(this._database);

  final AppDatabase _database;

  /// Crea un adjunto local a partir de una captura.
  Future<Attachment> create({
    required String incidentId,
    required AttachmentKind kind,
    required String localPath,
    required String sha256,
    DateTime? takenAt,
    double? latitude,
    double? longitude,
    double? accuracyMeters,
  }) async {
    final id = const Uuid().v4();
    await _database.into(_database.attachments).insert(
          AttachmentsCompanion.insert(
            id: id,
            incidentId: incidentId,
            kind: kind,
            localPath: localPath,
            sha256: sha256,
            sizeBytes: 0,
            capturedAt: takenAt ?? DateTime.now(),
            syncStatus: AttachmentSyncStatus.pending,
          ),
        );

    final query = _database.select(_database.attachments)
      ..where((a) => a.id.equals(id));
    return query.getSingle();
  }

  Stream<AttachmentSyncStatus?> watchStatus(String incidentId) {
    final query = _database.select(_database.attachments)
      ..where((row) => row.incidentId.equals(incidentId))
      ..limit(1);
    return query.watch().map(
          (rows) => rows.isEmpty ? null : rows.first.syncStatus,
        );
  }

  /// Lista adjuntos de un incidente.
  Future<List<Attachment>> listForIncident(String incidentId) async {
    final query = _database.select(_database.attachments)
      ..where((a) => a.incidentId.equals(incidentId));
    return query.get();
  }
}
