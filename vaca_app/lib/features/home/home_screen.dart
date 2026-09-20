import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/widgets.dart';
import '../../data/local/enums.dart';
import '../capture/camera_capture_screen.dart';
import '../capture/capture_result.dart';

/// Home base de VACA. Muestra el estado de red, acceso rápido a crear
/// incidente y una demostración visual de los tokens de UI.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  CaptureResult? _lastCapture;

  Future<void> _capture() async {
    final result = await Navigator.of(context).push<CaptureResult>(
      MaterialPageRoute(builder: (_) => const CameraCaptureScreen()),
    );
    if (result != null && mounted) {
      setState(() => _lastCapture = result);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.celadon900,
        foregroundColor: AppColors.white,
        title: Text(
          'VACA',
          style: AppTypography.h3.copyWith(color: AppColors.white),
        ),
      ),
      body: Column(
        children: [
          const NetworkStatusBanner(state: NetworkUiState.offline),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.screenPadding),
              children: [
                const Text(
                  'Infraestructura cívica de resiliencia',
                  style: AppTypography.h1,
                ),
                const SizedBox(height: AppSpacing.xs),
                const Text(
                  'Andamiaje base de captura offline. Señal de incidente en construcción.',
                  style: AppTypography.body,
                ),
                const SizedBox(height: AppSpacing.xl),
                const Text('Prioridades operativas', style: AppTypography.h3),
                const SizedBox(height: AppSpacing.sm),
                const Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xs,
                  children: [
                    PriorityBadge(priority: IncidentPriority.p0),
                    PriorityBadge(priority: IncidentPriority.p2),
                    PriorityBadge(priority: IncidentPriority.p4),
                  ],
                ),
                const SizedBox(height: AppSpacing.xl),
                if (_lastCapture != null)
                  _CaptureSummary(result: _lastCapture!),
                const SizedBox(height: AppSpacing.xl),
                VacaButton(
                  label: 'Capturar evidencia',
                  icon: Icons.photo_camera,
                  onPressed: _capture,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Muestra el resultado de una captura (demo de la integración cámara+GPS+hash).
class _CaptureSummary extends StatelessWidget {
  const _CaptureSummary({required this.result});

  final CaptureResult result;

  @override
  Widget build(BuildContext context) {
    final gps = result.hasGps ? ', ' : 'sin GPS';
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.check_circle, color: AppColors.success, size: 18),
                SizedBox(width: AppSpacing.xs),
                Text('Evidencia capturada', style: AppTypography.h3),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            _Field(label: 'SHA-256', value: result.sha256),
            _Field(label: 'GPS', value: gps),
            _Field(label: 'Timestamp', value: result.takenAt.toIso8601String()),
            _Field(label: 'Ruta local', value: result.localPath),
          ],
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: AppTypography.caption.copyWith(color: context.tokens.muted),
          ),
          Text(value, style: AppTypography.dataSm),
        ],
      ),
    );
  }
}
