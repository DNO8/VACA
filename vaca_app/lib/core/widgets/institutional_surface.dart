import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class VacaAssetBackground extends StatelessWidget {
  const VacaAssetBackground({
    required this.asset,
    required this.child,
    this.overlayAsset,
    this.alignment = Alignment.center,
    this.overlayOpacity = 0.35,
    super.key,
  });

  final String asset;
  final String? overlayAsset;
  final Widget child;
  final Alignment alignment;
  final double overlayOpacity;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(asset, fit: BoxFit.cover, alignment: alignment),
        if (overlayAsset != null)
          Opacity(
            opacity: overlayOpacity,
            child: Image.asset(
              overlayAsset!,
              fit: BoxFit.cover,
              alignment: alignment,
              color: AppColors.celadon900,
              colorBlendMode: BlendMode.multiply,
            ),
          ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0xCC1F3B30),
                Color(0x991F3B30),
                Color(0xED1F3B30),
              ],
              stops: [0, 0.52, 1],
            ),
          ),
        ),
        child,
      ],
    );
  }
}

class VacaHero extends StatelessWidget {
  const VacaHero({
    required this.asset,
    required this.title,
    this.subtitle,
    this.height = 220,
    this.onBack,
    this.alignment = Alignment.center,
    super.key,
  });

  final String asset;
  final String title;
  final String? subtitle;
  final double height;
  final VoidCallback? onBack;
  final Alignment alignment;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(asset, fit: BoxFit.cover, alignment: alignment),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xB31F3B30), Color(0xE61F3B30)],
              ),
            ),
          ),
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (onBack != null)
                    IconButton.filledTonal(
                      onPressed: onBack,
                      tooltip: 'Volver',
                      icon: const Icon(Icons.arrow_back),
                      style: IconButton.styleFrom(
                        backgroundColor: const Color(0x33456B58),
                        foregroundColor: AppColors.white,
                      ),
                    ),
                  const Spacer(),
                  if (subtitle != null) ...[
                    Text(
                      subtitle!,
                      style: AppTypography.dataSm.copyWith(
                        color: AppColors.celadon300,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                  ],
                  Text(
                    title,
                    style: AppTypography.h1.copyWith(color: AppColors.white),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
