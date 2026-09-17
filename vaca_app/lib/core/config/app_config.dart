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
    required this.privacyPolicyUri,
    required this.supportUri,
  });

  static final AppConfig _instance = _load();

  static AppConfig get instance => _instance;

  factory AppConfig() => _instance;

  static AppConfig _load() {
    const configuredFlavor = String.fromEnvironment('FLAVOR');
    const configuredRevenueCatAndroidApiKey = String.fromEnvironment(
      'REVENUECAT_ANDROID_API_KEY',
    );
    const configuredAdMobBannerAdUnitId = String.fromEnvironment(
      'ADMOB_BANNER_AD_UNIT_ID',
    );
    const privacyPolicyUrl = String.fromEnvironment('PRIVACY_POLICY_URL');
    const supportUrl = String.fromEnvironment('SUPPORT_URL');
    final privacyPolicyUri = _httpsUri(privacyPolicyUrl);
    final supportUri = _httpsUri(supportUrl);
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
    final revenueCatAndroidApiKey = configuredRevenueCatAndroidApiKey.isNotEmpty
        ? configuredRevenueCatAndroidApiKey
        : flavor == 'public'
            ? 'goog_BXkRalBAZezAZoynMpueiqJiydy'
            : '';
    final adMobBannerAdUnitId = configuredAdMobBannerAdUnitId.isNotEmpty
        ? configuredAdMobBannerAdUnitId
        : flavor == 'public'
            ? 'ca-app-pub-4732294050798203/3390895689'
            : '';
    if (!kDebugMode && flavor == 'public') {
      if (revenueCatAndroidApiKey.isEmpty) {
        throw StateError(
          'RevenueCat Ads requiere REVENUECAT_ANDROID_API_KEY en '
          'public release.',
        );
      }
      if (privacyPolicyUri == null || supportUri == null) {
        throw StateError(
          'PRIVACY_POLICY_URL y SUPPORT_URL HTTPS son obligatorias en '
          'public release.',
        );
      }
    }

    return AppConfig._(
      flavor: flavor,
      revenueCatAndroidApiKey: revenueCatAndroidApiKey,
      adMobBannerAdUnitId: adMobBannerAdUnitId,
      privacyPolicyUri: privacyPolicyUri,
      supportUri: supportUri,
    );
  }

  static Uri? _httpsUri(String value) {
    final uri = Uri.tryParse(value);
    return uri?.scheme == 'https' && uri!.host.isNotEmpty ? uri : null;
  }

  final String flavor;
  final String revenueCatAndroidApiKey;
  final String adMobBannerAdUnitId;
  final Uri? privacyPolicyUri;
  final Uri? supportUri;

  bool get isDev => flavor == 'dev';
  bool get isPublic => flavor == 'public';
  bool get isMunicipalPilot => flavor == 'municipalPilot';
  bool get adsConfigured =>
      revenueCatAndroidApiKey.isNotEmpty && adMobBannerAdUnitId.isNotEmpty;
}
