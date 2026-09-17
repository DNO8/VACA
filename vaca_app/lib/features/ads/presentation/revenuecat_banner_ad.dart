import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import '../../../core/config/app_config.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../domain/ad_tracking_service.dart';

class RevenueCatBannerAd extends ConsumerStatefulWidget {
  const RevenueCatBannerAd({super.key});

  @override
  ConsumerState<RevenueCatBannerAd> createState() => _RevenueCatBannerAdState();
}

class _RevenueCatBannerAdState extends ConsumerState<RevenueCatBannerAd> {
  BannerAd? _banner;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    unawaited(_initialize());
  }

  Future<void> _initialize() async {
    final config = AppConfig.instance;
    if (!config.adsConfigured) return;
    final tracker = ref.read(adTrackingServiceProvider);
    if ((await tracker.initialize()).isFailure) return;
    if (!await _requestConsent()) return;
    await MobileAds.instance.initialize();
    if (!mounted) return;
    _loadBanner(config.adMobBannerAdUnitId, tracker);
  }

  Future<bool> _requestConsent() async {
    final update = Completer<bool>();
    ConsentInformation.instance.requestConsentInfoUpdate(
      ConsentRequestParameters(),
      () => update.complete(true),
      (_) => update.complete(false),
    );
    if (!await update.future) return false;

    final form = Completer<bool>();
    await ConsentForm.loadAndShowConsentFormIfRequired(
      (error) => form.complete(error == null),
    );
    if (!await form.future) return false;
    return ConsentInformation.instance.canRequestAds();
  }

  void _loadBanner(String adUnitId, AdTrackingService tracker) {
    _banner = BannerAd(
      adUnitId: adUnitId,
      size: AdSize.banner,
      request: const AdRequest(nonPersonalizedAds: true),
      listener: BannerAdListener(
        onAdLoaded: (ad) {
          final tracked = _trackedAd(ad);
          if (tracked != null) unawaited(tracker.trackLoaded(tracked));
          if (mounted) setState(() => _loaded = true);
        },
        onAdFailedToLoad: (ad, _) {
          ad.dispose();
          if (mounted) setState(() => _loaded = false);
        },
        onAdImpression: (ad) {
          final tracked = _trackedAd(ad);
          if (tracked != null) unawaited(tracker.trackDisplayed(tracked));
        },
        onPaidEvent: (ad, valueMicros, precision, currencyCode) {
          final tracked = _trackedAd(ad);
          if (tracked == null) return;
          unawaited(
            tracker.trackRevenue(
              tracked,
              revenueMicros: valueMicros.round(),
              currency: currencyCode,
              precision: _mapPrecision(precision),
            ),
          );
        },
      ),
    )..load();
  }

  TrackedAd? _trackedAd(Ad ad) {
    final impressionId = ad.responseInfo?.responseId;
    if (impressionId == null || impressionId.isEmpty) return null;
    return TrackedAd(
      adUnitId: ad.adUnitId,
      impressionId: impressionId,
      networkName: ad.responseInfo?.mediationAdapterClassName,
    );
  }

  AdRevenuePrecision _mapPrecision(PrecisionType precision) =>
      switch (precision) {
        PrecisionType.precise => AdRevenuePrecision.exact,
        PrecisionType.publisherProvided => AdRevenuePrecision.publisherDefined,
        PrecisionType.estimated => AdRevenuePrecision.estimated,
        PrecisionType.unknown => AdRevenuePrecision.unknown,
      };

  @override
  void dispose() {
    _banner?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final banner = _banner;
    if (!_loaded || banner == null) return const SizedBox.shrink();
    return Semantics(
      label: 'Contenido patrocinado',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Contenido patrocinado',
            style: AppTypography.caption,
          ),
          const SizedBox(height: AppSpacing.xxs),
          SizedBox(
            width: banner.size.width.toDouble(),
            height: banner.size.height.toDouble(),
            child: AdWidget(ad: banner),
          ),
        ],
      ),
    );
  }
}
