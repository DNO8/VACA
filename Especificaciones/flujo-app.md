# Especificación funcional y de flujos — Aplicación VACA

## Propósito y autoridad

Este documento define de forma permanente cómo se comporta la aplicación VACA. No está ligado a una convocatoria, fecha de entrega ni proveedor específico. Los planes de ejecución pueden implementar capacidades por etapas, pero no redefinen estos fundamentos.

Se interpreta junto con:

- `01-public-mvp-product-spec.md`: alcance y reglas del producto público.
- `02-hybrid-dtn-architecture.md`: arquitectura de bundles y transportes.
- `modelo-datos-fibe.md`: modelo lógico de identidad, incidentes y entrega. El nombre del archivo se conserva por compatibilidad; FIBE no es el modelo activo.
- `03-release-security-readiness.md`: controles de seguridad, privacidad y publicación.
- `sistema-diseno-app.md`: sistema visual y accesibilidad.

Ante un conflicto, prevalecen las reglas de seguridad y producto; los handoffs y backlogs sólo controlan secuencia y evidencia de una entrega.

## 1. Principios de comportamiento

1. **Offline-first real.** La captura esencial funciona sin Internet.
2. **Persistir antes de transmitir.** Una señal y su evento quedan almacenados antes de cualquier intento de envío.
3. **Entrega verificable.** Sólo un recibo firmado del servidor autorizado confirma recepción.
4. **KYC no bloqueante.** La verificación mejora el nivel de aseguramiento de identidad, pero no impide guardar señales P0/P1.
5. **Privacidad por diseño.** La app no almacena documentos de identidad, biometría, respuestas completas de KYC ni secretos del proveedor.
6. **Payload confidencial.** Relays y gateways transportan bundles cifrados sin poder leer ubicación exacta, notas o evidencia.
7. **Eventos append-only.** Actualizaciones y cancelaciones crean eventos nuevos; no reescriben bundles firmados.
8. **Degradación honesta.** Falta de GPS, cámara, KYC o red reduce capacidades, pero no convierte un estado local en una entrega confirmada.
9. **Plataforma pública común.** Android e iOS comparten dominio, persistencia, codec, outbox, HTTPS y recibos.
10. **Piloto aislado.** El relay BLE municipal existe sólo en builds Android autorizados y nunca se habilita desde el flavor público.

## 2. Actores

| Actor | Responsabilidad |
| --- | --- |
| Reportante público | Registra una señal propia o un incidente observado. |
| Usuario preparado | Completó verificación y conserva una credencial opaca vigente. |
| Usuario no verificado | Puede registrar señales con límites antiabuso más estrictos. |
| Nodo relay | Conserva y reenvía bundles cifrados sin acceder al payload. |
| Gateway municipal | Recibe bundles del piloto y los entrega al servidor autorizado. |
| Servidor autorizado | Valida, deduplica, persiste y firma recibos. |
| Operador institucional | Revisa señales en herramientas institucionales separadas de la app pública. |

## 3. Modos operativos

### 3.1 Aplicación pública

Disponible en Android e iOS. Utiliza persistencia local, outbox durable y sincronización HTTPS. No expone controles, permisos ni afirmaciones del piloto BLE.

### 3.2 Piloto municipal

Build Android administrado para dispositivos aprobados. Añade relay BLE, foreground service visible, configuración de confianza institucional y gateway certificado. El piloto no convierte a cualquier usuario en gateway.

## 4. Inventario de pantallas

| Código | Pantalla | Objetivo |
| --- | --- | --- |
| P0 | Splash | Identidad y arranque. |
| P1 | Propósito y disclaimer | Explicar límites y canales oficiales. |
| P2 | Privacidad y consentimiento | Registrar versión aceptada. |
| P3 | Preparación de identidad | Configurar clave, autenticación y KYC o continuar sin verificar. |
| P4 | Inicio / señales | Mostrar incidentes locales y acción principal. |
| P5 | Categoría | Seleccionar categoría; la app deriva la prioridad. |
| P6 | Ubicación | GPS, corrección manual o estado no disponible. |
| P7 | Datos mínimos | Personas afectadas y nota breve opcional. |
| P8 | Cámara | Adjuntar fotografía opcional sin bloquear la señal compacta. |
| P9 | Confirmación local | Mostrar `savedLocally`, nunca “enviado”. |
| P10 | Detalle | Estado, eventos, actualización y cancelación. |
| P11 | Entrega | Outbox, reintentos y recibo verificado. |
| P12 | Identidad, privacidad y datos | Estado KYC, consentimiento, soporte y eliminación. |
| P13 | Relay municipal | Estado y control del servicio; sólo en piloto autorizado. |

## 5. Navegación principal

```text
Instalación
  → propósito y disclaimer
  → privacidad y consentimiento
  → preparación verificada | continuar sin verificar
  → inicio

Inicio
  → crear señal
  → lista y detalle
  → estado de entrega
  → identidad, privacidad y datos
  → relay municipal (sólo build autorizado)
```

## 6. Flujos funcionales

### F1 — Preparación e identidad

**Precondición:** primera ejecución o política actualizada.

1. La persona lee el propósito, los límites y la recomendación de usar canales oficiales cuando estén disponibles.
2. Acepta una versión concreta del consentimiento.
3. La app crea una clave de dispositivo protegida por capacidades de plataforma.
4. La persona puede continuar como no verificada.
5. Si solicita KYC y existe conectividad, el backend crea una sesión con el proveedor; ningún secreto del proveedor entra al cliente.
6. El proveedor completa el flujo y notifica al backend mediante webhook firmado.
7. El backend emite una credencial opaca, firmada, revocable y con vencimiento.
8. La app almacena únicamente la referencia opaca y la credencial necesarias.

