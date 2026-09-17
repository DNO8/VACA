import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../delivery/presentation/delivery_screen.dart';
import '../../identity/presentation/identity_data_screen.dart';
import '../../incident/presentation/create_incident_screen.dart';
import '../../incident/presentation/incident_list_screen.dart';
import '../../wallet/presentation/stellar_wallet_screen.dart';

class AppShell extends ConsumerStatefulWidget {
  const AppShell({this.startCapture = false, super.key});

  final bool startCapture;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  @override
  void initState() {
    super.initState();
    if (widget.startCapture) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openCapture());
    }
  }

  Future<void> _openCapture() async {
    if (!mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => const CreateIncidentScreen()),
    );
  }

  void _openWallet() {
    Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => const StellarWalletScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final index = ref.watch(shellTabProvider);
    final pages = [
      const IncidentListScreen(),
      const DeliveryScreen(),
      IdentityDataScreen(onOpenWallet: _openWallet),
    ];
    return Scaffold(
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) =>
            ref.read(shellTabProvider.notifier).state = value,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Inicio',
          ),
          NavigationDestination(
            icon: Icon(Icons.outbox_outlined),
            selectedIcon: Icon(Icons.outbox),
            label: 'Entrega',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Identidad',
          ),
        ],
      ),
    );
  }
}
