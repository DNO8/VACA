# VACA — Vaquita de Ayuda y Coordinación Activa

Infraestructura cívica de resiliencia para emergencias, desarrollada por **Fundación Camada** (Chile).

> En el Día 0 la información vale más que cualquier recurso: sin datos, la ayuda fluye a ciegas. VACA permite que vecinos y voluntarios reporten lo que ocurre en una emergencia **aunque el teléfono no tenga internet** — cada señal queda sellada en el dispositivo y se entrega cuando vuelve la conectividad, con un recibo firmado que prueba la recepción.

## Qué hay en este repo

| Carpeta | Contenido |
| --- | --- |
| `vaca_app/` | App móvil Flutter offline-first (Android/iOS): captura de incidentes, outbox durable, entrega cifrada y recibos verificables. |

> [!NOTE]
> La documentación del proyecto (especificaciones, brandboard, whitepaper, SOW, changelogs y evidencia de entregables) vive en el **Drive de Fundación Camada**, carpeta `VACA/`. Este repositorio se mantiene deliberadamente como repo de código de la app.

## Repos relacionados

- [`VACA-web`](https://github.com/DNO8/VACA-web) — demo web del riel de ayuda sobre Stellar Testnet (globo interactivo, tokenización, claimable balances, multifirma).
- [`VACA-prototipo-visual`](https://github.com/DNO8/VACA-prototipo-visual) — prototipo visual de referencia (Figma Make, 15 pantallas).

## Lo esencial de la app

- **Offline-first real**: wizard de 4 pasos (categoría → ubicación → detalles → foto) que persiste en Drift/SQLite con hash SHA-256, timestamp EXIF y GPS.
- **Store-and-forward verificable**: bundles CBOR cifrados AES-256-GCM y firmados Ed25519; Supabase acepta atómicamente y devuelve recibo firmado que el dispositivo verifica.
- **Estados honestos**: guardado local ≠ recepción institucional; el recibo prueba recepción técnica, nunca atención.
- **Sin barreras de emergencia**: captura P0/P1 disponible como invitado; permisos y KYC (Didit, sandbox) siempre opcionales.
- **Wallet Stellar testnet**: keypair Ed25519, seed en secure storage, Friendbot y balance Horizon — herramienta de desarrollo aislada del dominio.
- **Accesibilidad**: Semantics con valores, contraste ≥4.5:1 y tolerancia a escala de texto 200%.

## Verificación

```powershell
cd vaca_app
flutter pub get
flutter analyze
flutter test                              # 61 tests, incluye harness visual
flutter test test/visual_audit_golden_test.dart
flutter build apk --debug --flavor dev
```

Detalles de setup, flavors y fundamentos en [`vaca_app/README.md`](vaca_app/README.md) y [`vaca_app/SETUP.md`](vaca_app/SETUP.md).

## Alcance honesto

> [!WARNING]
> VACA es una herramienta comunitaria independiente — **no está afiliada ni respaldada por organismos de gobierno ni servicios de emergencia**. Ante riesgo vital, usar siempre los canales oficiales (Chile: 131 SAMU, 132 Bomberos, 133 Carabineros). Una señal guardada localmente aún no fue recibida por ninguna institución: el recibo del servidor prueba recepción técnica, nunca atención.
