import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/features/refund/data/refund_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_http_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_submission_journal.dart';
import 'package:vaca_app/features/refund/data/refund_submission_gate.dart';
import 'package:vaca_app/features/refund/data/refund_submission_journal.dart';
import 'package:vaca_app/features/refund/domain/refund_remainder_status.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';
import 'package:vaca_app/features/refund/domain/refund_status.dart';

import 'refund_client_test.dart' show consumer, transport;
import 'refund_remainder_status_test.dart' show remainderFixture;
import 'refund_test_fixtures.dart';

// Faults occur at the storage port, not in the journal/consumer under test.
class _Storage extends RefundMemoryStorage {
  final trace = <String>[];
  String? fault;
  bool written = false;
  @override
  Future<Result<String?>> read(String key) async {
    if (key == 'stellar.testnet.secret-seed') {
      trace.add('sign:read');
    } else if (written && key.startsWith('d1.refund.submission.')) {
      trace.add('readback');
      if (fault == 'readback') {
        return const Failure(VacaError(code: 'synthetic_readback'));
      }
    }
    return super.read(key);
  }

  @override
  Future<Result<void>> write(String key, String value) async {
    trace.add('write');
    if (fault == 'reject') {
      return const Failure(VacaError(code: 'synthetic_write'));
    }
    final result = await super.write(key, value);
    written = true;
    if (fault == 'lost_ack') {
      return const Failure(VacaError(code: 'synthetic_ack'));
    }
    trace.add('ack');
    return result;
  }
}

RemainderClient _client(
    RefundMemoryStorage storage, Future<ResponseBody> Function(RequestOptions) reply,) {
  final http = RemainderHttpClient(
    projectUrl: Uri.parse('https://project.invalid'),
    publicApiKey: 'synthetic-public-key',
    storage: storage,
    adapter: RefundTestAdapter(reply),
    now: () => DateTime.utc(2026, 11, 7, 12, 6),
  );
  addTearDown(http.close);
  return RemainderClient(http: http, journal: RemainderSubmissionJournal(storage));
}

String _action(RequestOptions request) =>
    (jsonDecode(request.data! as String) as Map)['action'] as String;
ResponseBody _reply(String state, {int code = 200}) => ResponseBody.fromString(
      jsonEncode(remainderFixture(state)), code,
      headers: {'content-type': ['application/json'], 'cache-control': ['no-store']},
    );
final _journalError = throwsA(isA<RefundProtocolError>().having(
    (error) => error.code, 'code', 'd1_refund_journal_unavailable',),);

void _unknown(RemainderClientResult result, String code, bool? recorded) {
  expect(result.state, 'unknown');
  expect(result.status, isNull);
  expect(result.isSettled, isFalse);
  expect(result.errorCode, code);
  expect(result.firstPostRecorded, recorded);
  expect(result.safeActions, recorded == true
      ? [RemainderAction.status, RemainderAction.reconcile]
      : [RemainderAction.status],);
}

