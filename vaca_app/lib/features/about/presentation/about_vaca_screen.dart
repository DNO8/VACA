import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../ads/presentation/revenuecat_banner_ad.dart';

class AboutVacaScreen extends StatelessWidget {
  const AboutVacaScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Acerca de VACA')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.screenPadding),
        children: const [
          VacaBrandLogo(size: 88),
          SizedBox(height: AppSpacing.lg),
          Text(
            'Infraestructura cívica de resiliencia',
            textAlign: TextAlign.center,
            style: AppTypography.h2,
          ),
          SizedBox(height: AppSpacing.sm),
          Text(
            'VACA permite guardar señales locales cuando no hay conexión y entregarlas de forma verificable cuando vuelve la red.',
            textAlign: TextAlign.center,
          ),
          SizedBox(height: AppSpacing.xl),
          Card(
            child: Padding(
              padding: EdgeInsets.all(AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Publicidad responsable', style: AppTypography.h3),
                  SizedBox(height: AppSpacing.xs),
                  Text(
                    'La publicidad aparece únicamente en esta sección informativa. Nunca interrumpe una señal, la identidad, la entrega o un recibo.',
                  ),
                  SizedBox(height: AppSpacing.xs),
                  Text(
                    'VACA no comparte el contenido de señales, ubicación, evidencia ni datos de identidad con redes publicitarias.',
                  ),
                ],
              ),
            ),
          ),
          SizedBox(height: AppSpacing.lg),
          RevenueCatBannerAd(),
        ],
      ),
    );
  }
}
