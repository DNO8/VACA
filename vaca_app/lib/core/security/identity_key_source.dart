import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../result/result.dart';
import 'secure_storage.dart';

/// Genera y protege el par de claves de dispositivo / identidad local.
///
/// La clave privada vive en `flutter_secure_storage`; la publica se expone
/// para firmar bundles. No implementa criptografia manual: la firma se
/// delegara a un servicio backend o a Didit en fases posteriores.
class IdentityKeySource {
  const IdentityKeySource(this._storage);

  final SecureStorage _storage;

  static const String _publicKeyKey = 'vaca_device_public_key';
  static const String _privateKeyKey = 'vaca_device_private_key';

  /// Recupera o genera un par de claves Ed25519-compatible.
  ///
  /// Por ahora la clave es un seed aleatorio de 32 bytes; la firma real se
  /// implementa en `B2` con Didit o con `pointycastle` validado.
  Future<Result<DeviceKeyPair>> getOrCreateKeyPair() async {
    final publicRead = await _storage.read(_publicKeyKey);
    if (publicRead.isFailure) return publicRead as Failure<DeviceKeyPair>;
    final public = publicRead.valueOrNull;

    final privateRead = await _storage.read(_privateKeyKey);
    if (privateRead.isFailure) return privateRead as Failure<DeviceKeyPair>;
    final private = privateRead.valueOrNull;

    if (public != null && public.isNotEmpty && private != null && private.isNotEmpty) {
      return Success(DeviceKeyPair(publicKey: public, privateKeySeed: private));
    }

    final seed = Uint8List(32);
    final random = Random.secure();
    for (var i = 0; i < seed.length; i++) {
      seed[i] = random.nextInt(256);
    }

    final newPublic = 'DPK:${sha256.convert(seed).toString().substring(0, 32)}';
    final newPrivate = base64Encode(seed);

    final publicWrite = await _storage.write(_publicKeyKey, newPublic);
    if (publicWrite.isFailure) return publicWrite as Failure<DeviceKeyPair>;

    final privateWrite = await _storage.write(_privateKeyKey, newPrivate);
    if (privateWrite.isFailure) return privateWrite as Failure<DeviceKeyPair>;

    return Success(
      DeviceKeyPair(publicKey: newPublic, privateKeySeed: newPrivate),
    );
  }

  /// Elimina el par de claves del dispositivo.
  Future<Result<void>> delete() async {
    await _storage.delete(_publicKeyKey);
    await _storage.delete(_privateKeyKey);
    return const Success(null);
  }
}

/// Par de claves opacas del dispositivo.
class DeviceKeyPair {
  const DeviceKeyPair({
    required this.publicKey,
    required this.privateKeySeed,
  });

  final String publicKey;
  final String privateKeySeed;
}
