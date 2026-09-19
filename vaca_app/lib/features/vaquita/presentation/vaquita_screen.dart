import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/result/result.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../domain/vaquita_feed_service.dart';

/// Pestaña Vaquita: incidentes promovidos a fase de donaciones.
///
/// Gate: requiere wallet Stellar activa (receptores). Sin wallet se ofrece
/// activarla primero — tour de una pantalla.
class VaquitaScreen extends ConsumerWidget {
  const VaquitaScreen({required this.onOpenWallet, super.key});

  final VoidCallback onOpenWallet;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: FutureBuilder<Result<dynamic>>(
        future: ref.read(stellarWalletServiceProvider).load(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final wallet =
              snapshot.data is Success ? (snapshot.data as Success).value : null;
          if (wallet == null) {
            return _WalletGate(onOpenWallet: onOpenWallet);
          }
          return const _PromotedList();
        },
      ),
    );
  }
}

class _WalletGate extends StatelessWidget {
  const _WalletGate({required this.onOpenWallet});

  final VoidCallback onOpenWallet;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.screenPadding),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.volunteer_activism_outlined,
              size: 56,
              color: AppColors.celadon700,
            ),
            const SizedBox(height: AppSpacing.md),
            const Text('Vaquita', style: AppTypography.h1),
            const SizedBox(height: AppSpacing.sm),
            const Text(
              'Cuando tu señal sea verificada y promovida a donaciones, '
              'los aportes llegan a tu wallet. Para participar necesitas '
              'activarla primero.',
              style: AppTypography.body,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppSpacing.lg),
            VacaButton(
              label: 'Activar mi wallet',
              onPressed: onOpenWallet,
            ),
            const SizedBox(height: AppSpacing.xs),
            const Text(
              'Testnet — sin fondos reales durante el piloto.',
              style: AppTypography.caption,
            ),
          ],
        ),
      ),
    );
  }
}

class _PromotedList extends ConsumerStatefulWidget {
  const _PromotedList();

  @override
  ConsumerState<_PromotedList> createState() => _PromotedListState();
}

class _PromotedListState extends ConsumerState<_PromotedList> {
  List<VaquitaFeedItem> _items = const [];
  double _pendingXlm = 0;
  bool _loading = true;
  bool _claiming = false;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final feed = await ref.read(vaquitaFeedServiceProvider).fetchFeed();
    final claims = await ref
        .read(stellarWalletServiceProvider)
        .pendingClaims();
    if (!mounted) return;
    var pending = 0.0;
    if (claims case Success(value: final balances)) {
      for (final b in balances) {
        pending += double.tryParse(b.amount) ?? 0;
      }
    }
    setState(() {
      _loading = false;
      _pendingXlm = pending;
      if (feed case Success(value: final items)) {
        _items = items;
        _error = null;
      } else if (feed case Failure(error: final error)) {
        _error = error.message ?? 'No se pudo cargar Vaquitas.';
      }
    });
  }

  Future<void> _claim() async {
    setState(() {
      _claiming = true;
      _notice = null;
      _error = null;
    });
    final res = await ref.read(stellarWalletServiceProvider).claimAll();
    if (!mounted) return;
    if (res case Failure(error: final error)) {
      setState(() {
        _claiming = false;
        _error = error.message ?? 'No se pudo reclamar.';
      });
      return;
    }
    setState(() {
      _claiming = false;
      _notice = 'Ayuda recibida en tu wallet.';
    });
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _items.isEmpty) {
      return EmptyState(
        kind: EmptyStateKind.error,
        title: 'Sin conexión',
        message: _error!,
      );
    }
    final promoted = _items.where((i) => i.isPromoted).toList();
    if (promoted.isEmpty && _pendingXlm <= 0) {
      return const EmptyState(
        kind: EmptyStateKind.empty,
        title: 'Sin Vaquitas aún',
        message:
            'Cuando una señal verificada sea promovida por la comunidad '
            'o por VACA aparecerá aquí.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(AppSpacing.screenPadding),
      itemCount: promoted.length + 1,
      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
      itemBuilder: (context, index) {
        if (index == 0) {
          return _ClaimCard(
            pendingXlm: _pendingXlm,
            claiming: _claiming,
            error: _error,
            notice: _notice,
            onClaim: _claim,
          );
        }
        return _VaquitaCard(item: promoted[index - 1]);
      },
    );
  }
}

/// Tarjeta de ayuda pendiente: muestra el XLM reclamable y ejecuta el
/// claim de todos los claimable balances dirigidos a la wallet.
class _ClaimCard extends StatelessWidget {
  const _ClaimCard({
    required this.pendingXlm,
    required this.claiming,
    required this.onClaim,
    this.error,
    this.notice,
  });

  final double pendingXlm;
  final bool claiming;
  final VoidCallback onClaim;
  final String? error;
  final String? notice;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.volunteer_activism_outlined,
                  size: 18,
                  color: AppColors.success,
                ),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  'Ayuda para tu señal',
                  style: AppTypography.body.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xxs),
            if (pendingXlm > 0)
              Text(
                '${pendingXlm.toStringAsFixed(2)} XLM testnet reclamables',
                style: AppTypography.caption,
              )
            else
              const Text(
                'Sin ayuda pendiente por ahora.',
                style: AppTypography.caption,
              ),
            if (notice != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xxs),
                child: Text(
                  notice!,
                  style: AppTypography.caption
                      .copyWith(color: AppColors.success),
                ),
              ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xxs),
                child: Text(
                  error!,
                  style: AppTypography.caption
                      .copyWith(color: AppColors.danger),
                ),
              ),
            if (pendingXlm > 0) ...[
              const SizedBox(height: AppSpacing.xs),
              VacaButton(
                label: claiming ? 'Reclamando…' : 'Reclamar ayuda',
                onPressed: claiming ? null : onClaim,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _VaquitaCard extends StatelessWidget {
  const _VaquitaCard({required this.item});

  final VaquitaFeedItem item;

  @override
  Widget build(BuildContext context) {
    final verified = item.isVerified;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  verified
                      ? Icons.verified_outlined
                      : Icons.groups_outlined,
                  size: 18,
                  color: verified
                      ? AppColors.success
                      : AppColors.celadon700,
                ),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  verified ? 'Vaquita verificada' : 'Vaquita Comunitaria',
                  style: AppTypography.body.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xxs),
            Text(
              'Señal ${item.incidentId.substring(0, 8)}… · '
              '${item.category}',
              style: AppTypography.caption,
            ),
            if (item.peopleCount != null)
              Text(
                '${item.peopleCount} personas reportadas',
                style: AppTypography.caption,
              ),
            const SizedBox(height: AppSpacing.xs),
            const Text(
              'Las donaciones se coordinan desde la web de VACA y llegan '
              'como saldo reclamable a la wallet del receptor.',
              style: AppTypography.caption,
            ),
          ],
        ),
      ),
    );
  }
}
