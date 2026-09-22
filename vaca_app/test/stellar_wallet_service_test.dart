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

  @override
  StellarWalletCredentials createCredentials() =>
      const StellarWalletCredentials(accountId: 'GACCOUNT', secretSeed: 'S');

  @override
  StellarWalletCredentials credentialsFromSecret(String secretSeed) =>
      StellarWalletCredentials(accountId: 'GACCOUNT', secretSeed: secretSeed);

  @override
  Future<bool> fund(String accountId) async => true;

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
    return const StellarWalletSnapshot(
      accountId: 'GACCOUNT',
      balance: '12.0000000',
      funded: true,
    );
  }
}

void main() {
  test('creates a real Stellar keypair and stores only its secret securely',
      () async {
    final storage = _WalletStorage();
    final service = StellarWalletService(storage, StellarSdkWalletGateway());

    final created = await service.create();

    expect(created.isSuccess, isTrue);
    expect(created.valueOrNull!.accountId, startsWith('G'));
    expect(created.valueOrNull!.balance, '0.0000000');
    expect(storage.values, hasLength(1));
    expect(storage.values.values.single, startsWith('S'));
    expect(storage.values.values.single, isNot(created.valueOrNull!.accountId));
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

  test('claims every pending balance and returns verifiable hashes', () async {
    final storage = _WalletStorage()
      ..values['stellar.testnet.secret-seed'] = 'S';
    final gateway = _WalletGateway()
      ..claims = const [
        StellarClaim(balanceId: 'CB-1', amount: '2.0'),
        StellarClaim(balanceId: 'CB-2', amount: '3.0'),
      ]
      ..claimHashes.addAll({'CB-1': 'tx-1', 'CB-2': 'tx-2'});
    final service = StellarWalletService(storage, gateway);

    final result = await service.claimAll();

    expect(result.isSuccess, isTrue);
    expect(result.valueOrNull?.transactionHashes, ['tx-1', 'tx-2']);
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
