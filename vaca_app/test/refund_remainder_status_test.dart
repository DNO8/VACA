// Source scenarios only: financial/protocol execution remains deferred.
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';
import 'package:vaca_app/features/refund/domain/refund_remainder_status.dart';

import 'refund_test_fixtures.dart';

// Synthetic fixture construction only, never conversion of persisted v1 receipts.
Map<String, Object?> remainderFixture(String state) {
  final body = refundFixture(state);
  body['version'] = 2;
  body['safeActions'] = (body['safeActions']! as List<String>)
      .map((action) => action.replaceFirst('refund', 'refund_remainder'))
      .toList();
  return body;
}

void main() {
  for (final state in [
    'not_due',
    'not_started',
    'blocked',
    'pending',
    'unknown',
    'refund_observed',
    'refund_failed_observed',
    'settled'
  ]) {
    test('v2 exact state $state preserves original gross and null facts', () {
      final body = remainderFixture(state);
      final parsed = RemainderStatus.parse(body, refundTestScope);
      expect(parsed.toJson(), body);
      expect(parsed.state, state);
      expect(parsed.isSettled, state == 'settled');
      expect(parsed.donation['grossAmount'], '10.0000000');
      expect(parsed.deadline, body['deadline']);
      expect(parsed.safeActions.map((a) => a.wire), body['safeActions']);
      if (state != 'settled') {
        expect(parsed.settlement.values, everyElement(isNull));
      }
    });
  }

  test(
      'positive 1 + 9 settles original 10; beneficiary-only settlement is valid',
      () {
    final body = remainderFixture('settled');
    final parsed = RemainderStatus.parse(body, refundTestScope);
    expect(parsed.refund!['amount'], '9.0000000');
    expect(parsed.refund!['claimableBalanceId'], isNull);
    expect(parsed.settlement.values, ['1.0000000', '9.0000000', '0.0000000']);
    body['refund'] = null;
    body['settlement'] = {
      'beneficiaryClaimedAmount': '10.0000000',
      'donorRefundedAmount': '0.0000000',
      'remainingPrincipalAmount': '0.0000000'
    };
    expect(RemainderStatus.parse(body, refundTestScope).isSettled, isTrue);
  });

  test('included failure retains 9 and never permits a new refund command', () {
    final body = remainderFixture('refund_failed_observed');
    body['settlement'] = {
      'beneficiaryClaimedAmount': '1.0000000',
      'donorRefundedAmount': '0.0000000',
      'remainingPrincipalAmount': '9.0000000'
    };
    final parsed = RemainderStatus.parse(body, refundTestScope);
    expect(parsed.isSettled, isFalse);
    expect(parsed.safeActions,
        [RemainderAction.status, RemainderAction.reconcile]);
    expect(parsed.settlement['remainingPrincipalAmount'], '9.0000000');
  });

  test(
      'v1, non-payment CB, contradictory settlement and reordered actions reject',
      () {
    final variants = <Map<String, Object?>>[
      refundFixture('settled'),
      {...remainderFixture('settled'), 'version': 2.0},
      {
        ...remainderFixture('settled'),
        'refund': {
          'transactionHash': 'b' * 64,
          'amount': '9.0000000',
          'claimableBalanceId': '00000000${'a' * 64}'
        }
      },
      {
        ...remainderFixture('settled'),
        'settlement': {
          'beneficiaryClaimedAmount': null,
          'donorRefundedAmount': '9.0000000',
          'remainingPrincipalAmount': '0.0000000'
        }
      },
      {
        ...remainderFixture('settled'),
        'settlement': {
          'beneficiaryClaimedAmount': '0.0000000',
          'donorRefundedAmount': '9.0000000',
          'remainingPrincipalAmount': '0.0000000'
        }
      },
      {...remainderFixture('pending'), 'refund': null},
      {
        ...remainderFixture('unknown'),
        'safeActions': ['refund_remainder_reconcile', 'refund_remainder_status']
      },
      {
        ...remainderFixture('unknown'),
        'requestId': '33333333-3333-3333-3333-333333333333'
      },
      {...remainderFixture('unknown'), 'deadline': '2026-02-30T00:00:00Z'},
      {...remainderFixture('unknown'), 'extra': true},
    ];
    for (final body in variants) {
      expect(() => RemainderStatus.parse(body, refundTestScope),
          throwsA(isA<RefundProtocolError>()));
    }
  });

  test('exact int64 money bounds, positive gross and nullable zeros', () {
    for (final gross in ['0.0000000', '922337203685.4775808', '10.0', 10.0]) {
      final body = remainderFixture('unknown');
      (body['donation']! as Map<String, Object?>)['grossAmount'] = gross;
      expect(() => RemainderStatus.parse(body, refundTestScope),
          throwsA(isA<RefundProtocolError>()));
    }
    final body = remainderFixture('unknown');
    (body['donation']! as Map<String, Object?>)['grossAmount'] =
        '922337203685.4775807';
    expect(RemainderStatus.parse(body, refundTestScope).donation['grossAmount'],
        '922337203685.4775807');
  });

  test('detached exports cannot rewrite immutable facts or extend deadline',
      () {
    final parsed =
        RemainderStatus.parse(remainderFixture('unknown'), refundTestScope);
    final changed = parsed.toJson();
    (changed['donation']! as Map<String, Object?>)['grossAmount'] = '9.0000000';
    changed['deadline'] = '2026-11-07T12:10:00Z';
    expect(parsed.donation['grossAmount'], '10.0000000');
    expect(parsed.sameDonation(RemainderStatus.parse(changed, refundTestScope)),
        isFalse);
    expect(() => parsed.donation['grossAmount'] = '9.0000000',
        throwsUnsupportedError);
  });
}
