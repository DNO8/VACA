import 'package:flutter/material.dart';

/// Tokens de color de VACA.
///
/// Fuente de verdad: `Especificaciones/sistema-diseno-app.md` §2.
/// Los valores oscurecidos de `semantic/*` son los calculados para cumplir
/// contraste >= 4.5:1; ajustar aquí si se recalibran en la herramienta de diseño.
abstract final class AppColors {
  // --- Paleta base (marca) ---
  static const Color orange = Color(0xFFFD802E); // Naranja Resiliencia (acción)
  static const Color deepBlue =
      Color(0xFF233D4C); // Azul Profundo (institucional)
  static const Color dustySky =
      Color(0xFFA6C2D4); // Cielo Polvoriento (digital)
  static const Color celadon = Color(0xFFB8D9C6); // Verde Celadón (comunidad)
  static const Color celadon300 = Color(0xFFB8D9C6); // Marca, ilustración
  static const Color celadon500 = Color(0xFF7EAD91); // Acentos secundarios
  static const Color celadon700 = Color(0xFF456B58); // Acción primaria
  static const Color celadon900 = Color(0xFF1F3B30); // Fondo institucional oscuro
  static const Color terracotta = Color(0xFFDBA59E); // Terracota (alerta suave)
  static const Color white = Color(0xFFFFFFFF); // Blanco Puro (dignidad)
  static const Color neonPink = Color(0xFFFF6B9D); // Rosa Neón (glow crítico)

  // --- Neutrales derivados (UI operativa) ---
  static const Color neutral900 = Color(0xFF1A2C36);
  static const Color neutral800 = Color(0xFF233D4C); // = deepBlue
  static const Color neutral700 = Color(0xFF375160);
  static const Color neutral500 = Color(0xFF6B8494);
  static const Color neutral300 = Color(0xFFC3D2DC);
  static const Color neutral100 = Color(0xFFEEF3F6);
  static const Color neutral0 = Color(0xFFFFFFFF);

  // --- Semánticos funcionales ---
  static const Color action = orange;
  static const Color success =
      Color(0xFF2E8B6F); // celadón oscurecido (texto/íconos)
  static const Color warning =
      Color(0xFFC6705F); // terracota oscurecida (texto)
  static const Color danger =
      Color(0xFFD64545); // rojo funcional (errores/destructivo)
  static const Color criticalGlow = neonPink; // solo halo/animación crítica
  static const Color info = dustySky;

  // --- Trust Score (verdad emergente Nivel 1 -> 2 -> 3) ---
  static const Color trust1 = terracotta; // señal temprana
  static const Color trust2 = orange; // consenso
  static const Color trust3 = success; // validado
}
