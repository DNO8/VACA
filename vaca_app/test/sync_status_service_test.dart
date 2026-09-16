import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/transport/transport.dart';
import 'package:vaca_app/features/delivery/domain/sync_status_service.dart';

void main() {
  SyncSnapshot derive({
    TransportAvailability availability = TransportAvailability.available,
    int queued = 0,
    int sending = 0,
    int delivered = 0,
    int failed = 0,
    int pendingAttachments = 0,
    int uploadingAttachments = 0,
    int failedAttachments = 0,
  }) {
    return SyncSnapshot.derive(
      availability: availability,
      queued: queued,
      sending: sending,
      delivered: delivered,
      failed: failed,
      pendingAttachments: pendingAttachments,
      uploadingAttachments: uploadingAttachments,
      failedAttachments: failedAttachments,
    );
  }

  test('offline takes precedence and retains pending count', () {
    final snapshot = derive(
      availability: TransportAvailability.unavailable,
      queued: 2,
      failedAttachments: 1,
    );

    expect(snapshot.phase, SyncPhase.offline);
    expect(snapshot.pendingCount, 3);
  });

  test('active bundle or attachment projects syncing', () {
    expect(derive(sending: 1).phase, SyncPhase.syncing);
    expect(derive(uploadingAttachments: 1).phase, SyncPhase.syncing);
  });

  test('persisted failures project error with retry action', () {
    final snapshot = derive(failed: 1, failedAttachments: 1);

    expect(snapshot.phase, SyncPhase.error);
    expect(snapshot.pendingCount, 2);
    expect(snapshot.canRetry, isTrue);
  });

  test('permanent bundle failure does not expose a dead retry action', () {
    final snapshot = derive(failed: 1);

    expect(snapshot.phase, SyncPhase.error);
    expect(snapshot.canRetry, isFalse);
  });

  test('delivered history with no pending work projects success', () {
    final snapshot = derive(delivered: 2);

    expect(snapshot.phase, SyncPhase.success);
    expect(snapshot.deliveredCount, 2);
  });
}
