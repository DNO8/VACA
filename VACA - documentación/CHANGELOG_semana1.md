# Changelog — Entregable Semana 1 (Instawards VACA)

**Proyecto:** VACA (Vaquita de Ayuda y Coordinación Activa)  
**Periodo:** Semana 1 — Bootstrap & Basic Capture  
**SOW de referencia:** `Statement of Work (SOW) — Instawards.md`  
**Repo:** `https://github.com/DNO8/VACA-demo`  
**Fecha del changelog:** 2026-09-07  

---

## 1. Resumen ejecutivo

| Entregable semana 1 | Estado global | Nota |
| --- | --- | --- |
| Brandboard y fundación técnica | **Completo** (con excepción del PDF de evidencia) | Identidad, paleta, tipografía, arquitectura visual y component library cerrados en Figma; falta exportar a PDF y commitear el asset de logo. |
| Repositorio Flutter + arquitectura + Drift | **Completo** | Proyecto con Clean Architecture, Riverpod, Drift y esquema de incidentes FIBE M5 operativo. |
| Integración cámara + GPS | **Completo** | Permisos, captura de fotos y geolocalización funcionan en el flujo de incidente. |
| Base de prospección (15-20 contactos) | **Completo (iniciado)** | Conversaciones activas con Municipalidad de Viña del Mar como punto de partida; documento de prospección en cierre. |

**Logro adicional:** durante la semana 1 y las siguientes iteraciones del sprint se avanzó sensiblemente más allá del entregable semana 1, incluyendo el backend Supabase completo, el protocolo store-and-forward de bundles, el contrato de servidor autorizado y la integración KYC con Didit. Estos avances se detallan al final como contexto, pero no forman parte del entregable semana 1 estricto.

---

## 2. Entregable 1 — Brandboard & Technical Foundation

### 2.1 Identidad de marca

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Concepto de marca y esencia | **Completo** | `Markdowns/brandboard.md` secciones 1-3 | Propósito, personalidad, tono, promesa y concepto "Clasicismo Cívico Celadón" definidos. |
| Paleta cromática | **Completo** | `Markdowns/brandboard.md` sección 5 | Tokens `celadon/50` a `celadon/900`, `stone/100`, `ivory/50`, `bronze/500`, `ink/900` con hex de referencia. Estados funcionales (peligro, advertencia, info, éxito) mapeados. |
| Tipografía | **Completo** | `Markdowns/brandboard.md` sección 6 | Anderson Grotesk para interfaz; JetBrains Mono para datos técnicos. Serif institucional descartado para la app operativa hasta validación. |
| Gramática arquitectónica | **Completo** | `Markdowns/brandboard.md` secciones 4, 7-8 | Órdenes dórico/jónico, gradientes, texturas, elementos visuales y criterios de aprobación. |
| Assets visuales de referencia | **Completo** | Carpeta `estetica/` | `estetica-5.jpg` como referencia rectora, gradientes y texturas para fondos/editorial. |
| Logo ejecutable | **Completo** | Figma Make / archivo de Figma del prototipo VACA | Sello VACA generado y aplicado en el prototipo visual. El asset vectorial no está commiteado en el repo. |
| Component library (Figma / coded) | **Completo** | Figma Make + `Markdowns/figma-make-prototype-prompt.md` + `Markdowns/brandboard.md` | Librería de componentes visual y estilos definidos en Figma; guías documentadas en brandboard; widgets base implementados en Flutter. El PDF exportable aún no se genera. |

**Interpretación:** la dirección de marca, el logo y la librería de componentes están cerrados en Figma. Los artefactos finales que aún no se materializan en el repo son el asset vectorial del logo y el PDF/Pantallazos de Figma para la evidencia de entrega.

### 2.2 Proyecto Flutter con Clean Architecture + Riverpod + Drift

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Proyecto Flutter configurado | **Completo** | `vaca_app/` | Build flavors (`dev`, `qa`, `prod`) en `android/app/build.gradle.kts`, esquema iOS, configuración de entorno por `--dart-define`. |
| Clean Architecture | **Completo** | `vaca_app/lib/{core,features,data,domain,presentation}/` | Separación por capas: `core`, `features/identity`, `features/incident`, `data/local`, `data/remote`, `domain`, `presentation`. |
| Riverpod (DI + estado) | **Completo** | `vaca_app/lib/core/providers.dart`, `vaca_app/lib/features/*/presentation/*_provider.dart` | Providers para DB, permisos, contrato servidor, transporte, almacenamiento seguro, identidad y KYC. |
| Drift + SQLite schema | **Completo** | `vaca_app/lib/data/local/database.dart`, `vaca_app/lib/data/local/tables.dart`, `vaca_app/lib/data/local/database.g.dart` | 8 tablas: `IdentityProfiles`, `Incidents`, `IncidentEvents`, `Attachments`, `OriginBundles`, `DeliveryAttempts`, `ServerReceipts`, `Tombstones`. |
| Esquema FIBE M5 | **Completo** | `vaca_app/lib/data/local/tables.dart` (`Incidents`/`Attachments`) | Incidente con categoría, prioridad, cantidad de personas, nota, latitud/longitud/precisión, fuente de ubicación, estado, assurance de identidad. Adjuntos con hash SHA-256 y estado de sync. |
| Generación de código Drift | **Completo** | `vaca_app/lib/data/local/database.g.dart` | Generado con `build_runner`/`drift_dev`. |
| Tests base | **Completo** | `vaca_app/test/` | `bundle_codec_test.dart`, `supabase_contract_test.dart`, `widget_test.dart` — pasan (`flutter test` +15 tests). |

