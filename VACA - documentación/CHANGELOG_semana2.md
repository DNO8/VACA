# Changelog — Entregable Semana 2 (Instawards VACA)

**Proyecto:** VACA (Vaquita de Ayuda y Coordinación Activa)  
**Periodo:** Semana 2 — Offline Data Capture MVP & Wallet Foundation  
**SOW de referencia:** `Statement of Work (SOW) — Instawards.md`  
**Repo:** `https://github.com/DNO8/VACA-demo`  
**Fecha del changelog:** 2026-09-12  

---

## 1. Resumen ejecutivo

| Entregable semana 2 | Estado global | Nota |
| --- | --- | --- |
| Prototipos visuales y UI final de formularios offline | **Completo** | Prototipo Figma Make con 15 pantallas como fuente de verdad visual; contrato prototipo→móvil congelado en repo y UI ya implementada en Flutter con el design system celadón. |
| Módulo de formulario offline funcional (SQLite, hashes, timestamps) | **Completo** | Flujo de captura en 4 pasos (categoría, ubicación, datos, foto) que persiste en Drift/SQLite con hash SHA-256, timestamp EXIF y GPS. |
| Backend cloud (Supabase) con tablas y storage | **Completo en código; despliegue por verificar** | 5 edge functions + 4 migraciones + bucket de storage en `supabase/`; falta evidencia de despliegue vivo. |
| Wallet Stellar testnet (keypair, secure storage, friendbot, balance) | **Completo** | Wallet real sobre testnet: keypair Ed25519, seed en `flutter_secure_storage`, fondeo vía Friendbot y balance consultado en Horizon. |

**Logro adicional:** durante la semana 2 también se implementó la entrega segura de paquetes (outbox + bundles cifrados AES-256-GCM firmados Ed25519 + recibos de servidor verificados) y el flujo de onboarding completo con consentimiento y permisos — alcance que el SOW reservaba a la semana 3.

---

## 2. Entregable 2 — Offline Data Capture MVP & Wallet Foundation

### 2.1 Prototipos visuales y UI final

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Prototipo interactivo | **Completo** | Archivo Figma Make (15 pantallas, iPhone 14 390×844) | Flows: onboarding, KYC, captura offline, sync, settings, wallet. Prompt y referencias en `Markdowns/figma-make-prototype-prompt.md`. |
| Contrato prototipo→móvil | **Completo** | Commit `5357df1` (`docs: freeze prototype-to-mobile contract`) | Congela assets, tokens y flows para el handoff. |
| Design system implementado | **Completo** | `vaca_app/lib/core/theme/` + `vaca_app/lib/core/widgets/` | Paleta celadón, tipografías Anderson Grotesk/JetBrains Mono, `VacaButton`, `VacaTextField`, `VacaHero`, `EmptyState`, badges de prioridad/sync. |
| Onboarding visual | **Completo** | `vaca_app/lib/features/onboarding/presentation/onboarding_flow.dart` | Intro de marca, disclaimer de emergencia, permisos just-in-time, elección de identidad. Transición de arranque brandeada (`0901ec4`). |

### 2.2 Módulo de formulario offline funcional

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Captura offline con persistencia local | **Completo** | `vaca_app/lib/features/incident/` | Wizard de 4 pasos: categoría, ubicación, datos mínimos, foto. Persiste inmediato en Drift/SQLite sin red (`savedLocally` → `queued`). |
| Esquema de registro local | **Completo** | `vaca_app/lib/data/local/tables.dart`, `enums.dart` | Incidente con categoría, prioridad, personas, nota, lat/long/precisión, fuente de ubicación, estado, assurance de identidad. El dominio activo usa taxonomía propia de incidentes (FIBE quedó retirado del alcance vigente). |
| Foto con hash y timestamp | **Completo** | `vaca_app/lib/features/capture/` | Copia a caché de evidencia, SHA-256 del archivo, timestamp EXIF, GPS opcional. Fallbacks ante permiso denegado o sin cámara. |
| Lista de señales + detalle + ciclo de vida | **Completo** | `incident_list_screen.dart`, `incident_detail_screen.dart` | Lista offline con estado, detalle con actualizar/cancelar señal, confirmación local explícita ("no confirma recepción institucional"). |
| Cola de salida durable | **Completo** | `vaca_app/lib/core/bundle/bundle_queue_service.dart`, `bundle_scheduler.dart` | Outbox persistido con backoff exponencial, presupuesto de copias y registro append-only de eventos. |

