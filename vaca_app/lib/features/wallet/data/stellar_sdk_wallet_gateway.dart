import 'package:stellar_flutter_sdk/stellar_flutter_sdk.dart';

import '../domain/stellar_wallet_gateway.dart';

class StellarSdkWalletGateway implements StellarWalletGateway {
  StellarSdkWalletGateway({StellarSDK? sdk}) : _sdk = sdk ?? StellarSDK.TESTNET;

  final StellarSDK _sdk;

  @override
  StellarWalletCredentials createCredentials() {
    final keyPair = KeyPair.random();
    return StellarWalletCredentials(
      accountId: keyPair.accountId,
      secretSeed: keyPair.secretSeed,
    );
  }

  @override
  StellarWalletCredentials credentialsFromSecret(String secretSeed) {
    final keyPair = KeyPair.fromSecretSeed(secretSeed);
    return StellarWalletCredentials(
      accountId: keyPair.accountId,
      secretSeed: secretSeed,
    );
  }

  @override
  Future<StellarWalletSnapshot> snapshot(String secretSeed) async {
    final credentials = credentialsFromSecret(secretSeed);
    try {
      final account = await _sdk.accounts.account(credentials.accountId);
      final nativeBalance = account.balances
          .where((balance) => balance.assetType == Asset.TYPE_NATIVE)
          .map((balance) => balance.balance)
          .firstOrNull;
      return StellarWalletSnapshot(
        accountId: credentials.accountId,
        balance: nativeBalance ?? '0.0000000',
        funded: nativeBalance != null,
      );
    } catch (_) {
      return StellarWalletSnapshot(
        accountId: credentials.accountId,
        balance: '0.0000000',
        funded: false,
      );
    }
  }

  @override
  Future<bool> fund(String accountId) => FriendBot.fundTestAccount(accountId);

  @override
  Future<List<StellarClaim>> pendingClaims(String accountId) async {
    final page = await _sdk.claimableBalances.forClaimant(accountId).execute();
    return page.records
        .map(
          (balance) => StellarClaim(
            balanceId: balance.balanceId,
            amount: balance.amount,
          ),
        )
        .toList(growable: false);
  }

  @override
  Future<String?> claim(String secretSeed, String balanceId) async {
    final keyPair = KeyPair.fromSecretSeed(secretSeed);
    final account = await _sdk.accounts.account(keyPair.accountId);
    final transaction = TransactionBuilder(account)
        .addOperation(ClaimClaimableBalanceOperation(balanceId))
        .build();
    transaction.sign(keyPair, Network.TESTNET);
    final response = await _sdk.submitTransaction(transaction);
    return response.success ? response.hash : null;
  }
}
