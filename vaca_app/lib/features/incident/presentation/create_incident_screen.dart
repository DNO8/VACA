import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/result/result.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../data/local/enums.dart';
import '../../capture/camera_capture_screen.dart';
import '../../capture/capture_result.dart';
import '../domain/incident_service.dart';
import 'local_confirmation_screen.dart';

/// Pantalla de creación de incidente.
///
/// Captura categoría, prioridad, nota corta, personas y ubicación.
/// La foto es opcional y se adjunta en fase B5.
class CreateIncidentScreen extends ConsumerStatefulWidget {
  const CreateIncidentScreen({super.key});

  @override
  ConsumerState<CreateIncidentScreen> createState() =>
      _CreateIncidentScreenState();
}

class _CreateIncidentScreenState extends ConsumerState<CreateIncidentScreen> {
  IncidentCategory _category = IncidentCategory.sos;
  final _peopleController = TextEditingController();
  final _noteController = TextEditingController();
  final _latitudeController = TextEditingController();
  final _longitudeController = TextEditingController();
  int? _peopleCount;
  String _note = '';
  double? _latitude;
  double? _longitude;
  double? _accuracy;
  LocationSource _locationSource = LocationSource.unavailable;
  CaptureResult? _photo;
  bool _saving = false;
  int _step = 0;

  @override
  void initState() {
    super.initState();
    _acquireLocation();
  }

  @override
  void dispose() {
    _peopleController.dispose();
    _noteController.dispose();
    _latitudeController.dispose();
    _longitudeController.dispose();
    super.dispose();
  }

