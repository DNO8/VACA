class StellarWalletSnapshot {
  const StellarWalletSnapshot({
    required this.accountId,
    required this.balance,
    required this.funded,
  });

  final String accountId;
  final String balance;
  final bool funded;
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

abstract interface class StellarWalletGateway {
  StellarWalletCredentials createCredentials();

  StellarWalletCredentials credentialsFromSecret(String secretSeed);

  Future<StellarWalletSnapshot> snapshot(String secretSeed);

  Future<bool> fund(String accountId);

  Future<List<StellarClaim>> pendingClaims(String accountId);

  Future<String?> claim(String secretSeed, String balanceId);
}
