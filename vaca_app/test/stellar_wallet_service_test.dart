import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:vaca_app/features/wallet/data/stellar_sdk_wallet_gateway.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_gateway.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_service.dart';

class _WalletStorage implements SecureStorage {
  final values = <String, String>{};
  int writes = 0;
  Completer<void>? writeGate;
  Completer<void>? writeStarted;

  @override
  Future<Result<String?>> read(String key) async => Success(values[key]);

  @override
  Future<Result<void>> write(String key, String value) async {
    writes++;
    if (!(writeStarted?.isCompleted ?? true)) writeStarted!.complete();
    await writeGate?.future;
    values[key] = value;
    return const Success(null);
  }

  @override
  Future<Result<void>> delete(String key) async {
    values.remove(key);
    return const Success(null);
  }

  @override
  Future<Result<void>> deleteAll() async {
    values.clear();
    return const Success(null);
  }
}

class _WalletGateway implements StellarWalletGateway {
  String? snapshotSecret;
  List<StellarClaim> claims = const [];
  final claimHashes = <String, String?>{};
  final claimedBalanceIds = <String>[];
  final fundedAccountIds = <String>[];
  final trustlineSecrets = <String>[];
  int credentialCreations = 0;
  int snapshots = 0;
  Completer<void>? snapshotGate;
  Completer<void>? snapshotStarted;
  bool failSnapshot = false;
  bool funded = true;
  bool usdcTrustlineReady = true;

  @override
  StellarWalletCredentials createCredentials() {
    credentialCreations++;
    return StellarWalletCredentials(
      accountId: 'GACCOUNT',
      secretSeed: credentialCreations == 1 ? 'S' : 'S$credentialCreations',
    );
  }

  @override
  StellarWalletCredentials credentialsFromSecret(String secretSeed) =>
      StellarWalletCredentials(accountId: 'GACCOUNT', secretSeed: secretSeed);

  @override
  Future<bool> fund(String accountId) async {
    fundedAccountIds.add(accountId);
    funded = true;
    return true;
  }

  @override
  Future<String?> ensureUsdcTrustline(String secretSeed) async {
    trustlineSecrets.add(secretSeed);
    if (usdcTrustlineReady) return null;
    usdcTrustlineReady = true;
    return 'trustline-tx';
  }

  @override
  Future<List<StellarClaim>> pendingClaims(String accountId) async => claims;

  @override
  Future<String?> claim(String secretSeed, String balanceId) async {
    claimedBalanceIds.add(balanceId);
    return claimHashes[balanceId];
  }

  @override
  Future<StellarWalletSnapshot> snapshot(String secretSeed) async {
    snapshotSecret = secretSeed;
    snapshots++;
    if (!(snapshotStarted?.isCompleted ?? true)) snapshotStarted!.complete();
    await snapshotGate?.future;
    if (failSnapshot) throw StateError('snapshot unavailable');
    return StellarWalletSnapshot(
      accountId: 'GACCOUNT',
      balance: funded ? '12.0000000' : '0.0000000',
      funded: funded,
      usdcTrustlineReady: usdcTrustlineReady,
      usdcBalance: '0.0000000',
    );
  }
}

