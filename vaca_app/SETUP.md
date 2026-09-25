# VACA app — Configuración de desarrollo

## Fuentes normativas

Viven en el Drive de Fundación Camada, carpeta `VACA/`:

- `01 Producto/Estrategia y requisitos/` — spec del MVP público y flujo de la app.
- `01 Producto/Desarrollo y QA/` — arquitectura DTN híbrida, mesh-comunicaciones, modelo de datos y release/security readiness.
- `01 Producto/Diseño UX UI/` — sistema de diseño de la app.

Los handoffs y backlogs fechados no redefinen el producto.

## Prerrequisitos

- Flutter y Dart compatibles con `pubspec.yaml`.
- Android SDK/API configurado para el target vigente.
- macOS, Xcode y cuenta autorizada para archives iOS.
- Dispositivo/emulador Android; iPhone/simulador para validación iOS.
- Supabase CLI y Docker sólo cuando se ejecuten pruebas locales del backend.

Verificar:

```powershell
flutter doctor -v
```

## Dependencias y código generado

```powershell
flutter pub get
dart run build_runner build --delete-conflicting-outputs
```

> [!IMPORTANT]
> No edites manualmente `database.g.dart`. Toda evolución de esquema requiere migración y regeneración verificable.

## Flavors

```text
dev             desarrollo local
public          aplicación pública Android/iOS
municipalPilot  despliegue Android administrado con BLE
```

Todo release debe recibir `FLAVOR` mediante `dart-define` y fallar cerrado si falta configuración obligatoria.

Ejecución local conectada al backend autorizado:

```powershell
.\run-dev.ps1
```

El launcher lee `..\supabase\.env` y exige `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SERVER_BUNDLE_PUBLIC_KEY` y
`SERVER_RECEIPT_PUBLIC_KEY`. Así evita compilar accidentalmente con trust roots
vacíos u obsoletos. Si hay más de un Android conectado, usa
`.\run-dev.ps1 -DeviceId <id>`.

> [!CAUTION]
> Nunca coloques en el cliente:
>
> - Secretos de Didit/KYC.
> - Service-role keys.
> - Claves privadas de recibos.
> - Claves simétricas globales capaces de descifrar payloads.

> [!NOTE]
> La anon/publishable key de Supabase puede identificar el proyecto, pero no reemplaza autenticación ni autorización.

## Fuentes

Las familias declaradas en `pubspec.yaml` deben existir bajo `assets/fonts/` para que la app funcione offline.

## Permisos

### Público

- Cámara bajo demanda.
- Ubicación en uso bajo demanda.
- Internet y estado de red.
- Sin permisos BLE de relay/gateway.

### Municipal pilot

Añade permisos Bluetooth y foreground service sólo en el source set/flavor autorizado. Debe mostrar notificación y control de detención.

### iOS

Mantener purpose strings, privacy manifest y capabilities alineados con el comportamiento real. El build público no declara relay BLE.

## Verificación

```powershell
dart format --output=none --set-exit-if-changed lib test
dart run build_runner build --delete-conflicting-outputs
dart analyze
flutter test
flutter test integration_test
flutter build appbundle --release --flavor public --dart-define=FLAVOR=public
flutter build apk --release --flavor municipalPilot --dart-define=FLAVOR=municipalPilot
```

El build iOS se valida en macOS/Xcode. Las pruebas físicas y del backend no se sustituyen por compilación.

## Estructura

```text
lib/
  core/
    bundle/       codec, cifrado, firma, outbox y scheduler
    config/       flavors y configuración tipada
    security/     almacenamiento y claves
    transport/    adapters de enlace y contrato del servidor
    theme/        sistema visual
  data/local/     Drift y migraciones
  features/
    identity/     perfil y KYC boundary
    incident/     dominio y pantallas
    capture/      cámara y metadata
```

> [!NOTE]
> El backend Supabase (migraciones `001`–`010` y Edge Functions) no vive en este repo: está en Drive `VACA/01 Producto/Desarrollo y QA/supabase/`.
