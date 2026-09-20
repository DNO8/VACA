import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'vaca_button.dart';

/// Tipo de estado no-feliz de una pantalla. Ver sistema-diseno-app.md §6.9.
enum EmptyStateKind { empty, error, loading }

/// Estado vacío / error / carga reutilizable. Obligatorio en pantallas core.
class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.kind,
    this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    super.key,
  });

  final EmptyStateKind kind;
  final String? title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    if (kind == EmptyStateKind.loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final tokens = context.tokens;
    final icon = kind == EmptyStateKind.error
        ? Icons.error_outline
        : Icons.inbox_outlined;
    final iconColor =
        kind == EmptyStateKind.error ? tokens.danger : tokens.muted;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: iconColor),
            const SizedBox(height: AppSpacing.md),
            if (title != null)
              Text(
                title!,
                style: AppTypography.h3,
                textAlign: TextAlign.center,
              ),
            if (message != null) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                message!,
                style: AppTypography.body.copyWith(color: tokens.muted),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: AppSpacing.lg),
              VacaButton(
                label: actionLabel!,
                onPressed: onAction,
                variant: VacaButtonVariant.secondary,
                expand: false,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