void main() {
  const seedKey = 'stellar.testnet.secret-seed';

  test('overlapping create calls preserve one new credential and preparation',
      () async {
    final storage = _WalletStorage()
      ..writeGate = Completer<void>()
      ..writeStarted = Completer<void>();
    final gateway = _WalletGateway()
      ..funded = false
      ..usdcTrustlineReady = false;
    final service = StellarWalletService(storage, gateway);
    final first = service.create();
    final second = service.create();
    await storage.writeStarted!.future;
    await Future<void>.value();
    storage.writeGate!.complete();
    final results = await Future.wait([first, second]);

    expect(results.every((r) => r.isSuccess), isTrue);
    expect(gateway.credentialCreations, 1);
    expect(storage.writes, 1);
    expect(storage.values, {seedKey: 'S'});
    expect(gateway.fundedAccountIds, ['GACCOUNT']);
    expect(gateway.trustlineSecrets, ['S']);
    expect(gateway.snapshots, 2);
    expect(gateway.claimedBalanceIds, isEmpty);
  });

  for (final order in ['create/fund', 'fund/create', 'fund/fund']) {
    test('$order shares preparation only after a stored seed is read', () async {
      final storage = _WalletStorage()..values[seedKey] = 'S';
      final gateway = _WalletGateway()
        ..funded = false
        ..snapshotGate = Completer<void>()
        ..snapshotStarted = Completer<void>();
      final service = StellarWalletService(storage, gateway);
      final first = order.startsWith('create') ? service.create() : service.fund();
      await gateway.snapshotStarted!.future;
      final second = order.endsWith('create') ? service.create() : service.fund();
      await Future<void>.value();
      gateway.snapshotGate!.complete();
      final results = await Future.wait([first, second]);

      expect(results.every((r) => r.isSuccess), isTrue);
      expect(gateway.credentialCreations, 0);
      expect(storage.writes, 0);
      expect(storage.values, {seedKey: 'S'});
      expect(gateway.fundedAccountIds, ['GACCOUNT']);
      expect(gateway.trustlineSecrets, ['S']);
      expect(gateway.snapshots, 2);
      expect(gateway.claimedBalanceIds, isEmpty);
    });
  }

  for (final absentSeed in [null, '']) {
    test('fund rejects $absentSeed seed while create has not saved it', () async {
      final storage = _WalletStorage()
        ..writeGate = Completer<void>()
        ..writeStarted = Completer<void>();
      if (absentSeed != null) storage.values[seedKey] = absentSeed;
      final gateway = _WalletGateway()..funded = false;
      final service = StellarWalletService(storage, gateway);
      final creating = service.create();
      await storage.writeStarted!.future;
      final rejected = await service.fund();

      expect(rejected.errorOrNull?.code, 'stellar_wallet_missing');
      expect(rejected.errorOrNull?.message, 'Primero crea una wallet testnet.');
      expect(gateway.credentialCreations, 1);
      expect(storage.writes, 1);
      expect(storage.values, absentSeed == null ? isEmpty : {seedKey: ''});
      expect(gateway.snapshots, 0);
      expect(gateway.fundedAccountIds, isEmpty);
      expect(gateway.trustlineSecrets, isEmpty);
      expect(gateway.claimedBalanceIds, isEmpty);
      storage.writeGate!.complete();
      expect((await creating).isSuccess, isTrue);
      expect(storage.values, {seedKey: 'S'});
      expect(gateway.fundedAccountIds, ['GACCOUNT']);
      expect(gateway.trustlineSecrets, ['S']);
    });
  }

  for (final operation in ['create', 'fund']) {
    test('$operation shares failure, then allows only explicit later retry',
        () async {
      final storage = _WalletStorage()..values[seedKey] = 'S';
      final gateway = _WalletGateway()
        ..funded = false
        ..failSnapshot = true
        ..snapshotGate = Completer<void>()
        ..snapshotStarted = Completer<void>();
      final service = StellarWalletService(storage, gateway);
      final run = operation == 'create' ? service.create : service.fund;
      final first = run();
      await gateway.snapshotStarted!.future;
      final second = run();
      await Future<void>.value();
      gateway.snapshotGate!.complete();
      final results = await Future.wait([first, second]);

      expect(
        results.map((r) => r.errorOrNull?.code),
        ['stellar_usdc_setup', 'stellar_usdc_setup'],
      );
      expect(results.map((r) => r.errorOrNull?.message), [
        'No se pudo preparar la wallet para USDC testnet.',
        'No se pudo preparar la wallet para USDC testnet.',
      ]);
      expect(gateway.snapshots, 1);
      expect(gateway.credentialCreations, 0);
      expect(storage.writes, 0);
      expect(storage.values, {seedKey: 'S'});
      expect(gateway.fundedAccountIds, isEmpty);
      expect(gateway.trustlineSecrets, isEmpty);
      expect(gateway.claimedBalanceIds, isEmpty);
      gateway.failSnapshot = false;
      expect((await run()).isSuccess, isTrue);
      expect(gateway.snapshots, 3);
      expect(gateway.fundedAccountIds, ['GACCOUNT']);
      expect(gateway.trustlineSecrets, ['S']);
      expect(storage.values, {seedKey: 'S'});
      expect(storage.writes, 0);
    });
  }

  test('gateway creates a real Stellar keypair', () {
    final created = StellarSdkWalletGateway().createCredentials();

    expect(created.accountId, startsWith('G'));
    expect(created.secretSeed, startsWith('S'));
    expect(created.secretSeed, isNot(created.accountId));
  });

  test('create funds the wallet and establishes the USDC trustline', () async {
    final storage = _WalletStorage();
    final gateway = _WalletGateway()
      ..funded = false
      ..usdcTrustlineReady = false;
    final service = StellarWalletService(storage, gateway);

    final created = await service.create();

    expect(created.isSuccess, isTrue);
    expect(created.valueOrNull?.funded, isTrue);
    expect(created.valueOrNull?.usdcTrustlineReady, isTrue);
    expect(storage.values.values.single, 'S');
    expect(gateway.fundedAccountIds, ['GACCOUNT']);
    expect(gateway.trustlineSecrets, ['S']);
  });

  test('loads a stored wallet through a substitutable gateway', () async {
    final storage = _WalletStorage()
      ..values['stellar.testnet.secret-seed'] = 'S';
    final gateway = _WalletGateway();
    final service = StellarWalletService(storage, gateway);

    final loaded = await service.load();

    expect(loaded.valueOrNull?.accountId, 'GACCOUNT');
    expect(loaded.valueOrNull?.balance, '12.0000000');
    expect(gateway.snapshotSecret, 'S');
  });

  test('fund repairs a funded wallet without a USDC trustline', () async {
    final storage = _WalletStorage()
      ..values['stellar.testnet.secret-seed'] = 'S';
    final gateway = _WalletGateway()..usdcTrustlineReady = false;
    final service = StellarWalletService(storage, gateway);

    final result = await service.fund();

    expect(result.valueOrNull?.usdcTrustlineReady, isTrue);
    expect(gateway.fundedAccountIds, isEmpty);
    expect(gateway.trustlineSecrets, ['S']);
  });

  test('claims every pending balance and returns verifiable hashes', () async {
    final storage = _WalletStorage()
      ..values['stellar.testnet.secret-seed'] = 'S';
    final gateway = _WalletGateway()
      ..usdcTrustlineReady = false
      ..claims = const [
        StellarClaim(balanceId: 'CB-1', amount: '2.0'),
        StellarClaim(balanceId: 'CB-2', amount: '3.0'),
      ]
      ..claimHashes.addAll({'CB-1': 'tx-1', 'CB-2': 'tx-2'});
    final service = StellarWalletService(storage, gateway);

    final result = await service.claimAll();

    expect(result.isSuccess, isTrue);
    expect(result.valueOrNull?.transactionHashes, ['tx-1', 'tx-2']);
    expect(gateway.trustlineSecrets, ['S']);
    expect(gateway.claimedBalanceIds, ['CB-1', 'CB-2']);
  });

  test('stops claiming when Horizon rejects a transaction', () async {
    final storage = _WalletStorage()
      ..values['stellar.testnet.secret-seed'] = 'S';
    final gateway = _WalletGateway()
      ..claims = const [
        StellarClaim(balanceId: 'CB-1', amount: '2.0'),
        StellarClaim(balanceId: 'CB-2', amount: '3.0'),
      ];
    final service = StellarWalletService(storage, gateway);

    final result = await service.claimAll();

    expect(result.errorOrNull?.code, 'stellar_claim_failed');
    expect(gateway.claimedBalanceIds, ['CB-1']);
  });
}
