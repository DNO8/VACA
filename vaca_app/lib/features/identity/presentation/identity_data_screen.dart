import 'package:drift/drift.dart' show OrderingTerm;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/format/vaca_format.dart';
import '../../../core/providers.dart';
import '../../../core/result/result.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../data/local/enums.dart';
import '../../about/presentation/about_vaca_screen.dart';
import '../domain/identity_profile.dart';

class IdentityDataScreen extends ConsumerStatefulWidget {
  const IdentityDataScreen({this.onOpenWallet, super.key});

  final VoidCallback? onOpenWallet;

  @override
  ConsumerState<IdentityDataScreen> createState() => _IdentityDataScreenState();
}

class _IdentityDataScreenState extends ConsumerState<IdentityDataScreen> {
  Future<UserIdentityProfile>? _profile;
  Future<_LocalStats>? _stats;
  bool _verifying = false;
  bool _deleting = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _profile = ref.read(identityServiceProvider).getOrCreateLocalProfile();
    _stats = _loadStats();
  }

  Future<_LocalStats> _loadStats() async {
    final db = ref.read(databaseProvider);
    final incidents = await db.select(db.incidents).get();
    final attachments = await db.select(db.attachments).get();
    final receipts = await (db.select(db.serverReceipts)
          ..orderBy([(r) => OrderingTerm.desc(r.serverReceivedAt)])
          ..limit(1))
        .get();
    return _LocalStats(
      incidents.length,
      attachments.length,
      receipts.firstOrNull?.serverReceivedAt,
    );
  }

  Future<void> _verify() async {
    setState(() => _verifying = true);
    final result = await ref.read(identityServiceProvider).verifyWithKyc();
    if (!mounted) return;
    setState(() {
      _verifying = false;
      _reload();
    });
    if (result case Failure(error: final error)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error.message ?? 'No fue posible verificar la identidad.',
          ),
        ),
      );
    }
  }

  Future<void> _requestRemoteDeletion(UserIdentityProfile profile) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Eliminar cuenta del servidor'),
        content: const Text(
          'Se eliminarán de forma permanente tu identidad y todas las señales, adjuntos y recibos asociados en el servidor. Los datos guardados en este dispositivo no se borran. Esta acción no se puede deshacer.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _deleting = true);
    final result = await ref
        .read(accountDeletionServiceProvider)
        .requestDeletion(profile.devicePublicKey);
    if (!mounted) return;
    setState(() => _deleting = false);
    final message = result.isSuccess
        ? 'El servidor confirmó la eliminación remota.'
        : result.errorOrNull?.message ??
            'No se completó la eliminación remota.';
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _openLink(Uri? uri) async {
    final opened =
        uri != null && await ref.read(externalLinkServiceProvider).open(uri);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enlace no disponible.')),
      );
    }
  }

  Future<void> _deleteLocalData() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Eliminar datos locales'),
        content: const Text(
          'Se eliminarán señales, adjuntos, recibos, identidad y claves de este dispositivo. Esta acción no se puede deshacer.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _deleting = true);
    final result = await ref.read(identityServiceProvider).deleteLocalData();
    if (!mounted) return;
    setState(() {
      _deleting = false;
      _reload();
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          result.isSuccess
              ? 'Datos locales eliminados. Reinicia VACA para configurar el dispositivo nuevamente.'
              : result.errorOrNull?.message ??
                  'No se completó la eliminación local.',
        ),
      ),
    );
  }

  void _showCredential(UserIdentityProfile profile) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Credencial del dispositivo'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'CLAVE PÚBLICA',
              style:
                  AppTypography.caption.copyWith(color: AppColors.neutral500),
            ),
            const SizedBox(height: AppSpacing.xxs),
            SelectableText(
              profile.devicePublicKey,
              style: AppTypography.dataSm,
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'ESTADO',
              style:
                  AppTypography.caption.copyWith(color: AppColors.neutral500),
            ),
            const SizedBox(height: AppSpacing.xxs),
            Text(
              _assuranceLabel(profile.identityAssurance),
              style: AppTypography.body,
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'CONSENTIMIENTO',
              style:
                  AppTypography.caption.copyWith(color: AppColors.neutral500),
            ),
            const SizedBox(height: AppSpacing.xxs),
            Text(
              'Versión ${profile.consentVersion}',
              style: AppTypography.body,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }

  String _assuranceLabel(IdentityAssurance assurance) => switch (assurance) {
        IdentityAssurance.unverified =>
          'No verificada · las señales se guardan igualmente',
        IdentityAssurance.verified => 'Verificada · credencial opaca vigente',
        IdentityAssurance.expired => 'Credencial caducada',
        IdentityAssurance.revoked => 'Credencial revocada',
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          const VacaHero(
            asset: 'assets/images/estetica-5.jpg',
            title: 'Identidad y datos',
            subtitle: 'PRIVACIDAD · CONTROL LOCAL',
            height: 190,
            alignment: Alignment(0, 0.35),
          ),
          Expanded(
            child: FutureBuilder<UserIdentityProfile>(
              future: _profile,
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const EmptyState(kind: EmptyStateKind.loading);
                }
                final profile = snapshot.data!;
                final verified =
                    profile.identityAssurance == IdentityAssurance.verified;
                return ListView(
                  padding: const EdgeInsets.all(AppSpacing.screenPadding),
                  children: [
                    _IdentitySummary(profile: profile),
                    const SizedBox(height: AppSpacing.lg),
                    const Text('Preparación', style: AppTypography.h2),
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        Expanded(
                          child: VacaButton(
                            label: verified
                                ? 'Identidad verificada'
                                : 'Verificar identidad',
                            icon: Icons.verified_user_outlined,
                            loading: _verifying,
                            onPressed: verified ? null : _verify,
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: VacaButton(
                            label: 'Ver credencial',
                            variant: VacaButtonVariant.secondary,
                            onPressed: () => _showCredential(profile),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    const Text('Datos locales', style: AppTypography.h2),
                    const SizedBox(height: AppSpacing.sm),
                    FutureBuilder<_LocalStats>(
                      future: _stats,
                      builder: (context, statsSnapshot) {
                        final stats = statsSnapshot.data;
                        return Card(
                          child: Column(
                            children: [
                              _StatsRow(
                                label: 'Señales guardadas',
                                value: stats == null
                                    ? '—'
                                    : '${stats.incidentCount} '
                                        'señal${stats.incidentCount == 1 ? '' : 'es'}',
                              ),
                              _StatsRow(
                                label: 'Fotos adjuntas',
                                value: stats == null
                                    ? '—'
                                    : '${stats.attachmentCount} '
                                        'archivo${stats.attachmentCount == 1 ? '' : 's'}',
                              ),
                              _StatsRow(
                                label: 'Última recepción',
                                value: stats == null
                                    ? '—'
                                    : stats.lastReceiptAt == null
                                        ? 'Sin recepciones'
                                        : vacaRelativeTime(
                                            stats.lastReceiptAt!,
                                            now: ref.watch(vacaClockProvider)(),
                                          ),
                                last: true,
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    const Text(
                      'Herramientas de prueba',
                      style: AppTypography.h2,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Card(
                      child: ListTile(
                        minVerticalPadding: AppSpacing.md,
                        leading:
                            const Icon(Icons.account_balance_wallet_outlined),
                        title: const Text('Wallet Stellar testnet'),
                        subtitle: const Text(
                          'Cuenta de desarrollo aislada de señales y ayuda.',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: widget.onOpenWallet,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Card(
                      child: ListTile(
                        minVerticalPadding: AppSpacing.md,
                        leading: const Icon(Icons.info_outline),
                        title: const Text('Acerca de VACA'),
                        subtitle: const Text(
                          'Misión, transparencia y publicidad responsable.',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => Navigator.of(context).push<void>(
                          MaterialPageRoute(
                            builder: (_) => const AboutVacaScreen(),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    const Text('Privacidad', style: AppTypography.h2),
                    const SizedBox(height: AppSpacing.sm),
                    Card(
                      child: Column(
                        children: [
                          ListTile(
                            leading: const Icon(Icons.policy_outlined),
                            title: const Text('Consentimiento'),
                            subtitle: Text('Versión ${profile.consentVersion}'),
                          ),
                          const Divider(height: 1),
                          ListTile(
                            leading: const Icon(Icons.policy_outlined),
                            title: const Text('Política de privacidad'),
                            subtitle: const Text('Abrir documento público'),
                            trailing: const Icon(Icons.open_in_new),
                            onTap: () => _openLink(
                              AppConfig.instance.privacyPolicyUri,
                            ),
                          ),
                          const Divider(height: 1),
                          ListTile(
                            leading: const Icon(Icons.support_agent_outlined),
                            title: const Text('Soporte'),
                            subtitle: const Text('Abrir canal público'),
                            trailing: const Icon(Icons.open_in_new),
                            onTap: () => _openLink(
                              AppConfig.instance.supportUri,
                            ),
                          ),
                          const Divider(height: 1),
                          ListTile(
                            enabled: !_deleting,
                            leading: const Icon(
                              Icons.cloud_off_outlined,
                              color: AppColors.danger,
                            ),
                            title: const Text('Solicitar eliminación remota'),
                            subtitle: const Text(
                              'Firma la solicitud con la clave de este dispositivo.',
                            ),
                            onTap: () => _requestRemoteDeletion(profile),
                          ),
                          const Divider(height: 1),
                          ListTile(
                            enabled: !_deleting,
                            leading: const Icon(
                              Icons.delete_forever_outlined,
                              color: AppColors.danger,
                            ),
                            title: const Text('Eliminar datos locales'),
                            subtitle: const Text(
                              'Borra señales, adjuntos, recibos, identidad y claves.',
                            ),
                            onTap: _deleteLocalData,
                          ),
                        ],
                      ),
                    ),
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

class _LocalStats {
  const _LocalStats(
    this.incidentCount,
    this.attachmentCount,
    this.lastReceiptAt,
  );

  final int incidentCount;
  final int attachmentCount;
  final DateTime? lastReceiptAt;
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({
    required this.label,
    required this.value,
    this.last = false,
  });

  final String label;
  final String value;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        border: last
            ? null
            : const Border(bottom: BorderSide(color: AppColors.stone100)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: AppTypography.body),
          Text(
            value,
            style: AppTypography.dataSm.copyWith(color: AppColors.neutral500),
          ),
        ],
      ),
    );
  }
}

class _IdentitySummary extends StatelessWidget {
  const _IdentitySummary({required this.profile});

  final UserIdentityProfile profile;

  @override
  Widget build(BuildContext context) {
    final verified = profile.identityAssurance == IdentityAssurance.verified;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.celadon900,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Row(
        children: [
          Icon(
            verified ? Icons.verified : Icons.person_outline,
            color: AppColors.celadon300,
            size: 36,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  verified ? 'Identidad verificada' : 'Identidad no verificada',
                  style: AppTypography.h3.copyWith(color: AppColors.white),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  verified
                      ? 'Credencial opaca vigente'
                      : 'Puedes guardar señales urgentes igualmente',
                  style:
                      AppTypography.body.copyWith(color: AppColors.celadon300),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
