import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stellar_flutter_sdk/stellar_flutter_sdk.dart';
import 'package:vaca_app/features/refund/data/refund_http_client.dart';
import 'package:vaca_app/features/refund/data/refund_submission_journal.dart';
import 'package:vaca_app/features/refund/data/refund_wallet_signer.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';
import 'package:vaca_app/features/refund/domain/refund_status.dart';
import 'refund_test_fixtures.dart';

void main() {
  refundWireTests();
  test('UTC RFC3339 retains original deadline spelling and rejects overflow',
      () {
    for (final deadline in [
      '2026-11-07T12:05:00Z',
      '2026-11-07T12:05:00+00:00',
      '2026-11-07t12:05:00z'
    ]) {
      final status = RefundStatus.parse(
          refundFixture('not_started')..['deadline'] = deadline,
          refundTestScope);
      expect(status.deadline, deadline);
    }
    for (final deadline in [
      '2026-02-30T12:05:00Z',
      '2026-11-07T12:05:00+01:00'
    ]) {
      expect(
          () => RefundStatus.parse(
              refundFixture('not_started')..['deadline'] = deadline,
              refundTestScope),
          throwsA(isA<RefundProtocolError>()));
    }
  });
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

void refundWireTests() {
  test('personal proof has exact fields and the specified independent preimage',
      () async {
    final storage = RefundMemoryStorage();
    final proof = await RefundWalletSigner(storage)
        .sign(refundTestScope, RefundAction.status, 1700000000);
    expect(proof.keys.toSet(), {
      'version',
      'network',
      'pool',
      'namespace',
      'action',
      'request_id',
      'timestamp',
      'payload',
      'wallet',
      'signature'
    });
    final canonical =
        '{"action":"refund_status","namespace":"${refundTestScope.namespace}",'
        '"network":"TESTNET","payload":{},"pool":"${refundTestScope.pool}",'
        '"request_id":"${refundTestScope.requestId}","timestamp":1700000000,'
        '"version":1,"wallet":"${refundTestWallet.accountId}"}';
    final digest = Uint8List.fromList(sha256
        .convert(utf8.encode('Stellar Signed Message:\n$canonical'))
        .bytes);
    final signature = base64Decode(proof['signature']! as String);
    expect(signature.length, 64);
    expect(base64Encode(signature), proof['signature']);
    expect(
        KeyPair.fromAccountId(refundTestWallet.accountId)
            .verify(digest, signature),
        isTrue);
    expect(proof['payload'], isEmpty);
    expect(storage.events, isEmpty);
  });

  test('three exact routes and one-use acknowledged local reservation',
      () async {
    final storage = RefundMemoryStorage();
    final requests = <String>[];
    final http = RefundHttpClient(
        projectUrl: Uri.parse('https://project.invalid'),
        publicApiKey: 'public-test-key',
        signer: RefundWalletSigner(storage),
        now: () => DateTime.utc(2026, 11, 7, 12, 6),
        adapter: RefundTestAdapter((request) async {
          final body = jsonDecode(request.data! as String) as Map;
          final action = body['action'] as String;
          requests.add(action);
          expect(request.method, 'POST');
          expect(request.followRedirects, isFalse);
          expect(request.headers['apikey'], 'public-test-key');
          expect(request.uri.path,
              '/functions/v1/d1-custody/${RefundAction.values.singleWhere((a) => a.wire == action).path}');
          expect(body['request_id'], refundTestScope.requestId);
          expect(body.keys.length, 10);
          expect(utf8.encode(request.data! as String).length,
              lessThanOrEqualTo(8192));
          if (action == 'refund')
            expect(storage.events, ['write:start', 'write:ack']);
          return refundTestResponse('pending',
              code: action == 'refund_status' ? 200 : 202);
        }));
    addTearDown(http.close);
    await expectLater(http.send(refundTestScope, RefundAction.refund),
        throwsA(isA<RefundProtocolError>()));
    expect(requests, isEmpty);
    final journal = RefundSubmissionJournal(storage);
    final permit = await journal.reserve(refundTestScope,
        RefundStatus.parse(refundFixture('not_started'), refundTestScope));
    await http.send(refundTestScope, RefundAction.refund, reservation: permit);
    await expectLater(
        http.send(refundTestScope, RefundAction.refund, reservation: permit),
        throwsA(isA<RefundProtocolError>()));
    await http.send(refundTestScope, RefundAction.status);
    await http.send(refundTestScope, RefundAction.reconcile);
    expect(requests, ['refund', 'refund_status', 'refund_reconcile']);
    expect(
        storage.values.keys
            .where((key) => key.startsWith('d1.refund.v1.'))
            .length,
        1);
    expect(storage.events, ['write:start', 'write:ack']);
  });
}
