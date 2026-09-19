import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../data/local/database.dart';
import '../../data/local/enums.dart';
import '../../features/identity/domain/identity_profile.dart';
import '../../features/incident/domain/incident.dart';
import '../result/result.dart';
import '../transport/transport.dart' show DeliveryReceipt;
import 'bundle_codec.dart';
import 'bundle_models.dart';

/// Crea y administra bundles en la cola de origen.
///
/// Responsabilidades:
/// - Convertir un incidente en un bundle canónico.
/// - Persistir el bundle en [OriginBundles] para envío posterior.
/// - Registrar el evento [IncidentEvents] append-only.
/// - Leer/actualizar el estado de los bundles.
class BundleQueueService {
  BundleQueueService(
    this._database,
    this._codec,
  );

  final AppDatabase _database;
  final BundleCodec _codec;

  /// Crea un bundle a partir del incidente y lo encola.
  ///
  /// Devuelve el [Bundle] generado y el id del bundle (messageId).
  Future<Result<BundleEnvelope>> enqueue(
    UserIncident incident,
    UserIdentityProfile profile, {
    required EventType eventType,
    List<Attachment> attachments = const [],
    String? replacesMessageId,
    String? stellarPubkey,
  }) async {
    final manifest = attachments.map(_toManifestEntry).toList();

    final bundleResult = await _codec.createBundle(
      incident,
      profile,
      eventType: eventType,
      attachmentManifest: manifest,
      replacesMessageId: replacesMessageId,
      stellarPubkey: stellarPubkey,
    );
    if (bundleResult.isFailure) {
      return Failure((bundleResult as Failure<Bundle>).error);
    }
    final bundle = bundleResult.valueOrNull!;

    final encodedResult = await _codec.encodeBundle(bundle);
    if (encodedResult.isFailure) {
      return Failure((encodedResult as Failure<Uint8List>).error);
    }
    final encoded = encodedResult.valueOrNull!;

    final now = DateTime.now();
    final eventId = const Uuid().v4();
    final bundleId = bundle.header.messageId;
    final incidentId = bundle.header.incidentId;

    try {
      await _database.transaction(() async {
        final canonicalHeader =
            base64Encode(_codec.encodeProtectedHeader(bundle.header));
        final payloadHashBytes = bundle.header.payloadHash;
        final payloadHashHex = payloadHashBytes
            .map((b) => b.toRadixString(16).padLeft(2, '0'))
            .join();

        await _database.into(_database.incidentEvents).insert(
              IncidentEventsCompanion.insert(
                id: eventId,
                incidentId: incidentId,
                eventType: eventType,
                signer: profile.devicePublicKey,
                signature: base64Encode(bundle.header.signature),
                timestamp: now,
                payloadHash: payloadHashHex,
              ),
            );

        await _database.into(_database.originBundles).insert(
              OriginBundlesCompanion.insert(
                id: bundleId,
                incidentId: incidentId,
                eventId: eventId,
                priority: incident.priority,
                canonicalHeader: canonicalHeader,
                ciphertextBytes: Value(encoded),
                payloadHash: payloadHashHex,
                expiresAt: bundle.header.expiresAt,
                state: DeliveryState.queued,
                createdAt: now,
                hopLimit: Value(bundle.header.hopLimit),
                copyBudget: const Value(3),
              ),
            );
      });

      return Success(
        BundleEnvelope(
          bundle: bundle,
          bundleId: bundleId,
          eventId: eventId,
        ),
      );
    } catch (e) {
      return Failure(
        VacaError(
          code: 'bundle_enqueue',
          message: 'No se pudo encolar el bundle.',
          cause: e,
        ),
      );
    }
  }

  /// Incidentes cuya señal fue cancelada: sus bundles ya no deben viajar.
  BaseSelectStatement _cancelledIncidentIds() =>
      _database.selectOnly(_database.incidents)
        ..addColumns([_database.incidents.id])
        ..where(
          _database.incidents.status.isIn([
            IncidentStatus.cancelledLocally.index,
            IncidentStatus.cancellationQueued.index,
            IncidentStatus.cancellationReceived.index,
          ]),
        );

