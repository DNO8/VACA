import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/result/result.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../domain/stellar_wallet_service.dart';

class StellarWalletScreen extends ConsumerStatefulWidget {
  const StellarWalletScreen({super.key});

  @override
  ConsumerState<StellarWalletScreen> createState() =>
      _StellarWalletScreenState();
}

class _StellarWalletScreenState extends ConsumerState<StellarWalletScreen> {
  Future<Result<StellarWalletSnapshot?>>? _wallet;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _wallet = ref.read(stellarWalletServiceProvider).load();
  }

  Future<void> _run(
    Future<Result<StellarWalletSnapshot>> Function() operation,
  ) async {
    setState(() => _busy = true);
    final result = await operation();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _wallet = Future.value(
        switch (result) {
          Success(value: final value) => Success(value),
          Failure(error: final error) => Failure(error),
        },
      );
    });
    if (result case Failure(error: final error)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message ?? 'Operación testnet fallida.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Container(
            color: AppColors.ink,
            padding: const EdgeInsets.only(bottom: AppSpacing.xl),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.xl,
                  AppSpacing.sm,
                  AppSpacing.xl,
                  0,
                ),
                child: Row(
                  children: [
                    IconButton.filledTonal(
                      onPressed: () => Navigator.of(context).pop(),
                      tooltip: 'Volver',
                      icon: const Icon(Icons.arrow_back),
                      style: IconButton.styleFrom(
                        backgroundColor: const Color(0x33456B58),
                        foregroundColor: AppColors.white,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Wrap(
                            crossAxisAlignment: WrapCrossAlignment.center,
                            spacing: AppSpacing.xs,
                            runSpacing: AppSpacing.xxs,
                            children: [
                              const Text(
                                'Wallet Stellar',
                                style: TextStyle(
                                  fontFamily: AppTypography.brandFont,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 20,
                                  color: AppColors.white,
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.xs,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.celadon300
                                      .withValues(alpha: 0.16),
                                  borderRadius:
                                      BorderRadius.circular(AppRadius.full),
                                ),
                                child: const Text(
                                  'TESTNET',
                                  style: TextStyle(
                                    fontFamily: AppTypography.monoFont,
                                    fontSize: 10,
                                    letterSpacing: 0.8,
                                    color: AppColors.celadon300,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const Text(
                            'Entorno de demostración sin valor monetario real',
                            style: TextStyle(
                              fontFamily: AppTypography.brandFont,
                              fontSize: 12,
                              color: Color(0xB8B8D9C6),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: FutureBuilder<Result<StellarWalletSnapshot?>>(
              future: _wallet,
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const EmptyState(kind: EmptyStateKind.loading);
                }
                final result = snapshot.data!;
                if (result case Failure(error: final error)) {
                  return EmptyState(
                    kind: EmptyStateKind.error,
                    title: 'Wallet no disponible',
                    message: error.message,
                    actionLabel: 'Reintentar',
                    onAction: () => setState(_load),
                  );
                }
                final wallet = result.valueOrNull;
                return ListView(
                  padding: const EdgeInsets.all(AppSpacing.screenPadding),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF8EE),
                        border: Border.all(color: AppColors.bronze),
                        borderRadius: BorderRadius.circular(AppRadius.md),
                      ),
                      child: const Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.science_outlined, color: AppColors.bronze),
                          SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Text(
                              'STELLAR TESTNET · XLM de prueba sin valor real y sin relación con señales, identidad o acceso a ayuda.',
                              style: TextStyle(
                                fontFamily: AppTypography.brandFont,
                                fontSize: 14,
                                height: 20 / 14,
                                // Fondo claro fijo (0xFFFFF8EE) → texto fijo oscuro.
                                color: AppColors.ink,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    if (wallet == null)
                      _EmptyWallet(
                        busy: _busy,
                        onCreate: () => _run(
                          ref.read(stellarWalletServiceProvider).create,
                        ),
                      )
                    else
                      _WalletDetails(
                        wallet: wallet,
                        busy: _busy,
                        onPrepare: () => _run(
                          ref.read(stellarWalletServiceProvider).fund,
                        ),
                        onRefresh: () => _run(
                          ref.read(stellarWalletServiceProvider).refresh,
                        ),
                      ),
                    if (wallet == null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Center(
                        child: TextButton(
                          onPressed: () => Navigator.of(context).pop(),
                          child: const Text('Volver a identidad y datos'),
                        ),
                      ),
                    ],
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyWallet extends StatelessWidget {
  const _EmptyWallet({required this.busy, required this.onCreate});

  final bool busy;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          children: [
            Icon(
              Icons.account_balance_wallet_outlined,
              size: 52,
              color: context.tokens.muted,
            ),
            const SizedBox(height: AppSpacing.md),
            const Text('Crear wallet de prueba', style: AppTypography.h2),
            const SizedBox(height: AppSpacing.xs),
            const Text(
              'Se generará un keypair Stellar, se solicitará XLM a Friendbot y se habilitará la trustline USDC Testnet oficial. La clave secreta permanecerá en el almacenamiento seguro.',
              textAlign: TextAlign.center,
              style: AppTypography.body,
            ),
            const SizedBox(height: AppSpacing.xl),
            VacaButton(
              label: 'Crear y preparar wallet testnet',
              loading: busy,
              onPressed: busy ? null : onCreate,
            ),
          ],
        ),
      ),
    );
  }
}

class _WalletDetails extends StatelessWidget {
  const _WalletDetails({
    required this.wallet,
    required this.busy,
    required this.onPrepare,
    required this.onRefresh,
  });

  final StellarWalletSnapshot wallet;
  final bool busy;
  final VoidCallback onPrepare;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final readyForUsdc = wallet.funded && wallet.usdcTrustlineReady;
    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(AppSpacing.xl),
          decoration: BoxDecoration(
            color: AppColors.celadon900,
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: AppSpacing.md,
                runSpacing: AppSpacing.xs,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.account_balance_wallet_outlined,
                        color: AppColors.celadon300,
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      Text(
                        'STELLAR TESTNET',
                        style: AppTypography.caption.copyWith(
                          color: AppColors.celadon300,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    wallet.funded ? 'FINANCIADA' : 'SIN FONDOS',
                    style: AppTypography.caption.copyWith(
                      color: wallet.funded
                          ? AppColors.celadon300
                          : const Color(0xFFFFC97A),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
              Text(
                'Balance disponible',
                style: AppTypography.body.copyWith(color: AppColors.celadon300),
              ),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                '${wallet.balance} XLM',
                style: AppTypography.display.copyWith(color: AppColors.white),
              ),
              const SizedBox(height: AppSpacing.md),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.sm),
                decoration: BoxDecoration(
                  color: AppColors.ink.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                  border: Border.all(
                    color: wallet.usdcTrustlineReady
                        ? AppColors.success.withValues(alpha: 0.55)
                        : AppColors.warning.withValues(alpha: 0.55),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      wallet.usdcTrustlineReady
                          ? Icons.check_circle_outline
                          : Icons.pending_outlined,
                      color: wallet.usdcTrustlineReady
                          ? AppColors.success
                          : AppColors.warning,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            wallet.usdcTrustlineReady
                                ? 'USDC TESTNET HABILITADO'
                                : 'TRUSTLINE USDC PENDIENTE',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.white,
                            ),
                          ),
                          Text(
                            wallet.usdcTrustlineReady
                                ? 'Lista para recibir USDC del faucet de Circle.'
                                : 'Habilítala antes de recibir o reclamar USDC.',
                            style: AppTypography.body.copyWith(
                              color: AppColors.celadon300,
                            ),
                          ),
                          if (wallet.usdcTrustlineReady)
                            Text(
                              '${wallet.usdcBalance} USDC',
                              style: AppTypography.dataSm.copyWith(
                                color: AppColors.celadon300,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Clave pública', style: AppTypography.caption),
                const SizedBox(height: AppSpacing.xs),
                SelectableText(wallet.accountId, style: AppTypography.dataSm),
                const SizedBox(height: AppSpacing.sm),
                VacaButton(
                  label: 'Copiar clave pública',
                  icon: Icons.copy,
                  variant: VacaButtonVariant.secondary,
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: wallet.accountId));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Clave pública copiada.')),
                    );
                  },
                ),
                const SizedBox(height: AppSpacing.sm),
                const Row(
                  children: [
                    Icon(Icons.shield_outlined, color: AppColors.success),
                    SizedBox(width: AppSpacing.xs),
                    Expanded(
                      child: Text(
                        'Clave secreta protegida en almacenamiento seguro.',
                        style: AppTypography.body,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        VacaButton(
          label: readyForUsdc
              ? 'Actualizar balances testnet'
              : wallet.funded
                  ? 'Habilitar USDC testnet'
                  : 'Solicitar XLM y habilitar USDC',
          icon: readyForUsdc ? Icons.refresh : Icons.add_circle_outline,
          loading: busy,
          onPressed: busy ? null : (readyForUsdc ? onRefresh : onPrepare),
        ),
        const SizedBox(height: AppSpacing.xs),
        Center(
          child: TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Volver a identidad y datos'),
          ),
        ),
      ],
    );
  }
}