void main() {
  for (final lane in ['v1', 'v2']) {
    test('$lane gate is durable, detached and refuses either second lane', () async {
      final storage = _Storage();
      final gate = RefundSubmissionGate(storage);
      final baseline = lane == 'v1'
          ? refundFixture('not_started') : remainderFixture('not_started');
      await gate.reserve(refundTestScope, lane, baseline);
      final saved = Map<String, String>.from(storage.values);
      final writes = List<String>.from(storage.events);
      final hold = (await RefundSubmissionGate(storage).load(refundTestScope))!;
      expect(hold.lane, lane);
      expect(hold.baseline, baseline);
      (hold.baseline['donation']! as Map)['grossAmount'] = '1.0000000';
      expect(hold.matchesOriginal(baseline), isTrue);
      for (final next in ['v1', 'v2']) {
        await expectLater(gate.reserve(refundTestScope, next, next == 'v1'
            ? refundFixture('not_started') : remainderFixture('not_started'),), _journalError,);
      }
      expect(storage.values, saved);
      expect(storage.events, writes);
      expect(storage.trace.where((event) => event == 'sign:read'), isEmpty);
    });

    test('$lane journal permit can be consumed only once', () async {
      final storage = _Storage();
      final void Function(RefundScope) consume;
      if (lane == 'v1') {
        final permit = await RefundSubmissionJournal(storage).reserve(refundTestScope,
            RefundStatus.parse(refundFixture('not_started'), refundTestScope),);
        consume = permit.consume;
      } else {
        final permit = await RemainderSubmissionJournal(storage).reserve(refundTestScope,
            RemainderStatus.parse(remainderFixture('not_started'), refundTestScope),);
        consume = permit.consume;
      }
      final saved = Map<String, String>.from(storage.values);
      final writes = List<String>.from(storage.events);
      consume(refundTestScope);
      expect(() => consume(refundTestScope), throwsA(isA<RefundProtocolError>()));
      expect((await RefundSubmissionGate(storage).load(refundTestScope))!.lane, lane);
      expect(storage.values, saved);
      expect(storage.events, writes);
    });

    test('$lane wins concurrent full clients; opposite lane observes only', () async {
      final storage = _Storage();
      final actions = <String>[];
      Future<ResponseBody> reply(RequestOptions request) async {
        final action = _action(request);
        actions.add(action);
        storage.trace.add(action);
        final v2 = action.startsWith('refund_remainder');
        final submit = action == 'refund' || action == 'refund_remainder';
        return v2 ? _reply(submit ? 'pending' : 'not_started', code: submit ? 202 : 200)
            : refundTestResponse(submit ? 'pending' : 'not_started', code: submit ? 202 : 200);
      }
      final v1Http = transport(storage, RefundTestAdapter(reply));
      addTearDown(v1Http.close);
      final v1 = consumer(v1Http, storage);
      final v2 = _client(storage, reply);
      final first = lane == 'v1' ? v1.requestRefund(refundTestScope) : v2.requestRefund(refundTestScope);
      final second = lane == 'v1' ? v2.requestRefund(refundTestScope) : v1.requestRefund(refundTestScope);
      final results = await Future.wait<Object>([first, second]);
      final v1Result = results[lane == 'v1' ? 0 : 1] as RefundClientResult;
      expect(v1Result.errorCode, isNull);
      expect(v1Result.firstPostRecorded, isTrue);
      expect(v1Result.state, lane == 'v1' ? 'pending' : 'not_started');
      expect(v1Result.safeActions, lane == 'v1'
          ? [RefundAction.status, RefundAction.reconcile] : [RefundAction.status],);
      final v2Result = results[lane == 'v2' ? 0 : 1] as RemainderClientResult;
      expect(v2Result.errorCode, isNull);
      expect(v2Result.firstPostRecorded, isTrue);
      expect(v2Result.holdLane, lane);
      expect(v2Result.state, lane == 'v2' ? 'pending' : 'not_started');
      expect(v2Result.safeActions, lane == 'v2'
          ? [RemainderAction.status, RemainderAction.reconcile]
          : [RemainderAction.status],);
      expect(actions, lane == 'v1'
          ? ['refund_status', 'refund', 'refund_remainder_status']
          : ['refund_remainder_status', 'refund_remainder', 'refund_status'],);
      expect((await RefundSubmissionGate(storage).load(refundTestScope))!.lane, lane);
      final signIndexes = <int>[for (var i = 0; i < storage.trace.length; i++)
        if (storage.trace[i] == 'sign:read') i,];
      expect(signIndexes.length, 3);
      final ack = storage.trace.indexOf('ack');
      final readback = storage.trace.indexOf('readback');
      expect(ack, greaterThan(signIndexes.first));
      expect(readback, greaterThan(ack));
      expect(signIndexes[1], greaterThan(readback));
      expect(storage.trace.indexOf(lane == 'v1' ? 'refund' : 'refund_remainder'), greaterThan(signIndexes[1]));
    });
  }

  for (final fault in ['reject', 'lost_ack', 'readback']) {
    test('$fault prevents v2 signing/POST after fresh status', () async {
      final storage = _Storage()..fault = fault;
      final before = Map<String, String>.from(storage.values);
      final actions = <String>[];
      final client = _client(storage, (request) async {
        actions.add(_action(request));
        return _reply('not_started');
      });
      final result = await client.requestRefund(refundTestScope);
      _unknown(result, 'd1_refund_journal_unavailable', false);
      expect(result.holdLane, isNull);
      expect(actions, ['refund_remainder_status']);
      expect(storage.trace.where((event) => event == 'sign:read').length, 1);
      expect(storage.trace.where((event) => event == 'write').length, 1);
      storage.fault = null;
      final hold = await RefundSubmissionGate(storage).load(refundTestScope);
      if (fault == 'reject') {
        expect(hold, isNull);
        expect(storage.values, before);
        expect(storage.events, isEmpty);
      } else {
        expect(hold!.lane, 'v2');
        final durable = Map<String, String>.from(storage.values);
        final writes = List<String>.from(storage.events);
        final restored = await client.requestRefund(refundTestScope);
        expect(restored.firstPostRecorded, isTrue);
        expect(restored.safeActions, [RemainderAction.status]);
        expect(actions, ['refund_remainder_status', 'refund_remainder_status']);
        expect(storage.values, durable);
        expect(storage.events, writes);
      }
    });
  }

  test('legacy v1 is recognized without migration; conflicts fail before signing', () async {
    final seeded = RefundMemoryStorage();
    await RefundSubmissionJournal(seeded).reserve(refundTestScope,
        RefundStatus.parse(refundFixture('not_started'), refundTestScope),);
    for (final conflict in [false, true]) {
      final storage = _Storage();
      if (conflict) {
        await RemainderSubmissionJournal(storage).reserve(refundTestScope,
            RemainderStatus.parse(remainderFixture('not_started'), refundTestScope),);
      }
      // Model an old installation through the storage fixture port.
      storage.values.addEntries(seeded.values.entries.where((entry) => entry.key.startsWith('d1.refund.v1.')));
      final before = Map<String, String>.from(storage.values);
      final writes = List<String>.from(storage.events);
      final actions = <String>[];
      final client = _client(storage, (request) async {
        actions.add(_action(request));
        return _reply('not_started');
      });
      final result = await client.requestRefund(refundTestScope);
      if (conflict) {
        _unknown(result, 'd1_refund_journal_unavailable', null);
        expect(result.holdLane, isNull);
        expect(actions, isEmpty);
        expect(storage.trace.where((event) => event == 'sign:read'), isEmpty);
        await expectLater(RefundSubmissionGate(storage).load(refundTestScope), _journalError);
      } else {
        expect(result.state, 'not_started');
        expect(result.errorCode, isNull);
        expect(result.firstPostRecorded, isTrue);
        expect(result.holdLane, 'v1');
        expect(result.safeActions, [RemainderAction.status]);
        expect(actions, ['refund_remainder_status']);
        expect((await RefundSubmissionGate(storage).load(refundTestScope))!.lane, 'v1');
      }
      expect(storage.values, before);
      expect(storage.events, writes);
    }
  });

  test('lost v2 reply retains hold across reconstruction; recovery is explicit', () async {
    final storage = _Storage();
    final actions = <String>[];
    Future<ResponseBody> reply(RequestOptions request) async {
      final action = _action(request);
      actions.add(action);
      if (action == 'refund_remainder') {
        throw DioException(requestOptions: request, type: DioExceptionType.receiveTimeout,
            message: 'private diagnostic',);
      }
      return _reply(actions.length == 1 ? 'not_started' : 'unknown',
          code: action == 'refund_remainder_reconcile' ? 202 : 200,);
    }
    final result = await _client(storage, reply).requestRefund(refundTestScope);
    _unknown(result, 'd1_remainder_transport_unavailable', true);
    expect(result.holdLane, 'v2');
    expect(actions, ['refund_remainder_status', 'refund_remainder']);
    final durable = Map<String, String>.from(storage.values);
    final writes = List<String>.from(storage.events);
    final restored = _client(storage, reply);
    for (final operation in [restored.requestRefund, restored.status, restored.reconcile]) {
      final observed = await operation(refundTestScope);
      expect(observed.state, 'unknown');
      expect(observed.status, isNotNull);
      expect(observed.errorCode, isNull);
      expect(observed.firstPostRecorded, isTrue);
      expect(observed.holdLane, 'v2');
      expect(observed.isSettled, isFalse);
      expect(observed.safeActions, [RemainderAction.status, RemainderAction.reconcile]);
    }
    expect(actions, ['refund_remainder_status', 'refund_remainder',
      'refund_remainder_status', 'refund_remainder_status', 'refund_remainder_reconcile',],);
    expect(storage.values, durable);
    expect(storage.events, writes);
  });

  test('cold construction is passive; status and ineligible intent never reserve', () async {
    final storage = _Storage();
    final before = Map<String, String>.from(storage.values);
    final actions = <String>[];
    var state = 'not_started';
    final client = _client(storage, (request) async {
      actions.add(_action(request));
      return _reply(state);
    });
    expect(storage.trace, isEmpty);
    expect(actions, isEmpty);
    final initial = await client.status(refundTestScope);
    expect(initial.state, 'not_started');
    expect(initial.firstPostRecorded, isFalse);
    expect(initial.safeActions, [RemainderAction.refund, RemainderAction.status]);
    for (state in ['not_due', 'blocked', 'pending', 'unknown', 'refund_observed', 'refund_failed_observed', 'settled']) {
      final result = await client.requestRefund(refundTestScope);
      expect(result.state, state);
      expect(result.errorCode, isNull);
      expect(result.firstPostRecorded, isFalse);
      expect(result.holdLane, isNull);
      expect(result.isSettled, state == 'settled');
      expect(result.safeActions, RemainderStatus.parse(remainderFixture(state), refundTestScope).safeActions);
    }
    expect(actions, List.filled(8, 'refund_remainder_status'));
    expect(storage.values, before);
    expect(storage.events, isEmpty);
  });

  test('durable original deadline rejects changed facts after reconstruction', () async {
    final storage = _Storage();
    await RemainderSubmissionJournal(storage).reserve(refundTestScope,
        RemainderStatus.parse(remainderFixture('not_started'), refundTestScope),);
    final before = Map<String, String>.from(storage.values);
    final writes = List<String>.from(storage.events);
    final actions = <String>[];
    final client = _client(storage, (request) async {
      actions.add(_action(request));
      final body = remainderFixture('settled')..['deadline'] = '2026-11-07T12:10:00Z';
      return ResponseBody.fromString(jsonEncode(body), 200,
          headers: {'content-type': ['application/json'], 'cache-control': ['no-store']},);
    });
    _unknown(await client.requestRefund(refundTestScope), 'd1_refund_response_unverified', true);
    expect(actions, ['refund_remainder_status']);
    expect(storage.values, before);
    expect(storage.events, writes);
  });
}
