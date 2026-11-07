import 'dart:async';

import '../domain/refund_scope.dart';
import '../domain/refund_status.dart';
import 'refund_http_client.dart';
import 'refund_submission_journal.dart';

/// Present validated facts or an unknown hold; never convert an error to zero.
class RefundClientResult {
  RefundClientResult._(this.status, this.firstPostRecorded, this.errorCode);
  final RefundStatus? status;
  final bool? firstPostRecorded;
  final String? errorCode;

  String get state => errorCode == null ? status!.state : 'unknown';
  bool get isSettled => errorCode == null && status!.isSettled;
  List<RefundAction> get safeActions => errorCode != null
      ? const []
      : List.unmodifiable(status!.safeActions.where((action) =>
          action != RefundAction.refund || firstPostRecorded == false));
}

/// Integration seam only: not mounted in existing providers, D3 or screens.
class RefundClient {
  RefundClient(
      {required RefundHttpClient http,
      required RefundSubmissionJournal journal})
      : _http = http,
        _journal = journal;
  final RefundHttpClient _http;
  final RefundSubmissionJournal _journal;

  // Shared across instances IN THIS ISOLATE only, never a cross-device CAS.
  static final _tails = <String, Future<void>>{};

  Future<RefundClientResult> status(RefundScope scope) =>
      _serialized(scope, () => _observe(scope, RefundAction.status));

  /// Explicit observation only. Never invoked automatically after a lost reply.
  Future<RefundClientResult> reconcile(RefundScope scope) =>
      _serialized(scope, () => _observe(scope, RefundAction.reconcile));

  /// Explicit first-submit intent. A recorded attempt takes the status-only path.
  Future<RefundClientResult> requestRefund(RefundScope scope) =>
      _serialized(scope, () async {
        final baseline = await _journal.load(scope);
        if (baseline != null)
          return _observe(scope, RefundAction.status, baseline: baseline);
        final fresh = await _http.send(scope, RefundAction.status);
        if (fresh.state != 'not_started')
          return RefundClientResult._(fresh, false, null);
        final reservation = await _journal.reserve(scope, fresh);
        final response = await _http.send(scope, RefundAction.refund,
            reservation: reservation);
        return RefundClientResult._(response, true, null);
      });

  Future<RefundClientResult> _observe(
    RefundScope scope,
    RefundAction action, {
    RefundStatus? baseline,
  }) async {
    final saved = baseline ?? await _journal.load(scope);
    final response = await _http.send(scope, action);
    RefundValidation.require(saved == null || saved.sameDonation(response));
    return RefundClientResult._(response, saved != null, null);
  }

  Future<RefundClientResult> _serialized(
    RefundScope scope,
    Future<RefundClientResult> Function() operation,
  ) async {
    final prior = _tails[scope.identity] ?? Future<void>.value();
    final finished = Completer<void>();
    final tail = prior.then((_) => finished.future);
    _tails[scope.identity] = tail;
    await prior;
    try {
      return await operation();
    } on RefundProtocolError catch (error) {
      return RefundClientResult._(null, null, error.code);
    } catch (_) {
      return RefundClientResult._(null, null, 'd1_refund_local_unavailable');
    } finally {
      finished.complete();
      if (identical(_tails[scope.identity], tail))
        _tails.remove(scope.identity);
    }
  }
}
