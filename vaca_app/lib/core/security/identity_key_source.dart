import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:ed25519_edwards/ed25519_edwards.dart' as ed25519;

import '../result/result.dart';
import 'secure_storage.dart';

/// Genera y protege el par de claves Ed25519 del dispositivo.
///
/// La clave privada vive en `flutter_secure_storage`; la publica se expone
/// para autenticar bundles. Usa `ed25519_edwards` para firma/verificacion.
class IdentityKeySource {
  const IdentityKeySource(this._storage);

  final SecureStorage _storage;

  static const String _publicKeyKey = 'vaca_device_public_key';
  static const String _privateKeyKey = 'vaca_device_private_key';

  /// Recupera o genera un par de claves Ed25519.
  ///
  /// La clave privada se almacena como el seed RFC 8032 de 32 bytes.
  /// La publica es el punto de 32 bytes codificado en base64.
  Future<Result<DeviceKeyPair>> getOrCreateKeyPair() async {
    final publicRead = await _storage.read(_publicKeyKey);
    if (publicRead.isFailure) return publicRead as Failure<DeviceKeyPair>;
    final publicB64 = publicRead.valueOrNull;

    final privateRead = await _storage.read(_privateKeyKey);
    if (privateRead.isFailure) return privateRead as Failure<DeviceKeyPair>;
    final seedB64 = privateRead.valueOrNull;

    if (publicB64 != null &&
        publicB64.isNotEmpty &&
        seedB64 != null &&
        seedB64.isNotEmpty) {
      try {
        final publicKey = base64Decode(publicB64);
        final seed = base64Decode(seedB64);
        if (publicKey.length == ed25519.PublicKeySize &&
            seed.length == ed25519.SeedSize) {
          return Success(
            DeviceKeyPair(
              publicKey: publicB64,
              privateKeySeed: seedB64,
            ),
          );
        }
      } catch (_) {
        // Fall through to regenerate.
      }
    }

    final seed = Uint8List(ed25519.SeedSize);
    final random = Random.secure();
    for (var i = 0; i < seed.length; i++) {
      seed[i] = random.nextInt(256);
    }

    final privateKey = ed25519.newKeyFromSeed(seed);
    final publicKey = privateKey.bytes.sublist(
      ed25519.SeedSize,
      ed25519.SeedSize + ed25519.PublicKeySize,
    );

    final newSeedB64 = base64Encode(seed);
    final newPublicB64 = base64Encode(publicKey);

    final publicWrite = await _storage.write(_publicKeyKey, newPublicB64);
    if (publicWrite.isFailure) return publicWrite as Failure<DeviceKeyPair>;

    final privateWrite = await _storage.write(_privateKeyKey, newSeedB64);
    if (privateWrite.isFailure) return privateWrite as Failure<DeviceKeyPair>;

    return Success(
      DeviceKeyPair(
        publicKey: newPublicB64,
        privateKeySeed: newSeedB64,
      ),
    );
  }

  /// Firma `message` con la clave privada almacenada.
  Future<Result<Uint8List>> sign(Uint8List message) async {
    final pairRead = await getOrCreateKeyPair();
    if (pairRead.isFailure) {
      return Failure((pairRead as Failure<DeviceKeyPair>).error);
    }
    final pair = pairRead.valueOrNull!;
    try {
      final seed = base64Decode(pair.privateKeySeed);
      final privateKey = ed25519.newKeyFromSeed(seed);
      final signature = ed25519.sign(privateKey, message);
      return Success(signature);
    } catch (e) {
      return Failure(
        VacaError(
          code: 'identity_sign',
          message: 'No se pudo firmar el mensaje.',
          cause: e,
        ),
      );
    }
  }

  /// Verifica `signature` de `message` con la clave publica del dispositivo.
  Future<Result<bool>> verify(Uint8List message, Uint8List signature) async {
    final pairRead = await getOrCreateKeyPair();
    if (pairRead.isFailure) {
      return Failure((pairRead as Failure<DeviceKeyPair>).error);
    }
    final pair = pairRead.valueOrNull!;
    try {
      final publicKey = base64Decode(pair.publicKey);
      final public = ed25519.PublicKey(publicKey);
      final valid = ed25519.verify(public, message, signature);
      return Success(valid);
    } catch (e) {
      return Failure(
        VacaError(
          code: 'identity_verify',
          message: 'No se pudo verificar la firma.',
          cause: e,
        ),
      );
    }
  }

  /// Recupera el hash resumido del dispositivo (SHA-256 de la publica).
  ///
  /// Util para identificar el origen en logs no sensibles.
  Future<Result<String>> publicKeyThumbprint() async {
    final pairRead = await getOrCreateKeyPair();
    if (pairRead.isFailure) {
      return Failure((pairRead as Failure<DeviceKeyPair>).error);
    }
    final pair = pairRead.valueOrNull!;
    try {
      final publicKey = base64Decode(pair.publicKey);
      final digest = sha256.convert(publicKey);
      return Success(digest.toString().substring(0, 16));
    } catch (e) {
      return Failure(
        VacaError(
          code: 'identity_thumbprint',
          message: 'No se pudo calcular el thumbprint.',
          cause: e,
        ),
      );
    }
  }

  /// Elimina el par de claves del dispositivo.
  Future<Result<void>> delete() async {
    await _storage.delete(_publicKeyKey);
    await _storage.delete(_privateKeyKey);
    return const Success(null);
  }
}

/// Par de claves opacas del dispositivo.
///
/// Los valores estan en base64. `privateKeySeed` es el seed RFC 8032 de 32 bytes.
class DeviceKeyPair {
  const DeviceKeyPair({
    required this.publicKey,
    required this.privateKeySeed,
  });

  final String publicKey;
  final String privateKeySeed;
}
