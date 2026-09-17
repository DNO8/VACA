import 'package:flutter/foundation.dart';

/// Configuración tipada y validada del flavor de build.
///
/// Los sabores permitidos son `dev`, `public` y `municipalPilot`.
/// En builds de release la variable `FLAVOR` debe estar definida mediante
/// `--dart-define`; no se permite fallback a `dev` en release para evitar
/// configuraciones de prueba en artefactos de producción.
class AppConfig {
  AppConfig._({
    required this.flavor,
    required this.revenueCatAndroidApiKey,
    required this.adMobBannerAdUnitId,
  });

  static final AppConfig _instance = _load();

  static AppConfig get instance => _instance;

  factory AppConfig() => _instance;

  static AppConfig _load() {
    const configuredFlavor = String.fromEnvironment('FLAVOR');
    const revenueCatAndroidApiKey = String.fromEnvironment(
      'REVENUECAT_ANDROID_API_KEY',
    );
    const adMobBannerAdUnitId = String.fromEnvironment(
      'ADMOB_BANNER_AD_UNIT_ID',
    );
    var flavor = configuredFlavor;
    if (flavor.isEmpty) {
      if (kDebugMode) {
        flavor = 'dev';
      } else {
        throw StateError(
          'FLAVOR no definido. En release debe compilarse con '
          '--dart-define=FLAVOR=public o municipalPilot.',
        );
      }
    }

    const known = {'dev', 'public', 'municipalPilot'};
    if (!known.contains(flavor)) {
      throw StateError('FLAVOR desconocido: $flavor. Valores: $known.');
    }
    if (!kDebugMode &&
        flavor == 'public' &&
        (revenueCatAndroidApiKey.isEmpty || adMobBannerAdUnitId.isEmpty)) {
      throw StateError(
        'RevenueCat Ads requiere REVENUECAT_ANDROID_API_KEY y '
        'ADMOB_BANNER_AD_UNIT_ID en public release.',
      );
    }

    return AppConfig._(
      flavor: flavor,
      revenueCatAndroidApiKey: revenueCatAndroidApiKey,
      adMobBannerAdUnitId: adMobBannerAdUnitId,
    );
  }

  final String flavor;
  final String revenueCatAndroidApiKey;
  final String adMobBannerAdUnitId;

  bool get isDev => flavor == 'dev';
  bool get isPublic => flavor == 'public';
  bool get isMunicipalPilot => flavor == 'municipalPilot';
  bool get adsConfigured =>
      revenueCatAndroidApiKey.isNotEmpty && adMobBannerAdUnitId.isNotEmpty;
}
