import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/providers.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:vaca_app/features/refund/data/refund_http_client.dart';
import 'package:vaca_app/features/refund/data/refund_wallet_signer.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';
import 'package:vaca_app/features/refund/refund_providers.dart';

class _CountingStorage extends SecureStorage {
  int reads = 0;
  int writes = 0;
  @override
  Future<Result<String?>> read(String key) async {
    reads++;
    return const Failure(VacaError(code: 'unexpected_read'));
  }

  @override
  Future<Result<void>> write(String key, String value) async {
    writes++;
    return const Failure(VacaError(code: 'unexpected_write'));
  }
}

class _CountingAdapter implements HttpClientAdapter {
  int requests = 0;
  int closes = 0;
  bool? forced;
  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests++;
    throw StateError('Unexpected HTTP command');
  }

  @override
  void close({bool force = false}) {
    closes++;
    forced = force;
  }
}

class _OwnedHttp extends RefundHttpClient {
  _OwnedHttp(RefundClientConfiguration configuration, SecureStorage storage,
      HttpClientAdapter adapter)
      : super(
          projectUrl: Uri.parse(configuration.projectUrl),
          publicApiKey: configuration.publicApiKey,
          signer: RefundWalletSigner(storage),
          adapter: adapter,
        );
  int closes = 0;
  @override
  void close() {
    closes++;
    super.close();
  }
}

void main() {
  test('composition is cold, shares the container instance and owns one close',
      () {
    final storage = _CountingStorage();
    final adapter = _CountingAdapter();
    const configuration = (
      projectUrl: 'https://project.invalid',
      publicApiKey: 'public-test-key'
    );
    final created = <_OwnedHttp>[];
    final container = ProviderContainer(overrides: [
      secureStorageProvider.overrideWithValue(storage),
      refundClientConfigurationProvider.overrideWithValue(configuration),
      refundHttpClientFactoryProvider
          .overrideWithValue((config, providedStorage) {
        expect(config, configuration);
        expect(providedStorage, same(storage));
        final http = _OwnedHttp(config, providedStorage, adapter);
        created.add(http);
        return http;
      }),
    ]);
    try {
      expect(created, isEmpty);
      final client = container.read(refundClientProvider);
      expect(container.read(refundClientProvider), same(client));
      expect(container.read(refundHttpClientProvider), same(created.single));
      expect(created.single.closes, 0);
      expect(adapter.closes, 0);
      expect(storage.reads, 0);
      expect(storage.writes, 0);
      expect(adapter.requests, 0);
    } finally {
      container.dispose();
    }
    expect(created.single.closes, 1);
    expect(adapter.closes, 1);
    expect(adapter.forced, isTrue);
    expect(storage.reads, 0);
    expect(storage.writes, 0);
    expect(adapter.requests, 0);
  });

  test('default valid construction is cold and retains one client', () {
    final storage = _CountingStorage();
    final container = ProviderContainer(overrides: [
      secureStorageProvider.overrideWithValue(storage),
      refundClientConfigurationProvider.overrideWithValue((
        projectUrl: 'https://project.invalid',
        publicApiKey: 'public-test-key'
      )),
    ]);
    try {
      final client = container.read(refundClientProvider);
      expect(container.read(refundClientProvider), same(client));
      expect(storage.reads, 0);
      expect(storage.writes, 0);
    } finally {
      container.dispose();
    }
    expect(storage.reads, 0);
    expect(storage.writes, 0);
  });

  test(
      'default factory rejects invalid public configuration without storage IO',
      () {
    for (final configuration in [
      (projectUrl: '', publicApiKey: 'public-test-key'),
      (projectUrl: 'https://project.invalid', publicApiKey: ''),
      (projectUrl: 'https://[', publicApiKey: 'public-test-key'),
      (projectUrl: 'http://project.invalid', publicApiKey: 'public-test-key'),
    ]) {
      final storage = _CountingStorage();
      final container = ProviderContainer(overrides: [
        secureStorageProvider.overrideWithValue(storage),
        refundClientConfigurationProvider.overrideWithValue(configuration),
      ]);
      try {
        expect(
            () => container.read(refundClientProvider),
            throwsA(isA<RefundProtocolError>().having(
                (error) => error.code, 'code', 'd1_refund_configuration')));
        expect(storage.reads, 0);
        expect(storage.writes, 0);
      } finally {
        container.dispose();
      }
      expect(storage.reads, 0);
      expect(storage.writes, 0);
    }
  });
}
