import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/app.dart';

void main() {
  testWidgets('VacaApp arranca y muestra la lista de señales',
      (tester) async {
    await tester.pumpWidget(const ProviderScope(child: VacaApp()));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('Señales'), findsOneWidget);
    expect(find.byIcon(Icons.add), findsOneWidget);
  });
}
