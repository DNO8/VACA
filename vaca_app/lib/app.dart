import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers.dart';
import 'core/theme/app_theme.dart';
import 'features/onboarding/presentation/onboarding_flow.dart';
import 'features/shell/presentation/app_shell.dart';
import 'features/startup/presentation/startup_screen.dart';

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
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  Future<void> _start() async {
    final complete = widget.skipOnboarding
        ? true
        : await ref.read(onboardingServiceProvider).isComplete();
    if (!widget.skipOnboarding) {
      await Future<void>.delayed(const Duration(milliseconds: 1200));
    }
    if (!mounted) return;
    await Navigator.of(context).pushReplacement<void, void>(
      _brandRoute(
        complete ? const AppShell() : const _OnboardingEntry(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => const StartupScreen();
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
