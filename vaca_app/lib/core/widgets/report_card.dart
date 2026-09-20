import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/local/enums.dart';
import '../format/vaca_format.dart';
import '../providers.dart';
import '../theme/app_theme.dart';
import 'sync_status_badge.dart';
import 'trust_score_badge.dart';

/// Tarjeta resumen de un incidente en la lista. Ver sistema-diseno-app.md §6.3.
class ReportCard extends ConsumerWidget {
  const ReportCard({
    required this.category,
    required this.priority,
    required this.status,
    required this.locationLabel,
    required this.capturedAt,
    this.incidentId,
    this.note,
    this.attachmentStatus,
    this.onTap,
    super.key,
  });

  final IncidentCategory category;
  final IncidentPriority priority;
  final IncidentStatus status;
  final String locationLabel;
  final DateTime capturedAt;
  final String? incidentId;
  final String? note;
  final AttachmentSyncStatus? attachmentStatus;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final meta = categoryMeta(category);
    final statusColor = incidentStatusColor(status, tokens);

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
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Icon(
                  _statusIcon(status),
                  color: statusColor,
                  size: 20,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        PriorityBadge(priority: priority, compact: true),
                        const SizedBox(width: AppSpacing.xs),
                        Expanded(
                          child: Text(
                            meta.label,
                            style: AppTypography.bodyLg.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    if (note != null && note!.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        note!,
                        style: AppTypography.body
                            .copyWith(color: tokens.muted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      [
                        if (incidentId != null) vacaShortId(incidentId!),
                        vacaRelativeTime(
                          capturedAt,
                          now: ref.watch(vacaClockProvider)(),
                        ),
                      ].join(' · '),
                      style: AppTypography.dataSm
                          .copyWith(color: tokens.muted),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Row(
                      children: [
                        Icon(
                          Icons.location_on_outlined,
                          size: 13,
                          color: tokens.muted,
                        ),
                        const SizedBox(width: 2),
                        Expanded(
                          child: Text(
                            locationLabel,
                            style: AppTypography.caption
                                .copyWith(color: tokens.muted),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 150),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      incidentStatusLabel(status),
                      textAlign: TextAlign.end,
                      style: AppTypography.caption.copyWith(
                        color: statusColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (attachmentStatus != null) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      SyncStatusBadge(status: attachmentStatus!),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _statusIcon(IncidentStatus s) => switch (s) {
        IncidentStatus.draft => Icons.edit_outlined,
        IncidentStatus.savedLocally => Icons.save_outlined,
        IncidentStatus.queued => Icons.schedule,
        IncidentStatus.relaying => Icons.upload_outlined,
        IncidentStatus.uploading => Icons.upload_outlined,
        IncidentStatus.receivedByServer => Icons.verified_outlined,
        IncidentStatus.acknowledgedInstitutionally => Icons.verified,
        IncidentStatus.cancelledLocally => Icons.cancel_outlined,
        IncidentStatus.cancellationQueued => Icons.cancel_outlined,
        IncidentStatus.cancellationReceived => Icons.cancel_outlined,
        IncidentStatus.expired => Icons.hourglass_disabled_outlined,
        IncidentStatus.failedRetryable => Icons.error_outline,
      };
}
