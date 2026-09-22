import '../../../core/result/result.dart';
import '../../../core/security/secure_storage.dart';
import 'stellar_wallet_gateway.dart';

export 'stellar_wallet_gateway.dart' show StellarWalletSnapshot;

class StellarWalletService {
  StellarWalletService(this._storage, this._gateway);

  static const _secretKey = 'stellar.testnet.secret-seed';
  final SecureStorage _storage;
  final StellarWalletGateway _gateway;

  Future<Result<StellarWalletSnapshot?>> load() async {
    final stored = await _storage.read(_secretKey);
    if (stored case Failure(error: final error)) return Failure(error);
    final secret = stored.valueOrNull;
    if (secret == null || secret.isEmpty) return const Success(null);
    try {
      return Success(await _gateway.snapshot(secret));
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
      final credentials = _gateway.createCredentials();
      final write = await _storage.write(_secretKey, credentials.secretSeed);
      if (write case Failure(error: final error)) return Failure(error);
      return Success(
        StellarWalletSnapshot(
          accountId: credentials.accountId,
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
      final funded = await _gateway.fund(snapshot.accountId);
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
  Future<Result<List<StellarClaim>>> pendingClaims() async {
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
      final credentials = _gateway.credentialsFromSecret(secret);
      return Success(await _gateway.pendingClaims(credentials.accountId));
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
      final credentials = _gateway.credentialsFromSecret(secret);
      if (!(await _gateway.snapshot(secret)).funded) {
        final funded = await _gateway.fund(credentials.accountId);
        if (!funded) {
          return const Failure(
            VacaError(
              code: 'stellar_friendbot_rejected',
              message: 'Friendbot no financió la cuenta testnet.',
            ),
          );
        }
        await Future<void>.delayed(const Duration(seconds: 2));
      }
      final claims = await _gateway.pendingClaims(credentials.accountId);
      for (final claim in claims) {
        final transactionHash = await _gateway.claim(
          secret,
          claim.balanceId,
        );
        if (transactionHash == null) {
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
      return Success(await _gateway.snapshot(secret));
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
}
