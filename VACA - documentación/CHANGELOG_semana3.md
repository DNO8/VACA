# Changelog — Entregable Semana 3 (Instawards VACA)

**Proyecto:** VACA (Vaquita de Ayuda y Coordinación Activa)  
**Periodo:** Semana 3 — Store-and-Forward Sync & Security Research  
**SOW de referencia:** `Statement of Work (SOW) — Instawards.md`  
**Repo:** `https://github.com/DNO8/VACA-demo`  
**Fecha del changelog:** 2026-09-17  

---

## 1. Resumen ejecutivo

| Entregable semana 3 | Estado global | Nota |
| --- | --- | --- |
| UI/UX de estados de red (offline/online, progreso de sync) | **Completo** | Banner de estado, bandeja filtrable y estados por señal verificados en Android físico (SM A075M). |
| Sincronización store-and-forward (cola local → nube) | **Completo — verificado end-to-end en dispositivo** | 4 bundles entregados con recibo firmado validado en cliente, idempotencia confirmada en replay y adjuntos sincronizados de forma independiente. |
| Memo de factibilidad biometría + Passkeys | **Completo** | Documento en Markdown y PDF con decisión ejecutiva y arquitectura propuesta. |
| Pipeline de prospección actualizado (≥15 contactos) | **Sin evidencia en el repositorio** | Responsable asignado; pendiente de consolidación documental. |

**Logro adicional:** durante la semana 3 se completó además la auditoría y el rediseño de paridad visual contra el prototipo (11 pantallas portadas), se integró el boundary de medición de anuncios (RevenueCat AdTracker + banner AdMob sin compras) y se preparó el paquete de publicación Android para Play Store.

---

## 2. Entregable 3 — Store-and-Forward Sync & Security Research

### 2.1 UI/UX de estados de red y progreso de sincronización

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Banner de estado de red | **Completo** | `vaca_app/lib/core/widgets/network_status_banner.dart` | Estados offline/online/syncing/success/error con Semantics `liveRegion`; contraste corregido a ≥4.5:1 tras auditoría. |
| Bandeja de salida filtrable | **Completo** | `vaca_app/lib/features/delivery/presentation/delivery_screen.dart` | Filtros Todos/Pendientes/Entregadas, estado por ítem, reintento explícito y error visible. |
| Confirmación local honesta | **Completo** | `local_confirmation_screen.dart` | Comunica "guardado local" sin afirmar recepción institucional; acceso directo al estado de entrega. |
| Estados de adjuntos | **Completo** | `core/widgets/sync_status_badge.dart` | Badge por adjunto (pendiente/subiendo/sincronizado/error) con Semantics que incluye el valor. |

### 2.2 Motor store-and-forward y endurecimiento del sync

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Outbox durable con retry | **Completo** | `vaca_app/lib/core/bundle/` | Backoff exponencial persistido, `nextAttemptAt`, presupuesto de copias y expiración de bundles (`fix(sync)` 98f3702, 4b594e8). |
| Proyección de estado de entrega | **Completo** | `features/delivery/domain/sync_status_service.dart` | Estado durable derivado del outbox; conteo real de pendientes verificado en app (`9a215a5`). |
| Validación e idempotencia backend | **Completo** | `supabase/functions/bundle-ingest/`, migraciones `005`–`008` | Aceptación atómica, límites de bundle entrantes y replay con mismo `receipt_id` sin duplicar (`58f68ca`, `3849a09`, `2ade4c1`). |
| Adjuntos con retry independiente | **Completo** | `attachment-authorize` + `c37c9b6` | Tras la entrega del bundle, 3 adjuntos subieron de forma independiente en prueba física. |
| Correcciones de verificación | **Completo** | `76d5c97`, `8a87603` | Grants `service_role`/`request_nonces`, CBOR decodificado, firma Ed25519 de 64 bytes normalizada (noble v2 devolvía 65). |

### 2.3 Backend Supabase desplegado y verificado

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Migraciones aplicadas | **Completo** | `supabase/migrations/` | `001`–`008` aplicadas al proyecto `tgqxxnldwiqisopiclmk`. |
| Edge Functions vivas | **Completo** | `supabase/functions/` | `bundle-ingest` y `attachment-authorize` verificadas end-to-end desde dispositivo físico. |
| Evidencia E2E en físico | **Completo** | `VACA - documentación/Entregable 3 - Guion de evidencia.md` | Escenario ejecutado en SM A075M: offline → cola → reconexión → recibo firmado; estado de aceptación actualizado (`019b797`). |
| Capturas y video del escenario | **Pendiente de ejecución guiada** | Guion listo en el mismo documento | Capturas `d3-01` a `d3-06` y video de 60–90 s definidos; pendiente la grabación formal. |

