import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/features/refund/data/refund_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_http_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_status_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_submission_journal.dart';
import 'package:vaca_app/features/refund/data/refund_submission_journal.dart';
import 'package:vaca_app/features/refund/domain/refund_remainder_status.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';

import 'refund_client_test.dart' show consumer, transport;
import 'refund_remainder_status_test.dart' show remainderFixture;
import 'refund_test_fixtures.dart';

const _hostErrors = ['custody_unavailable', 'initial_submission_unavailable'];

ResponseBody _reply(String body, int code) => ResponseBody.fromString(
      body,
      code,
      headers: {
        'content-type': ['application/json'],
        'cache-control': ['no-store'],
      },
    );

String _action(RequestOptions request) {
  expect(request.method, 'POST');
  expect(request.followRedirects, isFalse);
  final action = (jsonDecode(request.data! as String) as Map)['action'] as String;
  expect(
    request.uri.path,
    '/functions/v1/d1-custody/${action.replaceAll('_', '-')}',
  );
  return action;
}

void _v1Failure(RefundClientResult result, String code) {
  expect(result.state, 'unknown');
  expect(result.status, isNull);
  expect(result.isSettled, isFalse);
  expect(result.errorCode, code);
  expect(result.firstPostRecorded, isNull);
  expect(result.safeActions, isEmpty);
}

void _v2Failure(RemainderClientResult result, String code, bool recorded) {
  expect(result.state, 'unknown');
  expect(result.status, isNull);
  expect(result.isSettled, isFalse);
  expect(result.errorCode, code);
  expect(result.firstPostRecorded, recorded);
  expect(result.holdLane, recorded ? 'v2' : null);
  expect(
    result.safeActions,
    recorded
        ? [RemainderAction.status, RemainderAction.reconcile]
        : [RemainderAction.status],
  );
}

// Exercise the consumer, including its fresh-status/reservation path for refund.
// A second explicit intent after an error must observe, never submit again.
Future<void> _v1Case(
  RefundAction action,
  String body,
  String expectedCode, {
  int httpCode = 503,
  bool rejectPreflight = false,
}) async {
  final storage = RefundMemoryStorage();
  final journal = RefundSubmissionJournal(storage);
  final requests = <String>[];
  final submitted = action == RefundAction.refund && !rejectPreflight;
  final http = transport(storage, RefundTestAdapter((request) async {
    requests.add(_action(request));
    if (submitted && requests.length == 1) {
      expect(requests.single, 'refund_status');
      return refundTestResponse('not_started');
    }
    return _reply(body, httpCode);
  }));
  addTearDown(http.close);
  final client = consumer(http, storage);
  final result = await switch (action) {
    RefundAction.status => client.status(refundTestScope),
    RefundAction.refund => client.requestRefund(refundTestScope),
    RefundAction.reconcile => client.reconcile(refundTestScope),
  };
  _v1Failure(result, expectedCode);
  expect(
    requests,
    submitted
        ? ['refund_status', 'refund']
        : [rejectPreflight ? 'refund_status' : action.wire],
  );
  expect(
    storage.events,
    submitted
        ? ['write:start', 'write:ack', 'write:start', 'write:ack']
        : isEmpty,
  );
  final saved = await journal.load(refundTestScope);
  final hold = await journal.sharedHold(refundTestScope);
  expect(saved?.toJson(), submitted ? refundFixture('not_started') : null);
  expect(hold?.lane, submitted ? 'v1' : null);
  expect(hold?.baseline, submitted ? refundFixture('not_started') : null);
  if (submitted) {
    final writes = List<String>.from(storage.events);
    final restored = consumer(http, storage);
    _v1Failure(await restored.requestRefund(refundTestScope), expectedCode);
    expect(requests, ['refund_status', 'refund', 'refund_status']);
    expect((await journal.load(refundTestScope))!.toJson(), saved!.toJson());
    final retained = (await journal.sharedHold(refundTestScope))!;
    expect(retained.lane, hold!.lane);
    expect(retained.baseline, hold.baseline);
    expect(storage.events, writes);
  }
}

