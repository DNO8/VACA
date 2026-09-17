import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/transport/transport.dart';
import 'package:vaca_app/features/delivery/domain/sync_status_service.dart';

void main() {
  SyncSnapshot derive({
    TransportAvailability availability = TransportAvailability.available,
    Set<String> pendingIncidentIds = const {},
    int delivered = 0,
    bool hasInFlight = false,
    bool hasFailures = false,
    bool hasRetryableAttachments = false,
  }) {
    return SyncSnapshot.derive(
      availability: availability,
      pendingIncidentIds: pendingIncidentIds,
      delivered: delivered,
      hasInFlight: hasInFlight,
      hasFailures: hasFailures,
      hasRetryableAttachments: hasRetryableAttachments,
    );
  }

  test('offline takes precedence and retains pending count', () {
    final snapshot = derive(
      availability: TransportAvailability.unavailable,
      pendingIncidentIds: {'inc-1', 'inc-2'},
    );

    expect(snapshot.phase, SyncPhase.offline);
    expect(snapshot.pendingCount, 2);
  });

  test('active bundle or attachment projects syncing', () {
    expect(derive(hasInFlight: true).phase, SyncPhase.syncing);
  });

  test('persisted failures project error with retry action', () {
    final snapshot = derive(
      pendingIncidentIds: {'inc-1'},
      hasFailures: true,
      hasRetryableAttachments: true,
    );

    expect(snapshot.phase, SyncPhase.error);
    expect(snapshot.pendingCount, 1);
    expect(snapshot.canRetry, isTrue);
  });

  test('permanent bundle failure does not expose a dead retry action', () {
    final snapshot = derive(hasFailures: true);

    expect(snapshot.phase, SyncPhase.error);
    expect(snapshot.canRetry, isFalse);
  });

  test('delivered history with no pending work projects success', () {
    final snapshot = derive(delivered: 2);

    expect(snapshot.phase, SyncPhase.success);
    expect(snapshot.deliveredCount, 2);
  });

  test('an incident with undelivered bundle and unsynced photo counts once', () {
    // Misma señal con dos items pendientes -> un solo pendiente visible.
    final snapshot = derive(
      pendingIncidentIds: {'inc-1'},
      hasInFlight: true,
    );

    expect(snapshot.pendingCount, 1);
  });
}
