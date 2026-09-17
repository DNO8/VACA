import 'package:flutter/material.dart';

import '../../data/local/enums.dart';
import '../theme/app_theme.dart';

/// Indicador de prioridad del incidente. Reemplaza el Trust Score heredado
/// del modelo FIBE por la prioridad operativa del nuevo dominio público.
class PriorityBadge extends StatelessWidget {
  const PriorityBadge({
    required this.priority,
    this.compact = false,
    super.key,
  });

  final IncidentPriority priority;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (color, text) = switch (priority) {
      IncidentPriority.p0 => (tokens.danger, 'P0 · SOS'),
      IncidentPriority.p1 => (tokens.danger, 'P1 · Emergencia médica'),
      IncidentPriority.p2 => (tokens.info, 'P2 · Persona'),
      IncidentPriority.p3 => (tokens.warning, 'P3 · Peligro/infraestructura'),
      IncidentPriority.p4 => (tokens.success, 'P4 · Coordinación'),
      IncidentPriority.p5 => (AppColors.neutral500, 'P5 · Multimedia'),
    };

    return Semantics(
      label: 'Prioridad: $text',
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xxs,
        ),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(color: color, width: 1.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _Dot(color: color),
            if (!compact) ...[
              const SizedBox(width: AppSpacing.xs),
              Text(
                text,
                style: AppTypography.caption
                    .copyWith(color: Theme.of(context).colorScheme.onSurface),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
      ),
    );
  }
}
