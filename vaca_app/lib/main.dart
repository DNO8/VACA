import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config/app_config.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AppConfig(); // Valida flavor antes de arrancar.
  runApp(
    const ProviderScope(
      child: VacaApp(),
    ),
  );
}
