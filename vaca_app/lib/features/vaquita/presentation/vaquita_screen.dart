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

class _PromotedList extends ConsumerWidget {
  const _PromotedList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<Result<List<VaquitaFeedItem>>>(
      future: ref.read(vaquitaFeedServiceProvider).fetchFeed(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final result = snapshot.data!;
        if (result case Failure(error: final error)) {
          return EmptyState(
            kind: EmptyStateKind.error,
            title: 'Sin conexión',
            message: error.message ?? 'No se pudo cargar Vaquitas.',
          );
        }
        final promoted =
            result.valueOrNull?.where((i) => i.isPromoted).toList() ??
                const <VaquitaFeedItem>[];
        if (promoted.isEmpty) {
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
          itemCount: promoted.length,
          separatorBuilder: (_, __) =>
              const SizedBox(height: AppSpacing.sm),
          itemBuilder: (context, index) =>
              _VaquitaCard(item: promoted[index]),
        );
      },
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
