import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../data/local/enums.dart';
import '../domain/incident.dart';
import 'create_incident_screen.dart';
import 'incident_detail_screen.dart';

/// Lista de incidentes capturados localmente.
class IncidentListScreen extends ConsumerStatefulWidget {
  const IncidentListScreen({super.key});

  @override
  ConsumerState<IncidentListScreen> createState() => _IncidentListScreenState();
}

class _IncidentListScreenState extends ConsumerState<IncidentListScreen> {
  Future<List<UserIncident>>? _incidents;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final service = ref.read(incidentServiceProvider);
    final future = service.list();
    setState(() {
      _incidents = future;
    });
  }

  Future<void> _create() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const CreateIncidentScreen()),
    );
    if (created == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.celadon900,
        foregroundColor: AppColors.white,
        title: Text('Señales', style: AppTypography.h3.copyWith(color: AppColors.white)),
      ),
      body: Column(
        children: [
          const NetworkStatusBanner(state: NetworkUiState.offline),
          Expanded(
            child: FutureBuilder<List<UserIncident>>(
              future: _incidents,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                final incidents = snapshot.data ?? [];
                if (incidents.isEmpty) {
                  return EmptyState(
                    kind: EmptyStateKind.empty,
                    title: 'Sin señales guardadas',
                    message: 'Crea una señal para registrar un incidente.',
                    actionLabel: 'Nueva señal',
                    onAction: _create,
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.all(AppSpacing.screenPadding),
                  itemCount: incidents.length,
                  itemBuilder: (context, index) {
                    final i = incidents[index];
                    return ReportCard(
                      category: i.category,
                      priority: i.priority,
                      status: i.status,
                      locationLabel: _locationLabel(i),
                      capturedAt: i.createdAt,
                      attachmentStatus: AttachmentSyncStatus.pending,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => IncidentDetailScreen(incidentId: i.id),
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
          onPressed: _create,
          backgroundColor: AppColors.celadon700,
          child: const Icon(Icons.add, color: AppColors.white),
        ),
      ),
    );
  }

  String _locationLabel(UserIncident i) {
    if (i.latitude != null && i.longitude != null) {
      return '${i.latitude!.toStringAsFixed(4)}, ${i.longitude!.toStringAsFixed(4)}';
    }
    return 'Ubicación no registrada';
  }
}
