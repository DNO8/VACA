import 'dart:io';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/bundle/bundle_queue_service.dart';
import '../../../core/result/result.dart';
import '../../../data/local/database.dart';
import '../../../data/local/enums.dart';
import '../../../features/identity/domain/identity_service.dart';
import 'attachment_service.dart';
import 'incident.dart';

/// Servicio de incidentes offline-first.
///
/// Crea, actualiza y lista incidentes locales. Al enviar un incidente,
/// lo convierte en un bundle canonico y lo encola en [BundleQueueService].
class IncidentService {
  const IncidentService(
    this._database,
    this._queue,
    this._identity,
    this._attachments,
  );

  final AppDatabase _database;
  final BundleQueueService _queue;
  final IdentityService _identity;
  final AttachmentService _attachments;

  /// Crea un incidente local a partir de los datos capturados.
  Future<UserIncident> create({
    required String reporterProfileId,
    required IncidentCategory category,
    required IncidentPriority priority,
    int? peopleCount,
    String? shortNote,
    double? latitude,
    double? longitude,
    double? accuracyMeters,
    required LocationSource locationSource,
    required IdentityAssurance identityAssurance,
  }) async {
    final id = const Uuid().v4();
    final now = DateTime.now();
    await _database.into(_database.incidents).insert(
          IncidentsCompanion.insert(
            id: id,
            reporterProfileId: reporterProfileId,
            category: category,
            priority: priority,
            peopleCount: Value(peopleCount),
            shortNote: Value(shortNote),
            latitude: Value(latitude),
            longitude: Value(longitude),
            accuracyMeters: Value(accuracyMeters),
            locationSource: locationSource,
            createdAt: now,
            updatedAt: now,
            status: IncidentStatus.savedLocally,
            identityAssurance: identityAssurance,
          ),
        );

    return UserIncident(
      id: id,
      reporterProfileId: reporterProfileId,
      category: category,
      priority: priority,
      peopleCount: peopleCount,
      shortNote: shortNote,
      latitude: latitude,
      longitude: longitude,
      accuracyMeters: accuracyMeters,
      locationSource: locationSource,
      createdAt: now,
      updatedAt: now,
      status: IncidentStatus.savedLocally,
      identityAssurance: identityAssurance,
    );
  }

  Future<Result<UserIncident>> createAndEnqueue({
    required IncidentCategory category,
    required IncidentPriority priority,
    int? peopleCount,
    String? shortNote,
    double? latitude,
    double? longitude,
    double? accuracyMeters,
    required LocationSource locationSource,
    PendingAttachment? attachment,
  }) async {
    final profile = await _identity.getOrCreateLocalProfile();
    try {
      late UserIncident incident;
      await _database.transaction(() async {
        incident = await create(
          reporterProfileId: profile.id,
          category: category,
          priority: priority,
          peopleCount: peopleCount,
          shortNote: shortNote,
          latitude: latitude,
          longitude: longitude,
          accuracyMeters: accuracyMeters,
          locationSource: locationSource,
          identityAssurance: profile.identityAssurance,
        );
        final attachments = <Attachment>[];
        if (attachment != null) {
          final file = File(attachment.localPath);
          final sizeBytes = await file.length();
          final row = Attachment(
            id: const Uuid().v4(),
            incidentId: incident.id,
            kind: attachment.kind,
            localPath: attachment.localPath,
            sha256: attachment.sha256,
            sizeBytes: sizeBytes,
            capturedAt: attachment.capturedAt,
            syncStatus: AttachmentSyncStatus.pending,
          );
          await _database.into(_database.attachments).insert(row);
          attachments.add(row);
        }
        final queued = await _queue.enqueue(
          incident,
          profile,
          eventType: EventType.created,
          attachments: attachments,
        );
        if (queued case Failure(error: final error)) {
          throw _AtomicCaptureFailure(error);
        }
      });
      return Success(incident);
    } on _AtomicCaptureFailure catch (failure) {
      return Failure(failure.error);
    } catch (error) {
      return Failure(
        VacaError(
          code: 'incident_atomic_create',
          message: 'No se pudo guardar la señal y su bandeja de salida.',
          cause: error,
        ),
      );
    }
  }

  /// Lista todos los incidentes locales ordenados por creacion descendente.
  Future<List<UserIncident>> list() async {
    final rows = await _orderedIncidents().get();
    return rows.map(_toDomain).toList();
  }

  Stream<List<UserIncident>> watch() =>
      _orderedIncidents().watch().map((rows) => rows.map(_toDomain).toList());

  Selectable<Incident> _orderedIncidents() =>
      _database.select(_database.incidents)
        ..orderBy([(row) => OrderingTerm.desc(row.createdAt)]);

  /// Recupera un incidente por id.
  Future<UserIncident?> get(String id) async {
    final query = _database.select(_database.incidents)
      ..where((i) => i.id.equals(id));
    final row = await query.getSingleOrNull();
    return row == null ? null : _toDomain(row);
  }

