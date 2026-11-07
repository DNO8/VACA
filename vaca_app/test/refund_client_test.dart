import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/features/refund/data/refund_client.dart';
import 'package:vaca_app/features/refund/data/refund_http_client.dart';
import 'package:vaca_app/features/refund/data/refund_submission_journal.dart';
import 'package:vaca_app/features/refund/data/refund_wallet_signer.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';
import 'refund_test_fixtures.dart';

RefundHttpClient transport(
        RefundMemoryStorage storage, RefundTestAdapter adapter) =>
    RefundHttpClient(
        projectUrl: Uri.parse('https://project.invalid'),
        publicApiKey: 'public-test-key',
        signer: RefundWalletSigner(storage),
        adapter: adapter,
        now: () => DateTime.utc(2026, 11, 7, 12, 6));

RefundClient consumer(RefundHttpClient http, RefundMemoryStorage storage) =>
    RefundClient(http: http, journal: RefundSubmissionJournal(storage));

void main() {
  test(
      'lost reply and concurrent instances retain one refund POST; reconstruction is status only',
      () async {
    final storage = RefundMemoryStorage();
    final requests = <String>[];
    var refunds = 0;
    var missing = false;
    final http = transport(storage, RefundTestAdapter((request) async {
      final body = jsonDecode(request.data! as String) as Map;
      final action = body['action'] as String;
      expect(body['request_id'], refundTestScope.requestId);
      requests.add(action);
      if (action == 'refund') {
        refunds++;
        expect(storage.events, ['write:start', 'write:ack']);
        expect(
            storage.values.keys
                .where((key) => key.startsWith('d1.refund.v1.'))
                .length,
            1);
        throw DioException(
            requestOptions: request,
            type: DioExceptionType.receiveTimeout,
            message: 'private diagnostic must not escape');
      }
      if (missing)
        return ResponseBody.fromString('{"error":"request_not_found"}', 404,
            headers: {
              'cache-control': ['no-store']
            });
      return refundTestResponse(refunds == 0 ? 'not_started' : 'unknown');
    }));
    addTearDown(http.close);
    final results = await Future.wait([
      consumer(http, storage).requestRefund(refundTestScope),
      consumer(http, storage).requestRefund(refundTestScope)
    ]);
    expect(refunds, 1);
    expect(requests, ['refund_status', 'refund', 'refund_status']);
    expect(results.first.state, 'unknown');
    expect(results.first.status, isNull);
    expect(results.first.safeActions, isEmpty);
    expect(results.first.errorCode, isNot(contains('private diagnostic')));
    expect(results.last.safeActions, isNot(contains(RefundAction.refund)));
    final durable = Map<String, String>.from(storage.values);
    missing = true;
    final restored =
        await consumer(http, storage).requestRefund(refundTestScope);
    expect(restored.state, 'unknown');
    expect(restored.isSettled, isFalse);
    expect(restored.safeActions, isEmpty);
    expect(refunds, 1);
    expect(requests.last, 'refund_status');
    expect(storage.values, durable);
    expect(storage.events, ['write:start', 'write:ack']);
  });

  test('unacknowledged journal write prevents the first refund POST', () async {
    final storage = RefundMemoryStorage()..rejectWrite = true;
    final before = Map<String, String>.from(storage.values);
    final requests = <String>[];
    final http = transport(storage, RefundTestAdapter((request) async {
      requests.add(
          (jsonDecode(request.data! as String) as Map)['action'] as String);
      return refundTestResponse('not_started');
    }));
    addTearDown(http.close);
    final result = await consumer(http, storage).requestRefund(refundTestScope);
    expect(result.state, 'unknown');
    expect(result.safeActions, isEmpty);
    expect(requests, ['refund_status']);
    expect(storage.events, ['write:start']);
    expect(storage.values, before);
  });

  test('malformed body and redirect cannot authorize the first refund',
      () async {
    for (final reply in [
      ResponseBody.fromString('{', 200, headers: {
        'cache-control': ['no-store']
      }),
      ResponseBody.fromString('{}', 302, headers: {
        'location': ['https://elsewhere.invalid'],
        'cache-control': ['no-store']
      }),
    ]) {
      final storage = RefundMemoryStorage();
      final before = Map<String, String>.from(storage.values);
      final requests = <String>[];
      final http = transport(storage, RefundTestAdapter((request) async {
        requests.add(
            (jsonDecode(request.data! as String) as Map)['action'] as String);
        expect(request.followRedirects, isFalse);
        return reply;
      }));
      addTearDown(http.close);
      final result =
          await consumer(http, storage).requestRefund(refundTestScope);
      expect(result.state, 'unknown');
      expect(result.status, isNull);
      expect(result.safeActions, isEmpty);
      expect(result.isSettled, isFalse);
      expect(requests, ['refund_status']);
      expect(storage.events, isEmpty);
      expect(storage.values, before);
    }
  });

  test('a reduced gross cannot replace the original gross10 after claim1',
      () async {
    final storage = RefundMemoryStorage();
    var refunds = 0;
    final http = transport(storage, RefundTestAdapter((request) async {
      final action = (jsonDecode(request.data! as String) as Map)['action'];
      if (action == 'refund_status' && refunds == 0)
        return refundTestResponse('not_started');
      if (action == 'refund') refunds++;
      final shrunk = refundFixture('settled')..['refund'] = null;
      (shrunk['donation']! as Map)['grossAmount'] = '1.0000000';
      (shrunk['settlement']! as Map)['donorRefundedAmount'] = '0.0000000';
      return ResponseBody.fromString(jsonEncode(shrunk), 200, headers: {
        'cache-control': ['no-store']
      });
    }));
    addTearDown(http.close);
    for (var i = 0; i < 2; i++) {
      final result =
          await consumer(http, storage).requestRefund(refundTestScope);
      expect(result.state, 'unknown');
      expect(result.isSettled, isFalse);
      expect(result.safeActions, isEmpty);
    }
    expect(refunds, 1);
    final saved = await RefundSubmissionJournal(storage).load(refundTestScope);
    expect(saved!.donation['grossAmount'], '10.0000000');
  });

  test(
      'full gross10 equals claim1 plus refund9; reconcile is separately explicit',
      () async {
    final storage = RefundMemoryStorage();
    final requests = <String>[];
    final http = transport(storage, RefundTestAdapter((request) async {
      final action =
          (jsonDecode(request.data! as String) as Map)['action'] as String;
      requests.add(action);
      return refundTestResponse(
          requests.length == 1 ? 'not_started' : 'settled');
    }));
    addTearDown(http.close);
    final client = consumer(http, storage);
    final settled = await client.requestRefund(refundTestScope);
    expect(settled.isSettled, isTrue);
    expect(settled.safeActions, [RefundAction.status]);
    expect(requests, ['refund_status', 'refund']);
    final reconciled = await client.reconcile(refundTestScope);
    expect(reconciled.isSettled, isTrue);
    expect(requests, ['refund_status', 'refund', 'refund_reconcile']);
    expect(storage.events, ['write:start', 'write:ack']);
  });

  test('non-not_started states never cause refund or create a local attempt',
      () async {
    for (final state in [
      'not_due',
      'blocked',
      'pending',
      'unknown',
      'refund_observed',
      'refund_failed_observed',
      'settled'
    ]) {
      final storage = RefundMemoryStorage();
      final requests = <String>[];
      final http = transport(storage, RefundTestAdapter((request) async {
        requests.add(
            (jsonDecode(request.data! as String) as Map)['action'] as String);
        return refundTestResponse(state);
      }));
      addTearDown(http.close);
      final result =
          await consumer(http, storage).requestRefund(refundTestScope);
      expect(result.state, state);
      expect(result.safeActions, isNot(contains(RefundAction.refund)));
      expect(requests, ['refund_status']);
      expect(storage.events, isEmpty);
    }
  });

  test('all documented error codes remain unknown holds without write or retry',
      () async {
    for (final row in [
      (400, 'invalid_request'),
      (401, 'stale_request'),
      (401, 'invalid_signature'),
      (403, 'unauthorized_admin_wallet'),
      (404, 'request_not_found'),
      (404, 'not_found'),
      (405, 'method_not_allowed'),
      (503, 'refund_unavailable')
    ]) {
      final storage = RefundMemoryStorage();
      final before = Map<String, String>.from(storage.values);
      var calls = 0;
      final http = transport(storage, RefundTestAdapter((request) async {
        calls++;
        expect((jsonDecode(request.data! as String) as Map)['action'],
            'refund_status');
        return ResponseBody.fromString(jsonEncode({'error': row.$2}), row.$1,
            headers: {
              'cache-control': ['no-store']
            });
      }));
      addTearDown(http.close);
      final result =
          await consumer(http, storage).requestRefund(refundTestScope);
      expect(result.state, 'unknown');
      expect(result.errorCode, row.$2);
      expect(result.status, isNull);
      expect(result.safeActions, isEmpty);
      expect(result.isSettled, isFalse);
      expect(calls, 1);
      expect(storage.values, before);
      expect(storage.events, isEmpty);
    }
  });
}
