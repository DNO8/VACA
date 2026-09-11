import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/transport/transport.dart';
import '../../../core/widgets/widgets.dart';
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
    final transport = ref.watch(transportProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Señales')),
      body: Column(
        children: [
          StreamBuilder<TransportStatus>(
            stream: transport.status,
            builder: (context, snapshot) => NetworkStatusBanner(
              state: snapshot.data?.isAvailable == true
                  ? NetworkUiState.online
                  : NetworkUiState.offline,
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
                  padding: const EdgeInsets.all(AppSpacing.screenPadding),
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
      floatingActionButton: Semantics(
        button: true,
        label: 'Nueva señal',
        child: FloatingActionButton(
          onPressed: () => _create(context),
          backgroundColor: AppColors.celadon700,
          child: const Icon(Icons.add, color: AppColors.white),
        ),
      ),
    );
  }

  String _locationLabel(UserIncident incident) {
    if (incident.latitude != null && incident.longitude != null) {
      return '${incident.latitude!.toStringAsFixed(4)}, ${incident.longitude!.toStringAsFixed(4)}';
    }
    return 'Ubicación no registrada';
  }
}
