// Source scenarios only: not executed under the financial-test deferral.
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_status_client.dart';
import 'package:vaca_app/features/refund/domain/refund_remainder_status.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';

import 'refund_test_fixtures.dart';
import 'refund_remainder_status_test.dart' show remainderFixture;

class _Storage extends RefundMemoryStorage {
  int reads = 0;
  @override
  Future<Result<String?>> read(String key) {
    reads++;
    return super.read(key);
  }
}

ResponseBody _reply(Object body, {int code = 200, bool noStore = true}) =>
    ResponseBody.fromString(body is String ? body : jsonEncode(body), code,
        headers: {
          'content-type': ['application/json; charset=utf-8'],
          if (noStore) 'cache-control': ['no-store']
        });

void main() {
  test(
      'cold construction has no effects; one status signs the exact v2 envelope',
      () async {
    final storage = _Storage();
    final before = Map<String, String>.from(storage.values);
    var calls = 0;
    final client = RemainderStatusClient(
        projectUrl: Uri.parse('https://example.invalid'),
        publicApiKey: 'synthetic-public-key',
        storage: storage,
        now: () => DateTime.utc(2026, 11, 7),
        adapter: RefundTestAdapter((options) async {
          calls++;
          expect(options.method, 'POST');
          expect(options.uri.path,
              '/functions/v1/d1-custody/refund-remainder-status');
          expect(options.followRedirects, isFalse);
          final root =
              jsonDecode(options.data! as String) as Map<String, dynamic>;
          expect(root.keys.toSet(), {
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
          expect(root['version'], 2);
          expect(root['network'], 'TESTNET');
          expect(root['action'], 'refund_remainder_status');
          expect(root['request_id'], refundTestScope.requestId);
          expect(root['namespace'], refundTestScope.namespace);
          expect(root['pool'], refundTestScope.pool);
          expect(root['wallet'], refundTestWallet.accountId);
          expect(root['timestamp'],
              DateTime.utc(2026, 11, 7).millisecondsSinceEpoch ~/ 1000);
          expect(root['payload'], isEmpty);
          final signatureText = root.remove('signature') as String;
          final signature = base64Decode(signatureText);
          expect(signature.length, 64);
          expect(base64Encode(signature), signatureText);
          final keys = root.keys.toList()..sort();
          final canonical =
              jsonEncode({for (final key in keys) key: root[key]});
          final digest = Uint8List.fromList(sha256
              .convert(utf8.encode('Stellar Signed Message:\n$canonical'))
              .bytes);
          expect(refundTestWallet.verify(digest, signature), isTrue);
          return _reply(remainderFixture('not_started'));
        }));
    addTearDown(client.close);
    expect(storage.reads, 0);
    expect(calls, 0);
    final result = await client.status(refundTestScope);
    expect(result.state, 'not_started');
    expect(result.safeActions, [RemainderAction.status]);
    expect(result.errorCode, isNull);
    expect(calls, 1);
    expect(storage.reads, 1);
    expect(storage.events, isEmpty);
    expect(storage.values, before);
  });

  test(
      'lost, invalid, cached, duplicate or non-200 responses stay unknown without retry',
      () async {
    final replies = <Future<ResponseBody> Function()>[
      () async => throw StateError('private provider diagnostics'),
      () async => _reply(remainderFixture('settled'), noStore: false),
      () async => _reply(remainderFixture('settled'), code: 202),
      () async => _reply(jsonEncode(remainderFixture('settled'))
          .replaceFirst('"version":2', '"version":2,"version":2')),
      () async => _reply({'error': 'refund_unavailable'}, code: 503),
      () async => _reply(
          {'error': 'remainder_unavailable', 'private': 'hidden'},
          code: 503),
    ];
    for (final reply in replies) {
      final storage = _Storage();
      final before = Map<String, String>.from(storage.values);
      var calls = 0;
      final client = RemainderStatusClient(
          projectUrl: Uri.parse('https://example.invalid'),
          publicApiKey: 'synthetic-public-key',
          storage: storage,
          adapter: RefundTestAdapter((_) {
            calls++;
            return reply();
          }));
      final result = await client.status(refundTestScope);
      client.close();
      expect(result.state, 'unknown');
      expect(result.status, isNull);
      expect(result.isSettled, isFalse);
      expect(result.safeActions, isEmpty);
      expect(result.errorCode, isNot(contains('private')));
      expect(calls, 1);
      expect(storage.events, isEmpty);
      expect(storage.values, before);
    }
  });

  test(
      'exact errors are sanitized and original donation/deadline cannot change',
      () async {
    for (final pair in [
      (400, 'invalid_request'),
      (401, 'stale_request'),
      (401, 'invalid_signature'),
      (403, 'unauthorized_admin_wallet'),
      (404, 'request_not_found'),
      (404, 'not_found'),
      (405, 'method_not_allowed'),
      (503, 'remainder_unavailable')
    ]) {
      var calls = 0;
      final storage = _Storage();
      final client = RemainderStatusClient(
          projectUrl: Uri.parse('https://example.invalid'),
          publicApiKey: 'synthetic-public-key',
          storage: storage,
          adapter: RefundTestAdapter((_) async {
            calls++;
            return _reply({'error': pair.$2}, code: pair.$1);
          }));
      final result = await client.status(refundTestScope);
      client.close();
      expect(result.errorCode, pair.$2);
      expect(result.state, 'unknown');
      expect(result.safeActions, isEmpty);
      expect(calls, 1);
      expect(storage.events, isEmpty);
    }
    final baseline =
        RemainderStatus.parse(remainderFixture('unknown'), refundTestScope);
    final changed = remainderFixture('settled')
      ..['deadline'] = '2026-11-07T12:10:00Z';
    final client = RemainderStatusClient(
        projectUrl: Uri.parse('https://example.invalid'),
        publicApiKey: 'synthetic-public-key',
        storage: _Storage(),
        adapter: RefundTestAdapter((_) async => _reply(changed)));
    addTearDown(client.close);
    expect((await client.status(refundTestScope, previous: baseline)).state,
        'unknown');
    final foreign = RefundScope(
        namespace: refundTestScope.namespace,
        pool: refundTestScope.pool,
        requestId: '33333333-3333-3333-3333-333333333333');
    expect((await client.status(foreign, previous: baseline)).state, 'unknown');
  });
}
