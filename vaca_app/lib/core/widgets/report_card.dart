import 'package:flutter/material.dart';

import '../../data/local/enums.dart';
import '../theme/app_theme.dart';
import 'sync_status_badge.dart';
import 'trust_score_badge.dart';

/// Tarjeta resumen de un incidente en la lista. Ver sistema-diseno-app.md §6.3.
class ReportCard extends StatelessWidget {
  const ReportCard({
    required this.category,
    required this.priority,
    required this.status,
    required this.locationLabel,
    required this.capturedAt,
    this.attachmentStatus,
    this.onTap,
    super.key,
  });

  final IncidentCategory category;
  final IncidentPriority priority;
  final IncidentStatus status;
  final String locationLabel;
  final DateTime capturedAt;
  final AttachmentSyncStatus? attachmentStatus;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (categoryColor, categoryLabel) = switch (category) {
      IncidentCategory.sos => (tokens.danger, 'SOS'),
      IncidentCategory.medical => (tokens.danger, 'Medica'),
      IncidentCategory.person => (tokens.info, 'Persona'),
      IncidentCategory.hazard => (tokens.warning, 'Peligro'),
      IncidentCategory.coordination => (tokens.success, 'Coordinacion'),
    };

    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _CategoryChip(color: categoryColor, label: categoryLabel),
                  const Spacer(),
                  if (attachmentStatus != null)
                    SyncStatusBadge(status: attachmentStatus!),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(locationLabel, style: AppTypography.bodyLg),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                _formatDate(capturedAt),
                style:
                    AppTypography.dataSm.copyWith(color: AppColors.neutral500),
              ),
              const SizedBox(height: AppSpacing.xs),
              PriorityBadge(priority: priority, compact: true),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}/${two(d.month)}/${d.year} ${two(d.hour)}:${two(d.minute)}';
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xxs,
      ),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Text(
        label,
        style: AppTypography.caption.copyWith(color: AppColors.white),
      ),
    );
  }
}
