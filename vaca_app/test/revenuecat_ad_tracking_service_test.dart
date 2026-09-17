import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/features/ads/data/revenuecat_ad_tracking_service.dart';
import 'package:vaca_app/features/ads/domain/ad_tracking_service.dart';

class _FakeRevenueCatAdsClient implements RevenueCatAdsClient {
  int configureCalls = 0;
  int loadedCalls = 0;
  int displayedCalls = 0;
  int revenueCalls = 0;
  bool fail = false;

  @override
  Future<void> configure(String apiKey) async {
    configureCalls++;
    if (fail) throw StateError('secret detail');
  }

  @override
  Future<void> trackDisplayed(TrackedAd ad) async {
    displayedCalls++;
  }

  @override
  Future<void> trackLoaded(TrackedAd ad) async {
    loadedCalls++;
  }

  @override
  Future<void> trackRevenue(
    TrackedAd ad, {
    required int revenueMicros,
    required String currency,
    required AdRevenuePrecision precision,
  }) async {
    revenueCalls++;
  }
}

void main() {
  const ad = TrackedAd(
    adUnitId: 'banner-id',
    impressionId: 'impression-id',
    networkName: 'Google Ads',
  );

  test('fails closed when RevenueCat Ads is not configured', () async {
    final client = _FakeRevenueCatAdsClient();
    final service = RevenueCatAdTrackingService(apiKey: '', client: client);

    final result = await service.trackLoaded(ad);

    expect(result.isFailure, isTrue);
    expect(result.errorOrNull?.code, 'revenuecat_ads_unconfigured');
    expect(client.configureCalls, 0);
    expect(client.loadedCalls, 0);
  });

  test('configures once and forwards ad lifecycle events', () async {
    final client = _FakeRevenueCatAdsClient();
    final service = RevenueCatAdTrackingService(
      apiKey: 'public-sdk-key',
      client: client,
    );

    expect((await service.initialize()).isSuccess, isTrue);
    expect((await service.initialize()).isSuccess, isTrue);
    expect((await service.trackLoaded(ad)).isSuccess, isTrue);
    expect((await service.trackDisplayed(ad)).isSuccess, isTrue);
    expect(
      (await service.trackRevenue(
        ad,
        revenueMicros: 10,
        currency: 'USD',
        precision: AdRevenuePrecision.estimated,
      ))
          .isSuccess,
      isTrue,
    );
    expect(client.configureCalls, 1);
    expect(client.loadedCalls, 1);
    expect(client.displayedCalls, 1);
    expect(client.revenueCalls, 1);
  });

  test('redacts SDK exceptions behind a stable domain error', () async {
    final client = _FakeRevenueCatAdsClient()..fail = true;
    final service = RevenueCatAdTrackingService(
      apiKey: 'public-sdk-key',
      client: client,
    );

    final result = await service.initialize();

    expect(result.isFailure, isTrue);
    expect(result.errorOrNull?.code, 'revenuecat_ads_error');
    expect(result.errorOrNull?.message, isNot(contains('secret detail')));
  });
}
