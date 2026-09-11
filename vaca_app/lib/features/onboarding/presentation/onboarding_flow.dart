import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/permissions/permission_service.dart';
import '../../../core/providers.dart';
import '../../../core/result/result.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../domain/onboarding_service.dart';

class OnboardingFlow extends ConsumerStatefulWidget {
  const OnboardingFlow({required this.onComplete, super.key});

  final Future<void> Function(bool startCapture) onComplete;

  @override
  ConsumerState<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends ConsumerState<OnboardingFlow> {
  int _step = 0;
  bool _emergencyPath = false;
  bool _busy = false;
  final Map<String, PermissionOutcome> _permissions = {};

  Future<void> _finish(bool startCapture) async {
    setState(() => _busy = true);
    try {
      await ref
          .read(identityServiceProvider)
          .acceptConsent(OnboardingService.consentVersion);
      final result = await ref.read(onboardingServiceProvider).complete();
      if (result.isFailure) {
        _showError('No se pudo guardar la configuración inicial.');
        return;
      }
      await widget.onComplete(startCapture);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verifyIdentity() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(identityServiceProvider)
          .acceptConsent(OnboardingService.consentVersion);
      final result = await ref.read(identityServiceProvider).verifyWithKyc();
      switch (result) {
        case Success():
          await _finish(false);
        case Failure(error: final error):
          _showError(error.message ?? 'No fue posible verificar la identidad.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _request(String key) async {
    final service = ref.read(permissionServiceProvider);
    final outcome = switch (key) {
      'location' => await service.requestLocation(),
      'camera' => await service.requestCamera(),
      _ => await service.requestNotifications(),
    };
    if (mounted) setState(() => _permissions[key] = outcome);
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  void _back() {
    if (_step > 0) setState(() => _step--);
  }

  @override
  Widget build(BuildContext context) {
    return switch (_step) {
      0 => _Intro(onNext: () => setState(() => _step = 1)),
      1 => _Disclaimer(
          onBack: _back,
          onContinue: () => setState(() => _step = 2),
          onEmergency: () => setState(() {
            _emergencyPath = true;
            _step = 2;
          }),
        ),
      2 => _Permissions(
          outcomes: _permissions,
          busy: _busy,
          onBack: _back,
          onRequest: _request,
          onContinue: () =>
              _emergencyPath ? _finish(true) : setState(() => _step = 3),
        ),
      _ => _IdentityChoice(
          busy: _busy,
          onBack: _back,
          onVerify: _verifyIdentity,
          onUnverified: () => _finish(false),
        ),
    };
  }
}

class _Intro extends StatelessWidget {
  const _Intro({required this.onNext});

  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.celadon900,
      body: VacaAssetBackground(
        asset: 'assets/images/gradiente-2.jpg',
        overlayAsset: 'assets/images/gradiente-3.jpg',
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xxl),
            child: Column(
              children: [
                const Spacer(),
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppColors.celadon700,
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                    border: Border.all(color: AppColors.celadon300),
                  ),
                  child: const Icon(
                    Icons.account_balance_outlined,
                    color: AppColors.celadon300,
                    size: 40,
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                Text(
                  'VACA',
                  style: AppTypography.display.copyWith(
                    color: AppColors.white,
                    letterSpacing: 6,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Vaquita de Ayuda y Coordinación Activa',
                  textAlign: TextAlign.center,
                  style: AppTypography.dataSm.copyWith(
                    color: AppColors.celadon300,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxl),
                Text(
                  'La información es el primer alivio.\nLa comunidad es el primer respondedor.',
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyLg.copyWith(color: AppColors.white),
                ),
                const Spacer(),
                VacaButton(label: 'Iniciar', onPressed: onNext),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'v0.1.0 · offline-first',
                  style: AppTypography.dataSm.copyWith(
                    color: AppColors.celadon300,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Disclaimer extends StatelessWidget {
  const _Disclaimer({
    required this.onBack,
    required this.onContinue,
    required this.onEmergency,
  });

  final VoidCallback onBack;
  final VoidCallback onContinue;
  final VoidCallback onEmergency;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          VacaHero(
            asset: 'assets/images/estetica-4.jpg',
            title: 'Aviso importante',
            subtitle: 'PASO 1 DE 3 · SEGURIDAD',
            height: 240,
            alignment: const Alignment(0, 0.35),
            onBack: onBack,
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.xl),
              children: [
                const Text(
                  'VACA es una herramienta de coordinación comunitaria. No reemplaza los servicios de emergencia oficiales.',
                  style: AppTypography.bodyLg,
                ),
                const SizedBox(height: AppSpacing.xl),
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF2F2),
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    border: Border.all(color: AppColors.danger, width: 1.5),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.emergency, color: AppColors.danger),
                          SizedBox(width: AppSpacing.xs),
                          Expanded(
                            child: Text(
                              'Emergencia inmediata',
                              style: TextStyle(
                                fontFamily: AppTypography.brandFont,
                                fontWeight: FontWeight.w700,
                                fontSize: 18,
                                height: 24 / 18,
                                color: AppColors.danger,
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: AppSpacing.xs),
                      Text(
                        'Si existe riesgo vital, utiliza 131 (SAMU), 132 (Bomberos) o 133 (Carabineros), según corresponda, siempre que sea posible y seguro hacerlo.',
                        style: TextStyle(
                          fontFamily: AppTypography.brandFont,
                          fontSize: 14,
                          height: 20 / 14,
                          color: AppColors.ink,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                const _Fact(
                  icon: Icons.phone_in_talk_outlined,
                  text: 'Utiliza canales oficiales cuando estén disponibles.',
                ),
                const _Fact(
                  icon: Icons.save_outlined,
                  text:
                      'Guardar una señal localmente no confirma recepción institucional.',
                ),
                const _Fact(
                  icon: Icons.verified_outlined,
                  text:
                      'La recepción se confirma sólo con un recibo verificado del servidor.',
                ),
                const SizedBox(height: AppSpacing.xl),
                VacaButton(
                  label: 'Entendido, continuar',
                  onPressed: onContinue,
                ),
                const SizedBox(height: AppSpacing.sm),
                VacaButton(
                  label: 'Registrar emergencia sin verificar identidad',
                  icon: Icons.emergency_outlined,
                  variant: VacaButtonVariant.destructive,
                  onPressed: onEmergency,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Permissions extends StatelessWidget {
  const _Permissions({
    required this.outcomes,
    required this.busy,
    required this.onBack,
    required this.onRequest,
    required this.onContinue,
  });

  final Map<String, PermissionOutcome> outcomes;
  final bool busy;
  final VoidCallback onBack;
  final Future<void> Function(String key) onRequest;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: onBack,
          tooltip: 'Volver',
          icon: const Icon(Icons.arrow_back),
        ),
        title: const Text('Privacidad y permisos'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.xl),
          children: [
            const Text('Permisos de acceso', style: AppTypography.h1),
            const SizedBox(height: AppSpacing.xs),
            const Text(
              'Solicitamos cada permiso mediante el sistema y sólo cuando eliges habilitarlo.',
              style: AppTypography.bodyLg,
            ),
            const SizedBox(height: AppSpacing.xl),
            _PermissionTile(
              icon: Icons.location_on_outlined,
              title: 'Ubicación GPS',
              detail:
                  'Opcional. También puedes registrar una señal sin ubicación.',
              outcome: outcomes['location'],
              onPressed: () => onRequest('location'),
            ),
            _PermissionTile(
              icon: Icons.camera_alt_outlined,
              title: 'Cámara',
              detail: 'Opcional. Permite adjuntar evidencia fotográfica.',
              outcome: outcomes['camera'],
              onPressed: () => onRequest('camera'),
            ),
            _PermissionTile(
              icon: Icons.notifications_outlined,
              title: 'Notificaciones',
              detail:
                  'Opcional. Informa cambios de entrega cuando estén disponibles.',
              outcome: outcomes['notifications'],
              onPressed: () => onRequest('notifications'),
            ),
            const SizedBox(height: AppSpacing.md),
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.celadon100,
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: const Text(
                'Al continuar, aceptas el tratamiento descrito en la Política de Privacidad vigente. Los datos se procesan primero en tu dispositivo.',
                style: TextStyle(
                  fontFamily: AppTypography.brandFont,
                  fontSize: 14,
                  height: 20 / 14,
                  color: AppColors.ink,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            VacaButton(
              label: 'Aceptar y continuar',
              loading: busy,
              onPressed: busy ? null : onContinue,
            ),
          ],
        ),
      ),
    );
  }
}

class _PermissionTile extends StatelessWidget {
  const _PermissionTile({
    required this.icon,
    required this.title,
    required this.detail,
    required this.outcome,
    required this.onPressed,
  });

  final IconData icon;
  final String title;
  final String detail;
  final PermissionOutcome? outcome;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final status = switch (outcome) {
      PermissionOutcome.granted => 'Permitido',
      PermissionOutcome.denied => 'No permitido',
      PermissionOutcome.permanentlyDenied => 'Bloqueado en ajustes',
      PermissionOutcome.serviceDisabled => 'Servicio desactivado',
      null => 'Sin solicitar',
    };
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: AppColors.celadon700),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(detail, style: AppTypography.body),
                  const SizedBox(height: AppSpacing.xs),
                  Text(status, style: AppTypography.dataSm),
                ],
              ),
            ),
            TextButton(onPressed: onPressed, child: const Text('Solicitar')),
          ],
        ),
      ),
    );
  }
}

class _IdentityChoice extends StatelessWidget {
  const _IdentityChoice({
    required this.busy,
    required this.onBack,
    required this.onVerify,
    required this.onUnverified,
  });

  final bool busy;
  final VoidCallback onBack;
  final VoidCallback onVerify;
  final VoidCallback onUnverified;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          VacaHero(
            asset: 'assets/images/estetica-5.jpg',
            title: 'Configura tu identidad',
            subtitle: 'PASO 3 DE 3 · IDENTIDAD',
            height: 280,
            alignment: const Alignment(0, -0.25),
            onBack: onBack,
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.xl),
              children: [
                const SizedBox(height: AppSpacing.xs),
                const Text(
                  'La verificación es opcional y nunca impide guardar una señal urgente.',
                  style: AppTypography.bodyLg,
                ),
                const SizedBox(height: AppSpacing.xl),
                const _IdentityCard(
                  icon: Icons.verified_user_outlined,
                  title: 'Identidad verificada',
                  detail:
                      'Requiere Internet y una sesión KYC creada por el backend.',
                ),
                const SizedBox(height: AppSpacing.sm),
                const _IdentityCard(
                  icon: Icons.person_outline,
                  title: 'Continuar sin verificar',
                  detail:
                      'Las señales quedan marcadas como identidad no verificada.',
                ),
                const SizedBox(height: AppSpacing.xl),
                VacaButton(
                  label: 'Verificar identidad',
                  loading: busy,
                  onPressed: busy ? null : onVerify,
                ),
                const SizedBox(height: AppSpacing.sm),
                VacaButton(
                  label: 'Continuar sin verificar',
                  variant: VacaButtonVariant.secondary,
                  onPressed: busy ? null : onUnverified,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _IdentityCard extends StatelessWidget {
  const _IdentityCard({
    required this.icon,
    required this.title,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Row(
          children: [
            Icon(icon, size: 32, color: AppColors.celadon700),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(detail, style: AppTypography.body),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.celadon700),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Text(text, style: AppTypography.body)),
        ],
      ),
    );
  }
}
