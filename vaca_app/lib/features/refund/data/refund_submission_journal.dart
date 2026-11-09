import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../../../core/result/result.dart';
import '../../../core/security/secure_storage.dart';
import '../domain/refund_scope.dart';
import '../domain/refund_status.dart';
import 'refund_submission_gate.dart';

/// A durable client-side hold, NOT backend idempotence or financial permission.
class RefundSubmissionJournal {
  RefundSubmissionJournal(this._storage);
  final SecureStorage _storage;
  static final _reserving = <String>{};

  String _key(RefundScope scope) =>
      'd1.refund.v1.${sha256.convert(utf8.encode(scope.identity))}';

  Future<RefundStatus?> load(RefundScope scope) async {
    try {
      final result = await _storage.read(_key(scope));
      if (result is! Success<String?>) throw const RefundProtocolError();
      final raw = result.value;
      if (raw == null) {
        final hold = await sharedHold(scope);
        return hold?.lane == 'v1'
            ? RefundStatus.parse(hold!.baseline, scope)
            : null;
      }
      RefundValidation.require(utf8.encode(raw).length <= 16384);
      final entry = RefundValidation.object(
          RefundValidation.decodeJson(raw), const ['version', 'baseline']);
      RefundValidation.require(
          entry['version'] is int && entry['version'] == 1);
      final baseline = RefundStatus.parse(entry['baseline'], scope);
      RefundValidation.require(baseline.state == 'not_started');
      return baseline;
    } catch (_) {
      throw const RefundProtocolError('d1_refund_journal_unavailable');
    }
  }

  Future<RefundSubmissionHold?> sharedHold(RefundScope scope) =>
      RefundSubmissionGate(_storage).load(scope);

  /// Called under the shared isolate-local queue. No reset/delete.
  Future<RefundLocalReservation> reserve(
      RefundScope scope, RefundStatus baseline) async {
    if (!_reserving.add(scope.identity)) {
      throw const RefundProtocolError('d1_refund_journal_unavailable');
    }
    try {
      RefundValidation.require(
          baseline.state == 'not_started' && scope.matches(baseline.toJson()));
      RefundValidation.require(await load(scope) == null);
      await RefundSubmissionGate(_storage).reserve(scope, 'v1', baseline.toJson());
      final encoded = jsonEncode({'version': 1, 'baseline': baseline.toJson()});
      final written = await _storage.write(_key(scope), encoded);
      if (written is! Success<void>) throw const RefundProtocolError();
      final saved = await load(scope);
      RefundValidation.require(saved != null && saved.sameDonation(baseline));
      return RefundLocalReservation._(scope.identity, baseline);
    } catch (_) {
      throw const RefundProtocolError('d1_refund_journal_unavailable');
    } finally {
      _reserving.remove(scope.identity);
    }
  }
}

/// Only this library can mint one, after acknowledged persistence and readback.
/// Final prevents another library implementing a fake permit. Never financial authority.
final class RefundLocalReservation {
  RefundLocalReservation._(this._identity, this.baseline);
  final String _identity;
  final RefundStatus baseline;
  bool _consumed = false;

  void consume(RefundScope scope) {
    RefundValidation.require(!_consumed && scope.identity == _identity);
    _consumed = true; // Before signing/network, even if they subsequently fail.
  }
}
