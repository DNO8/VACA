/// Escala de espaciado (grid base 4dp). Ver `sistema-diseno-app.md` §4.
abstract final class AppSpacing {
  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 48;

  /// Padding lateral de pantalla en Modo Operación.
  static const double screenPadding = 16;

  /// Padding lateral de pantalla en Modo Marca.
  static const double screenPaddingBrand = 24;

  /// Target táctil mínimo (obligatorio SOW).
  static const double minTouchTarget = 48;
}