**Postcondición:** perfil `unverified`, `verified`, `expired` o `revoked`, con consentimiento auditable.

### F2 — Captura offline

**Precondición:** la app puede estar completamente desconectada.

1. La persona selecciona una categoría P0–P4.
2. La app deriva la prioridad; el usuario no edita el valor de red.
3. Intenta obtener ubicación y precisión.
4. La persona puede confirmar, corregir manualmente o continuar sin ubicación.
5. Ingresa un conteo acotado y una nota breve opcional.
6. En una transacción local se crean incidente, evento `created`, payload compacto, bundle cifrado y registro de outbox.
7. La interfaz muestra `savedLocally` inmediatamente.
8. La fotografía y el thumbnail se procesan como adjuntos independientes; nunca retrasan el guardado P0/P1.
9. Los intentos de entrega comienzan cuando un enlace autorizado está disponible.

**Postcondición:** señal durable y recuperable después de cierre, reinicio o muerte del proceso.

### F3 — Entrega por Internet

1. El coordinador comprueba alcance real del endpoint autorizado, no sólo presencia de interfaz de red.
2. Selecciona bundles por prioridad, vencimiento y antigüedad, con fairness.
3. Envía de forma idempotente por HTTPS.
4. El servidor valida autenticación, firma, credencial, esquema, tamaño, expiración y dedupe.
5. El servidor devuelve un recibo firmado ligado a `messageId`, `payloadHash`, instante de recepción y `serverKeyId`.
6. La app verifica el recibo con una raíz de confianza configurada.
7. Sólo después actualiza el incidente a `receivedByServer` y crea tombstone.
8. El acuse institucional, si existe, se registra como un estado posterior distinto.

### F4 — Relay BLE municipal

1. Un build autorizado inicia un foreground service visible.
2. El dispositivo anuncia capacidades mínimas y un identificador efímero.
3. Los peers negocian versión y establecen una sesión autenticada.
4. Intercambian inventarios acotados antes de solicitar bytes.
5. El relay valida cabecera, límites y firma antes de reservar memoria.
6. Persiste el bundle cifrado completo antes de confirmar custodia.
7. La política spray-and-wait distribuye copias con límites estrictos.
8. Un gateway certificado sube el bundle por el mismo contrato HTTPS.
9. El recibo firmado se propaga y reconcilia cuando vuelve a existir una ruta.

Custodia de relay o gateway no equivale a recepción del servidor.

### F5 — Actualizar o cancelar

1. La persona abre un incidente activo.
2. Registra una actualización o cancelación.
3. La app crea un evento firmado `updated` o `cancelled` que referencia el incidente y, cuando corresponda, el mensaje anterior.
4. El nuevo evento se persiste y encola sin mutar eventos ya firmados.
5. El servidor ordena eventos y aplica autorización e idempotencia.

### F6 — Eliminación y privacidad

1. La persona abre identidad, privacidad y datos.
2. Puede borrar datos locales, incluyendo adjuntos temporales y material criptográfico cuando corresponda.
3. Si existen datos sincronizados, solicita eliminación autenticada al backend.
4. El backend registra la solicitud, aplica retención aprobada y devuelve un resultado auditable.
5. La UI distingue solicitud recibida, eliminación completada y datos sujetos a conservación legal.

## 7. Máquinas de estado

### 7.1 Incidente

```text
draft → savedLocally → queued → uploading | relaying
       → receivedByServer → acknowledgedInstitutionally

savedLocally | queued | uploading | relaying
       → cancelledLocally → cancellationQueued → cancellationReceived

estado no terminal → expired | failedRetryable
```

### 7.2 Identidad

```text
unverified → verificationPending → verified
verified → expired | revoked
expired | revoked → verificationPending → verified
```

### 7.3 Adjunto

```text
pending → uploading → synced
pending | uploading → failed → pending
```

## 8. Reglas transversales

- P0/P1 se guardan sin depender de KYC, GPS, fotografía o Internet.
- P5 nunca bloquea P0–P4.
- Reenviar el mismo `messageId` y hash produce una sola aceptación lógica.
- Un duplicado con el mismo ID y hash distinto se rechaza y audita.
- Un relay no recibe claves de descifrado del destinatario.
- La UI no denomina “enviado” o “recibido” a un guardado local o custodia intermedia.
- Ubicación exacta, notas y medios no aparecen en logs ni telemetría.
- Los límites de nota, conteo, bundle, adjunto, reintento y retención se validan en cliente y servidor.
- La prioridad es una regla de scheduling, no una afirmación de veracidad ni una orden automática de despacho.

## 9. Criterios de aceptación permanentes

- La señal se crea en modo avión, sobrevive reinicio y se entrega al recuperar Internet.
- Un usuario no verificado puede guardar P0/P1.
- La fotografía no retrasa el bundle compacto P0/P1.
- Los reintentos no duplican incidentes.
- Un recibo inválido no cierra la entrega.
- Actualización y cancelación son eventos append-only.
- La eliminación local y remota tiene controles y evidencia.
- Android e iOS comparten el flujo público.
- El flavor público no puede iniciar el relay.
- El piloto demuestra origen → relay → gateway → servidor y confidencialidad frente a intermediarios.