  Future<void> _acquireLocation() async {
    final service = ref.read(permissionServiceProvider);
    final position = await service.currentPosition();
    if (position != null && mounted) {
      setState(() {
        _latitude = position.latitude;
        _longitude = position.longitude;
        _accuracy = position.accuracy;
        _latitudeController.text = position.latitude.toStringAsFixed(6);
        _longitudeController.text = position.longitude.toStringAsFixed(6);
        _locationSource = LocationSource.gps;
      });
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final photo = _photo;
      final result = await ref.read(incidentServiceProvider).createAndEnqueue(
            category: _category,
            priority: _categoryToPriority(_category),
            peopleCount: _peopleCount,
            shortNote: _note.isEmpty ? null : _note,
            latitude: _latitude,
            longitude: _longitude,
            accuracyMeters: _accuracy,
            locationSource: _locationSource,
            attachment: photo == null
                ? null
                : PendingAttachment(
                    kind: AttachmentKind.photo,
                    localPath: photo.localPath,
                    sha256: photo.sha256,
                    capturedAt: photo.takenAt,
                  ),
          );
      if (!mounted) return;
      switch (result) {
        case Success(value: final incident):
          unawaited(ref.read(bundleSchedulerProvider).processQueue());
          await Navigator.of(context).pushReplacement<bool, bool>(
            MaterialPageRoute(
              builder: (_) => LocalConfirmationScreen(incident: incident),
            ),
          );
        case Failure(error: final error):
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                error.message ?? 'No se pudo guardar la señal.',
              ),
              backgroundColor: AppColors.danger,
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

    final steps = <Widget>[
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('¿Qué está ocurriendo?', style: AppTypography.h1),
          const SizedBox(height: AppSpacing.xs),
          const Text(
            'Selecciona una categoría. VACA asignará la prioridad de entrega.',
            style: AppTypography.bodyLg,
          ),
          const SizedBox(height: AppSpacing.xl),
          VacaEnumSelector<IncidentCategory>(
            label: 'Categoría',
            selected: _category,
            values: IncidentCategory.values,
            labelBuilder: _categoryLabel,
            onChanged: (category) => setState(() => _category = category),
          ),
        ],
      ),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Ubicación del incidente', style: AppTypography.h1),
          const SizedBox(height: AppSpacing.xs),
          const Text(
            'Puedes continuar aunque el GPS no esté disponible.',
            style: AppTypography.bodyLg,
          ),
          const SizedBox(height: AppSpacing.xl),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: SizedBox(
              height: 190,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.asset(
                    'assets/images/mapa-3.jpg',
                    fit: BoxFit.cover,
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      color: Color(0x731F3B30),
                    ),
                  ),
                  const Center(
                    child: Icon(
                      Icons.location_pin,
                      color: AppColors.white,
                      size: 44,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Card(
            child: ListTile(
              leading: const Icon(Icons.location_on_outlined),
              title: Text(locationText, style: AppTypography.data),
              subtitle: Text(
                _latitude == null
                    ? 'Ubicación no disponible'
                    : 'Precisión aproximada: ${_accuracy?.toStringAsFixed(1)} m',
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          VacaTextField(
            label: 'Latitud manual',
            controller: _latitudeController,
            keyboardType: const TextInputType.numberWithOptions(
              signed: true,
              decimal: true,
            ),
            onChanged: (value) => setState(() {
              _latitude = double.tryParse(value.replaceAll(',', '.'));
              if (_latitude != null && _longitude != null) {
                _locationSource = LocationSource.manual;
                _accuracy = null;
              }
            }),
          ),
          const SizedBox(height: AppSpacing.sm),
          VacaTextField(
            label: 'Longitud manual',
            controller: _longitudeController,
            keyboardType: const TextInputType.numberWithOptions(
              signed: true,
              decimal: true,
            ),
            onChanged: (value) => setState(() {
              _longitude = double.tryParse(value.replaceAll(',', '.'));
              if (_latitude != null && _longitude != null) {
                _locationSource = LocationSource.manual;
                _accuracy = null;
              }
            }),
          ),
          const SizedBox(height: AppSpacing.sm),
          VacaButton(
            label: 'Actualizar GPS',
            icon: Icons.my_location,
            variant: VacaButtonVariant.secondary,
            onPressed: _acquireLocation,
          ),
        ],
      ),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Datos mínimos', style: AppTypography.h1),
          const SizedBox(height: AppSpacing.xs),
          const Text(
            'Agrega sólo la información necesaria para coordinar la respuesta.',
            style: AppTypography.bodyLg,
          ),
          const SizedBox(height: AppSpacing.xl),
          VacaTextField(
            label: 'Personas afectadas (opcional)',
            controller: _peopleController,
            keyboardType: TextInputType.number,
            onChanged: (value) => _peopleCount = int.tryParse(value),
          ),
          const SizedBox(height: AppSpacing.lg),
          VacaTextField(
            label: 'Descripción breve (opcional)',
            controller: _noteController,
            maxLines: 3,
            onChanged: (value) => _note = value,
          ),
        ],
      ),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Foto y evidencia', style: AppTypography.h1),
          const SizedBox(height: AppSpacing.xs),
          const Text(
            'La fotografía es opcional y no bloquea el guardado de la señal.',
            style: AppTypography.bodyLg,
          ),
          const SizedBox(height: AppSpacing.xl),
          _PhotoSection(
            photo: _photo,
            onCapture: () async {
              final result = await Navigator.of(context).push<CaptureResult>(
                MaterialPageRoute(builder: (_) => const CameraCaptureScreen()),
              );
              if (result != null && mounted) setState(() => _photo = result);
            },
          ),
        ],
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: _step == 0 ? 'Cerrar' : 'Paso anterior',
          onPressed: _step == 0
              ? () => Navigator.of(context).pop()
              : () => setState(() => _step--),
          icon: Icon(_step == 0 ? Icons.close : Icons.arrow_back),
        ),
        title: Text('Nueva señal · ${_step + 1} de 4'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.screenPadding),
        children: [steps[_step]],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          child: VacaButton(
            label: _step == steps.length - 1 ? 'Guardar señal' : 'Continuar',
            loading: _saving,
            onPressed: _saving
                ? null
                : _step == steps.length - 1
                    ? _save
                    : () => setState(() => _step++),
          ),
        ),
      ),
    );
  }

  String _categoryLabel(IncidentCategory c) => switch (c) {
        IncidentCategory.sos => 'SOS · Vida en riesgo',
        IncidentCategory.medical => 'Emergencia médica',
        IncidentCategory.person => 'Persona / ubicación',
        IncidentCategory.hazard => 'Peligro / infraestructura',
        IncidentCategory.coordination => 'Coordinación',
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
