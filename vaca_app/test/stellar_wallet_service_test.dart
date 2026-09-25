import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:vaca_app/features/wallet/data/stellar_sdk_wallet_gateway.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_gateway.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_service.dart';

class _WalletStorage implements SecureStorage {
  final values = <String, String>{};

  @override
  Future<Result<String?>> read(String key) async => Success(values[key]);

  @override
  Future<Result<void>> write(String key, String value) async {
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
  bool funded = true;
  bool usdcTrustlineReady = true;

  @override
  StellarWalletCredentials createCredentials() =>
      const StellarWalletCredentials(accountId: 'GACCOUNT', secretSeed: 'S');

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
