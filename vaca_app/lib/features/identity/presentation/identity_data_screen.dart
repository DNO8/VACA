import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/result/result.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../data/local/enums.dart';
import '../domain/identity_profile.dart';

class IdentityDataScreen extends ConsumerStatefulWidget {
  const IdentityDataScreen({this.onOpenWallet, super.key});

  final VoidCallback? onOpenWallet;

  @override
  ConsumerState<IdentityDataScreen> createState() => _IdentityDataScreenState();
}

class _IdentityDataScreenState extends ConsumerState<IdentityDataScreen> {
  Future<UserIdentityProfile>? _profile;
  bool _verifying = false;
  bool _deleting = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _profile = ref.read(identityServiceProvider).getOrCreateLocalProfile();
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
    setState(() => _deleting = false);
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Identidad y datos')),
      body: FutureBuilder<UserIdentityProfile>(
        future: _profile,
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const EmptyState(kind: EmptyStateKind.loading);
          }
          final profile = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(AppSpacing.screenPadding),
            children: [
              _IdentitySummary(profile: profile),
              const SizedBox(height: AppSpacing.lg),
              const Text('Preparación', style: AppTypography.h2),
              const SizedBox(height: AppSpacing.sm),
              VacaButton(
                label: profile.identityAssurance == IdentityAssurance.verified
                    ? 'Identidad verificada'
                    : 'Verificar identidad',
                icon: Icons.verified_user_outlined,
                loading: _verifying,
                onPressed:
                    profile.identityAssurance == IdentityAssurance.verified
                        ? null
                        : _verify,
              ),
              const SizedBox(height: AppSpacing.xl),
              const Text('Herramientas de prueba', style: AppTypography.h2),
              const SizedBox(height: AppSpacing.sm),
              Card(
                child: ListTile(
                  minVerticalPadding: AppSpacing.md,
                  leading: const Icon(Icons.account_balance_wallet_outlined),
                  title: const Text('Wallet Stellar testnet'),
                  subtitle: const Text(
                    'Cuenta de desarrollo aislada de señales y ayuda.',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: widget.onOpenWallet,
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
                    const ListTile(
                      leading: Icon(Icons.support_agent_outlined),
                      title: Text('Soporte'),
                      subtitle: Text('URL pública pendiente de aprobación.'),
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
