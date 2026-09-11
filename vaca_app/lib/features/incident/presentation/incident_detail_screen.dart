import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/result/result.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../data/local/enums.dart';
import '../domain/incident.dart';
import '../domain/incident_service.dart';

/// Detalle de un incidente y controles de ciclo de vida.
class IncidentDetailScreen extends ConsumerStatefulWidget {
  const IncidentDetailScreen({required this.incidentId, super.key});

  final String incidentId;

  @override
  ConsumerState<IncidentDetailScreen> createState() =>
      _IncidentDetailScreenState();
}

class _IncidentDetailScreenState extends ConsumerState<IncidentDetailScreen> {
  Future<UserIncident?>? _incident;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final service = ref.read(incidentServiceProvider);
    setState(() => _incident = service.get(widget.incidentId));
  }

  Future<void> _update(IncidentService service, UserIncident incident) async {
    final controller = TextEditingController(text: incident.shortNote);
    final note = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Actualizar señal'),
        content: TextField(
          controller: controller,
          maxLength: 280,
          maxLines: 4,
          decoration: const InputDecoration(labelText: 'Nota actualizada'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Guardar actualización'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (note == null || note.isEmpty) return;
    final result = await service.updateNote(incident.id, note);
    if (!mounted) return;
    switch (result) {
      case Success():
        unawaited(ref.read(bundleSchedulerProvider).processQueue());
        _load();
        _show('Actualización guardada y en cola.');
      case Failure(error: final error):
        _show(error.message ?? 'No se pudo guardar la actualización.');
    }
  }

  Future<void> _cancel(IncidentService service, UserIncident incident) async {
    final result = await service.cancel(incident.id);
    if (!mounted) return;
    switch (result) {
      case Success():
        unawaited(ref.read(bundleSchedulerProvider).processQueue());
        _load();
        _show('Cancelación guardada y en cola.');
      case Failure(error: final error):
        _show(error.message ?? 'No se pudo guardar la cancelación.');
    }
  }

  void _show(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: AppTypography.body.copyWith(color: AppColors.white),
        ),
        backgroundColor: AppColors.celadon700,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.celadon900,
        foregroundColor: AppColors.white,
        title: Text(
          'Detalle',
          style: AppTypography.h3.copyWith(color: AppColors.white),
        ),
      ),
      body: FutureBuilder<UserIncident?>(
        future: _incident,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final incident = snapshot.data;
          if (incident == null) {
            return const EmptyState(
              kind: EmptyStateKind.error,
              title: 'Señal no encontrada',
            );
          }
          return _buildBody(incident);
        },
      ),
    );
  }

  Widget _buildBody(UserIncident incident) {
    final service = ref.read(incidentServiceProvider);
    final canCancel = !{
      IncidentStatus.cancelledLocally,
      IncidentStatus.cancellationQueued,
      IncidentStatus.cancellationReceived,
      IncidentStatus.expired,
    }.contains(incident.status);

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.screenPadding),
      children: [
        PriorityBadge(priority: incident.priority),
        const SizedBox(height: AppSpacing.md),
        Text(_categoryLabel(incident.category), style: AppTypography.h2),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'Estado: ${_statusLabel(incident.status)}',
          style: AppTypography.bodyLg,
        ),
        Text(
          'Confianza: ${_assuranceLabel(incident.identityAssurance)}',
          style: AppTypography.body,
        ),
        const SizedBox(height: AppSpacing.xl),
        if (incident.shortNote != null) ...[
          Text(incident.shortNote!, style: AppTypography.bodyLg),
          const SizedBox(height: AppSpacing.xl),
        ],
        if (incident.peopleCount != null) ...[
          Text('Personas: ${incident.peopleCount}', style: AppTypography.data),
          const SizedBox(height: AppSpacing.xl),
        ],
        if (incident.latitude != null && incident.longitude != null) ...[
          Text(
            'Ubicacion: ${incident.latitude!.toStringAsFixed(5)}, ${incident.longitude!.toStringAsFixed(5)}',
            style: AppTypography.data,
          ),
          const SizedBox(height: AppSpacing.xl),
        ],
        if (canCancel) ...[
          VacaButton(
            label: 'Actualizar señal',
            icon: Icons.edit_outlined,
            onPressed: () => _update(service, incident),
          ),
          const SizedBox(height: AppSpacing.md),
          VacaButton(
            label: 'Cancelar señal',
            variant: VacaButtonVariant.destructive,
            onPressed: () => _cancel(service, incident),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        VacaButton(
          label: 'Volver',
          variant: VacaButtonVariant.secondary,
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }

  String _categoryLabel(IncidentCategory c) => switch (c) {
        IncidentCategory.sos => 'SOS · Vida en riesgo',
        IncidentCategory.medical => 'Emergencia medica',
        IncidentCategory.person => 'Persona / ubicacion',
        IncidentCategory.hazard => 'Peligro / infraestructura',
        IncidentCategory.coordination => 'Coordinacion',
      };

  String _statusLabel(IncidentStatus s) => switch (s) {
        IncidentStatus.draft => 'Borrador',
        IncidentStatus.savedLocally => 'Guardada localmente',
        IncidentStatus.queued => 'En cola',
        IncidentStatus.relaying => 'Reenviando',
        IncidentStatus.uploading => 'Subiendo',
        IncidentStatus.receivedByServer => 'Recibida',
        IncidentStatus.acknowledgedInstitutionally => 'Confirmada',
        IncidentStatus.cancelledLocally => 'Cancelada',
        IncidentStatus.cancellationQueued => 'Cancelando',
        IncidentStatus.cancellationReceived => 'Cancelada',
        IncidentStatus.expired => 'Expirada',
        IncidentStatus.failedRetryable => 'Reintentable',
      };

  String _assuranceLabel(IdentityAssurance a) => switch (a) {
        IdentityAssurance.unverified => 'Identidad no verificada',
        IdentityAssurance.verified => 'Identidad verificada',
        IdentityAssurance.expired => 'Credencial vencida',
        IdentityAssurance.revoked => 'Credencial revocada',
      };
}
