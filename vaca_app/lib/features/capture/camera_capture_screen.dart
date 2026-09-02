import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/permissions/permission_service.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/widgets.dart';
import 'capture_result.dart';

/// Pantalla de captura de evidencia fotográfica (Deliverable 1).
/// Preview de cámara + captura a caché local con timestamp EXIF y GPS.
/// Devuelve un [CaptureResult] vía Navigator.pop, o null si se cancela.
///
/// Maneja estados de fallback ante permiso denegado / sin cámara (requisito SOW).
class CameraCaptureScreen extends ConsumerStatefulWidget {
  const CameraCaptureScreen({super.key});

  @override
  ConsumerState<CameraCaptureScreen> createState() =>
      _CameraCaptureScreenState();
}

enum _CamStatus {
  checking,
  denied,
  permanentlyDenied,
  noCamera,
  ready,
  capturing,
  error,
}

class _CameraCaptureScreenState extends ConsumerState<CameraCaptureScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  _CamStatus _status = _CamStatus.checking;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _init();
  }

  Future<void> _init() async {
    setState(() => _status = _CamStatus.checking);
    final outcome = await ref.read(permissionServiceProvider).requestCamera();
    if (!mounted) return;
    if (outcome == PermissionOutcome.granted) {
      await _initCamera();
    } else if (outcome == PermissionOutcome.permanentlyDenied) {
      setState(() => _status = _CamStatus.permanentlyDenied);
    } else {
      setState(() => _status = _CamStatus.denied);
    }
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        if (mounted) setState(() => _status = _CamStatus.noCamera);
        return;
      }
      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      final controller = CameraController(
        back,
        ResolutionPreset.high,
        enableAudio: false,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() {
        _controller = controller;
        _status = _CamStatus.ready;
      });
    } catch (_) {
      if (mounted) setState(() => _status = _CamStatus.error);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      controller.dispose();
      _controller = null;
    } else if (state == AppLifecycleState.resumed) {
      _initCamera();
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || _status == _CamStatus.capturing) return;
    setState(() => _status = _CamStatus.capturing);
    try {
      final file = await controller.takePicture();
      final result =
          await ref.read(geoPhotoProcessorProvider).process(file.path);
      if (!mounted) return;
      Navigator.of(context).pop(result);
    } catch (_) {
      if (mounted) setState(() => _status = _CamStatus.ready);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: AppColors.deepBlue,
        foregroundColor: AppColors.white,
        title: const Text('Evidencia del daño'),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    switch (_status) {
      case _CamStatus.checking:
        return const EmptyState(
          kind: EmptyStateKind.loading,
        );
      case _CamStatus.denied:
        return EmptyState(
          kind: EmptyStateKind.error,
          title: 'Sin acceso a la cámara',
          message:
              'Se necesita la cámara para registrar la evidencia del daño. '
              'También puedes continuar sin foto y adjuntarla luego.',
          actionLabel: 'Permitir cámara',
          onAction: _init,
        );
      case _CamStatus.permanentlyDenied:
        return const EmptyState(
          kind: EmptyStateKind.error,
          title: 'Permiso de cámara bloqueado',
          message:
              'Activa el permiso de cámara en los ajustes del sistema para '
              'registrar evidencia.',
          actionLabel: 'Abrir ajustes',
          onAction: openAppSettings,
        );
      case _CamStatus.noCamera:
        return const EmptyState(
          kind: EmptyStateKind.error,
          title: 'Sin cámara disponible',
          message: 'Este dispositivo no tiene una cámara utilizable.',
        );
      case _CamStatus.error:
        return EmptyState(
          kind: EmptyStateKind.error,
          title: 'Error al abrir la cámara',
          message: 'Intenta nuevamente.',
          actionLabel: 'Reintentar',
          onAction: _init,
        );
      case _CamStatus.ready:
      case _CamStatus.capturing:
        return _buildPreview();
    }
  }

  Widget _buildPreview() {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return const EmptyState(kind: EmptyStateKind.loading);
    }
    final capturing = _status == _CamStatus.capturing;
    return Stack(
      alignment: Alignment.bottomCenter,
      children: [
        Center(child: CameraPreview(controller)),
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
          child: _CaptureButton(
            busy: capturing,
            onTap: capturing ? null : _capture,
          ),
        ),
      ],
    );
  }
}

class _CaptureButton extends StatelessWidget {
  const _CaptureButton({required this.busy, required this.onTap});

  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Tomar foto',
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 72,
          width: 72,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppColors.orange,
            border: Border.all(color: AppColors.white, width: 4),
          ),
          child: busy
              ? const Padding(
                  padding: EdgeInsets.all(20),
                  child: CircularProgressIndicator(
                    strokeWidth: 3,
                    color: AppColors.white,
                  ),
                )
              : const Icon(
                  Icons.photo_camera,
                  color: AppColors.deepBlue,
                  size: 32,
                ),
        ),
      ),
    );
  }
}
