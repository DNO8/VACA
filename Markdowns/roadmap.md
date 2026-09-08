# Hoja de ruta por capacidades — VACA

## Principio

La hoja de ruta describe dependencias y madurez, no compromisos de fecha. Las capacidades permanentes se definen en `Especificaciones/`; un hito puede diferir su entrega, pero no reescribir sus invariantes.

## Etapa 1 — Núcleo público offline-first

- Aplicación Android/iOS.
- Onboarding, disclaimer, privacidad y consentimiento.
- Identidad no verificada y adapter KYC provider-independent.
- Captura offline de incidentes P0–P4.
- Eventos append-only para crear, actualizar y cancelar.
- Persistencia y archivos privados con protección en reposo.
- Bundle canónico, cifrado, firma y outbox durable.
- HTTPS idempotente y recibo firmado.
- Eliminación local/remota y soporte.
- Accesibilidad y packaging de tiendas.

**Gate:** avión → captura → reinicio → reconexión → recibo válido en Android e iOS.

## Etapa 2 — Despliegue municipal DTN

- Flavor Android aislado.
- Foreground service visible.
- BLE discovery y sesiones autenticadas.
- Caché durable, inventario, chunks y custody.
- Routing spray-and-wait acotado.
- Gateway certificado y controles antiestampida.
- Propagación de recibos.
- Evidencia de confidencialidad frente a intermediarios.

**Gate:** origen → relay → gateway → servidor en tres dispositivos reales.

## Etapa 3 — Operación institucional

- Consola de revisión con RBAC.
- Acuse institucional separado del recibo técnico.
- Gestión de incidentes, retención y auditoría.
- Integraciones con municipios y organizaciones mediante adapters.
- Flujos de coordinación sin despacho automático.

**Gate:** un operador autorizado puede revisar y reconocer señales sin exponer datos a roles no autorizados.

## Etapa 4 — VACA Insights

- Métricas operativas y de resiliencia.
- Analítica territorial agregada.
- Calidad, procedencia y latencia de señales.
- Exportaciones e interoperabilidad institucional.
- Controles contra reidentificación y decisiones automatizadas sensibles.

**Gate:** los indicadores son reproducibles, explicables y compatibles con la política de privacidad.

## Etapa 5 — Expansión e interoperabilidad

- Nuevos `LinkAdapter` sólo cuando preserven el protocolo y los límites.
- Adaptación regulatoria y operativa por territorio.
- Estándares abiertos para intercambio institucional.
- Gobernanza, continuidad operacional y respuesta a incidentes de seguridad.

## Dependencias críticas

```text
seguridad + modelo de datos
       ↓
flujo público + backend autorizado
       ↓
recibos y pruebas E2E
       ↓
relay municipal
       ↓
operación institucional
       ↓
analítica y expansión
```

No se incorporan FIBE, Stellar, tokenización, elegibilidad automática, drones, gateway público ni otros transportes por simple continuidad histórica; cualquier nueva decisión requiere especificación, evaluación y aprobación explícita.