### 2.4 Memo de factibilidad — biometría local + Passkeys

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Memo técnico | **Completo** | `VACA - documentación/Entregable 3 - Factibilidad biometría y Passkeys.md` / `.pdf` | Distingue biometría local (protección opcional de identidad/recibos/wallet) de Passkeys (autenticación de cuenta; requiere dominio, signing y RP backend). |
| Recomendación MVP | **Completo** | Mismo documento | Incorporar primero autenticación local opcional; Passkeys cuando dominio/firma/backend estén cerrados; captura P0/P1 nunca bloqueada. |

### 2.5 Pipeline de prospección

| Componente | Estado | Evidencia / ubicación | Notas |
| --- | --- | --- | --- |
| Pipeline ≥15 contactos con seguimiento | **Sin evidencia en el repositorio** | — | Responsable: Marcos. Pendiente consolidar el documento actualizado. |

---

## 3. Estado del entregable semana 3 vs. evidencia esperada

| Evidencia esperada (SOW 6.1) | Estado | Cómo verificarla |
| --- | --- | --- |
| Screenshots de estados online/offline y UI de sync | **Completo (harness reproducible)** | `flutter test test/visual_audit_golden_test.dart` genera `test/visual_audit/*.png` — 16 pantallas a 390×844 con estados deterministas. |
| Video de datos en cola sincronizando a Supabase al reconectar | **Pendiente de grabación** | Escenario ya verificado en físico; falta la captura formal según el guion `d3-01..06` + video 60–90 s. |
| PDF de factibilidad Passkeys/biometría | **Completo** | `VACA - documentación/Entregable 3 - Factibilidad biometría y Passkeys.pdf`. |
| Pipeline de prospección actualizado (≥15 contactos) | **Sin evidencia en el repositorio** | Pendiente de Marcos. |

---

## 4. Avance acumulado adicional (fuera del entregable semana 3)

| Área | Logro | Evidencia principal |
| --- | --- | --- |
| Paridad visual prototipo↔app | Auditoría completa y rediseño de 11 pantallas: jerarquía CTA en inicio, tarjetas de categoría semántica con prioridad derivada, stepper de personas, bandeja filtrable, recibo institucional, héroes en ubicación y wallet. | Commits `833bd2b`–`010f0e5`; harness golden determinista con prueba a 200% de texto. |
| Accesibilidad | Badges de prioridad/sync anuncian su valor; contraste del banner elevado a ≥4.5:1; tarjetas toleran escala 200%. | `core/widgets/{trust_score_badge,sync_status_badge,network_status_banner,report_card}.dart` |
| Medición de anuncios (sin compras) | RevenueCat AdTracker + banner AdMob con consentimiento UMP, request no personalizado e ILRD; anuncios sólo en "Acerca de VACA". | Commits `de25097`, `67dbdaa`, `22c54e1`, `f485da8` |
| Preparación de publicación | `applicationId` definitivo `cl.vaca.app`, ficha Play es-CL/en-US, borrador Data Safety, release checklist, icono 1024×1024 reproducible y gates de release. | `vaca_app/store/android/`, commits `9e231e2`, `66ff2f9`, `1a4ec15`, `a8de9b2`, `05d4f4c` |

---

## 5. Bloqueadores y riesgos actuales

| # | Bloqueador/riesgo | Impacto | Propietario | Mitigación |
| --- | --- | --- | --- | --- |
| 1 | Video/capturas del escenario D3 sin grabar | Medio — evidencia | Equipo dev | Ejecutar el guion de evidencia en SM A075M y subir `d3-01..06` + video. |
| 2 | Pipeline de prospección sin evidencia en repo | Medio — entregable | Marcos | Consolidar documento con ≥15 contactos y estado de seguimiento. |
| 3 | Passkeys dependen de dominio/signing/backend no cerrados | Bajo — planificación | Danilo | Ya documentado en el memo: preparar interfaces, no afirmar implementación. |

---

## 6. Cómo se verifica el progreso técnico

```bash
# Desde c:\Users\DNO\Desktop\workspace\VACA\vaca_app
flutter pub get
flutter analyze
flutter test
flutter test test/visual_audit_golden_test.dart   # regenera/evidencia las 16 pantallas
flutter build apk --debug --flavor dev
```

Resultados actuales (2026-09-17):
- `flutter analyze` → 1 info (import redundante preexistente en `supabase_contract.dart`)
- `flutter test` → `+61: All tests passed!` (incluye 17 checks del harness de auditoría visual)

---

*Última actualización por el equipo de desarrollo. Este changelog refleja el estado del repositorio al 17 de septiembre de 2026.*
