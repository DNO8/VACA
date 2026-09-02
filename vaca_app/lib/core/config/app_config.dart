import 'package:flutter/foundation.dart';

/// Configuración tipada y validada del flavor de build.
///
/// Los sabores permitidos son `dev`, `public` y `municipalPilot`.
/// En builds de release la variable `FLAVOR` debe estar definida mediante
/// `--dart-define`; no se permite fallback a `dev` en release para evitar
/// configuraciones de prueba en artefactos de producción.
class AppConfig {
  AppConfig._({required this.flavor});

  static final AppConfig _instance = _load();

  static AppConfig get instance => _instance;

  factory AppConfig() => _instance;

  static AppConfig _load() {
    const flavor = String.fromEnvironment('FLAVOR', defaultValue: '');
    if (flavor.isEmpty) {
      if (kDebugMode) {
        return AppConfig._(flavor: 'dev');
      }
      throw StateError(
        'FLAVOR no definido. En release debe compilarse con '
        '--dart-define=FLAVOR=public o municipalPilot.',
      );
    }

    const known = {'dev', 'public', 'municipalPilot'};
    if (!known.contains(flavor)) {
      throw StateError('FLAVOR desconocido: $flavor. Valores: $known.');
    }

    return AppConfig._(flavor: flavor);
  }

  final String flavor;

  bool get isDev => flavor == 'dev';
  bool get isPublic => flavor == 'public';
  bool get isMunicipalPilot => flavor == 'municipalPilot';
}
