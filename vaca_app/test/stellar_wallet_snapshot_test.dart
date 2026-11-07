import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
// Test adapters use the HTTP implementation already locked by the Stellar SDK.
// ignore: depend_on_referenced_packages
import 'package:http/http.dart' as http;
// ignore: depend_on_referenced_packages
import 'package:http/testing.dart';
import 'package:stellar_flutter_sdk/stellar_flutter_sdk.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:vaca_app/features/wallet/data/stellar_sdk_wallet_gateway.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_gateway.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_service.dart';

class _Storage implements SecureStorage {
  _Storage(this.secret);
  final String secret;
  int writes = 0;
  @override
  Future<Result<String?>> read(String key) async => Success(secret);
  @override
  dynamic noSuchMethod(Invocation invocation) {
    writes++;
    throw StateError('Unexpected storage mutation');
  }
}

class _ObservedGateway extends StellarSdkWalletGateway {
  _ObservedGateway(StellarSDK sdk) : super(sdk: sdk);
  final effects = <String>[];
  @override
  Future<bool> fund(String accountId) async {
    effects.add('fund');
    return true;
  }

  @override
  Future<String?> ensureUsdcTrustline(String secretSeed) async {
    effects.add('trustline');
    return null;
  }

  @override
  Future<List<StellarClaim>> pendingClaims(String accountId) async {
    effects.add('pendingClaims');
    return [];
  }

  @override
  Future<String?> claim(String secretSeed, String balanceId) async {
    effects.add('claim');
    return 'fake-transaction';
  }
}

void main() {
  late KeyPair key;
  late int requests;
  late _ObservedGateway gateway;
  late _Storage storage;
  late StellarWalletService service;

  void connect(Future<http.Response> Function() response) {
    final client = MockClient((request) async {
      requests++;
      expect(request.method, 'GET');
      expect(
        request.url.toString(),
        'https://snapshot.invalid/accounts/${key.accountId}',
      );
      return response();
    });
    addTearDown(client.close);
    final sdk = StellarSDK('https://snapshot.invalid');
    sdk.httpClient.close();
    sdk.httpClient = client;
    gateway = _ObservedGateway(sdk);
    storage = _Storage(key.secretSeed);
    service = StellarWalletService(storage, gateway);
  }

  setUp(() {
    key = KeyPair.random();
    requests = 0;
  });

  for (final failure in ['500', '503', '429', 'transport', 'malformed']) {
    test('snapshot propagates unknown account failure: $failure', () async {
      connect(() async {
        if (failure == 'transport') throw http.ClientException('offline');
        if (failure == 'malformed') return http.Response('{', 200);
        return http.Response('{}', int.parse(failure));
      });
      await expectLater(gateway.snapshot(key.secretSeed), throwsA(anything));
      expect(requests, 1);
      expect(gateway.effects, isEmpty);
      expect(storage.writes, 0);
    });
  }

  test('explicit personal-account404 retains the unfunded snapshot', () async {
    connect(() async => http.Response('{}', 404));
    final snapshot = await gateway.snapshot(key.secretSeed);
    expect(snapshot.accountId, key.accountId);
    expect(snapshot.balance, '0.0000000');
    expect(snapshot.funded, isFalse);
    expect(snapshot.usdcTrustlineReady, isFalse);
    expect(snapshot.usdcBalance, '0.0000000');
    expect(requests, 1);
    expect(gateway.effects, isEmpty);
    expect(storage.writes, 0);
  });

  test('successful account retains native and USDC balances', () async {
    connect(
      () async => http.Response(
        jsonEncode(
          {
            'account_id': key.accountId,
            'sequence': '1',
            'paging_token': '1',
            'subentry_count': 1,
            'last_modified_ledger': 1,
            'thresholds': {
              'low_threshold': 1,
              'med_threshold': 1,
              'high_threshold': 1,
            },
            'flags': {
              'auth_required': false,
              'auth_revocable': false,
              'auth_immutable': false,
              'auth_clawback_enabled': false,
            },
            'balances': [
              {'asset_type': 'native', 'balance': '12.0000000'},
              {
                'asset_type': 'credit_alphanum4',
                'asset_code': 'USDC',
                'asset_issuer': StellarSdkWalletGateway.testnetUsdcIssuer,
                'balance': '2.5000000',
              },
            ],
            'signers': [],
            'data': {},
            'num_sponsoring': 0,
            'num_sponsored': 0,
            '_links': {
              for (final name in [
                'effects',
                'offers',
                'operations',
                'self',
                'transactions',
                'payments',
                'trades',
                'data',
              ])
                name: {'href': 'https://snapshot.invalid'},
            },
          },
        ),
        200,
      ),
    );
    final snapshot = await gateway.snapshot(key.secretSeed);
    expect(snapshot.accountId, key.accountId);
    expect(snapshot.balance, '12.0000000');
    expect(snapshot.funded, isTrue);
    expect(snapshot.usdcTrustlineReady, isTrue);
    expect(snapshot.usdcBalance, '2.5000000');
    expect(requests, 1);
    expect(gateway.effects, isEmpty);
    expect(storage.writes, 0);
  });

  for (final action in ['load', 'refresh', 'create', 'fund', 'claimAll']) {
    test(
        '$action fails closed on an unknown snapshot without financial effects',
        () async {
      connect(() async => http.Response('{}', 503));
      final Result<dynamic> result;
      switch (action) {
        case 'load':
          result = await service.load();
        case 'refresh':
          result = await service.refresh();
        case 'create':
          result = await service.create();
        case 'fund':
          result = await service.fund();
        default:
          result = await service.claimAll();
      }
      expect(result.isFailure, isTrue);
      expect(
        result.errorOrNull?.code,
        action == 'load'
            ? 'stellar_wallet_load'
            : action == 'refresh'
                ? 'stellar_horizon_error'
                : 'stellar_usdc_setup',
      );
      expect(gateway.effects, isEmpty);
      expect(requests, 1);
      expect(storage.writes, 0);
      expect(storage.secret, key.secretSeed);
    });
  }
}
