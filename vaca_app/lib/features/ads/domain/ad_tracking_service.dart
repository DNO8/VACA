import '../../../core/result/result.dart';

class TrackedAd {
  const TrackedAd({
    required this.adUnitId,
    required this.impressionId,
    this.networkName,
  });

  final String adUnitId;
  final String impressionId;
  final String? networkName;
}

enum AdRevenuePrecision { exact, publisherDefined, estimated, unknown }

abstract interface class AdTrackingService {
  Future<Result<void>> initialize();

  Future<Result<void>> trackLoaded(TrackedAd ad);

  Future<Result<void>> trackDisplayed(TrackedAd ad);

  Future<Result<void>> trackRevenue(
    TrackedAd ad, {
    required int revenueMicros,
    required String currency,
    required AdRevenuePrecision precision,
  });
}
