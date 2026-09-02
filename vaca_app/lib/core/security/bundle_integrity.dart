import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// Integridad de bundle canonico: hash y verificacion de carga.
///
/// No implementa criptografia manual; usa SHA-256 de `package:crypto`.
abstract final class BundleIntegrity {
  /// Hash SHA-256 de un string JSON canonico.
  static String hashCanonical(String canonicalJson) {
    final bytes = utf8.encode(canonicalJson);
    return sha256.convert(bytes).toString();
  }

  /// Hash SHA-256 de bytes (adjunto cifrado).
  static String hashBytes(Uint8List bytes) {
    return sha256.convert(bytes).toString();
  }

  /// Verifica que el payload coincida con el hash declarado.
  static bool verifyCanonical(String canonicalJson, String expectedHash) {
    return hashCanonical(canonicalJson) == expectedHash;
  }
}
