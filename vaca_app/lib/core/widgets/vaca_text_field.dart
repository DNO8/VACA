import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Campo de texto de VACA con label siempre visible, helper y error.
/// Ver sistema-diseno-app.md §6.2.
class VacaTextField extends StatelessWidget {
  const VacaTextField({
    required this.label,
    this.controller,
    this.onChanged,
    this.hintText,
    this.helperText,
    this.errorText,
    this.keyboardType,
    this.mono = false,
    this.maxLines = 1,
    super.key,
  });

  final String label;
  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;
  final String? hintText;
  final String? helperText;
  final String? errorText;
  final TextInputType? keyboardType;

  /// Usa JetBrains Mono para datos técnicos (folio, rutHash, coordenadas).
  final bool mono;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.bodyLg),
        const SizedBox(height: AppSpacing.xxs),
        TextField(
          controller: controller,
          onChanged: onChanged,
          keyboardType: keyboardType,
          maxLines: maxLines,
          style: mono ? AppTypography.data : AppTypography.bodyLg,
          decoration: InputDecoration(
            hintText: hintText,
            helperText: helperText,
            errorText: errorText,
            helperStyle:
                AppTypography.caption.copyWith(color: AppColors.neutral500),
          ),
        ),
      ],
    );
  }
}
