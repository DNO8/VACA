import 'dart:io';

import 'package:exif/exif.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../core/permissions/permission_service.dart';
import '../../core/providers.dart';
import '../../core/utils/hashing.dart';

/// Resultado de una captura de evidencia: la foto ya persistida en caché local
/// con su hash de integridad, timestamp y coordenadas GPS.
/// Alimenta la tabla `Evidences` (ver modelo-datos-fibe.md §5.7).
class CaptureResult {
  const CaptureResult({
    required this.localPath,
    required this.sha256,
    required this.takenAt,
    this.latitude,
    this.longitude,
    this.gpsAccuracy,
  });

  final String localPath;
  final String sha256;
  final DateTime takenAt;
  final double? latitude;
  final double? longitude;
  final double? gpsAccuracy;

  bool get hasGps => latitude != null && longitude != null;
}

/// Procesa una foto recién capturada: la copia a la caché de evidencia,
/// calcula su SHA-256, lee el timestamp EXIF y adjunta la posición GPS.
/// Tolerante al Día 0: si no hay GPS, devuelve la captura igual (sin coords).
class GeoPhotoProcessor {
  const GeoPhotoProcessor(this._permissions);

  final PermissionService _permissions;

  Future<CaptureResult> process(String sourcePath) async {
    final baseDir = await getApplicationDocumentsDirectory();
    final evidenceDir = Directory(p.join(baseDir.path, 'evidence'));
    if (!await evidenceDir.exists()) {
      await evidenceDir.create(recursive: true);
    }

    final id = const Uuid().v4();
    final destPath = p.join(evidenceDir.path, '$id.jpg');
    final destFile = await File(sourcePath).copy(destPath);

    final sha = await Hashing.fileSha256(destFile);
    final takenAt = await _readExifDate(destFile) ?? DateTime.now();
    final pos = await _permissions.currentPosition();

    return CaptureResult(
      localPath: destPath,
      sha256: sha,
      takenAt: takenAt,
      latitude: pos?.latitude,
      longitude: pos?.longitude,
      gpsAccuracy: pos?.accuracy,
    );
  }

  /// Lee el timestamp EXIF (DateTimeOriginal / DateTime). Formato EXIF:
  /// "YYYY:MM:DD HH:MM:SS". Devuelve null si no hay EXIF de fecha.
  Future<DateTime?> _readExifDate(File file) async {
    try {
      final bytes = await file.readAsBytes();
      final tags = await readExifFromBytes(bytes);
      final raw = tags['EXIF DateTimeOriginal']?.printable ??
          tags['Image DateTime']?.printable;
      if (raw == null) return null;
      final parts = raw.split(' ');
      if (parts.length != 2) return null;
      final date = parts[0].split(':');
      final time = parts[1].split(':');
      if (date.length != 3 || time.length != 3) return null;
      return DateTime(
        int.parse(date[0]),
        int.parse(date[1]),
        int.parse(date[2]),
        int.parse(time[0]),
        int.parse(time[1]),
        int.parse(time[2]),
      );
    } catch (_) {
      return null;
    }
  }
}

/// Provider del procesador de fotos geolocalizadas.
final geoPhotoProcessorProvider = Provider<GeoPhotoProcessor>((ref) {
  return GeoPhotoProcessor(ref.watch(permissionServiceProvider));
});