  /// Cierra los bundles aún pendientes de un incidente cancelado.
  ///
  /// Se invoca al cancelar una señal: el único bundle que debe seguir
  /// viajando es el de la propia cancelación ([exceptBundleId]).
  Future<void> closePendingForIncident(
    String incidentId, {
    String? exceptBundleId,
  }) async {
    final query = _database.update(_database.originBundles)
      ..where(
        (b) =>
            b.incidentId.equals(incidentId) &
            b.state.isIn([
              DeliveryState.queued.index,
              DeliveryState.sent.index,
            ]),
      );
    if (exceptBundleId != null) {
      query.where((b) => b.id.equals(exceptBundleId).not());
    }
    await query.write(
      const OriginBundlesCompanion(
        state: Value(DeliveryState.failed),
        nextAttemptAt: Value(null),
        lastErrorCode: Value('cancelled'),
      ),
    );
  }

  /// Recupera los bundles pendientes ordenados por prioridad y antigüedad.
  Future<List<OriginBundle>> pendingBundles({int limit = 10}) async {
    final now = DateTime.now();
    final query = _database.select(_database.originBundles)
      ..where(
        (b) => b.state.isIn([
          DeliveryState.queued.index,
          DeliveryState.sent.index,
        ]),
      )
      ..where((b) => b.expiresAt.isBiggerThan(Variable(now)))
      ..where(
        (b) =>
            b.nextAttemptAt.isNull() |
            b.nextAttemptAt.isSmallerOrEqual(Variable(now)),
      )
      ..where((b) => b.incidentId.isNotInQuery(_cancelledIncidentIds()))
      ..orderBy([
        (b) => OrderingTerm.asc(b.priority),
        (b) => OrderingTerm.asc(b.createdAt),
      ])
      ..limit(limit);
    return query.get();
  }

  Future<DateTime?> nextRetryAt() async {
    final query = _database.select(_database.originBundles)
      ..where(
        (row) => row.state.isIn([
          DeliveryState.queued.index,
          DeliveryState.sent.index,
        ]),
      )
      ..where((row) => row.nextAttemptAt.isNotNull())
      ..where((row) => row.incidentId.isNotInQuery(_cancelledIncidentIds()))
      ..orderBy([(row) => OrderingTerm.asc(row.nextAttemptAt)])
      ..limit(1);
    return (await query.getSingleOrNull())?.nextAttemptAt;
  }

  Future<void> expirePendingBundles() async {
    final now = DateTime.now();
    final query = _database.select(_database.originBundles)
      ..where(
        (row) => row.state.isIn([
          DeliveryState.queued.index,
          DeliveryState.sent.index,
        ]),
      )
      ..where((row) => row.expiresAt.isSmallerOrEqual(Variable(now)));
    final expired = await query.get();
    if (expired.isEmpty) return;
    await _database.transaction(() async {
      for (final bundle in expired) {
        await (_database.update(_database.originBundles)
              ..where((row) => row.id.equals(bundle.id)))
            .write(
          const OriginBundlesCompanion(
            state: Value(DeliveryState.failed),
            nextAttemptAt: Value(null),
            lastErrorCode: Value('expired'),
          ),
        );
        await (_database.update(_database.incidents)
              ..where((row) => row.id.equals(bundle.incidentId)))
            .write(
          const IncidentsCompanion(status: Value(IncidentStatus.expired)),
        );
        await _database.into(_database.deliveryAttempts).insert(
              DeliveryAttemptsCompanion.insert(
                id: const Uuid().v4(),
                messageId: bundle.id,
                linkId: 'internet',
                startedAt: now,
                finishedAt: Value(now),
                outcome: DeliveryOutcome.expired,
                errorCode: const Value('expired'),
              ),
            );
      }
    });
  }

  /// Marca un bundle como enviado.
  Future<Result<void>> markSent(String bundleId) async {
    try {
      final now = DateTime.now();
      await (_database.update(_database.originBundles)
            ..where((row) => row.id.equals(bundleId)))
          .write(
        OriginBundlesCompanion(
          state: const Value(DeliveryState.sent),
          lastAttemptAt: Value(now),
          nextAttemptAt: const Value(null),
          lastErrorCode: const Value(null),
        ),
      );
      return const Success(null);
    } catch (e) {
      return Failure(
        VacaError(
          code: 'bundle_mark_sent',
          message: 'No se pudo marcar el bundle como enviado.',
          cause: e,
        ),
      );
    }
  }

