import '../../../core/security/secure_storage.dart';
import '../domain/refund_remainder_status.dart';
import '../domain/refund_scope.dart';
import 'refund_submission_gate.dart';

/// V2 shares the original-scope hold with v1, not an independent first-post key.
class RemainderSubmissionJournal {
  RemainderSubmissionJournal(SecureStorage storage)
      : _gate = RefundSubmissionGate(storage);
  final RefundSubmissionGate _gate;

  Future<RefundSubmissionHold?> load(RefundScope scope) => _gate.load(scope);

  Future<RemainderLocalReservation> reserve(
      RefundScope scope, RemainderStatus baseline) async {
    RefundValidation.require(baseline.state == 'not_started' &&
        scope.matches(baseline.toJson()) &&
        baseline.safeActions.contains(RemainderAction.refund));
    await _gate.reserve(scope, 'v2', baseline.toJson());
    return RemainderLocalReservation._(scope.identity, baseline);
  }
}

/// Only this library can mint a permit, after durable acknowledgement/readback.
final class RemainderLocalReservation {
  RemainderLocalReservation._(this._identity, this.baseline);
  final String _identity;
  final RemainderStatus baseline;
  bool _consumed = false;

  void consume(RefundScope scope) {
    RefundValidation.require(!_consumed && scope.identity == _identity);
    _consumed = true; // Consume before signing/network, also on later failure.
  }
}
