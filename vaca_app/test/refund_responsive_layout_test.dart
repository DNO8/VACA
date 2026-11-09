import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/theme/app_theme.dart';
import 'package:vaca_app/features/refund/presentation/refund_admin_screen.dart';
import 'package:vaca_app/features/refund/presentation/refund_panel.dart';
import 'package:vaca_app/features/refund/refund_providers.dart';

// Public synthetic reference only: no wallet construction, storage or transport.
const _reference = {
  'refund-namespace': '11111111-1111-1111-1111-111111111111',
  'refund-pool': 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  'refund-original-request': '22222222-2222-2222-2222-222222222222',
};

void main() {
  for (final layout in [
    (width: 320.0, height: 760.0, scale: 2.0, dark: false, keyboard: 260.0),
    (width: 600.0, height: 900.0, scale: 1.0, dark: true, keyboard: 0.0),
    (width: 1024.0, height: 900.0, scale: 2.0, dark: true, keyboard: 0.0),
  ]) {
    testWidgets('cold refund layout ${layout.width} scale ${layout.scale}',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(layout.width, layout.height);
      tester.view.viewInsets = FakeViewPadding(bottom: layout.keyboard);
      addTearDown(tester.view.reset);
      var clientReads = 0;
      await tester.pumpWidget(ProviderScope(
        overrides: [
          refundClientProvider.overrideWith((ref) {
            clientReads++;
            throw StateError('Layout must not construct a financial client');
          }),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: layout.dark ? ThemeMode.dark : ThemeMode.light,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(layout.scale)),
            child: child!,
          ),
          home: const RefundAdminScreen(),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(tester.getSize(find.byType(Form)).width, lessThanOrEqualTo(760));
      for (final entry in _reference.entries) {
        final field = find.byKey(ValueKey(entry.key));
        await tester.ensureVisible(field);
        await tester.enterText(field, entry.value);
        expect(
            tester.widget<TextFormField>(field).controller!.text, entry.value);
      }
      // Settle focus-driven scrolling before testing pointer reachability.
      tester.binding.focusManager.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      final open = find.byKey(const ValueKey('refund-open-original'));
      await tester.ensureVisible(open);
      await tester.pumpAndSettle();
      await tester.tap(open);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byType(RefundPanel), findsOneWidget);
      expect(find.text('Estado: Sin consultar'), findsOneWidget);
      for (final key in _reference.keys) {
        expect(tester.widget<TextFormField>(find.byKey(ValueKey(key))).enabled,
            isFalse);
      }
      final status = find.byKey(const ValueKey('refund-status'));
      await tester.ensureVisible(status);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final bounds = tester.getRect(status);
      expect(bounds.width, greaterThanOrEqualTo(AppSpacing.minTouchTarget));
      expect(bounds.height, greaterThanOrEqualTo(AppSpacing.minTouchTarget));
      expect(bounds.left, greaterThanOrEqualTo(0));
      expect(bounds.right, lessThanOrEqualTo(layout.width));
      expect(bounds.bottom, lessThanOrEqualTo(layout.height - layout.keyboard));
      expect(find.byKey(const ValueKey('refund-request')), findsNothing);
      expect(find.byKey(const ValueKey('refund-reconcile')), findsNothing);
      expect(clientReads, 0);
      final change = find.byKey(const ValueKey('refund-change-reference'));
      await tester.ensureVisible(change);
      await tester.pumpAndSettle();
      await tester.tap(change);
      await tester.pumpAndSettle();
      expect(find.byType(RefundPanel), findsNothing);
      for (final entry in _reference.entries) {
        expect(
            tester
                .widget<TextFormField>(find.byKey(ValueKey(entry.key)))
                .controller!
                .text,
            entry.value);
      }
      expect(clientReads, 0);
      expect(tester.takeException(), isNull);
    });
  }
}
