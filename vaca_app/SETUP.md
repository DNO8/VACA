# VACA App — Setup (Deliverable 1)

Andamiaje del proyecto Flutter (Clean Architecture + Riverpod + Drift). Este repositorio se creó **manualmente** (el entorno donde se generó no tenía Flutter instalado), por lo que faltan las carpetas de plataforma (`android/`, etc.) y el código generado por Drift/Riverpod. Estos pasos las hidratan.

> Referencias de diseño e ingeniería: `../Especificaciones/modelo-datos-fibe.md`, `../Especificaciones/sistema-diseno-app.md`, `../Especificaciones/flujo-app.md`, `../Especificaciones/mesh-comunicaciones.md`.

## 0. Prerrequisitos
- Flutter SDK ≥ 3.22 (Dart ≥ 3.4). Instalación: https://docs.flutter.dev/get-started/install/windows
- Android SDK (API 26+; target reciente) + un dispositivo/emulador Android.
- Verificar: `flutter doctor`

## 1. Hidratar las carpetas de plataforma
Desde la carpeta `vaca_app/` (no borra `lib/` ni `pubspec.yaml` existentes):

```powershell
flutter create . --org cl.vaca --project-name vaca_app --platforms android
```

> Si `flutter create` regenera `pubspec.yaml`, restaurarlo desde control de versiones (git) para conservar dependencias y fuentes.

## 2. Colocar las fuentes
Crear `assets/fonts/` y copiar:

```powershell
mkdir assets\fonts
copy "..\font\Anderson Grotesk\*.otf" assets\fonts\
```

Descargar **JetBrains Mono** (OFL, gratuita — https://www.jetbrains.com/lp/mono/ o Google Fonts) y colocar en `assets/fonts/`:
- `JetBrainsMono-Regular.ttf`
- `JetBrainsMono-Medium.ttf`
- `JetBrainsMono-Bold.ttf`

## 3. Instalar dependencias
```powershell
flutter pub get
```

## 4. Generar código (Drift + Riverpod)
```powershell
dart run build_runner build --delete-conflicting-outputs
```
Esto genera `database.g.dart` (Drift) y los `*.g.dart` de Riverpod. Repetir tras cambios de esquema, o usar `watch`:
```powershell
dart run build_runner watch --delete-conflicting-outputs
```

## 5. Permisos Android
Tras `flutter create`, agregar a `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
<!-- Mesh (fase posterior): BLUETOOTH_SCAN / BLUETOOTH_ADVERTISE / BLUETOOTH_CONNECT -->
```
En `android/app/build.gradle`: `minSdkVersion 26`.

## 6. Ejecutar
```powershell
flutter run
```

## Estructura del proyecto
```
lib/
  main.dart                     # entrypoint + ProviderScope
  app.dart                      # MaterialApp + tema
  core/
    theme/                      # tokens de diseño (colores, tipografía, spacing, radios, tema)
    transport/                  # interfaz Transport/MeshTransport + InternetTransport (stub)
    permissions/                # PermissionService (cámara + GPS)
    utils/                      # hashing SHA-256 (rutHash, hash de archivos)
  data/
    local/                      # Drift: enums, tablas, base de datos
  domain/                       # (fases siguientes) entidades y contratos de repositorio
  features/                     # (fases siguientes) captura FIBE, wallet, sync, etc.
```

## Estado de verificación
Los archivos fuente **no se compilaron** en el entorno de origen (sin Flutter). Ejecutar los pasos 3–4 puede requerir ajustar versiones de paquetes en `pubspec.yaml` según lo que resuelva `pub get`. Los archivos `*.g.dart` referenciados por `part` existirán recién tras el paso 4.
