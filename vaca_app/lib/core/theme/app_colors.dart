import 'package:flutter/material.dart';

/// Tokens de color de VACA.
///
/// Fuente de verdad: `Especificaciones/sistema-diseno-app.md` §2.
/// Los valores oscurecidos de `semantic/*` son los calculados para cumplir
/// contraste >= 4.5:1; ajustar aquí si se recalibran en la herramienta de diseño.
abstract final class AppColors {
  // --- Paleta base (marca) ---
  static const Color celadon50 = Color(0xFFF3F7F3);
  static const Color celadon100 = Color(0xFFE2ECE5);
  static const Color celadon = Color(0xFFB8D9C6);
  static const Color celadon300 = Color(0xFFB8D9C6);
  static const Color celadon500 = Color(0xFF7EAD91);
  static const Color celadon700 = Color(0xFF456B58);
  static const Color celadon900 = Color(0xFF1F3B30);
  static const Color ivory = Color(0xFFF8F7F1);
  static const Color stone100 = Color(0xFFE7E7DF);
  static const Color stone300 = Color(0xFFCACDC5);
  static const Color stone600 = Color(0xFF59635D);
  static const Color ink = Color(0xFF17251F);
  static const Color bronze = Color(0xFF9C8058);
  static const Color white = Color(0xFFFFFFFF);

  // --- Neutrales derivados (UI operativa) ---
  static const Color neutral900 = celadon900;
  static const Color neutral800 = Color(0xFF29473A);
  static const Color neutral700 = celadon700;
  static const Color neutral500 = stone600;
  static const Color neutral300 = stone300;
  static const Color neutral100 = celadon50;
  static const Color neutral0 = white;

  // --- Semánticos funcionales ---
  static const Color action = celadon700;
  static const Color success = Color(0xFF35644E);
  static const Color warning = Color(0xFFA86F32);
  static const Color danger = Color(0xFFC44747);
  static const Color criticalGlow = danger;
  static const Color info = Color(0xFF376A7A);

  // --- Trust Score (verdad emergente Nivel 1 -> 2 -> 3) ---
  static const Color trust1 = warning;
  static const Color trust2 = info;
  static const Color trust3 = success;

  static const Color orange = action;
  static const Color deepBlue = celadon900;
  static const Color dustySky = info;
  static const Color terracotta = warning;
  static const Color neonPink = danger;
}