  /// Marca un bundle como entregado.
  Future<Result<void>> markDelivered(
    String bundleId,
    DeliveryReceipt receipt,
  ) async {
    try {
      final now = DateTime.now();
      final bundle = await (_database.select(_database.originBundles)
            ..where((row) => row.id.equals(bundleId)))
          .getSingle();
      await _database.transaction(() async {
        await (_database.update(_database.originBundles)
              ..where((row) => row.id.equals(bundleId)))
            .write(
          OriginBundlesCompanion(
            state: const Value(DeliveryState.delivered),
            lastAttemptAt: Value(now),
            serverReceiptId: Value(receipt.receiptId),
            nextAttemptAt: const Value(null),
            lastErrorCode: const Value(null),
          ),
        );
        await _database.into(_database.serverReceipts).insert(
              ServerReceiptsCompanion.insert(
                id: const Uuid().v4(),
                receiptId: receipt.receiptId,
                messageId: bundleId,
                payloadHash: _toHex(receipt.payloadHash),
                serverReceivedAt: receipt.serverReceivedAt,
                serverKeyId: receipt.serverKeyId,
                signature: base64Encode(receipt.signature),
                verifiedAt: Value(now),
              ),
            );
        final incidentRow = await (_database.select(_database.incidents)
              ..where((row) => row.id.equals(bundle.incidentId)))
            .getSingleOrNull();
        final cancelled = incidentRow != null &&
            (incidentRow.status == IncidentStatus.cancelledLocally ||
                incidentRow.status == IncidentStatus.cancellationQueued ||
                incidentRow.status == IncidentStatus.cancellationReceived);
        await (_database.update(_database.incidents)
              ..where((row) => row.id.equals(bundle.incidentId)))
            .write(
          IncidentsCompanion(
            status: Value(
              cancelled
                  ? IncidentStatus.cancellationReceived
                  : IncidentStatus.receivedByServer,
            ),
            updatedAt: Value(now),
          ),
        );
        await _database.into(_database.tombstones).insertOnConflictUpdate(
              TombstonesCompanion.insert(
                messageId: bundleId,
                expiresAt: receipt.serverReceivedAt.add(
                  const Duration(days: 30),
                ),
                createdAt: now,
              ),
            );
      });
      return const Success(null);
    } catch (e) {
      return Failure(
        VacaError(
          code: 'bundle_mark_delivered',
          message: 'No se pudo persistir el recibo verificado.',
          cause: e,
        ),
      );
    }
  }

  /// Marca un intento fallido sin consumir el presupuesto de copias DTN.
  Future<Result<void>> markFailed(
    String bundleId,
    DeliveryOutcome outcome, {
    String? errorCode,
    DateTime? nextAttemptAt,
  }) async {
    try {
      final now = DateTime.now();
      final query = _database.select(_database.originBundles)
        ..where((b) => b.id.equals(bundleId));
      final row = await query.getSingleOrNull();
      if (row == null) {
        return const Failure(
          VacaError(code: 'bundle_not_found', message: 'Bundle no encontrado.'),
        );
      }

      final retryable = outcome == DeliveryOutcome.retryable;
      await (_database.update(_database.originBundles)
            ..where((bundle) => bundle.id.equals(bundleId)))
          .write(
        OriginBundlesCompanion(
          state: Value(
            retryable ? DeliveryState.queued : DeliveryState.failed,
          ),
          lastAttemptAt: Value(now),
          retryCount: Value(row.retryCount + 1),
          nextAttemptAt: Value(retryable ? nextAttemptAt : null),
          lastErrorCode: Value(errorCode),
        ),
      );

      await _database.into(_database.deliveryAttempts).insert(
            DeliveryAttemptsCompanion.insert(
              id: const Uuid().v4(),
              messageId: bundleId,
              linkId: 'internet',
              startedAt: row.lastAttemptAt ?? now,
              finishedAt: Value(now),
              outcome: outcome,
              errorCode: Value(errorCode),
            ),
          );

      return const Success(null);
    } catch (e) {
      return Failure(
        VacaError(
          code: 'bundle_mark_failed',
          message: 'No se pudo marcar el bundle como fallido.',
          cause: e,
        ),
      );
    }
  }

