import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/features/refund/data/refund_client.dart';
import 'package:vaca_app/features/refund/data/refund_http_client.dart';
import 'package:vaca_app/features/refund/data/refund_submission_journal.dart';
import 'package:vaca_app/features/refund/data/refund_wallet_signer.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';
import 'package:vaca_app/features/refund/presentation/refund_panel.dart';
import 'package:vaca_app/features/refund/refund_providers.dart';
import 'refund_test_fixtures.dart';
import 'refund_client_test.dart' show expectV1Reservation;

class _ObservedClient extends RefundClient {
  _ObservedClient({required super.http, required super.journal});
  int completedStatuses = 0;
  late Completer<void> commandDone;

  Future<RefundClientResult> _observe(
      Future<RefundClientResult> Function() command, {bool status = false}) async {
    final completion = commandDone;
    try {
      final result = await command();
      if (status) completedStatuses++;
      return result;
    } finally {
      completion.complete();
    }
  }

  @override
  Future<RefundClientResult> status(RefundScope scope) =>
      _observe(() => super.status(scope), status: true);
  @override
  Future<RefundClientResult> requestRefund(RefundScope scope) =>
      _observe(() => super.requestRefund(scope));
  @override
  Future<RefundClientResult> reconcile(RefundScope scope) =>
      _observe(() => super.reconcile(scope));
}

_ObservedClient _client(RefundMemoryStorage storage, List<String> actions,
    Future<ResponseBody> Function(String) reply) {
  final http = RefundHttpClient(
    projectUrl: Uri.parse('https://project.invalid'),
    publicApiKey: 'public-test-key',
    signer: RefundWalletSigner(storage),
    now: () => DateTime.utc(2026, 11, 7, 12, 6),
    adapter: RefundTestAdapter((request) async {
      final body = jsonDecode(request.data! as String) as Map;
      expect(body['request_id'], refundTestScope.requestId);
      actions.add(body['action'] as String);
      return reply(body['action'] as String);
    }),
  );
  addTearDown(http.close);
  return _ObservedClient(http: http, journal: RefundSubmissionJournal(storage));
}

Widget _view(RefundClient client, RefundScope scope) => ProviderScope(
      overrides: [refundClientProvider.overrideWithValue(client)],
      child: MaterialApp(
          home: Scaffold(
              body: SingleChildScrollView(
                  child: RefundPanel(
                      key: const ValueKey('panel'), scope: scope)))),
    );
Finder _panelText(String text) => find.descendant(
    of: find.byKey(const ValueKey('panel')), matching: find.text(text));
Finder _panelKey(String key) => find.descendant(
    of: find.byKey(const ValueKey('panel')), matching: find.byKey(ValueKey(key)));

Future<void> _tap(WidgetTester tester, _ObservedClient client, String key,
    {bool startsCommand = true}) async {
  final target = key == 'refund-confirm'
      ? find.descendant(of: find.byType(AlertDialog),
          matching: find.byKey(ValueKey(key)))
      : _panelKey(key);
  expect(target, findsOneWidget);
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
  final awaitsCommand = startsCommand && key != 'refund-request';
  // Start the gesture/continuations and await the real consumer in one zone.
  // Pumping simulated frames cannot substitute for awaiting streamed responses.
  await tester.runAsync(() async {
    if (awaitsCommand) client.commandDone = Completer<void>();
    await tester.tap(target);
    if (awaitsCommand) await client.commandDone.future;
  });
  await tester.pumpAndSettle();
  if (key == 'refund-request') return; // Busy until the explicit dialog choice.
  const busy = 'Estado: Consulta o solicitud en curso';
  expect(tester.widget<Text>(_panelKey('refund-state')).data, isNot(busy));
}

void _noRefund() =>
    expect(find.byKey(const ValueKey('refund-request')), findsNothing);

