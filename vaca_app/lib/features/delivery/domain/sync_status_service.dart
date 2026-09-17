import 'dart:async';

import '../../../core/transport/transport.dart';
import '../../../data/local/database.dart';
import '../../../data/local/enums.dart' as local;

enum SyncPhase { offline, online, syncing, success, error }

class SyncSnapshot {
  const SyncSnapshot({
    required this.phase,
    required this.pendingCount,
    required this.deliveredCount,
    required this.canRetry,
  });

  final SyncPhase phase;
  final int pendingCount;
  final int deliveredCount;
  final bool canRetry;

  factory SyncSnapshot.derive({
    required TransportAvailability availability,
    required Set<String> pendingIncidentIds,
    required int delivered,
    required bool hasInFlight,
    required bool hasFailures,
    required bool hasRetryableAttachments,
  }) {
    final phase = switch (availability) {
      TransportAvailability.unavailable => SyncPhase.offline,
      _ when hasInFlight => SyncPhase.syncing,
      _ when hasFailures => SyncPhase.error,
      _ when pendingIncidentIds.isEmpty && delivered > 0 =>
        SyncPhase.success,
      _ => SyncPhase.online,
    };
    return SyncSnapshot(
      phase: phase,
      pendingCount: pendingIncidentIds.length,
      deliveredCount: delivered,
      canRetry: hasRetryableAttachments,
    );
  }
}

class SyncStatusService {
  const SyncStatusService(this._database, this._transport);

  final AppDatabase _database;
  final Transport _transport;

  Stream<SyncSnapshot> watch() {
    late StreamController<SyncSnapshot> controller;
    StreamSubscription<List<OriginBundle>>? bundlesSubscription;
    StreamSubscription<List<Attachment>>? attachmentsSubscription;
    StreamSubscription<TransportStatus>? transportSubscription;
    var bundles = const <OriginBundle>[];
    var attachments = const <Attachment>[];
    var availability = _transport.currentStatus.availability;

    void emit() {
      if (controller.isClosed) return;
      // Una "senal pendiente" es un incidente con trabajo sin terminar: su
      // bundle no llego o alguno de sus adjuntos no se sincronizo. Contar
      // incidentes (no items) evita que una señal con foto aparezca como 2.
      final pendingIncidentIds = <String>{
        for (final row in bundles)
          if (row.state != local.DeliveryState.delivered) row.incidentId,
        for (final row in attachments)
          if (row.syncStatus != local.AttachmentSyncStatus.synced)
            row.incidentId,
      };
      final hasInFlight = bundles.any(
            (row) => row.state == local.DeliveryState.sent,
          ) ||
          attachments.any(
            (row) => row.syncStatus == local.AttachmentSyncStatus.uploading,
          );
      final failedBundles = bundles.any(
        (row) => row.state == local.DeliveryState.failed,
      );
      final failedAttachments = attachments.any(
        (row) => row.syncStatus == local.AttachmentSyncStatus.failed,
      );
      controller.add(
        SyncSnapshot.derive(
          availability: availability,
          pendingIncidentIds: pendingIncidentIds,
          delivered: bundles
              .where((row) => row.state == local.DeliveryState.delivered)
              .length,
          hasInFlight: hasInFlight,
          hasFailures: failedBundles || failedAttachments,
          hasRetryableAttachments: failedAttachments,
        ),
      );
    }

    controller = StreamController<SyncSnapshot>(
      onListen: () {
        bundlesSubscription =
            _database.select(_database.originBundles).watch().listen((value) {
          bundles = value;
          emit();
        });
        attachmentsSubscription =
            _database.select(_database.attachments).watch().listen((value) {
          attachments = value;
          emit();
        });
        transportSubscription = _transport.status.listen((value) {
          availability = value.availability;
          emit();
        });
        emit();
      },
      onCancel: () async {
        await bundlesSubscription?.cancel();
        await attachmentsSubscription?.cancel();
        await transportSubscription?.cancel();
      },
    );
    return controller.stream;
  }
}
