import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Variantes de botón de VACA (ver sistema-diseno-app.md §6.1).
enum VacaButtonVariant { primary, secondary, destructive, text }

/// Botón base de VACA. Altura mínima 52 (>= target táctil 48dp del SOW).
class VacaButton extends StatelessWidget {
  const VacaButton({
    required this.label,
    required this.onPressed,
    this.variant = VacaButtonVariant.primary,
    this.icon,
    this.expand = true,
    this.loading = false,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final VacaButtonVariant variant;
  final IconData? icon;
  final bool expand;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final child = loading
        ? const SizedBox(
            height: 20,
            width: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : _content();

    final effectiveOnPressed = loading ? null : onPressed;

    final Widget button = switch (variant) {
      VacaButtonVariant.primary => FilledButton(
          onPressed: effectiveOnPressed,
          child: child,
        ),
      VacaButtonVariant.secondary => OutlinedButton(
          onPressed: effectiveOnPressed,
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.celadon700,
            side: const BorderSide(color: AppColors.celadon700, width: 1.5),
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
          ),
          child: child,
        ),
      VacaButtonVariant.destructive => FilledButton(
          onPressed: effectiveOnPressed,
          style: FilledButton.styleFrom(
            backgroundColor: tokens.danger,
            foregroundColor: AppColors.white,
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
          ),
          child: child,
        ),
      VacaButtonVariant.text => TextButton(
          onPressed: effectiveOnPressed,
          style: TextButton.styleFrom(
            foregroundColor: AppColors.celadon700,
            minimumSize: const Size.fromHeight(48),
          ),
          child: child,
        ),
    };

    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }

  Widget _content() {
    if (icon == null) return Text(label);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 20),
        const SizedBox(width: AppSpacing.xs),
        Flexible(
          child: Text(
            label,
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
  }
}
