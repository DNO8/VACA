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
    required int queued,
    required int sending,
    required int delivered,
    required int failed,
    required int pendingAttachments,
    required int uploadingAttachments,
    required int failedAttachments,
  }) {
    final pending =
        queued + sending + pendingAttachments + uploadingAttachments;
    final phase = switch (availability) {
      TransportAvailability.unavailable => SyncPhase.offline,
      _ when sending > 0 || uploadingAttachments > 0 => SyncPhase.syncing,
      _ when failed > 0 || failedAttachments > 0 => SyncPhase.error,
      _ when pending == 0 && delivered > 0 => SyncPhase.success,
      _ => SyncPhase.online,
    };
    return SyncSnapshot(
      phase: phase,
      pendingCount: pending + failed + failedAttachments,
      deliveredCount: delivered,
      canRetry: failedAttachments > 0,
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
      controller.add(
        SyncSnapshot.derive(
          availability: availability,
          queued: bundles
              .where((row) => row.state == local.DeliveryState.queued)
              .length,
          sending: bundles
              .where((row) => row.state == local.DeliveryState.sent)
              .length,
          delivered: bundles
              .where((row) => row.state == local.DeliveryState.delivered)
              .length,
          failed: bundles
              .where((row) => row.state == local.DeliveryState.failed)
              .length,
          pendingAttachments: attachments
              .where(
                (row) => row.syncStatus == local.AttachmentSyncStatus.pending,
              )
              .length,
          uploadingAttachments: attachments
              .where(
                (row) => row.syncStatus == local.AttachmentSyncStatus.uploading,
              )
              .length,
          failedAttachments: attachments
              .where(
                (row) => row.syncStatus == local.AttachmentSyncStatus.failed,
              )
              .length,
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
