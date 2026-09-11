import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

/// Resultado de una solicitud de permiso con estados de fallback claros
/// para la UI (ver flujo-app §F2 y sistema-diseno §6.9).
enum PermissionOutcome { granted, denied, permanentlyDenied, serviceDisabled }

/// Servicio de permisos de terreno: cámara y ubicación.
/// Requisito SOW D1: manejo de permisos en runtime (Android 10+) con estados
/// de fallback ante denegación.
class PermissionService {
  const PermissionService();

  /// Solicita permiso de cámara.
  Future<PermissionOutcome> requestCamera() async {
    final status = await Permission.camera.request();
    return _map(status);
  }

  /// Solicita permiso de ubicación, verificando además que el servicio de
  /// ubicación del dispositivo esté activo (necesario para capturar GPS).
  Future<PermissionOutcome> requestLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      await Geolocator.openLocationSettings();
      return PermissionOutcome.serviceDisabled;
    }
    final status = await Permission.locationWhenInUse.request();
    return _map(status);
  }

  Future<PermissionOutcome> requestNotifications() async {
    final status = await Permission.notification.request();
    return _map(status);
  }

  /// Obtiene la posición actual. Devuelve null si no hay permiso/servicio
  /// (modo degradado Día 0: nunca bloquear la captura por falta de GPS).
  Future<Position?> currentPosition() async {
    final outcome = await requestLocation();
    if (outcome != PermissionOutcome.granted) return null;
    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
    } catch (_) {
      return null;
    }
  }

  PermissionOutcome _map(PermissionStatus status) {
    if (status.isGranted || status.isLimited) return PermissionOutcome.granted;
    if (status.isPermanentlyDenied || status.isRestricted) {
      return PermissionOutcome.permanentlyDenied;
    }
    return PermissionOutcome.denied;
  }
}
