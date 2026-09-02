import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Selector de opciones para enums FIBE (tipo vivienda, ocupación, niveles de
/// daño, etc.). Usa chips grandes (>= 48dp) en vez de dropdowns pequeños.
/// Ver sistema-diseno-app.md §6.2 y §6.6.
class VacaEnumSelector<T> extends StatelessWidget {
  const VacaEnumSelector({
    required this.label,
    required this.values,
    required this.selected,
    required this.labelBuilder,
    required this.onChanged,
    this.colorBuilder,
    super.key,
  });

  final String label;
  final List<T> values;
  final T? selected;
  final String Function(T value) labelBuilder;
  final ValueChanged<T> onChanged;

  /// Color opcional por opción (ej. severidad de daño).
  final Color Function(T value)? colorBuilder;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.bodyLg),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: values.map((value) {
            final isSelected = value == selected;
            final accent = colorBuilder?.call(value) ?? AppColors.orange;
            return _SelectableChip(
              label: labelBuilder(value),
              selected: isSelected,
              accent: accent,
              onTap: () => onChanged(value),
            );
          }).toList(),
        ),
      ],
    );
  }
}

class _SelectableChip extends StatelessWidget {
  const _SelectableChip({
    required this.label,
    required this.selected,
    required this.accent,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final baseColor = Theme.of(context).colorScheme.onSurface;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.full),
        child: ConstrainedBox(
          constraints:
              const BoxConstraints(minHeight: AppSpacing.minTouchTarget),
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.xs,
            ),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? accent : Colors.transparent,
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(
                color: selected ? accent : AppColors.neutral500,
                width: 1.5,
              ),
            ),
            child: Text(
              label,
              style: AppTypography.body.copyWith(
                color: selected ? AppColors.deepBlue : baseColor,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
