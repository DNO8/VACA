import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/vaca_format.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../domain/incident.dart';

class LocalConfirmationScreen extends ConsumerWidget {
  const LocalConfirmationScreen({required this.incident, super.key});

  final UserIncident incident;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sync = ref.watch(syncSnapshotProvider).valueOrNull;
    final pending = sync?.pendingCount ?? 0;
    final meta = categoryMeta(incident.category);
    return Scaffold(
      backgroundColor: AppColors.celadon900,
      body: VacaAssetBackground(
        asset: 'assets/images/gradiente-2.jpg',
        overlayAsset: 'assets/images/gradiente-3.jpg',
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xl),
            child: Column(
              children: [
                const Spacer(),
                Container(
                  width: 88,
                  height: 88,
                  decoration: const BoxDecoration(
                    color: AppColors.celadon100,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.save_outlined,
                    color: AppColors.success,
                    size: 44,
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.celadon300.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(
                      color: AppColors.celadon300.withValues(alpha: 0.3),
                    ),
                  ),
                  child: const Text(
                    'GUARDADA LOCALMENTE',
                    style: TextStyle(
                      fontFamily: AppTypography.monoFont,
                      fontSize: 12,
                      letterSpacing: 0.8,
                      color: AppColors.celadon300,
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                const Text(
                  'Guardada localmente',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: AppTypography.brandFont,
                    fontWeight: FontWeight.w700,
                    fontSize: 28,
                    height: 34 / 28,
                    color: AppColors.white,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                const Text(
                  'La señal y su paquete de entrega están protegidos en este dispositivo. Esto todavía no confirma recepción institucional.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: AppTypography.brandFont,
                    fontSize: 15,
                    height: 24 / 15,
                    color: AppColors.celadon300,
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.celadon900.withValues(alpha: 0.7),
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    border: Border.all(
                      color: AppColors.celadon300.withValues(alpha: 0.15),
                    ),
                  ),
                  child: Column(
                    children: [
                      _DetailRow(
                        label: 'ID de señal',
                        value: vacaShortId(incident.id),
                        mono: true,
                      ),
                      _DetailRow(
                        label: 'Categoría',
                        value:
                            '${priorityShortLabel(meta.priority)} · ${meta.label}',
                      ),
                      _DetailRow(
                        label: 'Timestamp',
                        value: vacaTimestamp(incident.createdAt),
                        mono: true,
                      ),
                      _DetailRow(
                        label: 'Estado',
                        value: incidentStatusLabel(incident.status),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.xs,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.warning.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(
                      color: AppColors.warning.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.warning,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      Flexible(
                        child: Text(
                          pending > 0
                              ? '$pending señal${pending == 1 ? '' : 'es'} pendiente${pending == 1 ? '' : 's'} de entrega'
                              : 'La entrega comenzará con una ruta autorizada',
                          style: AppTypography.body.copyWith(
                            color: const Color(0xFFDDA85C),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                VacaButton(
                  label: 'Ver estado de entrega',
                  onPressed: () {
                    ref.read(shellTabProvider.notifier).state = 1;
                    Navigator.of(context).pop(true);
                  },
                ),
                const SizedBox(height: AppSpacing.xs),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.celadon300
                        .withValues(alpha: 0.75),
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: const Text('Volver al inicio'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.mono = false,
  });

  final String label;
  final String value;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: AppTypography.caption.copyWith(
              color: AppColors.celadon300.withValues(alpha: 0.6),
              fontWeight: FontWeight.w400,
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: (mono ? AppTypography.dataSm : AppTypography.body)
                  .copyWith(color: AppColors.celadon300),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
