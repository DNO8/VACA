import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/result/result.dart';
import '../../delivery/presentation/delivery_screen.dart';
import '../../identity/presentation/identity_data_screen.dart';
import '../../incident/presentation/create_incident_screen.dart';
import '../../incident/presentation/incident_list_screen.dart';
import '../../vaquita/presentation/vaquita_screen.dart';
import '../../wallet/presentation/stellar_wallet_screen.dart';
import 'cow_vaquita_button.dart';

class AppShell extends ConsumerStatefulWidget {
  const AppShell({this.startCapture = false, super.key});

  final bool startCapture;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  // Vaquita es la última página: el slide siempre entra desde la
  // derecha, el mismo lado del que sale la vaca.
  static const _vaquitaTab = 3;

  late final PageController _pages;
  // Offset desde el que empezó el pull de la vaca.
  double _pullStartOffset = 0;

  @override
  void initState() {
    super.initState();
    _pages = PageController(initialPage: ref.read(shellTabProvider));
    if (widget.startCapture) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openCapture());
    }
    // Cubre instalaciones anteriores al auto-provision del onboarding:
    // si no hay wallet testnet se crea y se fondea en segundo plano.
    WidgetsBinding.instance.addPostFrameCallback((_) => _provisionWallet());
  }

  Future<void> _provisionWallet() async {
    final service = ref.read(stellarWalletServiceProvider);
    final created = await service.create();
    if (created case Success(value: final snapshot) when !snapshot.funded) {
      await service.fund();
    }
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
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
    final pending =
        ref.watch(syncSnapshotProvider).valueOrNull?.pendingCount ?? 0;
    final vaquitaAlert = ref.watch(vaquitaAlertProvider).valueOrNull ?? false;
    final pages = [
      const IncidentListScreen(),
      const DeliveryScreen(),
      IdentityDataScreen(onOpenWallet: _openWallet),
      VaquitaScreen(onOpenWallet: _openWallet),
    ];
    // Fuente única de verdad: shellTabProvider. Quien lo cambie (nav,
    // confirmación, vaca) mueve también el PageView.
    ref.listen<int>(shellTabProvider, (prev, next) {
      if (_pages.hasClients && _pages.page?.round() != next) {
        _pages.animateToPage(
          next,
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOutCubic,
        );
      }
    });

    void go(int tab) {
      ref.read(shellTabProvider.notifier).state = tab;
      if (_pages.hasClients) {
        _pages.animateToPage(
          tab,
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOutCubic,
        );
      }
    }

    // El pull de la vaca arrastra el PageView hacia la pestaña Vaquita:
    // la pantalla sigue al dedo en proporción al progreso del gesto.
    void pullStart() {
      if (_pages.hasClients) _pullStartOffset = _pages.offset;
    }

    void pullProgress(double progress) {
      if (!_pages.hasClients) return;
      final target = _vaquitaTab * _pages.position.viewportDimension;
      _pages.jumpTo(
        _pullStartOffset + (target - _pullStartOffset) * progress,
      );
    }

    void pullEnd(bool opened) {
      if (!_pages.hasClients) return;
      if (opened) {
        go(_vaquitaTab);
      } else {
        _pages.animateToPage(
          index,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    }

    return Scaffold(
      body: PageView(
        controller: _pages,
        onPageChanged: (value) =>
            ref.read(shellTabProvider.notifier).state = value,
        children: pages,
      ),
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarTheme.of(context),
        child: Container(
          decoration: BoxDecoration(
            color: NavigationBarTheme.of(context).backgroundColor ??
                Theme.of(context).colorScheme.surfaceContainer,
          ),
          child: SafeArea(
            top: false,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 64),
              child: Row(
                children: [
                  _NavItem(
                    icon: Icons.home_outlined,
                    selectedIcon: Icons.home,
                    label: 'Inicio',
                    selected: index == 0,
                    onTap: () => go(0),
                  ),
                  _NavItem(
                    icon: Icons.outbox_outlined,
                    selectedIcon: Icons.outbox,
                    label: 'Entrega',
                    selected: index == 1,
                    badgeCount: pending,
                    onTap: () => go(1),
                  ),
                  _NavItem(
                    icon: Icons.person_outline,
                    selectedIcon: Icons.person,
                    label: 'Identidad',
                    selected: index == 2,
                    onTap: () => go(2),
                  ),
                  // La vaca asomada: slide-left la saca y arrastra la
                  // pantalla hacia Vaquita.
                  CowVaquitaButton(
                    selected: index == _vaquitaTab,
                    // Oscila cuando hay algo nuevo en Vaquita y el usuario
                    // aún no está mirando esa pestaña.
                    alert: vaquitaAlert && index != _vaquitaTab,
                    onPull: () => go(_vaquitaTab),
                    onPullStart: pullStart,
                    onPullProgress: pullProgress,
                    onPullEnd: pullEnd,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Item de navegación estilo M3: icono en pill + label, con badge opcional.
class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.badgeCount = 0,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final int badgeCount;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final iconWidget = Badge(
      isLabelVisible: badgeCount > 0,
      label: Text('$badgeCount'),
      child: Icon(selected ? selectedIcon : icon, size: 24),
    );
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 20,
                vertical: 4,
              ),
              decoration: BoxDecoration(
                color:
                    selected ? scheme.secondaryContainer : Colors.transparent,
                borderRadius: BorderRadius.circular(16),
              ),
              child: iconWidget,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color:
                        selected ? scheme.onSurface : scheme.onSurfaceVariant,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
