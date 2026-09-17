import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/vaca_format.dart';
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
  IncidentCategory? _category;
  final _noteController = TextEditingController();
  final _latitudeController = TextEditingController();
  final _longitudeController = TextEditingController();
  int _peopleCount = 0;
  String _note = '';
  double? _latitude;
  double? _longitude;
  double? _accuracy;
  LocationSource _locationSource = LocationSource.unavailable;
  CaptureResult? _photo;
  bool _saving = false;
  int _step = 0;

  static const _maxNoteLength = 160;

  @override
  void initState() {
    super.initState();
    _acquireLocation();
  }

  @override
  void dispose() {
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
            category: _category!,
            priority: categoryMeta(_category!).priority,
            peopleCount: _peopleCount > 0 ? _peopleCount : null,
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

  void _next() => setState(() => _step++);

  Future<void> _capturePhoto() async {
    final result = await Navigator.of(context).push<CaptureResult>(
      MaterialPageRoute(builder: (_) => const CameraCaptureScreen()),
    );
    if (result != null && mounted) setState(() => _photo = result);
  }

  @override
  Widget build(BuildContext context) {
    final canContinue = switch (_step) {
      0 => _category != null,
      _ => true,
    };

    return Scaffold(
      backgroundColor: _step == 3 ? AppColors.celadon900 : null,
      appBar: _step == 1 || _step == 3
          ? null
          : AppBar(
              leading: IconButton(
                tooltip: _step == 0 ? 'Cerrar' : 'Paso anterior',
                onPressed: _step == 0
                    ? () => Navigator.of(context).pop()
                    : () => setState(() => _step--),
                icon: Icon(_step == 0 ? Icons.close : Icons.arrow_back),
              ),
              title: Text('Nueva señal · ${_step + 1} de 4'),
            ),
      body: switch (_step) {
        1 => _buildLocationStep(),
        3 => SafeArea(child: _buildPhotoStep()),
        _ => ListView(
            padding: const EdgeInsets.all(AppSpacing.screenPadding),
            children: [
              _step == 0 ? _buildCategoryStep() : _buildDetailsStep(),
            ],
          ),
      },
      bottomNavigationBar: _step == 3
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.screenPadding),
                child: VacaButton(
                  label: _step == 0
                      ? (_category != null
                          ? 'Continuar con esta categoría'
                          : 'Selecciona una categoría')
                      : 'Continuar',
                  onPressed: canContinue ? _next : null,
                ),
              ),
            ),
    );
  }

  // ─── Paso 1: categoría ────────────────────────────────────────────────

  Widget _buildCategoryStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Tipo de incidente', style: AppTypography.h1),
        const SizedBox(height: AppSpacing.xs),
        const Text(
          'Selecciona una categoría. VACA asigna la prioridad de entrega.',
          style: AppTypography.bodyLg,
        ),
        const SizedBox(height: AppSpacing.xl),
        for (final c in IncidentCategory.values) ...[
          _CategoryCard(
            category: c,
            selected: _category == c,
            onTap: () => setState(() => _category = c),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }

  // ─── Paso 2: ubicación ────────────────────────────────────────────────

  Widget _buildLocationStep() {
    final hasGps = _latitude != null && _longitude != null;
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        SizedBox(
          height: 300,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.asset(
                'assets/images/mapa-3.jpg',
                fit: BoxFit.cover,
              ),
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0x881F3B30),
                      Color(0x441F3B30),
                      Color(0xCC1F3B30),
                    ],
                    stops: [0, 0.55, 1],
                  ),
                ),
              ),
              SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.xl,
                    vertical: AppSpacing.sm,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      IconButton.filledTonal(
                        onPressed: () => setState(() => _step--),
                        tooltip: 'Paso anterior',
                        icon: const Icon(Icons.arrow_back),
                        style: IconButton.styleFrom(
                          backgroundColor: const Color(0x33456B58),
                          foregroundColor: AppColors.white,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Ubicación del incidente',
                              style: TextStyle(
                                fontFamily: AppTypography.brandFont,
                                fontWeight: FontWeight.w700,
                                fontSize: 18,
                                color: AppColors.white,
                              ),
                            ),
                            Text(
                              'Paso 2 de 4 · Localización',
                              style: TextStyle(
                                fontFamily: AppTypography.brandFont,
                                fontSize: 12,
                                color: Color(0xCCB8D9C6),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Center(
                child: SizedBox(
                  width: 48,
                  height: 48,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.info.withValues(alpha: 0.15),
                          border: Border.all(
                            color: AppColors.info.withValues(alpha: 0.3),
                          ),
                        ),
                      ),
                      Container(
                        width: 30,
                        height: 30,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.info.withValues(alpha: 0.25),
                          border: Border.all(
                            color: AppColors.info.withValues(alpha: 0.4),
                          ),
                        ),
                      ),
                      Container(
                        width: 16,
                        height: 16,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.info,
                          border: Border.all(
                            color: AppColors.white,
                            width: 3,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(
                left: AppSpacing.md,
                bottom: AppSpacing.md,
                child: _MapChip(
                  text: hasGps
                      ? 'Precisión: ~${_accuracy?.toStringAsFixed(0) ?? '—'} m'
                      : 'Sin señal GPS',
                ),
              ),
              Positioned(
                right: AppSpacing.md,
                bottom: AppSpacing.md,
                child: _MapChip(
                  dot: hasGps ? AppColors.success : AppColors.warning,
                  text: hasGps ? 'GPS activo' : 'Sin GPS',
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
        Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: AppColors.ivory,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: AppColors.stone300),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Coordenadas capturadas',
                style: AppTypography.caption
                    .copyWith(color: AppColors.neutral500),
              ),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                hasGps
                    ? '${_latitude!.toStringAsFixed(5)}, ${_longitude!.toStringAsFixed(5)}'
                    : 'Sin ubicación automática',
                style: AppTypography.data,
              ),
              const SizedBox(height: AppSpacing.xs),
              Container(
                padding: const EdgeInsets.all(AppSpacing.sm),
                decoration: BoxDecoration(
                  color: AppColors.celadon50,
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Text(
                  'Las coordenadas exactas se entregan sólo al servidor autorizado.',
                  style: AppTypography.caption
                      .copyWith(color: AppColors.neutral500),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        VacaTextField(
          label: 'Latitud manual',
          controller: _latitudeController,
          mono: true,
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
          mono: true,
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
        ),
      ],
    );
  }

  // ─── Paso 3: datos mínimos ────────────────────────────────────────────

  Widget _buildDetailsStep() {
    final meta =
        _category != null ? categoryMeta(_category!) : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Detalles del incidente', style: AppTypography.h1),
        const SizedBox(height: AppSpacing.xs),
        const Text(
          'Agrega sólo la información necesaria para coordinar la respuesta.',
          style: AppTypography.bodyLg,
        ),
        const SizedBox(height: AppSpacing.xl),
        if (meta != null)
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.xs,
            ),
            decoration: BoxDecoration(
              color: meta.color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(color: meta.color.withValues(alpha: 0.4)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(meta.icon, size: 14, color: meta.color),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  '${priorityShortLabel(meta.priority)} · ${meta.label}',
                  style: AppTypography.caption.copyWith(
                    color: meta.color,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          'Personas afectadas estimadas',
          style: AppTypography.bodyLg.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            _StepperButton(
              icon: Icons.remove,
              onPressed: _peopleCount > 0
                  ? () => setState(() => _peopleCount--)
                  : null,
            ),
            Expanded(
              child: Column(
                children: [
                  Text(
                    '$_peopleCount',
                    style: AppTypography.display.copyWith(
                      fontFamily: AppTypography.monoFont,
                    ),
                  ),
                  Text(
                    _peopleCount == 0 ? 'sin dato' : 'personas aprox.',
                    style: AppTypography.caption
                        .copyWith(color: AppColors.neutral500),
                  ),
                ],
              ),
            ),
            _StepperButton(
              icon: Icons.add,
              onPressed: () => setState(() => _peopleCount++),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            for (final n in const [1, 5, 10, 50]) ...[
              Expanded(
                child: _CountChip(
                  label: '$n+',
                  selected: _peopleCount == n,
                  onTap: () => setState(() => _peopleCount = n),
                ),
              ),
              if (n != 50) const SizedBox(width: AppSpacing.xs),
            ],
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          'Descripción breve (opcional)',
          style: AppTypography.bodyLg.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: AppSpacing.xxs),
        TextField(
          controller: _noteController,
          maxLines: 4,
          maxLength: _maxNoteLength,
          onChanged: (value) => setState(() => _note = value),
          decoration: InputDecoration(
            hintText: 'Qué ocurrió, qué se observa, qué se necesita…',
            counterStyle: AppTypography.dataSm.copyWith(
              color: _note.length > _maxNoteLength * 0.85
                  ? AppColors.warning
                  : AppColors.neutral500,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: AppColors.celadon50,
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: Row(
            children: [
              Text(
                'ID de señal: ',
                style: AppTypography.caption
                    .copyWith(color: AppColors.neutral500),
              ),
              Text(
                'se generará al guardar',
                style: AppTypography.dataSm
                    .copyWith(color: AppColors.celadon700),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ─── Paso 4: foto (viewfinder oscuro) ─────────────────────────────────

  Widget _buildPhotoStep() {
    final photo = _photo;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          child: Row(
            children: [
              IconButton.filledTonal(
                onPressed: () => setState(() => _step--),
                tooltip: 'Paso anterior',
                icon: const Icon(Icons.arrow_back),
                style: IconButton.styleFrom(
                  backgroundColor: const Color(0x33456B58),
                  foregroundColor: AppColors.white,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Foto de evidencia',
                      style: TextStyle(
                        fontFamily: AppTypography.brandFont,
                        fontWeight: FontWeight.w700,
                        fontSize: 18,
                        color: AppColors.white,
                      ),
                    ),
                    Text(
                      'Paso 4 de 4 · Opcional',
                      style: TextStyle(
                        fontFamily: AppTypography.brandFont,
                        fontSize: 13,
                        color: Color(0xB3B8D9C6),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding:
              const EdgeInsets.symmetric(horizontal: AppSpacing.screenPadding),
          child: Container(
            height: 320,
            width: double.infinity,
            decoration: BoxDecoration(
              color: AppColors.ink.withValues(alpha: 0.7),
              borderRadius: BorderRadius.circular(AppRadius.lg),
              border: Border.all(
                color: AppColors.celadon300.withValues(alpha: 0.15),
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: photo != null
                ? Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.file(File(photo.localPath), fit: BoxFit.cover),
                      Positioned(
                        left: AppSpacing.sm,
                        bottom: AppSpacing.sm,
                        child: _MapChip(
                          dot: AppColors.success,
                          text: 'hash ${photo.sha256.substring(0, 12)}…',
                        ),
                      ),
                    ],
                  )
                : const Stack(
                    children: [
                      _ViewfinderCorner(Alignment.topLeft),
                      _ViewfinderCorner(Alignment.topRight),
                      _ViewfinderCorner(Alignment.bottomLeft),
                      _ViewfinderCorner(Alignment.bottomRight),
                      Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.photo_camera_outlined,
                              size: 48,
                              color: Color(0x66B8D9C6),
                            ),
                            SizedBox(height: AppSpacing.sm),
                            Text(
                              'Encuadre el área del incidente',
                              style: TextStyle(
                                fontFamily: AppTypography.brandFont,
                                fontSize: 13,
                                color: Color(0x80B8D9C6),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.sm),
            decoration: BoxDecoration(
              color: AppColors.neutral800.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(AppRadius.sm),
              border: Border.all(
                color: AppColors.celadon300.withValues(alpha: 0.15),
              ),
            ),
            child: const Text(
              'La foto se guarda localmente con un hash de integridad. Puedes omitirla si no es seguro o posible capturarla.',
              style: TextStyle(
                fontFamily: AppTypography.brandFont,
                fontSize: 12,
                height: 1.5,
                color: Color(0xB3B8D9C6),
              ),
            ),
          ),
        ),
        const Spacer(),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenPadding,
            0,
            AppSpacing.screenPadding,
            AppSpacing.screenPadding,
          ),
          child: Column(
            children: [
              VacaButton(
                label: photo == null ? 'Tomar foto' : 'Reemplazar foto',
                icon: Icons.photo_camera_outlined,
                onPressed: _capturePhoto,
              ),
              if (photo != null) ...[
                const SizedBox(height: AppSpacing.sm),
                TextButton(
                  onPressed: () => setState(() => _photo = null),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.celadon300,
                  ),
                  child: const Text('Quitar foto'),
                ),
              ],
              const SizedBox(height: AppSpacing.xs),
              VacaButton(
                label: _saving
                    ? 'Guardando…'
                    : photo == null
                        ? 'Omitir · Guardar sin foto'
                        : 'Guardar señal',
                variant: VacaButtonVariant.secondary,
                loading: _saving,
                onPressed: _saving ? null : _save,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final IncidentCategory category;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final meta = categoryMeta(category);
    return Semantics(
      button: true,
      selected: selected,
      label: '${meta.label}. ${meta.examples}.',
      child: Material(
        color: selected ? meta.color.withValues(alpha: 0.08) : AppColors.ivory,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(
                color: selected ? meta.color : AppColors.stone300,
                width: selected ? 2 : 1,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: selected
                        ? meta.color.withValues(alpha: 0.14)
                        : AppColors.stone100,
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  child: Icon(
                    meta.icon,
                    color: selected ? meta.color : AppColors.neutral500,
                    size: 24,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            priorityShortLabel(meta.priority).split(' ').first,
                            style: AppTypography.caption.copyWith(
                              color: meta.color,
                              fontFamily: AppTypography.monoFont,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.6,
                            ),
                          ),
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
                      const SizedBox(height: 2),
                      Text(
                        meta.examples,
                        style: AppTypography.caption
                            .copyWith(color: AppColors.neutral500),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Container(
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: selected ? meta.color : AppColors.stone300,
                      width: 2,
                    ),
                    color: selected ? meta.color : Colors.transparent,
                  ),
                  child: selected
                      ? const Icon(Icons.check, size: 12, color: AppColors.white)
                      : null,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MapChip extends StatelessWidget {
  const _MapChip({required this.text, this.dot});

  final String text;
  final Color? dot;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: AppColors.celadon900.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot != null) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: dot,
              ),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            text,
            style: AppTypography.caption.copyWith(
              fontFamily: AppTypography.monoFont,
              color: AppColors.celadon300,
            ),
          ),
        ],
      ),
    );
  }
}

class _StepperButton extends StatelessWidget {
  const _StepperButton({required this.icon, this.onPressed});

  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      height: 48,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 48),
          padding: EdgeInsets.zero,
          side: const BorderSide(color: AppColors.stone300, width: 1.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
        ),
        child: Icon(icon, color: AppColors.ink),
      ),
    );
  }
}

class _CountChip extends StatelessWidget {
  const _CountChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 48),
          padding: EdgeInsets.zero,
          backgroundColor:
              selected ? AppColors.celadon100 : AppColors.ivory,
          foregroundColor:
              selected ? AppColors.celadon700 : AppColors.neutral500,
          side: BorderSide(
            color: selected ? AppColors.celadon700 : AppColors.stone300,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          textStyle: AppTypography.body.copyWith(
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
        child: Text(label),
      ),
    );
  }
}

class _ViewfinderCorner extends StatelessWidget {
  const _ViewfinderCorner(this.alignment);

  final Alignment alignment;

  @override
  Widget build(BuildContext context) {
    const color = Color(0x80B8D9C6);
    return Align(
      alignment: alignment,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            border: Border(
              top: alignment.y < 0
                  ? const BorderSide(color: color, width: 2)
                  : BorderSide.none,
              bottom: alignment.y > 0
                  ? const BorderSide(color: color, width: 2)
                  : BorderSide.none,
              left: alignment.x < 0
                  ? const BorderSide(color: color, width: 2)
                  : BorderSide.none,
              right: alignment.x > 0
                  ? const BorderSide(color: color, width: 2)
                  : BorderSide.none,
            ),
          ),
        ),
      ),
    );
  }
}
