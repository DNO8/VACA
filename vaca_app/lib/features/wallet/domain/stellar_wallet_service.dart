import '../../../core/result/result.dart';
import '../../../core/security/secure_storage.dart';
import 'stellar_wallet_gateway.dart';

export 'stellar_wallet_gateway.dart'
    show StellarClaimResult, StellarWalletSnapshot;

class StellarWalletService {
  StellarWalletService(this._storage, this._gateway);

  static const _secretKey = 'stellar.testnet.secret-seed';
  final SecureStorage _storage;
  final StellarWalletGateway _gateway;
  Future<Result<StellarWalletSnapshot>>? _creating;
  final _preparing = <String, Future<Result<StellarWalletSnapshot>>>{};

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

  /// Shares an in-flight creation only within this service instance.
  Future<Result<StellarWalletSnapshot>> create() =>
      _creating ??= _createWallet().whenComplete(() {
        _creating = null;
      });

  Future<Result<StellarWalletSnapshot>> _createWallet() async {
    final stored = await _storage.read(_secretKey);
    if (stored case Failure(error: final error)) return Failure(error);
    var secret = stored.valueOrNull;
    if (secret == null || secret.isEmpty) {
      try {
        final credentials = _gateway.createCredentials();
        final write = await _storage.write(_secretKey, credentials.secretSeed);
        if (write case Failure(error: final error)) return Failure(error);
        secret = credentials.secretSeed;
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
    return _prepareOnce(secret);
  }

  Future<Result<StellarWalletSnapshot>> fund() async {
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
    return _prepareOnce(secret);
  }

  // fund() must read storage before joining: missing is not permission to create.
  Future<Result<StellarWalletSnapshot>> _prepareOnce(String secret) =>
      _preparing.putIfAbsent(
        secret,
        () => _prepareForUsdc(secret).whenComplete(() {
          _preparing.remove(secret);
        }),
      );

  Future<Result<StellarWalletSnapshot>> _prepareForUsdc(String secret) async {
    try {
      final credentials = _gateway.credentialsFromSecret(secret);
      final snapshot = await _gateway.snapshot(secret);
      if (!snapshot.funded) {
        final funded = await _gateway.fund(credentials.accountId);
        if (!funded) {
          return const Failure(
            VacaError(
              code: 'stellar_friendbot_rejected',
              message: 'Friendbot no financió la cuenta testnet.',
            ),
          );
        }
      }
      await _gateway.ensureUsdcTrustline(secret);
      return Success(await _gateway.snapshot(secret));
    } catch (error) {
      return Failure(
        VacaError(
          code: 'stellar_usdc_setup',
          message: 'No se pudo preparar la wallet para USDC testnet.',
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
  Future<Result<StellarClaimResult>> claimAll() async {
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
      final prepared = await _prepareForUsdc(secret);
      if (prepared case Failure(error: final error)) return Failure(error);
      final credentials = _gateway.credentialsFromSecret(secret);
      final claims = await _gateway.pendingClaims(credentials.accountId);
      final transactionHashes = <String>[];
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
        transactionHashes.add(transactionHash);
      }
      return Success(
        StellarClaimResult(
          wallet: await _gateway.snapshot(secret),
          transactionHashes: List.unmodifiable(transactionHashes),
        ),
      );
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
