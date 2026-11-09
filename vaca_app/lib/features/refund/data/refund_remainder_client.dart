import '../domain/refund_remainder_status.dart';
import '../domain/refund_scope.dart';
import 'refund_remainder_http_client.dart';
import 'refund_remainder_submission_journal.dart';
import 'refund_submission_gate.dart';

/// Observed facts plus local recovery state; never financial authorization.
class RemainderClientResult {
  const RemainderClientResult._(
      this.status, this.firstPostRecorded, this.holdLane, this.errorCode);
  final RemainderStatus? status;
  final bool? firstPostRecorded;
  final String? holdLane;
  final String? errorCode;
  String get state => errorCode == null ? status!.state : 'unknown';
  bool get isSettled => errorCode == null && status!.isSettled;

  List<RemainderAction> get safeActions => errorCode != null
      ? (firstPostRecorded == true
          ? const [RemainderAction.status, RemainderAction.reconcile]
          : const [RemainderAction.status])
      : List.unmodifiable(status!.safeActions.where((action) =>
          action != RemainderAction.refund || firstPostRecorded == false));
}

/// Explicit commands only. No automatic financial retry or lane switching.
class RemainderClient {
  RemainderClient({required RemainderHttpClient http,
      required RemainderSubmissionJournal journal})
      : _http = http, _journal = journal;
  final RemainderHttpClient _http;
  final RemainderSubmissionJournal _journal;
  final _originals = <String, RemainderStatus>{};

  Future<RemainderClientResult> status(RefundScope scope,
      {RemainderStatus? previous}) =>
      _run(scope, RemainderAction.status, previous);

  Future<RemainderClientResult> reconcile(RefundScope scope,
      {RemainderStatus? previous}) =>
      _run(scope, RemainderAction.reconcile, previous);

  Future<RemainderClientResult> requestRefund(RefundScope scope,
      {RemainderStatus? previous}) =>
      _run(scope, RemainderAction.refund, previous);

  Future<RemainderClientResult> _run(RefundScope scope,
      RemainderAction action, RemainderStatus? previous) =>
      RefundOperationQueue.run(scope, () async {
        bool? recorded;
        String? lane;
        try {
          RefundValidation.require(previous == null || scope.matches(previous.toJson()));
          final known = _originals[scope.identity];
          RefundValidation.require(known == null || previous == null ||
              known.sameDonation(previous));
          final baseline = known ?? previous;
          final hold = await _journal.load(scope);
          recorded = hold != null;
          lane = hold?.lane;
          RefundValidation.require(hold == null || baseline == null ||
              hold.matchesOriginal(baseline.toJson()));
          if (action == RemainderAction.refund && hold == null) {
            // Even explicit intent must first observe a fresh admissible state.
            final fresh = await _http.send(scope, RemainderAction.status);
            _remember(scope, fresh, baseline, hold);
            if (fresh.state != 'not_started' ||
                !fresh.safeActions.contains(RemainderAction.refund)) {
              return RemainderClientResult._(fresh, false, null, null);
            }
            final permit = await _journal.reserve(scope, fresh);
            recorded = true;
            lane = 'v2';
            final observed = await _http.send(scope, RemainderAction.refund,
                reservation: permit);
            _remember(scope, observed, fresh, null);
            return RemainderClientResult._(observed, true, lane, null);
          }
          // Any previous lane hold routes another submit intent to status ONLY.
          final observed = await _http.send(scope,
              action == RemainderAction.refund ? RemainderAction.status : action);
          _remember(scope, observed, baseline, hold);
          return RemainderClientResult._(observed, recorded, lane, null);
        } on RefundProtocolError catch (error) {
          return RemainderClientResult._(null, recorded, lane, error.code);
        } catch (_) {
          return RemainderClientResult._(
              null, recorded, lane, 'd1_remainder_local_unavailable');
        }
      });

  void _remember(RefundScope scope, RemainderStatus observed,
      RemainderStatus? previous, RefundSubmissionHold? hold) {
    RefundValidation.require(previous == null || previous.sameDonation(observed));
    RefundValidation.require(hold == null || hold.matchesOriginal(observed.toJson()));
    _originals.putIfAbsent(scope.identity, () => observed);
  }
}
