import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_radius.dart' show AppRadius;
import 'app_typography.dart';

export 'app_colors.dart';
export 'app_radius.dart';
export 'app_spacing.dart';
export 'app_typography.dart';

/// Tokens semánticos de VACA que no caben en el [ColorScheme] estándar
/// (Trust Score, estados de sync, colores funcionales). Se acceden vía
/// `Theme.of(context).extension<VacaTokens>()`.
@immutable
class VacaTokens extends ThemeExtension<VacaTokens> {
  const VacaTokens({
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
    required this.criticalGlow,
    required this.trust1,
    required this.trust2,
    required this.trust3,
    required this.syncPending,
    required this.syncing,
    required this.synced,
    required this.syncConflict,
    required this.syncError,
  });

  final Color success;
  final Color warning;
  final Color danger;
  final Color info;
  final Color criticalGlow;

  // Trust Score (verdad emergente)
  final Color trust1;
  final Color trust2;
  final Color trust3;

  // Estados de sincronización
  final Color syncPending;
  final Color syncing;
  final Color synced;
  final Color syncConflict;
  final Color syncError;

  static const VacaTokens standard = VacaTokens(
    success: AppColors.success,
    warning: AppColors.warning,
    danger: AppColors.danger,
    info: AppColors.info,
    criticalGlow: AppColors.criticalGlow,
    trust1: AppColors.trust1,
    trust2: AppColors.trust2,
    trust3: AppColors.trust3,
    syncPending: AppColors.neutral500,
    syncing: AppColors.orange,
    synced: AppColors.success,
    syncConflict: AppColors.terracotta,
    syncError: AppColors.danger,
  );

  @override
  VacaTokens copyWith({
    Color? success,
    Color? warning,
    Color? danger,
    Color? info,
    Color? criticalGlow,
    Color? trust1,
    Color? trust2,
    Color? trust3,
    Color? syncPending,
    Color? syncing,
    Color? synced,
    Color? syncConflict,
    Color? syncError,
  }) {
    return VacaTokens(
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      info: info ?? this.info,
      criticalGlow: criticalGlow ?? this.criticalGlow,
      trust1: trust1 ?? this.trust1,
      trust2: trust2 ?? this.trust2,
      trust3: trust3 ?? this.trust3,
      syncPending: syncPending ?? this.syncPending,
      syncing: syncing ?? this.syncing,
      synced: synced ?? this.synced,
      syncConflict: syncConflict ?? this.syncConflict,
      syncError: syncError ?? this.syncError,
    );
  }

  @override
  VacaTokens lerp(ThemeExtension<VacaTokens>? other, double t) {
    if (other is! VacaTokens) return this;
    return VacaTokens(
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      info: Color.lerp(info, other.info, t)!,
      criticalGlow: Color.lerp(criticalGlow, other.criticalGlow, t)!,
      trust1: Color.lerp(trust1, other.trust1, t)!,
      trust2: Color.lerp(trust2, other.trust2, t)!,
      trust3: Color.lerp(trust3, other.trust3, t)!,
      syncPending: Color.lerp(syncPending, other.syncPending, t)!,
      syncing: Color.lerp(syncing, other.syncing, t)!,
      synced: Color.lerp(synced, other.synced, t)!,
      syncConflict: Color.lerp(syncConflict, other.syncConflict, t)!,
      syncError: Color.lerp(syncError, other.syncError, t)!,
    );
  }
}

/// Tema de VACA. Modo Operación = temas claro/oscuro sobrios y de alto contraste.
/// Las superficies institucionales amplían la misma paleta sin alterar los
/// estados funcionales. Ver `sistema-diseno-app.md` §1 y §10.
abstract final class AppTheme {
  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: AppColors.celadon700,
      onPrimary: AppColors.white,
      secondary: AppColors.celadon500,
      onSecondary: AppColors.ink,
      tertiary: AppColors.bronze,
      onTertiary: AppColors.white,
      error: AppColors.danger,
      onError: AppColors.white,
      surface: isDark ? AppColors.neutral800 : AppColors.ivory,
      onSurface: isDark ? AppColors.white : AppColors.ink,
      surfaceContainerHighest:
          isDark ? AppColors.celadon900 : AppColors.celadon100,
      outline: isDark ? AppColors.celadon500 : AppColors.stone300,
    );
    final baseText = isDark ? AppColors.white : AppColors.ink;
    final textTheme = TextTheme(
      displayLarge: AppTypography.display.copyWith(color: baseText),
      headlineLarge: AppTypography.h1.copyWith(color: baseText),
      headlineMedium: AppTypography.h2.copyWith(color: baseText),
      titleLarge: AppTypography.h3.copyWith(color: baseText),
      bodyLarge: AppTypography.bodyLg.copyWith(color: baseText),
      bodyMedium: AppTypography.body.copyWith(color: baseText),
      labelSmall: AppTypography.caption.copyWith(color: baseText),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor:
          isDark ? AppColors.celadon900 : AppColors.celadon50,
      colorScheme: colorScheme,
      fontFamily: AppTypography.brandFont,
      textTheme: textTheme,
      extensions: const <ThemeExtension<dynamic>>[VacaTokens.standard],
      appBarTheme: AppBarTheme(
        backgroundColor: isDark ? AppColors.celadon900 : AppColors.ivory,
        foregroundColor: isDark ? AppColors.white : AppColors.ink,
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0,
        shape: const Border(
          bottom: BorderSide(color: AppColors.stone100),
        ),
        titleTextStyle: AppTypography.h3.copyWith(
          color: isDark ? AppColors.white : AppColors.ink,
        ),
      ),
      cardTheme: CardThemeData(
        color: isDark ? AppColors.neutral800 : AppColors.ivory,
        elevation: 0,
        shape: RoundedRectangleBorder(
          side: BorderSide(color: colorScheme.outline),
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.celadon700,
          foregroundColor: AppColors.white,
          minimumSize: const Size.fromHeight(52),
          textStyle: AppTypography.bodyLg.copyWith(fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.celadon700,
          minimumSize: const Size.fromHeight(52),
          side: const BorderSide(color: AppColors.celadon700),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? AppColors.neutral800 : AppColors.ivory,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.sm),
          borderSide: BorderSide(color: colorScheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.sm),
          borderSide: const BorderSide(color: AppColors.celadon700, width: 2),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: isDark ? AppColors.neutral800 : AppColors.ivory,
        indicatorColor: isDark ? AppColors.celadon700 : AppColors.celadon100,
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: isDark
                ? selected
                    ? AppColors.white
                    : AppColors.celadon300
                : selected
                    ? AppColors.celadon900
                    : AppColors.stone600,
          );
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return AppTypography.caption.copyWith(
            color: isDark
                ? selected
                    ? AppColors.white
                    : AppColors.celadon300
                : selected
                    ? AppColors.celadon900
                    : AppColors.stone600,
          );
        }),
      ),
    );
  }
}

/// Atajo para acceder a los tokens semánticos desde un [BuildContext].
extension VacaTokensX on BuildContext {
  VacaTokens get tokens =>
      Theme.of(this).extension<VacaTokens>() ?? VacaTokens.standard;
}
