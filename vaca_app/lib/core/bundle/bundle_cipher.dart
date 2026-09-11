import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:pointycastle/api.dart';
import 'package:pointycastle/block/aes.dart';
import 'package:pointycastle/block/modes/gcm.dart';

import '../result/result.dart';

/// Resultado de cifrar un payload de bundle.
///
/// El `ciphertext` contiene el tag GCM concatenado. `wrappedKey` contiene la
/// clave de contenido cifrada con la clave del destinatario. `nonce` y
/// `keyId` se publican en la cabecera para que el destinatario pueda
/// descifrar.
class BundleSealedPayload {
  const BundleSealedPayload({
    required this.ciphertext,
    required this.wrappedKey,
    required this.nonce,
    required this.wrapNonce,
    required this.ephemeralPublicKey,
    required this.keyId,
  });

  final Uint8List ciphertext;
  final Uint8List wrappedKey;
  final Uint8List nonce;
  final Uint8List wrapNonce;
  final Uint8List ephemeralPublicKey;
  final String keyId;

  BundleSealedPayload copyWith({
    Uint8List? ciphertext,
    Uint8List? wrappedKey,
    Uint8List? nonce,
    Uint8List? wrapNonce,
    Uint8List? ephemeralPublicKey,
    String? keyId,
  }) =>
      BundleSealedPayload(
        ciphertext: ciphertext ?? this.ciphertext,
        wrappedKey: wrappedKey ?? this.wrappedKey,
        nonce: nonce ?? this.nonce,
        wrapNonce: wrapNonce ?? this.wrapNonce,
        ephemeralPublicKey: ephemeralPublicKey ?? this.ephemeralPublicKey,
        keyId: keyId ?? this.keyId,
      );
}

/// Fuente de claves de destinatario para cifrar bundles.
///
/// En produccion resuelve la clave publica o clave compartida del servidor
/// autorizado. En tests/dev se inyecta un valor conocido. Si no hay clave
/// disponible, la implementacion debe fallar cerrado.
abstract interface class BundleKeySource {
  Future<Result<BundleRecipientKey>> resolveKey(String keyId);
}

class BundleRecipientKey {
  const BundleRecipientKey({
    required this.publicKey,
    this.privateKey,
  });

  final Uint8List publicKey;
  final Uint8List? privateKey;
}

class PublicBundleKeySource implements BundleKeySource {
  const PublicBundleKeySource(this._publicKey);

  final Uint8List _publicKey;

  @override
  Future<Result<BundleRecipientKey>> resolveKey(String keyId) async => Success(
        BundleRecipientKey(publicKey: _publicKey),
      );
}

/// Implementacion estatica para tests y desarrollo.
///
/// Nunca se usa en builds de produccion.
class StaticBundleKeySource implements BundleKeySource {
  const StaticBundleKeySource(this._privateKey);

  final Uint8List _privateKey;

  @override
  Future<Result<BundleRecipientKey>> resolveKey(String keyId) async {
    final pair = await X25519().newKeyPairFromSeed(_privateKey);
    final publicKey = await pair.extractPublicKey();
    return Success(
      BundleRecipientKey(
        publicKey: Uint8List.fromList(publicKey.bytes),
        privateKey: _privateKey,
      ),
    );
  }
}

/// Implementacion que falla cerrado (produccion sin clave configurada).
class FailClosedBundleKeySource implements BundleKeySource {
  const FailClosedBundleKeySource();

  @override
  Future<Result<BundleRecipientKey>> resolveKey(String keyId) async =>
      const Failure(
        VacaError(
          code: 'bundle_key_missing',
          message: 'Clave pública del destinatario no configurada.',
        ),
      );
}

/// Cifra el payload de un bundle con AES-256-GCM.
///
/// Genera una clave de contenido aleatoria por bundle, la cifra con la
/// clave del destinatario resuelta por [BundleKeySource] y devuelve el
/// ciphertext, la clave envuelta, el nonce y el keyId.
class AesGcmBundleCipher {
  const AesGcmBundleCipher(this._keySource);

  final BundleKeySource _keySource;

  static const int _keyLength = 32;
  static const int _nonceLength = 12;
  static const int _tagLength = 16;

