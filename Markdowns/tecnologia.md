# Infraestructura tecnológica — VACA

## Criterios

El stack se selecciona por soporte, seguridad, operación offline y mantenibilidad. Las versiones concretas viven en los manifiestos del repositorio; este documento describe responsabilidades permanentes.

## 1. Aplicación

| Área | Tecnología / frontera | Responsabilidad |
| --- | --- | --- |
| UI multiplataforma | Flutter/Dart | Android e iOS públicos. |
| Estado | Riverpod | Inyección y estado de aplicación. |
| Persistencia | Drift/SQLite | Incidentes, eventos, outbox y recibos. |
| Almacenamiento seguro | Keystore/Keychain mediante adapter | Credenciales y material de clave protegido. |
| Captura | APIs de cámara y ubicación | Evidencia opcional y ubicación con fallback. |
| Red | Cliente HTTPS con timeouts | Entrega al servidor autorizado. |

La persistencia estructurada sensible y los archivos requieren protección en reposo; guardar sólo claves en secure storage no cifra automáticamente la base o las fotografías.

## 2. Protocolo y seguridad

- CBOR canónico o representación determinista revisada.
- AEAD para confidencialidad e integridad de payload.
- Firma Ed25519 o construcción aprobada equivalente.
- Envoltura hacia una clave pública/raíz del servidor; no claves simétricas globales dentro del cliente.
- Hash del ciphertext ligado a firma y recibo.
- Límites de versión, tamaño, profundidad, fragmentos, reintentos y almacenamiento.

No se implementan primitivas criptográficas propias.

## 3. Backend

Supabase Postgres, Storage y Edge Functions constituyen la implementación de referencia actual, no una dependencia del dominio.

Controles obligatorios:

- Auth real de usuario/dispositivo.
- RLS y grants mínimos.
- Service role sólo en backend.
- Ingesta transaccional e idempotente.
- Storage privado con autorizaciones breves.
- KYC y secretos exclusivamente server-side.
- Recibos firmados y raíces rotables.
- Rate limits, replay protection y auditoría sin payload sensible.

## 4. Relay municipal

Kotlin/Android administra BLE central/peripheral, foreground service, sesiones autenticadas, caché durable y routing. Flutter consume una API estable de alto nivel.

El relay usa bundles cifrados y no recibe claves privadas del destinatario.

## 5. Calidad y operación

- Formato y análisis estático.
- Tests unitarios, widget, integración y migraciones.
- Pruebas de tamper, dedupe, autorización y reinicio.
- Builds por flavor.
- Scans de secretos, dependencias, licencias y configuración.
- Escenarios físicos Android/iPhone y piloto de tres dispositivos.

Ningún proveedor, SDK o versión se asume vigente sin verificar su documentación oficial al implementarlo.
