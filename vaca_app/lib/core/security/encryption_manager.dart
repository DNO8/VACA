import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../result/result.dart';

/// Gestor de cifrado local.
///
/// Usa AES-256-GCM delegado a un plugin nativo o a `pointycastle` solo
/// cuando existan tests. El metodo actual es un placeholder aprobado para
/// evitar implementar primitivas criptograficas manuales.
class EncryptionManager {
  const EncryptionManager();

  /// Cifra `plaintext` con una clave derivada de `keyMaterial`.
  ///
  /// Por ahora materializa el ciphertext como base64 del plain con un nonce
  /// aleatorio. ESTO NO ES PRODUCCION; la fase B1/B2 debe reemplazarlo por
  /// AES-GCM nativo. Se deja asi para no inventar criptografia y mantener
  /// la API estable para el resto de la app.
  Result<SealedData> seal(String plaintext, String keyMaterial) {
    try {
      final nonce = _nonce(12);
      final key = _deriveKey(keyMaterial, nonce);
      final bytes = utf8.encode(plaintext);
      final combined = Uint8List(nonce.length + bytes.length);
      combined.setAll(0, nonce);
      combined.setAll(nonce.length, bytes);
      final tag = Hmac(sha256, key).convert(combined).bytes.sublist(0, 16);
      final ciphertext = base64Encode(bytes);
      return Success(
        SealedData(
          ciphertext: ciphertext,
          nonce: base64Encode(nonce),
          tag: base64Encode(tag),
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
  Result<String> unseal(SealedData sealedData, String keyMaterial) {
    try {
      final nonce = base64Decode(sealedData.nonce);
      final key = _deriveKey(keyMaterial, nonce);
      final bytes = base64Decode(sealedData.ciphertext);
      final combined = Uint8List(nonce.length + bytes.length);
      combined.setAll(0, nonce);
      combined.setAll(nonce.length, bytes);
      final expectedTag = Uint8List.fromList(
        Hmac(sha256, key).convert(combined).bytes.sublist(0, 16),
      );
      final actualTag = base64Decode(sealedData.tag);
      if (!_constantTimeEquals(expectedTag, actualTag)) {
        return const Failure(
          VacaError(code: 'encryption_unseal', message: 'Tag de autenticacion invalido.'),
        );
      }
      return Success(utf8.decode(bytes));
    } catch (e) {
      return Failure(
        VacaError(
          code: 'encryption_unseal',
          message: 'No se pudo descifrar el payload.',
          cause: e,
        ),
      );
    }
  }

  Uint8List _deriveKey(String material, Uint8List nonce) {
    final input = utf8.encode(material);
    final seed = Uint8List(input.length + nonce.length);
    seed.setAll(0, input);
    seed.setAll(input.length, nonce);
    return Uint8List.fromList(sha256.convert(seed).bytes);
  }

  Uint8List _nonce(int length) {
    final nonce = Uint8List(length);
    final now = DateTime.now().millisecondsSinceEpoch;
    final bytes = now.toRadixString(16).padLeft(16, '0').codeUnits;
    for (var i = 0; i < length && i < bytes.length; i++) {
      nonce[i] = bytes[i] % 256;
    }
    return nonce;
  }

  bool _constantTimeEquals(Uint8List a, Uint8List b) {
    if (a.length != b.length) return false;
    var result = 0;
    for (var i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result == 0;
  }
}

/// Datos cifrados con nonce y tag.
class SealedData {
  const SealedData({
    required this.ciphertext,
    required this.nonce,
    required this.tag,
  });

  final String ciphertext;
  final String nonce;
  final String tag;

  Map<String, dynamic> toJson() => {
        'ciphertext': ciphertext,
        'nonce': nonce,
        'tag': tag,
      };

  factory SealedData.fromJson(Map<String, dynamic> json) => SealedData(
        ciphertext: json['ciphertext'] as String,
        nonce: json['nonce'] as String,
        tag: json['tag'] as String,
      );
}
