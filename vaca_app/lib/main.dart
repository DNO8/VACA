import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/providers.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AppConfig(); // Valida flavor antes de arrancar.

  final container = ProviderContainer();
  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const VacaApp(),
    ),
  );
  WidgetsBinding.instance.addPostFrameCallback((_) {
    unawaited(_startScheduler(container));
  });
}

Future<void> _startScheduler(ProviderContainer container) async {
  final scheduler = container.read(bundleSchedulerProvider);
  try {
    await scheduler.start();
  } catch (e) {
    // El scheduler puede fallar si no hay permisos de red; no bloqueamos
    // el arranque de la app.
    debugPrint('BundleScheduler start error: $e');
  }
}