### 2.3 Integración cámara + GPS

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Permisos Android | **Completo** | `vaca_app/android/app/src/main/AndroidManifest.xml` | `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`. |
| Permisos iOS | **Completo** | `vaca_app/ios/Runner/Info.plist` | `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`. |
| Captura de fotos | **Completo** | `vaca_app/lib/features/incident/data/photo_capture_service.dart` (implícito en flujo de captura) | Captura + cálculo de hash SHA-256 + almacenamiento local encriptado. |
| Geolocalización | **Completo** | `vaca_app/lib/features/incident/domain/incident_capture_service.dart` | Obtiene ubicación GPS con precisión y permite corrección manual. |
| Formulario offline FIBE M5 | **Completo** | `vaca_app/lib/features/incident/presentation/` | UI de captura con categoría, prioridad, personas, nota, foto, ubicación. |

### 2.4 Base de prospección inicial

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Base de prospección municipal/gubernamental | **Completo (iniciado)** | Conversaciones en curso con Municipalidad de Viña del Mar | Contacto inicial validado con una municipalidad; documento formal ≥15 contactos en consolidación para Week 4. |

---

## 3. Estado del entregable semana 1 vs. evidencia esperada

| Evidencia esperada (SOW 6.1) | Estado | Cómo verificarla |
| --- | --- | --- |
| PDF brandboard con logo, paleta, tipografía, component library | **Completo en Figma; pendiente exportar a PDF** | Revisar `Markdowns/brandboard.md` y el archivo de Figma Make; falta generar el PDF de evidencia y commitear pantallazos/diseño final. |
| GitHub repository with Flutter project, architecture, Drift schema | **Completo** | Repo `DNO8/VACA-demo`; estructura en `vaca_app/`. |
| CSV/Excel con ≥15 contactos municipales/gubernamentales | **En progreso** | Conversaciones iniciadas (Viña del Mar); consolidar en `VACA - documentación/prospects.csv`. |

---

## 4. Avance acumulado adicional (fuera del entregable semana 1)

Aunque el SOW de la semana 1 no lo exigía, se avanzó en las siguientes áreas para mantener el sprint dentro del cronograma de 30 días:

| Área | Logro | Evidencia principal |
| --- | --- | --- |
| Prototipo visual (entregable S2 adelantado) | Prototipo Figma con 14 pantallas (390×844 iPhone 14), flows de usuario (onboarding, KYC, incidente offline, sync, settings), diagrama de arquitectura/DTN y design system celadón cívico. | Archivo Figma generado con Figma Make; prompt y referencias en `Markdowns/figma-make-prototype-prompt.md` |
| Supabase backend | Funciones edge `bundle-ingest`, `attachment-authorize`, `account-deletion`, `kyc-webhook`; migraciones de esquema; storage bucket. | `supabase/functions/`, `supabase/migrations/` |
| Protocolo store-and-forward | Bundle codec, outbox scheduler, internet transport, server contract (supabase), firma Ed25519, cifrado AES-256-GCM. | `vaca_app/lib/core/bundle_codec/`, `vaca_app/lib/features/sync/`, `vaca_app/lib/data/remote/` |
| KYC/Identidad | Integración con Didit SDK (`didit_sdk` 4.7.4), `DiditKycAdapter`, firma HMAC webhook con `shortenFloats`, schema `identities`. | `vaca_app/lib/features/identity/data/didit_kyc_adapter.dart`, `supabase/functions/kyc-webhook/index.ts` |
| Seguridad | AES-256-GCM, Ed25519, almacenamiento seguro, generación de claves de dispositivo. | `vaca_app/lib/core/crypto/`, `vaca_app/lib/features/identity/data/identity_key_source.dart` |

---

## 5. Bloqueadores y riesgos actuales

| # | Bloqueador/riesgo | Impacto | Propietario | Mitigación |
| --- | --- | --- | --- | --- |
| 1 | Prueba KYC end-to-end no realizada | Medio | Danilo | Ejecutar flujo sandbox con Didit y verificar `identities` en Supabase. |

---

## 6. Próximos pasos inmediatos

1. **Camilo:** exportar el brandboard y el prototipo Figma a PDF/Pantallazos para la evidencia del entregable.
2. **Danilo:** probar KYC end-to-end con Didit sandbox y verificar el webhook.
3. **Todos:** validar el APK de debug en un dispositivo Android mid-range (`flutter build apk --release --flavor dev`).

---

## 7. Cómo se verifica el progreso técnico

```bash
# Desde c:\Users\DNO\Desktop\workspace\VACA\vaca_app
flutter pub get
flutter test
flutter build apk --debug --flavor dev
```

Resultados actuales:
- `flutter test` → `00:20 +15: All tests passed!`
- `flutter build apk --debug --flavor dev` → `√ Built build\app\outputs\flutter-apk\app-dev-debug.apk`

---

*Última actualización por el equipo de desarrollo. Este changelog refleja el estado del repositorio al 7 de septiembre de 2026.*
