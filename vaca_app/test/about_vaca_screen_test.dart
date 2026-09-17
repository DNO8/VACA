import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/features/about/presentation/about_vaca_screen.dart';

void main() {
  testWidgets('keeps ads isolated from emergency features', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: AboutVacaScreen()),
      ),
    );
    await tester.pump();

    expect(find.text('Publicidad responsable'), findsOneWidget);
    expect(
      find.textContaining('únicamente en esta sección informativa'),
      findsOneWidget,
    );
    expect(find.textContaining('Nunca interrumpe una señal'), findsOneWidget);
    expect(
      find.textContaining('no comparte el contenido de señales'),
      findsOneWidget,
    );
    expect(find.textContaining('Comprar'), findsNothing);
  });
}
