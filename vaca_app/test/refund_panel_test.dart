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

RefundClient _client(RefundMemoryStorage storage, List<String> actions,
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
  return RefundClient(http: http, journal: RefundSubmissionJournal(storage));
}

Widget _view(RefundClient client, RefundScope scope) => ProviderScope(
      overrides: [refundClientProvider.overrideWithValue(client)],
      child: MaterialApp(
          home: Scaffold(
              body: SingleChildScrollView(
                  child: RefundPanel(
                      key: const ValueKey('panel'), scope: scope)))),
    );
Future<void> _tap(WidgetTester tester, String key) async {
  final target = find.byKey(ValueKey(key));
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pumpAndSettle();
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
    await _tap(tester, 'refund-status');
    expect(find.text('Donante original: ${refundTestWallet.accountId}'),
        findsOneWidget);
    expect(find.text('Operación de pago original: 1'), findsOneWidget);
    expect(
        find.text('Transacción de pago original: ${'a' * 64}'), findsOneWidget);
    expect(find.text('Referencia del intento: ${'b' * 64}'), findsOneWidget);
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
    await _tap(tester, 'refund-status');
    expect(
        find.byKey(const ValueKey('refund-attempt-reference')), findsNothing);
    expect(find.text('Importe reportado del intento: 9.0000000'), findsNothing);
    expect(find.text('Donante original: ${refundTestWallet.accountId}'),
        findsOneWidget);
    expect(find.text('Importe original: 10.0000000'), findsOneWidget);
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
    await _tap(tester, 'refund-status');
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
    await _tap(tester, 'refund-status');
    await _tap(tester, 'refund-request');
    expect(actions, ['refund_status']);
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    expect(storage.events, isEmpty);
    await _tap(tester, 'refund-request');
    await _tap(tester, 'refund-confirm');
    expect(actions, ['refund_status', 'refund_status', 'refund']);
    expect(find.text('Estado: Resultado desconocido'), findsOneWidget);
    expect(find.textContaining('PRIVATE_FAILURE'), findsNothing);
    _noRefund();
    expect(storage.events, ['write:start', 'write:ack']);
    final baseline =
        await RefundSubmissionJournal(storage).load(refundTestScope);
    expect(baseline!.donation['grossAmount'], '10.0000000');
    final saved = Map<String, String>.from(storage.values);
    await _tap(tester, 'refund-status');
    expect(
        actions, ['refund_status', 'refund_status', 'refund', 'refund_status']);
    _noRefund();
    expect(storage.values, saved);
    expect(storage.events, ['write:start', 'write:ack']);
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
    await _tap(tester, 'refund-status');
    expect(actions, ['refund_status']);
    expect(find.text('Importe original: 10.0000000'), findsOneWidget);
    expect(find.text('Principal pendiente: 9.0000000'), findsOneWidget);
    expect(find.text('Devuelto al donante: Desconocido'), findsOneWidget);
    _noRefund();
    await _tap(tester, 'refund-reconcile');
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
      final pending = Completer<ResponseBody>();
      final client = _client(
          storage,
          actions,
          (_) => confirmation
              ? Future.value(refundTestResponse('not_started'))
              : pending.future);
      await tester.pumpWidget(_view(client, refundTestScope));
      if (confirmation) {
        await _tap(tester, 'refund-status');
        await _tap(tester, 'refund-request');
      } else {
        await tester.tap(find.byKey(const ValueKey('refund-status')));
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
        await _tap(tester, 'refund-confirm');
      else {
        pending.complete(refundTestResponse('not_started'));
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
