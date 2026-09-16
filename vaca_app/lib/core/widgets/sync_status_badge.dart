import 'package:flutter/material.dart';

import '../../data/local/enums.dart';
import '../theme/app_theme.dart';

/// Badge de estado de sincronización de un adjunto. Ver sistema-diseno-app.md §6.7.
class SyncStatusBadge extends StatelessWidget {
  const SyncStatusBadge({required this.status, super.key});

  final AttachmentSyncStatus status;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (color, label, icon) = switch (status) {
      AttachmentSyncStatus.pending => (
          tokens.syncPending,
          'Pendiente',
          Icons.schedule
        ),
      AttachmentSyncStatus.uploading => (
          tokens.syncing,
          'Subiendo',
          Icons.sync
        ),
      AttachmentSyncStatus.synced => (
          tokens.synced,
          'Sincronizado',
          Icons.check_circle
        ),
      AttachmentSyncStatus.failed => (
          tokens.syncError,
          'Error',
          Icons.error_outline
        ),
    };

    return Semantics(
      label: 'Estado de sincronización: ',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(label, style: AppTypography.dataSm.copyWith(color: color)),
        ],
      ),
    );
  }
}
