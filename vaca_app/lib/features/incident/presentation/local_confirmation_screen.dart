import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../domain/incident.dart';

class LocalConfirmationScreen extends StatelessWidget {
  const LocalConfirmationScreen({required this.incident, super.key});

  final UserIncident incident;

  @override
  Widget build(BuildContext context) {
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
                const SizedBox(height: AppSpacing.xl),
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
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Señal ${incident.id.substring(0, 8)}',
                  style:
                      AppTypography.data.copyWith(color: AppColors.celadon300),
                ),
                const SizedBox(height: AppSpacing.md),
                const Text(
                  'La señal y su paquete de entrega están protegidos en este dispositivo. Esto todavía no confirma recepción institucional.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: AppTypography.brandFont,
                    fontSize: 16,
                    height: 24 / 16,
                    color: AppColors.white,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.celadon100,
                    borderRadius: BorderRadius.circular(AppRadius.md),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.outbox_outlined, color: AppColors.celadon700),
                      SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          'La entrega comenzará cuando exista una ruta autorizada.',
                          style: TextStyle(
                            fontFamily: AppTypography.brandFont,
                            fontSize: 14,
                            height: 20 / 14,
                            color: AppColors.ink,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                VacaButton(
                  label: 'Volver al inicio',
                  onPressed: () => Navigator.of(context).pop(true),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
