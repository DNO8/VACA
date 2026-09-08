# Arquitectura del sistema — VACA

## Decisión

VACA utiliza una arquitectura modular offline-first con dominio de incidentes, DTN independiente del transporte, backend autorizado y consumo institucional separado.

## 1. Capas

```text
Aplicación pública y municipal
  ├─ identidad y consentimiento
  ├─ incidentes y eventos
  ├─ adjuntos
  ├─ estado de entrega
  └─ controles de privacidad
          │
          ▼
DTN de aplicación
  ├─ bundle canónico
  ├─ cifrado y firma
  ├─ outbox durable
  ├─ scheduler
  ├─ receipt verifier
  └─ link adapters
          │
          ├─ HTTPS
          └─ Android BLE relay
          │
          ▼
Servidor autorizado
  ├─ autenticación y KYC boundary
  ├─ ingesta transaccional
  ├─ idempotencia
  ├─ almacenamiento privado
  ├─ recibos firmados
  └─ autorización, retención y auditoría
          │
          ▼
Integraciones institucionales
  ├─ revisión operativa
  ├─ acuse institucional
  ├─ coordinación
  └─ analítica agregada
```

## 2. Aplicación

Flutter comparte dominio, persistencia y flujo público entre Android e iOS. Los datos sensibles se almacenan en espacio privado y con protección criptográfica. Los eventos son append-only.

El flavor municipal añade una frontera nativa Android para BLE. La lógica de radio, sesiones, routing y caché vive en Kotlin; Flutter recibe eventos de alto nivel.

## 3. DTN

El DTN coordina varios enlaces sin acoplar el dominio a HTTP o BLE. Un bundle conserva el mismo ID, firma, cifrado y reglas de expiración en todos los transportes.

La política usa prioridad, aging, límites de copia y tombstones. P0/P1 tienen precedencia, pero no se permite flooding ni almacenamiento ilimitado.

## 4. Identidad y confianza

- KYC prueba aseguramiento de identidad, no veracidad del incidente.
- El proveedor de KYC se encapsula detrás de un adapter.
- La creación de sesiones y webhooks ocurre en backend.
- El cliente conserva sólo referencias y credenciales opacas.
- El servidor valida prueba de posesión y autorización; no confía en una clave pública enviada sin vínculo autenticado.

## 5. Datos y recibos

El incidente es una proyección local/remota de eventos firmados. La entrega sólo se cierra cuando el cliente verifica un recibo ligado a `messageId`, `payloadHash`, tiempo y clave del servidor.

`receivedByServer` y `acknowledgedInstitutionally` son estados diferentes.

## 6. Extensibilidad

Nuevos enlaces, proveedores KYC o sistemas institucionales se agregan mediante adapters. Ninguna integración futura puede debilitar:

- Persistencia previa.
- Confidencialidad E2E.
- Idempotencia.
- Límites de recursos.
- Separación entre señal y decisión institucional.
- Evidencia criptográfica de entrega.

Las especificaciones normativas se encuentran en `Especificaciones/`.
