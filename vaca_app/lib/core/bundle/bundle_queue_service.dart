import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../data/local/database.dart';
import '../../data/local/enums.dart';
import '../../features/identity/domain/identity_profile.dart';
import '../../features/incident/domain/incident.dart';
import '../result/result.dart';
import 'bundle_codec.dart';
import 'bundle_models.dart';

/// Crea y administra bundles en la cola de origen.
///
/// Responsabilidades:
/// - Convertir un incidente en un bundle canonico.
/// - Persistir el bundle en [OriginBundles] para envio posterior.
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
  }) async {
    final manifest = attachments.map(_toManifestEntry).toList();

    final bundleResult = await _codec.createBundle(
      incident,
      profile,
      eventType: eventType,
      attachmentManifest: manifest,
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
        final canonicalHeader = base64Encode(_codec.encodeProtectedHeader(bundle.header));
        final payloadHashBytes = bundle.header.payloadHash;
        final payloadHashHex = payloadHashBytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

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

  /// Recupera los bundles pendientes ordenados por prioridad y antiguedad.
  Future<List<OriginBundle>> pendingBundles({int limit = 10}) async {
    final query = _database.select(_database.originBundles)
      ..where((b) => b.state.equals(DeliveryState.queued.index))
      ..where((b) => b.expiresAt.isBiggerThan(Variable(DateTime.now())))
      ..orderBy([
        (b) => OrderingTerm.desc(b.priority),
        (b) => OrderingTerm.asc(b.createdAt),
      ])
      ..limit(limit);
    return query.get();
  }

  /// Marca un bundle como enviado.
  Future<Result<void>> markSent(String bundleId) async {
    try {
      final now = DateTime.now();
      await _database.update(_database.originBundles).replace(
            OriginBundlesCompanion(
              id: Value(bundleId),
              state: const Value(DeliveryState.sent),
              lastAttemptAt: Value(now),
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
    String bundleId, {
    String? receiptId,
  }) async {
    try {
      final now = DateTime.now();
      await _database.update(_database.originBundles).replace(
            OriginBundlesCompanion(
              id: Value(bundleId),
              state: const Value(DeliveryState.delivered),
              lastAttemptAt: Value(now),
              serverReceiptId: Value(receiptId),
            ),
          );
      return const Success(null);
    } catch (e) {
      return Failure(
        VacaError(
          code: 'bundle_mark_delivered',
          message: 'No se pudo marcar el bundle como entregado.',
          cause: e,
        ),
      );
    }
  }

  /// Marca un bundle como fallido y decrementa presupuesto de copias.
  Future<Result<void>> markFailed(
    String bundleId,
    DeliveryOutcome outcome, {
    String? errorCode,
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

      final newCopyBudget = row.copyBudget - 1;
      final newState =
          newCopyBudget <= 0 ? DeliveryState.failed : DeliveryState.queued;

      await _database.update(_database.originBundles).replace(
            OriginBundlesCompanion(
              id: Value(bundleId),
              state: Value(newState),
              lastAttemptAt: Value(now),
              copyBudget: Value(newCopyBudget),
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