### 2.3 Backend cloud (Supabase)

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Edge functions | **Completo en código** | `supabase/functions/` | `bundle-ingest`, `attachment-authorize`, `account-deletion`, `kyc-session`, `kyc-webhook` + helpers compartidos (device-auth, encoding). |
| Migraciones y storage | **Completo en código** | `supabase/migrations/` | `001_initial_schema`, `002_delete_identity`, `003_storage_bucket`, `004_security_hardening`. |
| Contrato cliente | **Completo** | `vaca_app/lib/core/transport/supabase_contract.dart` | Entrega de bundle con recibo firmado verificado contra `SERVER_RECEIPT_PUBLIC_KEY`; falla cerrado si falta config. |
| Despliegue vivo | **Pendiente de evidencia** | — | Código listo; falta captura/URL que demuestre el entorno desplegado. |

### 2.4 Wallet Stellar testnet

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Generación de keypair | **Completo** | `vaca_app/lib/features/wallet/domain/stellar_wallet_service.dart` | `KeyPair.random()` real sobre Stellar testnet. |
| Almacenamiento seguro | **Completo** | `secure_storage.dart` | Secret seed en `flutter_secure_storage`; nunca se muestra en pantalla ni entra a logs/Drift/payloads. |
| Fondeo Friendbot | **Completo** | `stellar_wallet_service.dart` (`fund`) | `FriendBot.fundTestAccount` con manejo de rechazo/error de red. |
| Visibilidad de balance | **Completo** | `stellar_wallet_screen.dart` | Balance XLM consultado en Horizon; estados `FINANCIADA`/`SIN FONDOS`; copiar clave pública. |
| Aislamiento del dominio | **Completo** | `Especificaciones/01-public-mvp-product-spec.md` | Wallet marcada como herramienta de desarrollo testnet, aislada de señales, identidad, elegibilidad y ayuda. |

---

## 3. Estado del entregable semana 2 vs. evidencia esperada

| Evidencia esperada (SOW 6.1) | Estado | Cómo verificarla |
| --- | --- | --- |
| Prototipos Figma interactivos | **Completo** | Primer prototipo publicado en `https://chute-morph-24559766.figma.site`; prototipo completo (15 pantallas) en el repo `VACA-prototipo-visual`. |
| Grabación corta de captura offline y guardado local | **Completo** | Video del entregable 2 producido por el equipo; muestra captura offline, guardado local y creación + fondeo de la wallet dentro de la app. |
| Screenshot de wallet Stellar testnet con balance financiado | **Completo (cubierto por el video)** | El video evidencia la creación de la wallet y el fondeo Friendbot dentro de la app mobile; un screenshot fijo queda como respaldo opcional. |

---

## 4. Avance acumulado adicional (fuera del entregable semana 2)

| Área | Logro | Evidencia principal |
| --- | --- | --- |
| Entrega segura (adelanto S3) | Paquetes cifrados AES-256-GCM, firmados Ed25519, con recibo de servidor verificado criptográficamente y pantalla de recibo. | `vaca_app/lib/core/bundle/`, `core/security/`, `features/delivery/` |
| Identidad KYC | Adapter Didit real con firma de request por dispositivo y stub fail-closed sin credenciales. | `features/identity/data/didit_kyc_adapter.dart` |
| UX de marca | Startup brandeada, splash/launcher alineados a tema, onboarding responsivo. | Commits `0901ec4`–`47e015d` (2026-09-11) |
| Ortografía de UI | Corrección de tildes en strings visibles, labels Semantics y mensajes de error. | Working tree (pendiente de commit) |

---

## 5. Bloqueadores y riesgos actuales

| # | Bloqueador/riesgo | Impacto | Propietario | Mitigación |
| --- | --- | --- | --- | --- |
| 1 | Sin evidencia de Supabase desplegado | Medio — evidencia | Marcos/Danilo | Capturar dashboard de Supabase con funciones desplegadas o URL pública de `bundle-ingest`. |
| 2 | Discrepancia SOW↔alcance vigente (FIBE/Stellar aid retirados) | Medio — contractual | Danilo | La app entrega captura offline equivalente con taxonomía propia; alinear con Ambassador antes del cierre si se exige literalidad FIBE. |

---

## 6. Cómo se verifica el progreso técnico

```bash
# Desde c:\Users\DNO\Desktop\workspace\VACA\vaca_app
flutter pub get
flutter analyze
flutter test
flutter build apk --debug --flavor dev
```

Resultados actuales (2026-09-12):
- `flutter analyze` → `No issues found!`
- `flutter test` → `+30: All tests passed!`

---

*Última actualización por el equipo de desarrollo. Este changelog refleja el estado del repositorio al 12 de septiembre de 2026.*
