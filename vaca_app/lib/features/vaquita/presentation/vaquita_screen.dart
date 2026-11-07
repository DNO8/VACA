import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/providers.dart';
import '../../../core/result/result.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../domain/vaquita_feed_service.dart';

/// Pestaña Vaquita: solo las señales PROPIAS promovidas a donaciones.
///
/// Sin wallet: tour de 3 pasos que explica la mecánica y termina en el
/// gate de activación. Con wallet: lista de las señales propias que el
/// backend marcó como `community` o `vaquita` (descubierto en el próximo
/// sync — sin push).
class VaquitaScreen extends ConsumerWidget {
  const VaquitaScreen({required this.onOpenWallet, super.key});

  final VoidCallback onOpenWallet;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: Opacity(
              opacity:
                  Theme.of(context).brightness == Brightness.dark ? 0.12 : 0.06,
              child: Image.asset(
                'assets/images/gradiente-2.jpg',
                fit: BoxFit.cover,
              ),
            ),
          ),
          FutureBuilder<Result<dynamic>>(
            future: ref.read(stellarWalletServiceProvider).load(),
            builder: (context, snapshot) {
              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              final wallet = snapshot.data is Success
                  ? (snapshot.data as Success).value
                  : null;
              if (wallet == null) {
                return _IntroPager(onActivate: onOpenWallet);
              }
              return const _MyVaquitas();
            },
          ),
        ],
      ),
    );
  }
}

/// Tour de 3 pasos: qué es la Vaquita, cómo llegan los aportes y por qué
/// Stellar. El último paso lleva directo al gate de activación de wallet.
class _IntroPager extends StatefulWidget {
  const _IntroPager({required this.onActivate});

  final VoidCallback onActivate;

  @override
  State<_IntroPager> createState() => _IntroPagerState();
}

class _IntroPagerState extends State<_IntroPager> {
  final _controller = PageController();
  int _page = 0;

  static const _steps = [
    (
      icon: Icons.volunteer_activism_outlined,
      title: '¿Qué es una Vaquita?',
      body: 'Cuando tu señal es verificada por la comunidad o por VACA, '
          'se promueve a Vaquita: un llamado de ayuda visible en el mapa '
          'público de la web.',
    ),
    (
      icon: Icons.payments_outlined,
      title: 'Cómo llegan los aportes',
      body: 'Las donaciones se coordinan desde la web de VACA y llegan como '
          'saldo reclamable directo a tu wallet. Los ves aquí y los '
          'reclamas con un toque.',
    ),
    (
      icon: Icons.verified_outlined,
      title: 'Blockchain verificable',
      body: 'Usamos Stellar (testnet): cada aporte queda registrado en la '
          'cadena, de forma auditable y sin intermediarios. Sin fondos '
          'reales durante el piloto.',
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final last = _page == _steps.length - 1;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.screenPadding),
        child: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: _controller,
                onPageChanged: (i) => setState(() => _page = i),
                itemCount: _steps.length,
                itemBuilder: (context, i) {
                  final step = _steps[i];
                  return Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        step.icon,
                        size: 56,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(step.title, style: AppTypography.h1),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        step.body,
                        style: AppTypography.body,
                        textAlign: TextAlign.center,
                      ),
                    ],
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < _steps.length; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: i == _page ? 18 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: i == _page
                          ? Theme.of(context).colorScheme.onSurface
                          : context.tokens.muted.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(AppRadius.full),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            VacaButton(
              label: last ? 'Activar mi wallet' : 'Siguiente',
              onPressed: last
                  ? widget.onActivate
                  : () => _controller.nextPage(
                        duration: const Duration(milliseconds: 260),
                        curve: Curves.easeOutCubic,
                      ),
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

/// Lista solo las Vaquitas propias: señales del usuario que el backend
/// promovió (status community/vaquita) y existen en la DB local.
class _MyVaquitas extends ConsumerStatefulWidget {
  const _MyVaquitas();

  @override
  ConsumerState<_MyVaquitas> createState() => _MyVaquitasState();
}

class _MyVaquitasState extends ConsumerState<_MyVaquitas> {
  List<VaquitaFeedItem> _mine = const [];
  double _pendingXlm = 0;
  bool _loading = true;
  bool _claiming = false;
  bool _claimsLoading = false;
  bool _claimsUnavailable = false;
  String? _error;
  String? _notice;
  List<String> _claimTransactionHashes = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final db = ref.read(databaseProvider);
    final feed = await ref.read(vaquitaFeedServiceProvider).fetchFeed();
    await _refreshClaims();
    final localIds =
        (await db.select(db.incidents).get()).map((i) => i.id).toSet();
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (feed case Success(value: final items)) {
        _mine = items
            .where((i) => i.isPromoted && localIds.contains(i.incidentId))
            .toList();
        _error = null;
      } else if (feed case Failure(error: final error)) {
        _error = error.message ?? 'No se pudo cargar Vaquitas.';
      }
    });
  }

  Future<void> _refreshClaims() async {
    if (_claimsLoading || _claiming || !mounted) return;
    setState(() => _claimsLoading = true);
    final claims = await ref.read(stellarWalletServiceProvider).pendingClaims();
    if (!mounted) return;
    var pending = 0.0;
    if (claims case Success(value: final balances)) {
      for (final balance in balances) {
        pending += double.tryParse(balance.amount) ?? 0;
      }
    }
    setState(() {
      _claimsLoading = false;
      _claimsUnavailable = claims is Failure;
      _pendingXlm = pending;
    });
  }

  Future<void> _claim() async {
    setState(() {
      _claiming = true;
      _notice = null;
      _error = null;
      _claimTransactionHashes = const [];
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
    final transactionHashes = res.valueOrNull?.transactionHashes ?? const [];
    setState(() {
      _claiming = false;
      _notice = 'Ayuda recibida en tu wallet.';
      _claimTransactionHashes = transactionHashes;
    });
    await _load();
  }

  Future<void> _openClaimTransaction(String hash) async {
    final opened = await ref.read(externalLinkServiceProvider).open(
          Uri.parse('https://stellar.expert/explorer/testnet/tx/$hash'),
        );
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir Stellar Expert.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _mine.isEmpty) {
      return EmptyState(
        kind: EmptyStateKind.error,
        title: 'Sin conexión',
        message: _error!,
      );
    }
    if (_mine.isEmpty &&
        _pendingXlm <= 0 &&
        !_claimsUnavailable &&
        !_claimsLoading) {
      return const _EmptyVaquitas();
    }
    return ListView.separated(
      padding: const EdgeInsets.all(AppSpacing.screenPadding),
      itemCount: _mine.length + 1,
      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
      itemBuilder: (context, index) {
        if (index == 0) {
          return _ClaimCard(
            pendingXlm: _pendingXlm,
            claiming: _claiming,
            claimsLoading: _claimsLoading,
            claimsUnavailable: _claimsUnavailable,
            onRetry: _refreshClaims,
            error: _error,
            notice: _notice,
            transactionHashes: _claimTransactionHashes,
            onClaim: _claim,
            onOpenTransaction: _openClaimTransaction,
          );
        }
        return _VaquitaCard(item: _mine[index - 1]);
      },
    );
  }
}

