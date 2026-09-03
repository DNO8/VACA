import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/bundle/bundle_queue_service.dart';
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

  /// Lista todos los incidentes locales ordenados por creacion descendente.
  Future<List<UserIncident>> list() async {
    final rows = await _database.select(_database.incidents).get();
    return rows.map(_toDomain).toList();
  }

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

  /// Cancela un incidente local.
  Future<UserIncident?> cancel(String id) async {
    return _updateStatus(id, IncidentStatus.cancelledLocally);
  }

  Future<UserIncident?> _updateStatus(String id, IncidentStatus status) async {
    final existing = await get(id);
    if (existing == null) return null;
    final now = DateTime.now();
    await _database.update(_database.incidents).replace(
          IncidentsCompanion(
            id: Value(id),
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
