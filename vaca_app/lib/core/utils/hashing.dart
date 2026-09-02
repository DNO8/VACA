import 'dart:io';

import 'package:crypto/crypto.dart';

/// Utilidades de hashing para privacidad (Ley 19.628) e integridad de evidencia.
/// Ver `Especificaciones/modelo-datos-fibe.md` §6.
abstract final class Hashing {
  /// Normaliza un RUT chileno: quita puntos/guiones y pasa el dígito
  /// verificador a mayúscula. Ej: "12.345.678-k" -> "12345678K".
  static String normalizeRut(String rut) {
    return rut.replaceAll(RegExp(r'[.\-\s]'), '').toUpperCase();
  }

  /// `rutHash = SHA-256(rutNormalizado + salt)`. La sal vive en el
  /// EmergencyEvent y permite cruces dentro de un evento sin exponer el RUT.
  /// El RUT en claro NUNCA se persiste ni se transmite.
  static String rutHash(String rut, String salt) {
    final input = '${normalizeRut(rut)}$salt';
    return sha256.convert(input.codeUnits).toString();
  }

  /// Hash genérico de un documento de identidad (mismo tratamiento).
  static String documentHash(String documento, String salt) {
    final input = '${documento.trim().toUpperCase()}$salt';
    return sha256.convert(input.codeUnits).toString();
  }

  /// SHA-256 de un archivo (integridad de la evidencia fotográfica).
  static Future<String> fileSha256(File file) async {
    final bytes = await file.readAsBytes();
    return sha256.convert(bytes).toString();
  }
}
