class StellarWalletSnapshot {
  const StellarWalletSnapshot({
    required this.accountId,
    required this.balance,
    required this.funded,
    required this.usdcTrustlineReady,
    required this.usdcBalance,
  });

  final String accountId;
  final String balance;
  final bool funded;
  final bool usdcTrustlineReady;
  final String usdcBalance;
}

class StellarWalletCredentials {
  const StellarWalletCredentials({
    required this.accountId,
    required this.secretSeed,
  });

  final String accountId;
  final String secretSeed;
}

class StellarClaim {
  const StellarClaim({
    required this.balanceId,
    required this.amount,
  });

  final String balanceId;
  final String amount;
}

class StellarClaimResult {
  const StellarClaimResult({
    required this.wallet,
    required this.transactionHashes,
  });

  final StellarWalletSnapshot wallet;
  final List<String> transactionHashes;
}

abstract interface class StellarWalletGateway {
  StellarWalletCredentials createCredentials();

  StellarWalletCredentials credentialsFromSecret(String secretSeed);

  Future<StellarWalletSnapshot> snapshot(String secretSeed);

  Future<bool> fund(String accountId);

  Future<String?> ensureUsdcTrustline(String secretSeed);

  Future<List<StellarClaim>> pendingClaims(String accountId);

  Future<String?> claim(String secretSeed, String balanceId);
}