  /// Marca un incidente como enviado al backend.
  ///
  /// Crea un bundle canonico, lo persiste en la cola de origen y actualiza
  /// el estado del incidente a `queued` o `failedRetryable`.
  Future<UserIncident?> submit(String id) async {
    final incident = await get(id);
    if (incident == null) return null;

    final profile = await _identity.getOrCreateLocalProfile();
    final attachments = await _attachments.listForIncident(id);

    final result = await _queue.enqueue(
      incident,
      profile,
      eventType: EventType.created,
      attachments: attachments,
    );

    final newStatus = result.isSuccess
        ? IncidentStatus.queued
        : IncidentStatus.failedRetryable;
    return _updateStatus(id, newStatus);
  }

  Future<Result<UserIncident>> updateNote(String id, String note) async {
    final incident = await get(id);
    if (incident == null) {
      return const Failure(
        VacaError(code: 'incident_not_found', message: 'Señal no encontrada.'),
      );
    }
    final profile = await _identity.getOrCreateLocalProfile();
    final previous = await _latestBundle(id);
    final now = DateTime.now();
    final updated = UserIncident(
      id: incident.id,
      reporterProfileId: incident.reporterProfileId,
      category: incident.category,
      priority: incident.priority,
      peopleCount: incident.peopleCount,
      shortNote: note,
      latitude: incident.latitude,
      longitude: incident.longitude,
      accuracyMeters: incident.accuracyMeters,
      locationSource: incident.locationSource,
      createdAt: incident.createdAt,
      updatedAt: now,
      status: IncidentStatus.queued,
      identityAssurance: incident.identityAssurance,
    );
    try {
      await _database.transaction(() async {
        final queued = await _queue.enqueue(
          updated,
          profile,
          eventType: EventType.updated,
          replacesMessageId: previous?.id,
        );
        if (queued case Failure(error: final error)) {
          throw _AtomicCaptureFailure(error);
        }
        await (_database.update(_database.incidents)
              ..where((row) => row.id.equals(id)))
            .write(
          IncidentsCompanion(
            shortNote: Value(note),
            status: const Value(IncidentStatus.queued),
            updatedAt: Value(now),
          ),
        );
      });
      return Success(updated);
    } on _AtomicCaptureFailure catch (failure) {
      return Failure(failure.error);
    }
  }

  /// Cancela un incidente local.
  Future<Result<UserIncident>> cancel(String id) async {
    final incident = await get(id);
    if (incident == null) {
      return const Failure(
        VacaError(code: 'incident_not_found', message: 'Señal no encontrada.'),
      );
    }
    final profile = await _identity.getOrCreateLocalProfile();
    final previous = await _latestBundle(id);
    try {
      late UserIncident updated;
      await _database.transaction(() async {
        final queued = await _queue.enqueue(
          incident,
          profile,
          eventType: EventType.cancelled,
          replacesMessageId: previous?.id,
        );
        if (queued case Failure(error: final error)) {
          throw _AtomicCaptureFailure(error);
        }
        updated = (await _updateStatus(
          id,
          IncidentStatus.cancellationQueued,
        ))!;
      });
      return Success(updated);
    } on _AtomicCaptureFailure catch (failure) {
      return Failure(failure.error);
    }
  }

  Future<OriginBundle?> _latestBundle(String incidentId) {
    return (_database.select(_database.originBundles)
          ..where((row) => row.incidentId.equals(incidentId))
          ..orderBy([(row) => OrderingTerm.desc(row.createdAt)])
          ..limit(1))
        .getSingleOrNull();
  }

  Future<UserIncident?> _updateStatus(String id, IncidentStatus status) async {
    final existing = await get(id);
    if (existing == null) return null;
    final now = DateTime.now();
    await (_database.update(_database.incidents)
          ..where((row) => row.id.equals(id)))
        .write(
      IncidentsCompanion(
        status: Value(status),
        updatedAt: Value(now),
      ),
    );
    return existing.copyWith(status: status, updatedAt: now);
  }

  UserIncident _toDomain(Incident row) => UserIncident(
        id: row.id,
        reporterProfileId: row.reporterProfileId,
        category: row.category,
        priority: row.priority,
        peopleCount: row.peopleCount,
        shortNote: row.shortNote,
        latitude: row.latitude,
        longitude: row.longitude,
        accuracyMeters: row.accuracyMeters,
        locationSource: row.locationSource,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        status: row.status,
        identityAssurance: row.identityAssurance,
      );
}

class PendingAttachment {
  const PendingAttachment({
    required this.kind,
    required this.localPath,
    required this.sha256,
    required this.capturedAt,
  });

  final AttachmentKind kind;
  final String localPath;
  final String sha256;
  final DateTime capturedAt;
}

class _AtomicCaptureFailure implements Exception {
  const _AtomicCaptureFailure(this.error);

  final VacaError error;
}