/// Estado vacío: vaca asomada + instrucción honesta.
class _EmptyVaquitas extends StatelessWidget {
  const _EmptyVaquitas();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SvgPicture.asset(
                'assets/images/vaca-svg.svg',
                width: 120,
                height: 120,
                colorFilter: ColorFilter.mode(
                  context.tokens.muted,
                  BlendMode.srcIn,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              const Text('Aún no tienes Vaquitas', style: AppTypography.h2),
              const SizedBox(height: AppSpacing.sm),
              const Text(
                'Necesitas votos de la comunidad o aprobación '
                'institucional para que tu señal se promueva a Vaquita.',
                style: AppTypography.body,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Tarjeta de ayuda pendiente: muestra el XLM reclamable y ejecuta el
/// claim de todos los claimable balances dirigidos a la wallet.
class _ClaimCard extends StatelessWidget {
  const _ClaimCard({
    required this.pendingXlm,
    required this.claiming,
    required this.claimsLoading,
    required this.claimsUnavailable,
    required this.onRetry,
    required this.onClaim,
    required this.onOpenTransaction,
    required this.transactionHashes,
    this.error,
    this.notice,
  });

  final double pendingXlm;
  final bool claiming;
  final bool claimsLoading;
  final bool claimsUnavailable;
  final VoidCallback onRetry;
  final VoidCallback onClaim;
  final ValueChanged<String> onOpenTransaction;
  final List<String> transactionHashes;
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
            if (claimsLoading)
              const Text(
                'Consultando ayuda pendiente…',
                style: AppTypography.caption,
              )
            else if (claimsUnavailable)
              const Text(
                'No se pudo consultar la ayuda pendiente.',
                style: AppTypography.caption,
              )
            else if (pendingXlm > 0)
              Text(
                '${pendingXlm.toStringAsFixed(2)} XLM testnet reclamables',
                style: AppTypography.caption,
              )
            else
              const Text(
                'Sin ayuda pendiente por ahora.',
                style: AppTypography.caption,
              ),
            if (claimsUnavailable)
              TextButton(
                onPressed: claimsLoading ? null : onRetry,
                child: const Text('Reintentar consulta'),
              ),
            if (notice != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xxs),
                child: Text(
                  notice!,
                  style:
                      AppTypography.caption.copyWith(color: AppColors.success),
                ),
              ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xxs),
                child: Text(
                  error!,
                  style:
                      AppTypography.caption.copyWith(color: AppColors.danger),
                ),
              ),
            for (final hash in transactionHashes)
              Align(
                alignment: Alignment.centerLeft,
                child: Tooltip(
                  message: hash,
                  child: TextButton.icon(
                    onPressed: () => onOpenTransaction(hash),
                    icon: const Icon(Icons.open_in_new, size: 16),
                    label: Text(
                      'Ver transacción ${hash.length > 12 ? '${hash.substring(0, 12)}…' : hash}',
                    ),
                  ),
                ),
              ),
            if (pendingXlm > 0 && !claimsLoading && !claimsUnavailable) ...[
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
                  verified ? Icons.verified_outlined : Icons.groups_outlined,
                  size: 18,
                  color: verified ? AppColors.success : context.tokens.muted,
                ),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  verified ? 'Vaquita validada' : 'Vaquita Comunitaria',
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
              'como saldo reclamable a tu wallet.',
              style: AppTypography.caption,
            ),
          ],
        ),
      ),
    );
  }
}