  Future<Result<BundleSealedPayload>> seal(
    Uint8List plaintext,
    String keyId,
  ) async {
    final keyRead = await _keySource.resolveKey(keyId);
    if (keyRead.isFailure) {
      return Failure((keyRead as Failure<BundleRecipientKey>).error);
    }
    final recipient = keyRead.valueOrNull!;
    if (recipient.publicKey.length != _keyLength) {
      return const Failure(
        VacaError(
          code: 'bundle_key_invalid',
          message: 'La clave pública del destinatario debe tener 32 bytes.',
        ),
      );
    }

    try {
      final contentKey = _secureRandom(_keyLength);
      final nonce = _secureRandom(_nonceLength);
      final wrapNonce = _secureRandom(_nonceLength);
      final ephemeralPair = await X25519().newKeyPair();
      final ephemeralPublicKey = await ephemeralPair.extractPublicKey();
      final wrapKey = await _deriveWrapKey(
        keyPair: ephemeralPair,
        remotePublicKey: recipient.publicKey,
        nonce: wrapNonce,
      );

      // Cifra el payload.
      final payloadCipher = _encrypt(plaintext, contentKey, nonce);

      // Envuelve la clave de contenido con la clave del destinatario.
      final wrappedKey = _encrypt(contentKey, wrapKey, wrapNonce);

      return Success(
        BundleSealedPayload(
          ciphertext: payloadCipher,
          wrappedKey: wrappedKey,
          nonce: nonce,
          wrapNonce: wrapNonce,
          ephemeralPublicKey: Uint8List.fromList(ephemeralPublicKey.bytes),
          keyId: keyId,
        ),
      );
    } catch (e) {
      return Failure(
        VacaError(
          code: 'bundle_cipher_seal',
          message: 'No se pudo cifrar el payload del bundle.',
          cause: e,
        ),
      );
    }
  }

  Future<Result<Uint8List>> unseal(
    Uint8List ciphertext,
    Uint8List wrappedKey,
    Uint8List nonce,
    Uint8List wrapNonce,
    Uint8List ephemeralPublicKey,
    String keyId,
  ) async {
    final keyRead = await _keySource.resolveKey(keyId);
    if (keyRead.isFailure) {
      return Failure((keyRead as Failure<BundleRecipientKey>).error);
    }
    final privateKey = keyRead.valueOrNull!.privateKey;
    if (privateKey == null) {
      return const Failure(
        VacaError(
          code: 'bundle_private_key_unavailable',
          message: 'La clave privada del destinatario no está disponible.',
        ),
      );
    }

    try {
      final recipientPair = await X25519().newKeyPairFromSeed(privateKey);
      final wrapKey = await _deriveWrapKey(
        keyPair: recipientPair,
        remotePublicKey: ephemeralPublicKey,
        nonce: wrapNonce,
      );
      final contentKey = _decrypt(wrappedKey, wrapKey, wrapNonce);
      return Success(_decrypt(ciphertext, contentKey, nonce));
    } catch (e) {
      return Failure(
        VacaError(
          code: 'bundle_cipher_unseal',
          message: 'No se pudo descifrar el payload del bundle.',
          cause: e,
        ),
      );
    }
  }

  Future<Uint8List> _deriveWrapKey({
    required KeyPair keyPair,
    required Uint8List remotePublicKey,
    required Uint8List nonce,
  }) async {
    final shared = await X25519().sharedSecretKey(
      keyPair: keyPair,
      remotePublicKey: SimplePublicKey(
        remotePublicKey,
        type: KeyPairType.x25519,
      ),
    );
    final derived = await Hkdf(
      hmac: Hmac.sha256(),
      outputLength: _keyLength,
    ).deriveKey(
      secretKey: shared,
      nonce: nonce,
      info: utf8.encode('vaca:bundle-wrap:v2'),
    );
    return Uint8List.fromList(await derived.extractBytes());
  }

  Uint8List _encrypt(Uint8List plaintext, Uint8List key, Uint8List nonce) {
    final aes = AESEngine();
    final gcm = GCMBlockCipher(aes);
    final params = AEADParameters(
      KeyParameter(key),
      _tagLength * 8,
      nonce,
      Uint8List(0),
    );
    gcm.init(true, params);

    final output = Uint8List(plaintext.length + _tagLength);
    final len = gcm.processBytes(plaintext, 0, plaintext.length, output, 0);
    gcm.doFinal(output, len);
    return output;
  }

  Uint8List _decrypt(Uint8List input, Uint8List key, Uint8List nonce) {
    if (input.length < _tagLength) {
      throw ArgumentError('Ciphertext demasiado corto.');
    }
    final aes = AESEngine();
    final gcm = GCMBlockCipher(aes);
    final params = AEADParameters(
      KeyParameter(key),
      _tagLength * 8,
      nonce,
      Uint8List(0),
    );
    gcm.init(false, params);

    final output = Uint8List(input.length - _tagLength);
    final len = gcm.processBytes(input, 0, input.length, output, 0);
    gcm.doFinal(output, len);
    return output;
  }

  Uint8List _secureRandom(int length) {
    final bytes = Uint8List(length);
    final random = Random.secure();
    for (var i = 0; i < length; i++) {
      bytes[i] = random.nextInt(256);
    }
    return bytes;
  }
}
