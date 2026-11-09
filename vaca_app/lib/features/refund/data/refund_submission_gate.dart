import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../../../core/result/result.dart';
import '../../../core/security/secure_storage.dart';
import '../domain/refund_remainder_status.dart';
import '../domain/refund_scope.dart';
import '../domain/refund_status.dart';

/// Shared by both lanes and all client instances IN THIS ISOLATE only.
/// This is not a cross-process/device lock or backend financial authority.
class RefundOperationQueue {
  static final _tails = <String, Future<void>>{};

  static Future<T> run<T>(RefundScope scope, Future<T> Function() operation) async {
    final prior = _tails[scope.identity] ?? Future<void>.value();
    final finished = Completer<void>();
    final tail = prior.then((_) => finished.future);
    _tails[scope.identity] = tail;
    await prior;
    try {
      return await operation();
    } finally {
      finished.complete();
      if (identical(_tails[scope.identity], tail)) _tails.remove(scope.identity);
    }
  }
}

/// Immutable original facts and selected lane, never a reusable submit permit.
class RefundSubmissionHold {
  RefundSubmissionHold._(this.lane, this._baseline);
  final String lane;
  final Map<String, Object?> _baseline;
  Map<String, Object?> get baseline =>
      jsonDecode(jsonEncode(_baseline)) as Map<String, Object?>;

  bool matchesOriginal(Map<String, Object?> observed) =>
      _baseline['deadline'] == observed['deadline'] &&
      _same(_baseline['donation'], observed['donation']);

  static bool _same(Object? a, Object? b) {
    if (a is Map && b is Map) {
      return a.length == b.length &&
          a.keys.every((key) => b.containsKey(key) && _same(a[key], b[key]));
    }
    return a == b;
  }
}

/// Additive durable ownership. Never rewrites, deletes or relabels v1 records.
class RefundSubmissionGate {
  RefundSubmissionGate(this._storage);
  final SecureStorage _storage;
  static final _reserving = <String>{};

  String _suffix(RefundScope scope) =>
      sha256.convert(utf8.encode(scope.identity)).toString();
  String _key(RefundScope scope) => 'd1.refund.submission.${_suffix(scope)}';

  Future<String?> _read(String key) async {
    final result = await _storage.read(key);
    if (result is! Success<String?>) throw const RefundProtocolError();
    final raw = result.value;
    RefundValidation.require(raw == null || utf8.encode(raw).length <= 16384);
    return raw;
  }

  RefundSubmissionHold _hold(Object? value, RefundScope scope) {
    final entry = RefundValidation.object(value, const ['version', 'lane', 'baseline']);
    RefundValidation.require(entry['version'] is int && entry['version'] == 1);
    final lane = entry['lane'];
    RefundValidation.require(lane == 'v1' || lane == 'v2');
    final Map<String, Object?> baseline;
    if (lane == 'v1') {
      final status = RefundStatus.parse(entry['baseline'], scope);
      RefundValidation.require(status.state == 'not_started');
      baseline = status.toJson();
    } else {
      final status = RemainderStatus.parse(entry['baseline'], scope);
      RefundValidation.require(status.state == 'not_started');
      baseline = status.toJson();
    }
    return RefundSubmissionHold._(lane! as String, baseline);
  }

  Future<RefundSubmissionHold?> load(RefundScope scope) async {
    try {
      final raw = await _read(_key(scope));
      final shared = raw == null ? null : _hold(RefundValidation.decodeJson(raw), scope);
      // Old installations have only this key. Recognize it without migration.
      final old = await _read('d1.refund.v1.${_suffix(scope)}');
      if (old == null) return shared;
      final legacy = RefundValidation.object(
          RefundValidation.decodeJson(old), const ['version', 'baseline']);
      RefundValidation.require(legacy['version'] is int && legacy['version'] == 1);
      final original = RefundStatus.parse(legacy['baseline'], scope);
      RefundValidation.require(original.state == 'not_started');
      if (shared != null) {
        RefundValidation.require(shared.lane == 'v1' &&
            shared.matchesOriginal(original.toJson()));
        return shared;
      }
      return RefundSubmissionHold._('v1', original.toJson());
    } catch (_) {
      throw const RefundProtocolError('d1_refund_journal_unavailable');
    }
  }

  /// One acquisition only, including after an ambiguous acknowledgement/readback.
  /// A surviving hold is permanent; neither lane may mint another first permit.
  Future<void> reserve(RefundScope scope, String lane,
      Map<String, Object?> baseline) async {
    if (!_reserving.add(scope.identity)) {
      throw const RefundProtocolError('d1_refund_journal_unavailable');
    }
    try {
      final entry = {'version': 1, 'lane': lane, 'baseline': baseline};
      final validated = _hold(entry, scope);
      RefundValidation.require(await load(scope) == null);
      final encoded = jsonEncode(entry);
      RefundValidation.require(utf8.encode(encoded).length <= 16384);
      final saved = await _storage.write(_key(scope), encoded);
      if (saved is! Success<void>) throw const RefundProtocolError();
      final readback = await load(scope);
      RefundValidation.require(readback != null && readback.lane == lane &&
          readback.matchesOriginal(validated.baseline));
    } catch (_) {
      throw const RefundProtocolError('d1_refund_journal_unavailable');
    } finally {
      _reserving.remove(scope.identity);
    }
  }
}
