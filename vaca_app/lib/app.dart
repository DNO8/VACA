import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers.dart';
import 'core/theme/app_theme.dart';
import 'features/onboarding/presentation/onboarding_flow.dart';
import 'features/shell/presentation/app_shell.dart';

class VacaApp extends StatelessWidget {
  const VacaApp({this.skipOnboarding = false, super.key});

  final bool skipOnboarding;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'VACA',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      home: StartupGate(skipOnboarding: skipOnboarding),
    );
  }
}

class StartupGate extends ConsumerStatefulWidget {
  const StartupGate({required this.skipOnboarding, super.key});

  final bool skipOnboarding;

  @override
  ConsumerState<StartupGate> createState() => _StartupGateState();
}

class _StartupGateState extends ConsumerState<StartupGate> {
  // null = resolviendo (el splash nativo cubre este frame).
  bool? _onboardingComplete;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  Future<void> _start() async {
    final complete = widget.skipOnboarding
        ? true
        : await ref.read(onboardingServiceProvider).isComplete();
    if (!mounted) return;
    setState(() => _onboardingComplete = complete);
    // El destino ya está construido debajo del splash: se quita en el
    // primer frame real del contenido — no hay segunda pantalla visible.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      FlutterNativeSplash.remove();
    });
  }

  @override
  Widget build(BuildContext context) {
    final complete = _onboardingComplete;
    if (complete == null) return const SizedBox.shrink();
    return complete ? const AppShell() : const _OnboardingEntry();
  }
}

class _OnboardingEntry extends StatelessWidget {
  const _OnboardingEntry();

  @override
  Widget build(BuildContext context) {
    return OnboardingFlow(
      onComplete: (startCapture) async {
        await Navigator.of(context).pushReplacement<void, void>(
          _brandRoute(AppShell(startCapture: startCapture)),
        );
      },
    );
  }
}

PageRouteBuilder<void> _brandRoute(Widget destination) {
  return PageRouteBuilder<void>(
    transitionDuration: const Duration(milliseconds: 1050),
    reverseTransitionDuration: const Duration(milliseconds: 350),
    pageBuilder: (_, __, ___) => destination,
    transitionsBuilder: (_, animation, __, child) {
      final opacity = CurvedAnimation(
        parent: animation,
        curve: const Interval(0.18, 1, curve: Curves.easeOut),
      );
      return FadeTransition(opacity: opacity, child: child);
    },
  );
}