Future<void> _v2Case(
  RemainderAction action,
  String body,
  String expectedCode, {
  int httpCode = 503,
  bool rejectPreflight = false,
}) async {
  final storage = RefundMemoryStorage();
  final journal = RemainderSubmissionJournal(storage);
  final requests = <String>[];
  final submitted = action == RemainderAction.refund && !rejectPreflight;
  final http = RemainderHttpClient(
    projectUrl: Uri.parse('https://project.invalid'),
    publicApiKey: 'synthetic-public-key',
    storage: storage,
    now: () => DateTime.utc(2026, 11, 7, 12, 6),
    adapter: RefundTestAdapter((request) async {
      requests.add(_action(request));
      if (submitted && requests.length == 1) {
        expect(requests.single, 'refund_remainder_status');
        return _reply(jsonEncode(remainderFixture('not_started')), 200);
      }
      return _reply(body, httpCode);
    }),
  );
  addTearDown(http.close);
  final client = RemainderClient(http: http, journal: journal);
  final result = await switch (action) {
    RemainderAction.status => client.status(refundTestScope),
    RemainderAction.refund => client.requestRefund(refundTestScope),
    RemainderAction.reconcile => client.reconcile(refundTestScope),
  };
  _v2Failure(result, expectedCode, submitted);
  expect(
    requests,
    submitted
        ? ['refund_remainder_status', 'refund_remainder']
        : [rejectPreflight ? 'refund_remainder_status' : action.wire],
  );
  expect(storage.events, submitted ? ['write:start', 'write:ack'] : isEmpty);
  final hold = await journal.load(refundTestScope);
  expect(hold?.lane, submitted ? 'v2' : null);
  expect(hold?.baseline, submitted ? remainderFixture('not_started') : null);
  if (submitted) {
    final writes = List<String>.from(storage.events);
    final restored = RemainderClient(
      http: http,
      journal: RemainderSubmissionJournal(storage),
    );
    _v2Failure(await restored.requestRefund(refundTestScope), expectedCode, true);
    expect(requests, [
      'refund_remainder_status',
      'refund_remainder',
      'refund_remainder_status',
    ]);
    final retained = (await journal.load(refundTestScope))!;
    expect(retained.lane, hold!.lane);
    expect(retained.baseline, hold.baseline);
    expect(storage.events, writes);
  }
}

Future<void> _passiveCase(
  String body,
  String expectedCode, {
  int httpCode = 503,
}) async {
  final storage = RefundMemoryStorage();
  final requests = <String>[];
  final baseline = RemainderStatus.parse(
    remainderFixture('unknown'),
    refundTestScope,
  );
  final client = RemainderStatusClient(
    projectUrl: Uri.parse('https://project.invalid'),
    publicApiKey: 'synthetic-public-key',
    storage: storage,
    now: () => DateTime.utc(2026, 11, 7, 12, 6),
    adapter: RefundTestAdapter((request) async {
      requests.add(_action(request));
      return _reply(body, httpCode);
    }),
  );
  addTearDown(client.close);
  final result = await client.status(refundTestScope, previous: baseline);
  expect(result.state, 'unknown');
  expect(result.status, isNull);
  expect(result.isSettled, isFalse);
  expect(result.errorCode, expectedCode);
  expect(result.safeActions, isEmpty);
  expect(requests, ['refund_remainder_status']);
  expect(storage.events, isEmpty);
  expect(await RemainderSubmissionJournal(storage).load(refundTestScope), isNull);
  expect(baseline.toJson(), remainderFixture('unknown'));
}

// These must stay unverified, not inherit recognition from a code substring or
// a permissive JSON/HTTP match. Duplicate names include an escaped alias.
final _rejectedReplies = <(String, int)>[
  ('{"error":"unrecognized_host_error"}', 503),
  ('{', 503),
  ('{"error":"custody_unavailable","extra":true}', 503),
  ('{"error":503}', 503),
  (r'{"error":"custody_unavailable","\u0065rror":"custody_unavailable"}', 503),
  for (final code in _hostErrors) (jsonEncode({'error': code}), 200),
];

void main() {
  for (final action in RefundAction.values) {
    for (final code in [..._hostErrors, 'refund_unavailable']) {
      test('v1 ${action.wire}: HTTP 503 $code is a failure, never a retry', () async {
        await _v1Case(action, jsonEncode({'error': code}), code);
      });
    }
    test('v1 ${action.wire}: unknown/malformed errors stay unverified', () async {
      for (final reply in _rejectedReplies) {
        await _v1Case(
          action,
          reply.$1,
          'd1_refund_response_unverified',
          httpCode: reply.$2,
        );
      }
    });
  }
  for (final action in RemainderAction.values) {
    for (final code in [..._hostErrors, 'remainder_unavailable']) {
      test('v2 ${action.wire}: HTTP 503 $code is a failure, never a retry', () async {
        await _v2Case(action, jsonEncode({'error': code}), code);
      });
    }
    test('v2 ${action.wire}: unknown/malformed errors stay unverified', () async {
      for (final reply in _rejectedReplies) {
        await _v2Case(
          action,
          reply.$1,
          'd1_refund_response_unverified',
          httpCode: reply.$2,
        );
      }
    });
  }
  for (final code in [..._hostErrors, 'remainder_unavailable']) {
    test('passive v2 status: HTTP 503 $code is a failure, never a retry', () async {
      await _passiveCase(jsonEncode({'error': code}), code);
    });
  }
  test('passive v2 status: unknown/malformed errors stay unverified', () async {
    for (final reply in _rejectedReplies) {
      await _passiveCase(
        reply.$1,
        'd1_remainder_response_unverified',
        httpCode: reply.$2,
      );
    }
  });
  for (final code in _hostErrors) {
    test('v1 preflight $code cannot reserve or send refund', () async {
      await _v1Case(
        RefundAction.refund,
        jsonEncode({'error': code}),
        code,
        rejectPreflight: true,
      );
    });
    test('v2 preflight $code cannot reserve or send refund', () async {
      await _v2Case(
        RemainderAction.refund,
        jsonEncode({'error': code}),
        code,
        rejectPreflight: true,
      );
    });
  }
}
