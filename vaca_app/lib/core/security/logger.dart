import 'dart:developer' as dev;

/// Logger seguro de VACA.
///
/// Nunca registra coordenadas exactas, mensajes en claro, rutas de medios,
/// respuestas de KYC, credenciales, claves o bytes de bundle sin redactar.
class VacaLogger {
  const VacaLogger._();

  static const String _tag = 'VACA';

  /// Registra un evento de depuracion sin datos sensibles.
  static void d(String message, {String? area}) {
    dev.log('[$_tag${area != null ? ' · $area' : ''}] $message');
  }

  /// Registra un evento de informacion.
  static void i(String message, {String? area}) {
    dev.log('[$_tag${area != null ? ' · $area' : ''}] ℹ $message');
  }

  /// Registra un error. El `error` se convierte a string por defecto;
  /// si contiene datos sensibles, usar `redact` antes de llamar.
  static void e(String message, {Object? error, String? area}) {
    final safeError = _redact(error);
    dev.log(
      '[$_tag${area != null ? ' · $area' : ''}] ✕ $message · $safeError',
      error: safeError,
    );
  }

  /// Redacta datos sensibles de un objeto antes de loguear.
  static String redact(Object? value, {String mask = '[REDACTED]'}) {
    if (value == null) return 'null';
    if (value is Map) {
      return value.map(
        (k, v) => MapEntry(
          k.toString(),
          _isSensitiveKey(k.toString()) ? mask : redact(v, mask: mask),
        ),
      ).toString();
    }
    if (value is List) {
      return value.map((e) => redact(e, mask: mask)).toList().toString();
    }
    return _isSensitiveValue(value.toString()) ? mask : value.toString();
  }

  static String _redact(Object? error) => redact(error);

  static bool _isSensitiveKey(String key) {
    final lower = key.toLowerCase();
    return lower.contains('password') ||
        lower.contains('token') ||
        lower.contains('secret') ||
        lower.contains('key') ||
        lower.contains('credential') ||
        lower.contains('coord') ||
        lower.contains('location') ||
        lower.contains('rut') ||
        lower.contains('message');
  }

  static bool _isSensitiveValue(String value) {
    return value.contains('-----BEGIN') ||
        value.contains('sk-') ||
        RegExp(r'\b[A-Za-z0-9]{64}\b').hasMatch(value);
  }
}
