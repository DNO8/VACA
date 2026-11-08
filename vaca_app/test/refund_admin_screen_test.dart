import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/features/refund/presentation/refund_admin_screen.dart';
import 'package:vaca_app/features/refund/presentation/refund_panel.dart';
import 'package:vaca_app/features/refund/refund_providers.dart';
import 'refund_test_fixtures.dart';

Widget _view(VoidCallback onRead) => ProviderScope(
      overrides: [
        refundClientProvider.overrideWith((ref) {
          onRead();
          throw StateError('PRIVATE_CONFIGURATION');
        })
      ],
      child: const MaterialApp(home: Scaffold(body: RefundAdminEntry())),
    );
Future<void> _tap(WidgetTester tester, String key) async {
  final target = find.byKey(ValueKey(key));
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> _enter(
    WidgetTester tester, String namespace, String pool, String request) async {
  for (final entry in {
    'refund-namespace': namespace,
    'refund-pool': pool,
    'refund-original-request': request
  }.entries) {
    final field = find.byKey(ValueKey(entry.key));
    await tester.ensureVisible(field);
    await tester.enterText(field, entry.value);
  }
}

void main() {
  testWidgets('entry opens and returns without constructing a financial client',
      (tester) async {
    var reads = 0;
    await tester.pumpWidget(_view(() => reads++));
    await _tap(tester, 'refund-admin-entry');
    expect(find.byType(RefundAdminScreen), findsOneWidget);
    expect(find.byType(RefundPanel), findsNothing);
    expect(find.textContaining('abrir esta pantalla no concede permisos'),
        findsOneWidget);
    expect(reads, 0);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('refund-admin-entry')), findsOneWidget);
    expect(reads, 0);
  });

  testWidgets(
      'missing and noncanonical identifiers never produce a scope or call',
      (tester) async {
    var reads = 0;
    await tester.pumpWidget(_view(() => reads++));
    await _tap(tester, 'refund-admin-entry');
    await _tap(tester, 'refund-open-original');
    expect(find.text('Ingresá el UUID original en minúsculas, sin espacios.'),
        findsNWidgets(2));
    expect(find.text('Ingresá una clave pública Stellar válida (G…).'),
        findsOneWidget);
    final invalidPool = List.filled(56, 'S').join();
    await _enter(tester, 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', invalidPool,
        'not-original');
    await _tap(tester, 'refund-open-original');
    expect(find.byType(RefundPanel), findsNothing);
    expect(find.byKey(const ValueKey('refund-change-reference')), findsNothing);
    expect(
        tester
            .widget<TextFormField>(find.byKey(const ValueKey('refund-pool')))
            .controller!
            .text,
        invalidPool);
    expect(reads, 0);
  });

  testWidgets(
      'known original reference is cold, locked, explicit and replaceable',
      (tester) async {
    var reads = 0;
    await tester.pumpWidget(_view(() => reads++));
    await _tap(tester, 'refund-admin-entry');
    await _enter(tester, refundTestScope.namespace, refundTestScope.pool,
        refundTestScope.requestId);
    await _tap(tester, 'refund-open-original');
    final panel = tester.widget<RefundPanel>(find.byType(RefundPanel));
    expect(panel.scope.identity, refundTestScope.identity);
    expect(find.text('Estado: Sin consultar'), findsOneWidget);
    for (final key in [
      'refund-namespace',
      'refund-pool',
      'refund-original-request'
    ]) {
      expect(tester.widget<TextFormField>(find.byKey(ValueKey(key))).enabled,
          isFalse);
    }
    expect(reads, 0);
    await _tap(tester, 'refund-status');
    expect(reads, 1);
    expect(find.text('Estado: Resultado desconocido'), findsOneWidget);
    expect(find.textContaining('PRIVATE_CONFIGURATION'), findsNothing);
    expect(find.byKey(const ValueKey('refund-request')), findsNothing);
    await _tap(tester, 'refund-change-reference');
    expect(find.byType(RefundPanel), findsNothing);
    expect(reads, 1);
    expect(
        tester
            .widget<TextFormField>(
                find.byKey(const ValueKey('refund-original-request')))
            .controller!
            .text,
        refundTestScope.requestId);
    await _tap(tester, 'refund-open-original');
    expect(find.text('Estado: Sin consultar'), findsOneWidget);
    expect(reads, 1);
  });
}
