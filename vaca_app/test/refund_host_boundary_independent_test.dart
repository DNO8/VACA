import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_http_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_status_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_submission_journal.dart';
import 'package:vaca_app/features/refund/domain/refund_remainder_status.dart';

import 'refund_client_test.dart' show consumer, transport;
import 'refund_test_fixtures.dart';

const hostCodes = [
  'custody_unavailable',
  'initial_submission_unavailable',
];

String storageHash(RefundMemoryStorage storage) {
  final keys = storage.values.keys.toList()..sort();
  return sha256.convert(utf8.encode(jsonEncode({
    for (final key in keys) key: storage.values[key],
  }))).toString();
}

String actionOf(RequestOptions request) =>
    (jsonDecode(request.data! as String) as Map)['action'] as String;

ResponseBody reply(String body, int status, String? cache) =>
    ResponseBody.fromString(body, status, headers: {
      'content-type': ['application/json'],
      if (cache != null) 'cache-control': [cache],
    });

RemainderHttpClient remainderTransport(
  RefundMemoryStorage storage,
  RefundTestAdapter adapter,
) =>
    RemainderHttpClient(
      projectUrl: Uri.parse('https://project.invalid'),
      publicApiKey: 'synthetic-public-key',
      storage: storage,
      adapter: adapter,
      now: () => DateTime.utc(2026, 11, 7, 12, 6),
    );

void main() {
  test('S18: error admission never writes or advances failed preflight',
      () async {
    for (final code in hostCodes) {
      for (final row in <(int, String?, bool)>[
        (503, 'private, NO-STORE', true),
        (503, null, false),
        (503, 'no-cache', false),
        (502, 'no-store', false),
        (504, 'no-store', false),
        (409, 'no-store', false),
        (202, 'no-store', false),
      ]) {
        for (var lane = 0; lane < 3; lane++) {
          final storage = RefundMemoryStorage();
          final before = storageHash(storage);
          final calls = <String>[];
          final adapter = RefundTestAdapter((request) async {
            calls.add(actionOf(request));
            expect(request.followRedirects, isFalse);
            return reply(jsonEncode({'error': code}), row.$1, row.$2);
          });
          String? error;
          if (lane == 0) {
            final http = transport(storage, adapter);
            addTearDown(http.close);
            final result =
                await consumer(http, storage).requestRefund(refundTestScope);
            error = result.errorCode;
            expect(result.status, isNull);
            expect(result.isSettled, isFalse);
            expect(result.safeActions, isEmpty);
          } else if (lane == 1) {
            final http = remainderTransport(storage, adapter);
            addTearDown(http.close);
            final result = await RemainderClient(
              http: http,
              journal: RemainderSubmissionJournal(storage),
            ).requestRefund(refundTestScope);
            error = result.errorCode;
            expect(result.status, isNull);
            expect(result.isSettled, isFalse);
            expect(result.firstPostRecorded, isFalse);
            expect(result.safeActions, [RemainderAction.status]);
          } else {
            final http = RemainderStatusClient(
              projectUrl: Uri.parse('https://project.invalid'),
              publicApiKey: 'synthetic-public-key',
              storage: storage,
              adapter: adapter,
              now: () => DateTime.utc(2026, 11, 7, 12, 6),
            );
            addTearDown(http.close);
            final result = await http.status(refundTestScope);
            error = result.errorCode;
            expect(result.status, isNull);
            expect(result.isSettled, isFalse);
            expect(result.safeActions, isEmpty);
          }
          expect(
            error,
            row.$3
                ? code
                : lane == 2
                    ? 'd1_remainder_response_unverified'
                    : 'd1_refund_response_unverified',
          );
          expect(calls, [
            lane == 0 ? 'refund_status' : 'refund_remainder_status',
          ]);
          expect(storage.events, isEmpty);
          expect(storageHash(storage), before);
        }
      }
    }
  });

  test('S18: failed v1 attempt blocks v2 and preserves raw journal bytes',
      () async {
    for (final code in hostCodes) {
      final storage = RefundMemoryStorage();
      final calls = <String>[];
      String? reservedHash;
      final adapter = RefundTestAdapter((request) async {
        calls.add(actionOf(request));
        if (calls.length == 1) return refundTestResponse('not_started');
        reservedHash ??= storageHash(storage);
        return reply(jsonEncode({'error': code}), 503, 'no-store');
      });
      final v1 = transport(storage, adapter);
      final v2 = remainderTransport(storage, adapter);
      addTearDown(v1.close);
      addTearDown(v2.close);

      final first =
          await consumer(v1, storage).requestRefund(refundTestScope);
      expect(first.errorCode, code);
      expect(first.status, isNull);
      expect(first.isSettled, isFalse);
      expect(storageHash(storage), reservedHash);
      final writes = List<String>.from(storage.events);

      final second = await RemainderClient(
        http: v2,
        journal: RemainderSubmissionJournal(storage),
      ).requestRefund(refundTestScope);
      expect(second.errorCode, code);
      expect(second.status, isNull);
      expect(second.isSettled, isFalse);
      expect(second.firstPostRecorded, isTrue);
      expect(second.holdLane, 'v1');
      expect(second.safeActions, [
        RemainderAction.status,
        RemainderAction.reconcile,
      ]);
      expect(storageHash(storage), reservedHash);
      expect(storage.events, writes);
      expect(calls, [
        'refund_status',
        'refund',
        'refund_remainder_status',
      ]);
    }
  });
}
