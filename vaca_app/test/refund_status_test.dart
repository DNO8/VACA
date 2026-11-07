import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';
import 'package:vaca_app/features/refund/domain/refund_status.dart';
import 'refund_test_fixtures.dart';

void main() {
  test('all eight exact states preserve unknown amounts and frozen donation',
      () {
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
      final raw = refundFixture(state);
      final status = RefundStatus.parse(raw, refundTestScope);
      expect(status.state, state);
      expect(status.isSettled, state == 'settled');
      expect(() => status.donation['grossAmount'] = '0.0000000',
          throwsUnsupportedError);
      (raw['donation']! as Map)['grossAmount'] = '0.0000000';
      expect(status.donation['grossAmount'], '10.0000000');
      if (state != 'settled') {
        expect((status.toJson()['settlement']! as Map).values,
            everyElement(isNull));
      }
    }
  });

  test('rejects contradictory actions, correlation and partial settlement', () {
    final actions = refundFixture('unknown')..['safeActions'] = ['refund'];
    final wrongId = refundFixture('not_started')
      ..['requestId'] = '33333333-3333-3333-3333-333333333333';
    final partial = refundFixture('settled');
    (partial['settlement']! as Map)['donorRefundedAmount'] = '0.0000000';
    final extra = refundFixture('not_started')..['xdr'] = 'untrusted';
    for (final raw in [actions, wrongId, partial, extra]) {
      expect(() => RefundStatus.parse(raw, refundTestScope),
          throwsA(isA<RefundProtocolError>()));
    }
  });
}
