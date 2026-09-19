import 'package:stellar_flutter_sdk/stellar_flutter_sdk.dart';

import '../../../core/result/result.dart';
import '../../../core/security/secure_storage.dart';

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

class StellarWalletService {
  StellarWalletService(
    this._storage, {
    StellarSDK? sdk,
  }) : _sdk = sdk ?? StellarSDK.TESTNET;

  static const _secretKey = 'stellar.testnet.secret-seed';
  final SecureStorage _storage;
  final StellarSDK _sdk;

  Future<Result<StellarWalletSnapshot?>> load() async {
    final stored = await _storage.read(_secretKey);
    if (stored case Failure(error: final error)) return Failure(error);
    final secret = stored.valueOrNull;
    if (secret == null || secret.isEmpty) return const Success(null);
    try {
      return Success(await _snapshot(KeyPair.fromSecretSeed(secret)));
    } catch (error) {
      return Failure(
        VacaError(
          code: 'stellar_wallet_load',
          message: 'No se pudo recuperar la wallet testnet.',
          cause: error,
        ),
      );
    }
  }

  Future<Result<StellarWalletSnapshot>> create() async {
    final existing = await load();
    if (existing case Success(value: final snapshot?)) return Success(snapshot);
    if (existing case Failure(error: final error)) return Failure(error);
    try {
      final keyPair = KeyPair.random();
      final write = await _storage.write(_secretKey, keyPair.secretSeed);
      if (write case Failure(error: final error)) return Failure(error);
      return Success(
        StellarWalletSnapshot(
          accountId: keyPair.accountId,
          balance: '0.0000000',
          funded: false,
        ),
      );
    } catch (error) {
      return Failure(
        VacaError(
          code: 'stellar_wallet_create',
          message: 'No se pudo crear la wallet testnet.',
          cause: error,
        ),
      );
    }
  }

  Future<Result<StellarWalletSnapshot>> fund() async {
    final current = await load();
    if (current case Failure(error: final error)) return Failure(error);
    final snapshot = current.valueOrNull;
    if (snapshot == null) {
      return const Failure(
        VacaError(
          code: 'stellar_wallet_missing',
          message: 'Primero crea una wallet testnet.',
        ),
      );
    }
    try {
      final funded = await FriendBot.fundTestAccount(snapshot.accountId);
      if (!funded) {
        return const Failure(
          VacaError(
            code: 'stellar_friendbot_rejected',
            message: 'Friendbot no financió la cuenta testnet.',
          ),
        );
      }
      return refresh();
    } catch (error) {
      return Failure(
        VacaError(
          code: 'stellar_friendbot_error',
          message: 'No se pudo contactar a Friendbot.',
          cause: error,
        ),
      );
    }
  }

  /// Balances reclamables (claimable balances) pendientes para esta wallet.
  Future<Result<List<ClaimableBalanceResponse>>> pendingClaims() async {
    final stored = await _storage.read(_secretKey);
    if (stored case Failure(error: final error)) return Failure(error);
    final secret = stored.valueOrNull;
    if (secret == null || secret.isEmpty) {
      return const Failure(
        VacaError(
          code: 'stellar_wallet_missing',
          message: 'Primero crea una wallet testnet.',
        ),
      );
    }
    try {
      final keyPair = KeyPair.fromSecretSeed(secret);
      final page = await _sdk.claimableBalances
          .forClaimant(keyPair.accountId)
          .execute();
      return Success(page.records);
    } catch (error) {
      return Failure(
        VacaError(
          code: 'stellar_claims_query',
          message: 'No se pudo consultar la ayuda pendiente.',
          cause: error,
        ),
      );
    }
  }

  /// Reclama todos los balances pendientes hacia la wallet.
  /// Fondea con Friendbot si la cuenta aún no existe (paga fee + reservas).
  Future<Result<StellarWalletSnapshot>> claimAll() async {
    final stored = await _storage.read(_secretKey);
    if (stored case Failure(error: final error)) return Failure(error);
    final secret = stored.valueOrNull;
    if (secret == null || secret.isEmpty) {
      return const Failure(
        VacaError(
          code: 'stellar_wallet_missing',
          message: 'Primero crea una wallet testnet.',
        ),
      );
    }
    try {
      final keyPair = KeyPair.fromSecretSeed(secret);
      if (!(await _snapshot(keyPair)).funded) {
        await FriendBot.fundTestAccount(keyPair.accountId);
        await Future<void>.delayed(const Duration(seconds: 2));
      }
      final page = await _sdk.claimableBalances
          .forClaimant(keyPair.accountId)
          .execute();
      for (final balance in page.records) {
        final account = await _sdk.accounts.account(keyPair.accountId);
        final tx = TransactionBuilder(account)
            .addOperation(
              ClaimClaimableBalanceOperation(balance.balanceId),
            )
            .build();
        tx.sign(keyPair, Network.TESTNET);
        final res = await _sdk.submitTransaction(tx);
        if (!res.success) {
          return const Failure(
            VacaError(
              code: 'stellar_claim_failed',
              message: 'No se pudo reclamar la ayuda.',
            ),
          );
        }
      }
      return refresh();
    } catch (error) {
      return Failure(
        VacaError(
          code: 'stellar_claim_error',
          message: 'Error al reclamar la ayuda.',
          cause: error,
        ),
      );
    }
  }

  Future<Result<StellarWalletSnapshot>> refresh() async {
    final stored = await _storage.read(_secretKey);
    if (stored case Failure(error: final error)) return Failure(error);
    final secret = stored.valueOrNull;
    if (secret == null || secret.isEmpty) {
      return const Failure(
        VacaError(
          code: 'stellar_wallet_missing',
          message: 'Primero crea una wallet testnet.',
        ),
      );
    }
    try {
      return Success(await _snapshot(KeyPair.fromSecretSeed(secret)));
    } catch (error) {
      return Failure(
        VacaError(
          code: 'stellar_horizon_error',
          message: 'No se pudo consultar Stellar testnet.',
          cause: error,
        ),
      );
    }
  }

  Future<StellarWalletSnapshot> _snapshot(KeyPair keyPair) async {
    try {
      final account = await _sdk.accounts.account(keyPair.accountId);
      final nativeBalance = account.balances
          .where((balance) => balance.assetType == Asset.TYPE_NATIVE)
          .map((balance) => balance.balance)
          .firstOrNull;
      return StellarWalletSnapshot(
        accountId: keyPair.accountId,
        balance: nativeBalance ?? '0.0000000',
        funded: nativeBalance != null,
      );
    } catch (_) {
      return StellarWalletSnapshot(
        accountId: keyPair.accountId,
        balance: '0.0000000',
        funded: false,
      );
    }
  }
}
