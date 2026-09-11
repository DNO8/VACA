import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/app.dart';
import 'package:vaca_app/core/theme/app_theme.dart';
import 'package:vaca_app/features/onboarding/presentation/onboarding_flow.dart';

void main() {
  testWidgets('VacaApp arranca y muestra la lista de señales', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: VacaApp(skipOnboarding: true)),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('Coordinación local'), findsOneWidget);
    expect(find.byIcon(Icons.add), findsOneWidget);
  });

  testWidgets('onboarding muestra disclaimer antes de solicitar permisos',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: OnboardingFlow(onComplete: (_) async {}),
        ),
      ),
    );

    expect(find.text('Iniciar'), findsOneWidget);
    await tester.tap(find.text('Iniciar'));
    await tester.pumpAndSettle();

    expect(find.text('Aviso importante'), findsOneWidget);
    expect(find.textContaining('No reemplaza'), findsOneWidget);
    expect(find.textContaining('131 (SAMU)'), findsOneWidget);
  });

  testWidgets(
      'dark onboarding uses prototype assets and explicit light-surface contrast',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: ThemeMode.dark,
          home: OnboardingFlow(onComplete: (_) async {}),
        ),
      ),
    );

    final introAssets = tester.widgetList<Image>(find.byType(Image));
    expect(
      introAssets.where(
        (image) =>
            image.image == const AssetImage('assets/images/gradiente-2.jpg'),
      ),
      isNotEmpty,
    );
    await tester.tap(find.text('Iniciar'));
    await tester.pumpAndSettle();

    final disclaimerAssets = tester.widgetList<Image>(find.byType(Image));
    expect(
      disclaimerAssets.where(
        (image) =>
            image.image == const AssetImage('assets/images/estetica-4.jpg'),
      ),
      isNotEmpty,
    );
    final emergencyTitle =
        tester.widget<Text>(find.text('Emergencia inmediata'));
    final emergencyCopy =
        tester.widget<Text>(find.textContaining('131 (SAMU)'));
    expect(emergencyTitle.style?.color, AppColors.danger);
    expect(emergencyCopy.style?.color, AppColors.ink);
  });
}
