import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../data/local/enums.dart';
import '../../capture/camera_capture_screen.dart';
import '../../capture/capture_result.dart';

/// Pantalla de creacion de incidente.
///
/// Captura categoria, prioridad, nota corta, personas y ubicacion.
/// La foto es opcional y se adjunta en fase B5.
class CreateIncidentScreen extends ConsumerStatefulWidget {
  const CreateIncidentScreen({super.key});

  @override
  ConsumerState<CreateIncidentScreen> createState() =>
      _CreateIncidentScreenState();
}

class _CreateIncidentScreenState extends ConsumerState<CreateIncidentScreen> {
  IncidentCategory _category = IncidentCategory.sos;
  int? _peopleCount;
  String _note = '';
  double? _latitude;
  double? _longitude;
  double? _accuracy;
  LocationSource _locationSource = LocationSource.unavailable;
  CaptureResult? _photo;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _acquireLocation();
  }

  Future<void> _acquireLocation() async {
    final service = ref.read(permissionServiceProvider);
    final position = await service.currentPosition();
    if (position != null && mounted) {
      setState(() {
        _latitude = position.latitude;
        _longitude = position.longitude;
        _accuracy = position.accuracy;
        _locationSource = LocationSource.gps;
      });
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final identity = await ref.read(identityServiceProvider).getOrCreateLocalProfile();
      final incident = await ref.read(incidentServiceProvider).create(
            reporterProfileId: identity.id,
            category: _category,
            priority: _categoryToPriority(_category),
            peopleCount: _peopleCount,
            shortNote: _note.isEmpty ? null : _note,
            latitude: _latitude,
            longitude: _longitude,
            accuracyMeters: _accuracy,
            locationSource: _locationSource,
            identityAssurance: identity.identityAssurance,
          );
      final photo = _photo;
      if (photo != null) {
        await ref.read(attachmentServiceProvider).create(
          incidentId: incident.id,
          kind: AttachmentKind.photo,
          localPath: photo.localPath,
          sha256: photo.sha256,
          takenAt: photo.takenAt,
          latitude: photo.latitude,
          longitude: photo.longitude,
          accuracyMeters: photo.gpsAccuracy,
        );
      }
      if (mounted) {
        Navigator.of(context).pop(true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Señal ${incident.id.substring(0, 8)} guardada localmente.',
              style: AppTypography.body.copyWith(color: AppColors.white),
            ),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  IncidentPriority _categoryToPriority(IncidentCategory c) => switch (c) {
        IncidentCategory.sos => IncidentPriority.p0,
        IncidentCategory.medical => IncidentPriority.p1,
        IncidentCategory.person => IncidentPriority.p2,
        IncidentCategory.hazard => IncidentPriority.p3,
        IncidentCategory.coordination => IncidentPriority.p4,
      };

  @override
  Widget build(BuildContext context) {
    final locationText = _latitude != null && _longitude != null
        ? '${_latitude!.toStringAsFixed(5)}, ${_longitude!.toStringAsFixed(5)} ($_locationSource)'
        : 'Sin ubicación automática';

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.celadon900,
        foregroundColor: AppColors.white,
        title: Text('Nueva señal', style: AppTypography.h3.copyWith(color: AppColors.white)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.screenPadding),
        children: [
          const Text('Categoria', style: AppTypography.h2),
          const SizedBox(height: AppSpacing.sm),
          VacaEnumSelector<IncidentCategory>(
            label: 'Categoria',
            selected: _category,
            values: IncidentCategory.values,
            labelBuilder: (c) => _categoryLabel(c),
            onChanged: (c) => setState(() => _category = c),
          ),
          const SizedBox(height: AppSpacing.xl),
          const Text('Personas afectadas (opcional)', style: AppTypography.h2),
          VacaTextField(
            label: 'Cantidad',
            keyboardType: TextInputType.number,
            onChanged: (v) => _peopleCount = int.tryParse(v),
          ),
          const SizedBox(height: AppSpacing.xl),
          const Text('Nota corta', style: AppTypography.h2),
          VacaTextField(
            label: 'Descripcion breve',
            maxLines: 3,
            onChanged: (v) => _note = v,
          ),
          const SizedBox(height: AppSpacing.xl),
          const Text('Evidencia fotografica (opcional)', style: AppTypography.h2),
          const SizedBox(height: AppSpacing.sm),
          _PhotoSection(
            photo: _photo,
            onCapture: () async {
              final result = await Navigator.of(context).push<CaptureResult>(
                MaterialPageRoute(builder: (_) => const CameraCaptureScreen()),
              );
              if (result != null && mounted) setState(() => _photo = result);
            },
          ),
          const SizedBox(height: AppSpacing.xl),
          const Text('Ubicacion', style: AppTypography.h2),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: Text(
                  locationText,
                  style: AppTypography.data,
                ),
              ),
              TextButton(
                onPressed: _acquireLocation,
                child: const Text('Actualizar GPS'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          VacaButton(
            label: 'Guardar señal',
            loading: _saving,
            onPressed: _saving ? null : _save,
          ),
        ],
      ),
    );
  }

  String _categoryLabel(IncidentCategory c) => switch (c) {
        IncidentCategory.sos => 'SOS · Vida en riesgo',
        IncidentCategory.medical => 'Emergencia medica',
        IncidentCategory.person => 'Persona / ubicacion',
        IncidentCategory.hazard => 'Peligro / infraestructura',
        IncidentCategory.coordination => 'Coordinacion',
      };
}

class _PhotoSection extends StatelessWidget {
  const _PhotoSection({required this.photo, required this.onCapture});

  final CaptureResult? photo;
  final VoidCallback onCapture;

  @override
  Widget build(BuildContext context) {
    if (photo == null) {
      return VacaButton(
        label: 'Adjuntar foto',
        icon: Icons.photo_camera,
        variant: VacaButtonVariant.secondary,
        onPressed: onCapture,
      );
    }
    return Row(
      children: [
        const Icon(Icons.check_circle, color: AppColors.success),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            'Foto lista · hash ${photo!.sha256.substring(0, 12)}…',
            style: AppTypography.data,
          ),
        ),
        TextButton(
          onPressed: onCapture,
          child: const Text('Reemplazar'),
        ),
      ],
    );
  }
}
