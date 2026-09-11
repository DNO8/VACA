import 'package:flutter/material.dart';
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
      home: OnboardingGate(skipOnboarding: skipOnboarding),
    );
  }
}

class OnboardingGate extends ConsumerStatefulWidget {
  const OnboardingGate({required this.skipOnboarding, super.key});

  final bool skipOnboarding;

  @override
  ConsumerState<OnboardingGate> createState() => _OnboardingGateState();
}

class _OnboardingGateState extends ConsumerState<OnboardingGate> {
  bool? _complete;
  bool _startCapture = false;

  @override
  void initState() {
    super.initState();
    if (widget.skipOnboarding) {
      _complete = true;
    } else {
      _load();
    }
  }

  Future<void> _load() async {
    final complete = await ref.read(onboardingServiceProvider).isComplete();
    if (mounted) setState(() => _complete = complete);
  }

  Future<void> _finish(bool startCapture) async {
    setState(() {
      _startCapture = startCapture;
      _complete = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return switch (_complete) {
      null => const Scaffold(body: Center(child: CircularProgressIndicator())),
      true => AppShell(startCapture: _startCapture),
      false => OnboardingFlow(onComplete: _finish),
    };
  }
}
