import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/vaca_format.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../delivery/domain/sync_status_service.dart';
import '../../../data/local/enums.dart';
import '../domain/incident.dart';
import 'create_incident_screen.dart';
import 'incident_detail_screen.dart';

/// Lista de incidentes capturados localmente.
class IncidentListScreen extends ConsumerWidget {
  const IncidentListScreen({super.key});

  Future<void> _create(BuildContext context) async {
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const CreateIncidentScreen()),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final service = ref.watch(incidentServiceProvider);
    final attachments = ref.watch(attachmentServiceProvider);
    final sync = ref.watch(syncSnapshotProvider).valueOrNull;
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: Opacity(
              opacity:
                  Theme.of(context).brightness == Brightness.dark ? 0.12 : 0.06,
              child: Image.asset(
                'assets/images/textura-3.jpg',
                fit: BoxFit.cover,
              ),
            ),
          ),
          Column(
            children: [
          SizedBox(
            height: 200,
            width: double.infinity,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.asset(
                  'assets/images/estetica.jpg',
                  fit: BoxFit.cover,
                  alignment: const Alignment(0, 0.35),
                ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        const Color(0xAA1F3B30),
                        const Color(0x551F3B30),
                        Theme.of(context).scaffoldBackgroundColor,
                      ],
                      stops: const [0, 0.5, 1],
                    ),
                  ),
                ),
                SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.xl,
                      0,
                      AppSpacing.xl,
                      AppSpacing.xl,
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.end,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${vacaGreeting(ref.watch(vacaClockProvider)())},',
                                style: AppTypography.body.copyWith(
                                  color: AppColors.celadon300
                                      .withValues(alpha: 0.85),
                                ),
                              ),
                              const SizedBox(height: 2),
                              const Text(
                                'Respondedor Local',
                                style: TextStyle(
                                  fontFamily: AppTypography.brandFont,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 22,
                                  color: AppColors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: const Color(0xB3456B58),
                            borderRadius: BorderRadius.circular(AppRadius.sm),
                            border: Border.all(
                              color:
                                  AppColors.celadon300.withValues(alpha: 0.3),
                            ),
                          ),
                          child: const Icon(
                            Icons.shield_outlined,
                            color: AppColors.celadon300,
                            size: 20,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenPadding,
              AppSpacing.sm,
              AppSpacing.screenPadding,
              0,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.md),
              child: NetworkStatusBanner(
                state: _networkState(sync?.phase ?? SyncPhase.offline),
                pendingCount: sync?.pendingCount ?? 0,
                onRetry: sync?.canRetry == true
                    ? () => ref.read(bundleSchedulerProvider).processQueue()
                    : null,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenPadding,
              AppSpacing.sm,
              AppSpacing.screenPadding,
              AppSpacing.sm,
            ),
            child: Semantics(
              button: true,
              label: 'Nueva señal de incidente. Funciona sin conexión.',
              child: Material(
                color: AppColors.celadon700,
                borderRadius: BorderRadius.circular(AppRadius.lg),
                child: InkWell(
                  onTap: () => _create(context),
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.xl,
                      vertical: AppSpacing.lg,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: AppColors.white.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(AppRadius.sm),
                          ),
                          child: const Icon(
                            Icons.add,
                            color: AppColors.white,
                            size: 24,
                          ),
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Nueva señal de incidente',
                                style: TextStyle(
                                  fontFamily: AppTypography.brandFont,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 17,
                                  color: AppColors.white,
                                ),
                              ),
                              Text(
                                'Funciona sin conexión',
                                style: AppTypography.body.copyWith(
                                  color: AppColors.white.withValues(alpha: 0.8),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          Icons.chevron_right,
                          color: AppColors.white.withValues(alpha: 0.7),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenPadding,
            ),
            child: Row(
              children: [
                const Expanded(
                  child: Text('Actividad reciente', style: AppTypography.h3),
                ),
                TextButton(
                  onPressed: () =>
                      ref.read(shellTabProvider.notifier).state = 1,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.celadon700,
                    minimumSize: const Size(48, 36),
                  ),
                  child: const Text('Ver entrega →'),
                ),
              ],
            ),
          ),
          Expanded(
            child: StreamBuilder<List<UserIncident>>(
              stream: service.watch(),
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const EmptyState(kind: EmptyStateKind.loading);
                }
                final incidents = snapshot.data!;
                if (incidents.isEmpty) {
                  return EmptyState(
                    kind: EmptyStateKind.empty,
                    title: 'Sin señales guardadas',
                    message: 'Crea una señal para registrar un incidente.',
                    actionLabel: 'Nueva señal',
                    onAction: () => _create(context),
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screenPadding,
                  ),
                  itemCount: incidents.length,
                  itemBuilder: (context, index) {
                    final incident = incidents[index];
                    return StreamBuilder<AttachmentSyncStatus?>(
                      stream: attachments.watchStatus(incident.id),
                      builder: (context, attachmentSnapshot) => ReportCard(
                        category: incident.category,
                        priority: incident.priority,
                        status: incident.status,
                        locationLabel: _locationLabel(incident),
                        capturedAt: incident.createdAt,
                        incidentId: incident.id,
                        note: incident.shortNote,
                        attachmentStatus: attachmentSnapshot.data,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => IncidentDetailScreen(
                              incidentId: incident.id,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
            ],
          ),
        ],
      ),
    );
  }

  NetworkUiState _networkState(SyncPhase phase) => switch (phase) {
        SyncPhase.offline => NetworkUiState.offline,
        SyncPhase.online => NetworkUiState.online,
        SyncPhase.syncing => NetworkUiState.syncing,
        SyncPhase.success => NetworkUiState.success,
        SyncPhase.error => NetworkUiState.error,
      };

  String _locationLabel(UserIncident incident) {
    if (incident.latitude != null && incident.longitude != null) {
      return '${incident.latitude!.toStringAsFixed(4)}, ${incident.longitude!.toStringAsFixed(4)}';
    }
    return 'Ubicación no registrada';
  }
}
