import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';

class StartupScreen extends StatelessWidget {
  const StartupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).height < 700;
    return Scaffold(
      backgroundColor: AppColors.celadon900,
      body: VacaAssetBackground(
        asset: 'assets/images/gradiente-loading.webp',
        overlayAsset: 'assets/images/gradiente-3.jpg',
        overlayOpacity: 0.42,
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                VacaBrandLogo(size: compact ? 156 : 184),
                const SizedBox(height: AppSpacing.xl),
                Text(
                  'Preparando VACA',
                  style: AppTypography.h3.copyWith(color: AppColors.white),
                ),
                const SizedBox(height: AppSpacing.sm),
                const SizedBox(
                  width: 116,
                  child: LinearProgressIndicator(
                    value: 0.72,
                    minHeight: 3,
                    color: AppColors.celadon300,
                    backgroundColor: Color(0x33456B58),
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
