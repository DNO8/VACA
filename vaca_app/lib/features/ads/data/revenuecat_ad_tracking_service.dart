import 'package:purchases_flutter/purchases_flutter.dart' as rc;

import '../../../core/result/result.dart';
import '../domain/ad_tracking_service.dart';

abstract interface class RevenueCatAdsClient {
  Future<void> configure(String apiKey);

  Future<void> trackLoaded(TrackedAd ad);

  Future<void> trackDisplayed(TrackedAd ad);

  Future<void> trackRevenue(
    TrackedAd ad, {
    required int revenueMicros,
    required String currency,
    required AdRevenuePrecision precision,
  });
}

class RevenueCatSdkAdsClient implements RevenueCatAdsClient {
  @override
  Future<void> configure(String apiKey) async {
    if (await rc.Purchases.isConfigured) return;
    final configuration = rc.PurchasesConfiguration(apiKey)
      ..automaticDeviceIdentifierCollectionEnabled = false
      ..diagnosticsEnabled = false;
    await rc.Purchases.configure(configuration);
  }

  @override
  Future<void> trackLoaded(TrackedAd ad) {
    return rc.Purchases.adTracker.trackAdLoaded(
      rc.AdLoadedData(
        networkName: ad.networkName,
        mediatorName: rc.AdMediatorName.adMob,
        adFormat: rc.AdFormat.banner,
        placement: RevenueCatAdTrackingService.placement,
        adUnitId: ad.adUnitId,
        impressionId: ad.impressionId,
      ),
    );
  }

  @override
  Future<void> trackDisplayed(TrackedAd ad) {
    return rc.Purchases.adTracker.trackAdDisplayed(
      rc.AdDisplayedData(
        networkName: ad.networkName,
        mediatorName: rc.AdMediatorName.adMob,
        adFormat: rc.AdFormat.banner,
        placement: RevenueCatAdTrackingService.placement,
        adUnitId: ad.adUnitId,
        impressionId: ad.impressionId,
      ),
    );
  }

  @override
  Future<void> trackRevenue(
    TrackedAd ad, {
    required int revenueMicros,
    required String currency,
    required AdRevenuePrecision precision,
  }) {
    return rc.Purchases.adTracker.trackAdRevenue(
      rc.AdRevenueData(
        networkName: ad.networkName,
        mediatorName: rc.AdMediatorName.adMob,
        adFormat: rc.AdFormat.banner,
        placement: RevenueCatAdTrackingService.placement,
        adUnitId: ad.adUnitId,
        impressionId: ad.impressionId,
        revenueMicros: revenueMicros,
        currency: currency,
        precision: _mapPrecision(precision),
      ),
    );
  }

  rc.AdRevenuePrecision _mapPrecision(AdRevenuePrecision precision) =>
      switch (precision) {
        AdRevenuePrecision.exact => rc.AdRevenuePrecision.exact,
        AdRevenuePrecision.publisherDefined =>
          rc.AdRevenuePrecision.publisherDefined,
        AdRevenuePrecision.estimated => rc.AdRevenuePrecision.estimated,
        AdRevenuePrecision.unknown => rc.AdRevenuePrecision.unknown,
      };
}

class RevenueCatAdTrackingService implements AdTrackingService {
  RevenueCatAdTrackingService({
    required String apiKey,
    RevenueCatAdsClient? client,
  })  : _apiKey = apiKey,
        _client = client ?? RevenueCatSdkAdsClient();

  static const placement = 'about_vaca_banner';

  final String _apiKey;
  final RevenueCatAdsClient _client;
  Future<Result<void>>? _initialization;

  @override
  Future<Result<void>> initialize() =>
      _initialization ??= _run(() => _client.configure(_apiKey));

  @override
  Future<Result<void>> trackLoaded(TrackedAd ad) =>
      _afterInitialization(() => _client.trackLoaded(ad));

  @override
  Future<Result<void>> trackDisplayed(TrackedAd ad) =>
      _afterInitialization(() => _client.trackDisplayed(ad));

  @override
  Future<Result<void>> trackRevenue(
    TrackedAd ad, {
    required int revenueMicros,
    required String currency,
    required AdRevenuePrecision precision,
  }) =>
      _afterInitialization(
        () => _client.trackRevenue(
          ad,
          revenueMicros: revenueMicros,
          currency: currency,
          precision: precision,
        ),
      );

  Future<Result<void>> _afterInitialization(
    Future<void> Function() operation,
  ) async {
    final initialized = await initialize();
    if (initialized case Failure(error: final error)) return Failure(error);
    return _run(operation);
  }

  Future<Result<void>> _run(Future<void> Function() operation) async {
    if (_apiKey.isEmpty) {
      return const Failure(
        VacaError(
          code: 'revenuecat_ads_unconfigured',
          message: 'RevenueCat Ads no está configurado.',
        ),
      );
    }
    try {
      await operation();
      return const Success(null);
    } catch (_) {
      return const Failure(
        VacaError(
          code: 'revenuecat_ads_error',
          message: 'No se pudo registrar el evento publicitario.',
        ),
      );
    }
  }
}