void main() {
  testWidgets(
      'original provenance and a reported attempt never imply settlement',
      (tester) async {
    final storage = RefundMemoryStorage();
    final before = Map<String, String>.from(storage.values);
    final actions = <String>[];
    var state = 'pending';
    final client =
        _client(storage, actions, (_) async => refundTestResponse(state));
    await tester.pumpWidget(_view(client, refundTestScope));
    expect(find.byKey(const ValueKey('refund-original-donor')), findsNothing);
    expect(
        find.byKey(const ValueKey('refund-attempt-reference')), findsNothing);
    await _tap(tester, client, 'refund-status');
    expect(tester.widget<SelectableText>(_panelKey('refund-original-donor')).data,
        'Donante original: ${refundTestWallet.accountId}');
    expect(_panelText('Operación de pago original: 1'), findsOneWidget);
    expect(_panelText('Transacción de pago original: ${'a' * 64}'), findsOneWidget);
    expect(tester.widget<SelectableText>(_panelKey('refund-attempt-reference')).data,
        'Referencia del intento: ${'b' * 64}');
    expect(
        find.text('Importe reportado del intento: 9.0000000'), findsOneWidget);
    expect(
        find.text(
            'La referencia y el importe del intento no prueban liquidación.'),
        findsOneWidget);
    expect(find.text('Importe original: 10.0000000'), findsOneWidget);
    expect(find.text('Estado: Pendiente'), findsOneWidget);
    expect(find.text('Devuelto al donante: Desconocido'), findsOneWidget);
    expect(find.text('Estado: Donación liquidada'), findsNothing);
    _noRefund();
    state = 'not_started';
    await _tap(tester, client, 'refund-status');
    expect(
        find.byKey(const ValueKey('refund-attempt-reference')), findsNothing);
    expect(find.text('Importe reportado del intento: 9.0000000'), findsNothing);
    expect(tester.widget<SelectableText>(_panelKey('refund-original-donor')).data,
        'Donante original: ${refundTestWallet.accountId}');
    expect(_panelText('Importe original: 10.0000000'), findsOneWidget);
    expect(actions, ['refund_status', 'refund_status']);
    expect(storage.values, before);
    expect(storage.events, isEmpty);
  });
  testWidgets(
      'cold panel and a private failure expose status-only unknown hold',
      (tester) async {
    final storage = RefundMemoryStorage();
    final before = Map<String, String>.from(storage.values);
    final actions = <String>[];
    final client = _client(
        storage, actions, (_) async => throw StateError('PRIVATE_FAILURE'));
    await tester.pumpWidget(_view(client, refundTestScope));
    expect(actions, isEmpty);
    expect(find.text('Estado: Sin consultar'), findsOneWidget);
    expect(find.text('Solicitud original: ${refundTestScope.requestId}'),
        findsOneWidget);
    _noRefund();
    await _tap(tester, client, 'refund-status');
    expect(actions, ['refund_status']);
    expect(find.text('Estado: Resultado desconocido'), findsOneWidget);
    expect(find.textContaining('PRIVATE_FAILURE'), findsNothing);
    expect(find.byKey(const ValueKey('refund-reconcile')), findsNothing);
    _noRefund();
    expect(storage.values, before);
    expect(storage.events, isEmpty);
  });

  testWidgets(
      'confirmation is explicit; a lost reply and recorded hold never reoffer refund',
      (tester) async {
    final storage = RefundMemoryStorage();
    final actions = <String>[];
    final client = _client(storage, actions, (action) async {
      if (action == 'refund') throw StateError('PRIVATE_FAILURE');
      return refundTestResponse('not_started');
    });
    await tester.pumpWidget(_view(client, refundTestScope));
    await _tap(tester, client, 'refund-status');
    await _tap(tester, client, 'refund-request');
    expect(actions, ['refund_status']);
    await tester.runAsync(() => tester.tap(find.text('Cancelar')));
    await tester.pumpAndSettle();
    expect(storage.events, isEmpty);
    await _tap(tester, client, 'refund-request');
    await _tap(tester, client, 'refund-confirm');
    expect(actions, ['refund_status', 'refund_status', 'refund']);
    expect(find.text('Estado: Resultado desconocido'), findsOneWidget);
    expect(find.textContaining('PRIVATE_FAILURE'), findsNothing);
    _noRefund();
    expectV1Reservation(storage);
    final baseline =
        await RefundSubmissionJournal(storage).load(refundTestScope);
    expect(baseline!.donation['grossAmount'], '10.0000000');
    final saved = Map<String, String>.from(storage.values);
    await _tap(tester, client, 'refund-status');
    expect(
        actions, ['refund_status', 'refund_status', 'refund', 'refund_status']);
    _noRefund();
    expect(storage.values, saved);
    expectV1Reservation(storage);
  });

  testWidgets(
      'protected gross and unknown amounts remain visible; reconcile is explicit',
      (tester) async {
    final storage = RefundMemoryStorage();
    final before = Map<String, String>.from(storage.values);
    final actions = <String>[];
    final client = _client(storage, actions, (action) async {
      if (action == 'refund_reconcile') return refundTestResponse('settled');
      final body = refundFixture('blocked');
      body['settlement'] = {
        'beneficiaryClaimedAmount': '1.0000000',
        'donorRefundedAmount': null,
        'remainingPrincipalAmount': '9.0000000'
      };
      return ResponseBody.fromString(jsonEncode(body), 200, headers: {
        'cache-control': ['no-store']
      });
    });
    await tester.pumpWidget(_view(client, refundTestScope));
    await _tap(tester, client, 'refund-status');
    expect(actions, ['refund_status']);
    expect(tester.widget<SelectableText>(_panelKey('refund-original-donor')).data,
        'Donante original: ${refundTestWallet.accountId}');
    expect(_panelText('Importe original: 10.0000000'), findsOneWidget);
    expect(_panelText('Cobrado por beneficiario: 1.0000000'), findsOneWidget);
    expect(_panelText('Principal pendiente: 9.0000000'), findsOneWidget);
    expect(_panelText('Devuelto al donante: Desconocido'), findsOneWidget);
    _noRefund();
    await _tap(tester, client, 'refund-reconcile');
    expect(actions, ['refund_status', 'refund_reconcile']);
    expect(find.text('Estado: Donación liquidada'), findsOneWidget);
    expect(find.text('Importe original: 10.0000000'), findsOneWidget);
    expect(find.text('Principal pendiente: 0.0000000'), findsOneWidget);
    expect(find.byKey(const ValueKey('refund-reconcile')), findsNothing);
    _noRefund();
    expect(storage.values, before);
    expect(storage.events, isEmpty);
  });

  testWidgets('A-B-A scope changes discard old responses and old confirmations',
      (tester) async {
    final other = RefundScope(
        namespace: refundTestScope.namespace,
        pool: refundTestScope.pool,
        requestId: '33333333-3333-3333-3333-333333333333');
    for (final confirmation in [false, true]) {
      final storage = RefundMemoryStorage();
      final before = Map<String, String>.from(storage.values);
      final actions = <String>[];
      late Completer<ResponseBody> pending;
      final client = _client(
          storage,
          actions,
          (_) => confirmation
              ? Future.value(refundTestResponse('not_started'))
              : pending.future);
      await tester.pumpWidget(_view(client, refundTestScope));
      if (confirmation) {
        await _tap(tester, client, 'refund-status');
        await _tap(tester, client, 'refund-request');
      } else {
        await tester.runAsync(() async {
          pending = Completer<ResponseBody>();
          client.commandDone = Completer<void>();
          await tester.tap(find.byKey(const ValueKey('refund-status')));
        });
        await tester.pump();
        expect(
            tester
                .widget<OutlinedButton>(
                    find.byKey(const ValueKey('refund-status')))
                .onPressed,
            isNull);
      }
      await tester.pumpWidget(_view(client, other));
      await tester.pumpWidget(_view(client, refundTestScope));
      if (confirmation)
        await _tap(tester, client, 'refund-confirm', startsCommand: false);
      else {
        await tester.runAsync(() async {
          pending.complete(refundTestResponse('not_started'));
          await client.commandDone.future;
        });
        expect(client.completedStatuses, 1);
        await tester.pumpAndSettle();
      }
      expect(actions, ['refund_status']);
      expect(find.text('Estado: Sin consultar'), findsOneWidget);
      _noRefund();
      expect(storage.values, before);
      expect(storage.events, isEmpty);
    }
  });
}
