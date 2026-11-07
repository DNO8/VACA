import 'dart:convert';

import 'refund_scope.dart';

/// Validated backend facts, not a client-issued financial authorization.
class RefundStatus {
  RefundStatus._(this._json);
  final Map<String, Object?> _json;

  String get state => _json['state']! as String;
  String get deadline => _json['deadline']! as String;
  bool get isSettled => state == 'settled';
  Map<String, Object?> get donation =>
      _json['donation']! as Map<String, Object?>;
  List<RefundAction> get safeActions => List.unmodifiable(
        (_json['safeActions']! as List<Object?>).map(
          (action) => RefundAction.values.singleWhere((a) => a.wire == action),
        ),
      );

  /// A detached copy for storage; editing it cannot alter validated facts.
  Map<String, Object?> toJson() =>
      jsonDecode(jsonEncode(_json)) as Map<String, Object?>;

  static RefundStatus parse(Object? value, RefundScope scope) {
    final body = RefundValidation.object(value, const [
      'version',
      'network',
      'namespace',
      'pool',
      'requestId',
      'state',
      'verification',
      'deadline',
      'donation',
      'refund',
      'settlement',
      'safeActions',
      'reason',
    ]);
    RefundValidation.require(
        body['version'] is int && body['version'] == 1 && scope.matches(body));
    final state = body['state'];
    final rule = _rules[state];
    RefundValidation.require(rule != null);
    final selected = rule!;
    final actions = body['safeActions'];
    RefundValidation.require(
      body['verification'] == selected.verification &&
          selected.reasons.contains(body['reason']) &&
          actions is List &&
          actions.length == selected.actions.length &&
          List.generate(
                  actions.length, (i) => actions[i] == selected.actions[i])
              .every((same) => same),
    );
    final deadline = body['deadline'];
    RefundValidation.require(
      deadline is String &&
          RegExp(r'^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d{1,9})?([Zz]|\+00:00)$')
              .hasMatch(deadline),
    );
    final deadlineText = deadline! as String;
    final parsed = DateTime.tryParse(deadlineText);
    RefundValidation.require(
      parsed != null &&
          parsed.isUtc &&
          parsed.toIso8601String().substring(0, 19) ==
              deadlineText.substring(0, 19).toUpperCase(),
    );
    final donation = RefundValidation.object(body['donation'], const [
      'paymentOperationId',
      'paymentTransactionHash',
      'donor',
      'asset',
      'grossAmount',
    ]);
    final operationId = donation['paymentOperationId'];
    RefundValidation.require(
      operationId is String &&
          RegExp(r'^[1-9][0-9]{0,19}$').hasMatch(operationId),
    );
    RefundValidation.require(
      BigInt.parse(operationId! as String) <=
          BigInt.parse('18446744073709551615'),
    );
    RefundValidation.hash(donation['paymentTransactionHash']);
    RefundValidation.publicKey(donation['donor']);
    final gross = RefundValidation.amount(donation['grossAmount']);
    _asset(donation['asset']);
    final refund = body['refund'];
    RefundValidation.require(
      !const ['pending', 'refund_observed', 'refund_failed_observed']
              .contains(state) ||
          refund != null,
    );
    if (refund != null) {
      final item = RefundValidation.object(refund, const [
        'transactionHash',
        'amount',
        'claimableBalanceId',
      ]);
      RefundValidation.hash(item['transactionHash']);
      RefundValidation.require(
          RefundValidation.amount(item['amount'], positive: true) <= gross);
      final balanceId = item['claimableBalanceId'];
      RefundValidation.require(
        balanceId == null ||
            (balanceId is String &&
                RegExp(r'^00000000[0-9a-f]{64}$').hasMatch(balanceId)),
      );
    }
    final settlement = RefundValidation.object(body['settlement'], const [
      'beneficiaryClaimedAmount',
      'donorRefundedAmount',
      'remainingPrincipalAmount',
    ]);
    for (final amount in settlement.values) {
      if (amount != null) {
        RefundValidation.require(RefundValidation.amount(amount) <= gross);
      }
    }
    if (state == 'settled') {
      RefundValidation.require(
          settlement.values.every((amount) => amount != null));
      final claimed =
          RefundValidation.amount(settlement['beneficiaryClaimedAmount']);
      final refunded =
          RefundValidation.amount(settlement['donorRefundedAmount']);
      RefundValidation.require(
        settlement['remainingPrincipalAmount'] == '0.0000000' &&
            claimed + refunded == gross,
      );
    }
    return RefundStatus._(_freeze(body) as Map<String, Object?>);
  }

  /// Facts identifying the original donation must never change during recovery.
  bool sameDonation(RefundStatus other) =>
      deadline == other.deadline && _equal(donation, other.donation);

  static bool _equal(Object? a, Object? b) {
    if (a is Map && b is Map) {
      return a.length == b.length &&
          a.keys.every((k) => b.containsKey(k) && _equal(a[k], b[k]));
    }
    return a == b;
  }

  static void _asset(Object? value) {
    RefundValidation.require(value is Map<String, Object?>);
    final item = value! as Map<String, Object?>;
    if (item['type'] == 'native') {
      RefundValidation.object(item, const ['type']);
      return;
    }
    RefundValidation.object(item, const ['type', 'code', 'issuer']);
    final code = item['code'];
    RefundValidation.require(
      item['type'] == 'issued' &&
          code is String &&
          RegExp(r'^[a-zA-Z0-9]{1,12}$').hasMatch(code),
    );
    RefundValidation.publicKey(item['issuer']);
  }

  static Object? _freeze(Object? value) {
    if (value is Map<String, Object?>) {
      return Map<String, Object?>.unmodifiable(
          value.map((k, v) => MapEntry(k, _freeze(v))));
    }
    if (value is List) return List<Object?>.unmodifiable(value.map(_freeze));
    return value;
  }
}

class _Rule {
  const _Rule(this.verification, this.reasons, this.actions);
  final String verification;
  final List<String?> reasons;
  final List<String> actions;
}

const _read = ['refund_status'];
const _observe = ['refund_status', 'refund_reconcile'];
const _rules = <String, _Rule>{
  'not_due': _Rule('unverified', ['deadline_not_reached'], _read),
  'not_started': _Rule('unverified', [null], ['refund', 'refund_status']),
  'blocked': _Rule('unverified',
      ['financial_precondition_unavailable', 'remainder_protected'], _observe),
  'pending': _Rule('unverified', [null], _observe),
  'unknown': _Rule('unverified', ['outcome_unresolved'], _observe),
  'refund_observed': _Rule('persisted_sdk_observation', [null], _observe),
  'refund_failed_observed':
      _Rule('persisted_sdk_observation', ['refund_failed'], _observe),
  'settled': _Rule('persisted_sdk_observation', [null], _read),
};
