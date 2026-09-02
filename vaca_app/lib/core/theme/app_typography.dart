import 'package:flutter/widgets.dart';

/// Escala tipográfica de VACA. Ver `sistema-diseno-app.md` §3.
///
/// Familias: Anderson Grotesk (marca/UI) y JetBrains Mono (datos/hashes).
/// Anderson Grotesk disponible en pesos 300/400/700/800 (no hay Medium 500);
/// los roles "Medium" del brandboard se mapean a 700 para conservar jerarquía.
///
/// Tamaños en logical pixels; el escalado del sistema (hasta 200%) lo aplica
/// Flutter vía MediaQuery.textScaler — NO fijar textScaleFactor.
abstract final class AppTypography {
  static const String brandFont = 'AndersonGrotesk';
  static const String monoFont = 'JetBrainsMono';

  static const TextStyle display = TextStyle(
    fontFamily: brandFont,
    fontWeight: FontWeight.w800,
    fontSize: 34,
    height: 40 / 34,
  );

  static const TextStyle h1 = TextStyle(
    fontFamily: brandFont,
    fontWeight: FontWeight.w700,
    fontSize: 28,
    height: 34 / 28,
  );

  static const TextStyle h2 = TextStyle(
    fontFamily: brandFont,
    fontWeight: FontWeight.w700,
    fontSize: 22,
    height: 28 / 22,
  );

  static const TextStyle h3 = TextStyle(
    fontFamily: brandFont,
    fontWeight: FontWeight.w700,
    fontSize: 18,
    height: 24 / 18,
  );

  static const TextStyle bodyLg = TextStyle(
    fontFamily: brandFont,
    fontWeight: FontWeight.w400,
    fontSize: 16,
    height: 24 / 16,
  );

  static const TextStyle body = TextStyle(
    fontFamily: brandFont,
    fontWeight: FontWeight.w400,
    fontSize: 14,
    height: 20 / 14,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: brandFont,
    fontWeight: FontWeight.w700,
    fontSize: 12,
    height: 16 / 12,
  );

  /// Datos técnicos: hash, folio, rutHash, coordenadas, tx.
  static const TextStyle data = TextStyle(
    fontFamily: monoFont,
    fontWeight: FontWeight.w400,
    fontSize: 14,
    height: 20 / 14,
  );

  static const TextStyle dataSm = TextStyle(
    fontFamily: monoFont,
    fontWeight: FontWeight.w400,
    fontSize: 12,
    height: 16 / 12,
  );
}
