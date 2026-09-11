import 'package:flutter/material.dart';

import '../../delivery/presentation/delivery_screen.dart';
import '../../identity/presentation/identity_data_screen.dart';
import '../../incident/presentation/create_incident_screen.dart';
import '../../incident/presentation/incident_list_screen.dart';
import '../../wallet/presentation/stellar_wallet_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({this.startCapture = false, super.key});

  final bool startCapture;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

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
    final pages = [
      const IncidentListScreen(),
      const DeliveryScreen(),
      IdentityDataScreen(onOpenWallet: _openWallet),
    ];
    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
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
