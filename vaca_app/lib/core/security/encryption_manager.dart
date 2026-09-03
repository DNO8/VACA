import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:pointycastle/api.dart';
import 'package:pointycastle/block/aes.dart';
import 'package:pointycastle/block/modes/gcm.dart';
import 'package:pointycastle/digests/sha256.dart';
import 'package:pointycastle/key_derivators/api.dart';
import 'package:pointycastle/key_derivators/hkdf.dart';

import '../result/result.dart';

/// Gestor de cifrado local con AES-256-GCM usando pointycastle.
///
/// Usa HKDF-SHA256 para derivar una clave de 32 bytes a partir de
/// `keyMaterial` y un salt aleatorio. Cada operacion genera un nonce de 12
/// bytes aleatorio. El tag de autenticacion de 16 bytes se concatena al
/// ciphertext.
class EncryptionManager {
  const EncryptionManager();

  static const int _keyLength = 32;
  static const int _nonceLength = 12;
  static const int _tagLength = 16;

  /// Cifra `plaintext` con una clave derivada de `keyMaterial`.
  Result<SealedData> seal(Uint8List plaintext, String keyMaterial) {
    try {
      final nonce = _secureNonce(_nonceLength);
      final salt = _secureNonce(16);
      final key = _deriveKey(keyMaterial, salt);

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

      return Success(
        SealedData(
          ciphertext: base64Encode(output),
          nonce: base64Encode(nonce),
          salt: base64Encode(salt),
        ),
      );
    } catch (e) {
      return Failure(
        VacaError(
          code: 'encryption_seal',
          message: 'No se pudo cifrar el payload.',
          cause: e,
        ),
      );
    }
  }

  /// Descifra y verifica `sealedData`.
  Result<Uint8List> unseal(SealedData sealedData, String keyMaterial) {
    try {
      final nonce = base64Decode(sealedData.nonce);
      final salt = base64Decode(sealedData.salt);
      final key = _deriveKey(keyMaterial, salt);
      final input = base64Decode(sealedData.ciphertext);

      if (input.length < _tagLength) {
        return const Failure(
          VacaError(
            code: 'encryption_unseal',
            message: 'Ciphertext demasiado corto.',
          ),
        );
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

      return Success(output);
    } catch (e) {
      return Failure(
        VacaError(
          code: 'encryption_unseal',
          message: 'No se pudo descifrar el payload o tag invalido.',
          cause: e,
        ),
      );
    }
  }

  Uint8List _deriveKey(String material, Uint8List salt) {
    final input = utf8.encode(material);
    final hkdf = HKDFKeyDerivator(SHA256Digest());
    hkdf.init(HkdfParameters(input, _keyLength, salt));
    return hkdf.process(Uint8List(0));
  }

  Uint8List _secureNonce(int length) {
    final nonce = Uint8List(length);
    final random = Random.secure();
    for (var i = 0; i < length; i++) {
      nonce[i] = random.nextInt(256);
    }
    return nonce;
  }
}

/// Datos cifrados con nonce y salt.
///
/// El tag de autenticacion GCM esta concatenado al ciphertext.
class SealedData {
  const SealedData({
    required this.ciphertext,
    required this.nonce,
    required this.salt,
  });

  final String ciphertext;
  final String nonce;
  final String salt;

  Map<String, dynamic> toJson() => {
        'ciphertext': ciphertext,
        'nonce': nonce,
        'salt': salt,
      };

  factory SealedData.fromJson(Map<String, dynamic> json) => SealedData(
        ciphertext: json['ciphertext'] as String,
        nonce: json['nonce'] as String,
        salt: json['salt'] as String,
      );
}
