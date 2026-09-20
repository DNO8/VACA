import 'dart:io';
import 'dart:math' as math;

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
/// lo convierte en un bundle canónico y lo encola en [BundleQueueService].
class IncidentService {
  const IncidentService(
    this._database,
    this._queue,
    this._identity,
    this._attachments, {
    this.stellarPubkeyProvider,
  });

  final AppDatabase _database;
  final BundleQueueService _queue;
  final IdentityService _identity;
  final AttachmentService _attachments;

  /// Proveedor opcional de la pubkey Stellar del reportante. Se invoca al
  /// crear la señal para incluirla en el payload cifrado del bundle; si no
  /// hay wallet el campo simplemente no viaja.
  final Future<String?> Function()? stellarPubkeyProvider;

  /// Radio en metros para considerar dos señales "en el mismo lugar".
  static const double _duplicateRadiusMeters = 100;

  /// Ventana temporal para buscar duplicados: solo señales recientes cuentan.
  static const Duration _duplicateWindow = Duration(hours: 24);

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
    String? id,
    DateTime? now,
  }) async {
    final incidentId = id ?? const Uuid().v4();
    final created = now ?? DateTime.now();
    await _database.into(_database.incidents).insert(
          IncidentsCompanion.insert(
            id: incidentId,
            reporterProfileId: reporterProfileId,
            category: category,
            priority: priority,
            peopleCount: Value(peopleCount),
            shortNote: Value(shortNote),
            latitude: Value(latitude),
            longitude: Value(longitude),
            accuracyMeters: Value(accuracyMeters),
            locationSource: locationSource,
            createdAt: created,
            updatedAt: created,
            status: IncidentStatus.savedLocally,
            identityAssurance: identityAssurance,
          ),
        );

    return UserIncident(
      id: incidentId,
      reporterProfileId: reporterProfileId,
      category: category,
      priority: priority,
      peopleCount: peopleCount,
      shortNote: shortNote,
      latitude: latitude,
      longitude: longitude,
      accuracyMeters: accuracyMeters,
      locationSource: locationSource,
      createdAt: created,
      updatedAt: created,
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
    String? id,
    DateTime? now,
  }) async {
    final duplicate = await _findDuplicate(
      category: category,
      shortNote: shortNote,
      latitude: latitude,
      longitude: longitude,
      now: now ?? DateTime.now(),
    );
    if (duplicate != null) {
      return const Failure(
        VacaError(
          code: 'duplicate_signal',
          message:
              'Ya registraste una señal igual cerca de aquí hace poco. Revisala en Inicio antes de volver a enviar.',
        ),
      );
    }
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
          id: id,
          now: now,
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
        var stellarPubkey = await stellarPubkeyProvider?.call();
        if (stellarPubkey == null || stellarPubkey.isEmpty) {
          stellarPubkey = null;
        }
        final queued = await _queue.enqueue(
          incident,
          profile,
          eventType: EventType.created,
          attachments: attachments,
          stellarPubkey: stellarPubkey,
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

  /// Lista todos los incidentes locales ordenados por creación descendente.
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
  /// Crea un bundle canónico, lo persiste en la cola de origen y actualiza
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
        await _queue.closePendingForIncident(
          id,
          exceptBundleId: queued.valueOrNull?.bundleId,
        );
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

  /// Borra todos los datos locales de un incidente: archivos adjuntos,
  /// historial de eventos, bundles de entrega (incluida la cancelación
  /// pendiente), recibos y la fila del incidente.
  ///
  /// Pensado para incidentes ya cancelados: el usuario decide que la copia
  /// local ya no es necesaria. Si la cancelación aún no llegó al servidor,
  /// borrar la descarta — el incidente expirará allá por TTL.
  Future<Result<void>> deleteLocal(String id) async {
    final incident = await get(id);
    if (incident == null) {
      return const Failure(
        VacaError(code: 'incident_not_found', message: 'Señal no encontrada.'),
      );
    }
    try {
      final files = await (_database.select(_database.attachments)
            ..where((a) => a.incidentId.equals(id)))
          .get();
      final bundles = await (_database.select(_database.originBundles)
            ..where((b) => b.incidentId.equals(id)))
          .get();
      await _database.transaction(() async {
        for (final bundle in bundles) {
          await (_database.delete(_database.deliveryAttempts)
                ..where((d) => d.messageId.equals(bundle.id)))
              .go();
          await (_database.delete(_database.serverReceipts)
                ..where((r) => r.messageId.equals(bundle.id)))
              .go();
        }
        await (_database.delete(_database.originBundles)
              ..where((b) => b.incidentId.equals(id)))
            .go();
        await (_database.delete(_database.attachments)
              ..where((a) => a.incidentId.equals(id)))
            .go();
        await (_database.delete(_database.incidentEvents)
              ..where((e) => e.incidentId.equals(id)))
            .go();
        await (_database.delete(_database.incidents)
              ..where((i) => i.id.equals(id)))
            .go();
      });
      for (final attachment in files) {
        try {
          await File(attachment.localPath).delete();
        } on FileSystemException {
          // El archivo ya no existe o no se pudo borrar; no bloquea.
        }
      }
      return const Success(null);
    } catch (error) {
      return Failure(
        VacaError(
          code: 'incident_delete_failed',
          message: 'No se pudo borrar la señal del dispositivo.',
          cause: error,
        ),
      );
    }
  }

  /// Detecta una señal duplicada por contenido: misma categoría, nota
  /// equivalente y misma zona, creada dentro de [_duplicateWindow] y no
  /// cerrada por cancelación o expiración.
  ///
  /// Sirve para que un mismo evento no se encole varias veces: en BLE/mesh
  /// cada copia inunda los nodos, así que el duplicado se rechaza acá, antes
  /// de crear bundle.
  Future<Incident?> _findDuplicate({
    required IncidentCategory category,
    String? shortNote,
    double? latitude,
    double? longitude,
    required DateTime now,
  }) async {
    final cutoff = now.subtract(_duplicateWindow);
    final candidates = await (_database.select(_database.incidents)
          ..where(
            (i) =>
                i.category.equals(category.index) &
                i.createdAt.isBiggerThan(Variable(cutoff)) &
                i.status.isNotIn([
                  IncidentStatus.cancelledLocally.index,
                  IncidentStatus.cancellationQueued.index,
                  IncidentStatus.cancellationReceived.index,
                  IncidentStatus.expired.index,
                ]),
          ))
        .get();
    final newNote = _normalizeNote(shortNote);
    for (final candidate in candidates) {
      if (_normalizeNote(candidate.shortNote) != newNote) continue;
      final hasBothCoords = latitude != null &&
          longitude != null &&
          candidate.latitude != null &&
          candidate.longitude != null;
      if (hasBothCoords) {
        final distance = _distanceMeters(
          latitude,
          longitude,
          candidate.latitude!,
          candidate.longitude!,
        );
        if (distance <= _duplicateRadiusMeters) return candidate;
      } else if (latitude == null && candidate.latitude == null) {
        return candidate;
      } else if (newNote.isNotEmpty) {
        return candidate;
      }
    }
    return null;
  }

  static String _normalizeNote(String? note) =>
      (note ?? '').trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

  static double _distanceMeters(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    const radius = 6371000.0;
    final dLat = _toRadians(lat2 - lat1);
    final dLon = _toRadians(lon2 - lon1);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_toRadians(lat1)) *
            math.cos(_toRadians(lat2)) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    return 2 * radius * math.asin(math.sqrt(a));
  }

  static double _toRadians(double degrees) => degrees * math.pi / 180;

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
