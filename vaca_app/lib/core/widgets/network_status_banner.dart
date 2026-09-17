import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Estado de red/sincronización para el banner. El estado offline es el
/// esperado por defecto en el Día 0 y nunca debe ocultarse.
enum NetworkUiState { offline, online, syncing, success, error }

/// Banner de estado de red. Ver sistema-diseno-app.md §6.5.
class NetworkStatusBanner extends StatelessWidget {
  const NetworkStatusBanner({
    required this.state,
    this.pendingCount = 0,
    this.onRetry,
    super.key,
  });

  final NetworkUiState state;
  final int pendingCount;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (bg, fg, icon, text) = switch (state) {
      NetworkUiState.offline => (
          AppColors.neutral700,
          AppColors.white,
          Icons.cloud_off,
          pendingCount > 0
              ? 'Sin conexión · $pendingCount señales en espera'
              : 'Sin conexión · guardando local',
        ),
      NetworkUiState.online => (
          tokens.info,
          AppColors.white,
          Icons.wifi,
          pendingCount > 0
              ? 'Conectado · $pendingCount señales pendientes'
              : 'Conectado',
        ),
      NetworkUiState.syncing => (
          AppColors.orange,
          AppColors.white,
          Icons.sync,
          'Sincronizando $pendingCount señales…',
        ),
      NetworkUiState.success => (
          tokens.synced,
          AppColors.white,
          Icons.check_circle,
          'Entrega verificada · sin pendientes',
        ),
      NetworkUiState.error => (
          tokens.syncError,
          AppColors.white,
          Icons.error_outline,
          pendingCount > 0
              ? 'Entrega pendiente · $pendingCount elementos'
              : 'Error de sincronización',
        ),
    };

    return Semantics(
      liveRegion: true,
      label: text,
      child: Material(
        color: bg,
        child: SafeArea(
          top: false,
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.xs,
            ),
            child: Row(
              children: [
                Icon(icon, size: 18, color: fg),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Text(
                    text,
                    style: AppTypography.caption.copyWith(color: fg),
                  ),
                ),
                if (state == NetworkUiState.error && onRetry != null)
                  TextButton(
                    onPressed: onRetry,
                    style: TextButton.styleFrom(
                      foregroundColor: fg,
                      minimumSize: const Size(48, 32),
                    ),
                    child: const Text('Reintentar'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
