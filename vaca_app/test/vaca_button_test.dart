import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/theme/app_theme.dart';
import 'package:vaca_app/core/widgets/vaca_button.dart';

void main() {
  testWidgets('secondary CTA stays legible on dark surfaces', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: VacaButton(
            label: 'Acción alternativa',
            variant: VacaButtonVariant.secondary,
            onPressed: () {},
          ),
        ),
      ),
    );

    final button = tester.widget<OutlinedButton>(find.byType(OutlinedButton));
    expect(
      button.style?.foregroundColor?.resolve(const <WidgetState>{}),
      AppColors.celadon300,
    );
    expect(
      button.style?.side?.resolve(const <WidgetState>{})?.color,
      AppColors.celadon300,
    );
  });

  testWidgets('native alternative CTAs use the dark contrast token',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Column(
            children: [
              OutlinedButton(onPressed: () {}, child: const Text('Outlined')),
              TextButton(onPressed: () {}, child: const Text('Text')),
            ],
          ),
        ),
      ),
    );

    final context = tester.element(find.byType(OutlinedButton));
    final theme = Theme.of(context);
    expect(
      theme.outlinedButtonTheme.style?.foregroundColor
          ?.resolve(const <WidgetState>{}),
      AppColors.celadon300,
    );
    expect(
      theme.outlinedButtonTheme.style?.side
          ?.resolve(const <WidgetState>{})?.color,
      AppColors.celadon300,
    );
    expect(
      theme.textButtonTheme.style?.foregroundColor
          ?.resolve(const <WidgetState>{}),
      AppColors.celadon300,
    );
  });
}