  Future<List<PendingAttachmentUpload>> pendingAttachmentUploads({
    int limit = 5,
  }) async {
    final attachments = await (_database.select(_database.attachments)
          ..where(
            (row) => row.syncStatus.isIn([
              AttachmentSyncStatus.pending.index,
              AttachmentSyncStatus.uploading.index,
              AttachmentSyncStatus.failed.index,
            ]),
          )
          ..orderBy([(row) => OrderingTerm.asc(row.capturedAt)])
          ..limit(limit))
        .get();
    final pending = <PendingAttachmentUpload>[];
    for (final attachment in attachments) {
      final bundle = await (_database.select(_database.originBundles)
            ..where((row) => row.incidentId.equals(attachment.incidentId))
            ..where((row) => row.state.equals(DeliveryState.delivered.index))
            ..orderBy([(row) => OrderingTerm.desc(row.createdAt)])
            ..limit(1))
          .getSingleOrNull();
      if (bundle != null) {
        pending.add(PendingAttachmentUpload(bundle.id, attachment));
      }
    }
    return pending;
  }

  Future<void> retryNow(String bundleId) async {
    await (_database.update(_database.originBundles)
          ..where((row) => row.id.equals(bundleId))
          ..where((row) => row.state.isIn([
                DeliveryState.queued.index,
                DeliveryState.failed.index,
              ])))
        .write(
      const OriginBundlesCompanion(
        state: Value(DeliveryState.queued),
        nextAttemptAt: Value(null),
        lastErrorCode: Value(null),
      ),
    );
  }

  /// Quita el backoff de todos los bundles reintentables.
  ///
  /// El backoff existe para esperar mientras no hay camino de entrega; cuando
  /// la red vuelve (o el usuario pide reintentar), seguir esperando no tiene
  /// sentido: todos los bundles vuelven a ser elegibles de inmediato.
  Future<void> retryAllNow() async {
    await (_database.update(_database.originBundles)
          ..where((row) => row.state.isIn([
                DeliveryState.queued.index,
                DeliveryState.sent.index,
              ]))
          ..where(
            (row) => row.incidentId.isNotInQuery(_cancelledIncidentIds()),
          ))
        .write(
      const OriginBundlesCompanion(
        state: Value(DeliveryState.queued),
        nextAttemptAt: Value(null),
        lastErrorCode: Value(null),
      ),
    );
  }

  Future<void> updateAttachmentStatus(
    String attachmentId,
    AttachmentSyncStatus status,
  ) async {
    await (_database.update(_database.attachments)
          ..where((row) => row.id.equals(attachmentId)))
        .write(AttachmentsCompanion(syncStatus: Value(status)));
  }

  String _toHex(List<int> bytes) =>
      bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();

  BundleAttachmentManifestEntry _toManifestEntry(Attachment a) =>
      BundleAttachmentManifestEntry(
        contentHash: a.sha256,
        sizeBytes: a.sizeBytes,
        kindIndex: a.kind.index,
      );

  /// Recupera los bytes completos de un bundle encolado.
  Future<Uint8List?> bundleBytes(String bundleId) async {
    final query = _database.select(_database.originBundles)
      ..where((b) => b.id.equals(bundleId));
    final row = await query.getSingleOrNull();
    return row?.ciphertextBytes;
  }

  /// Cuantos intentos de entrega tiene un bundle.
  Future<int> countDeliveryAttempts(String bundleId) async {
    final query = _database.select(_database.deliveryAttempts)
      ..where((a) => a.messageId.equals(bundleId));
    final rows = await query.get();
    return rows.length;
  }
}

class PendingAttachmentUpload {
  const PendingAttachmentUpload(this.bundleId, this.attachment);

  final String bundleId;
  final Attachment attachment;
}

/// Bundle con sus ids de persistencia.
class BundleEnvelope {
  const BundleEnvelope({
    required this.bundle,
    required this.bundleId,
    required this.eventId,
  });

  final Bundle bundle;
  final String bundleId;
  final String eventId;
}
