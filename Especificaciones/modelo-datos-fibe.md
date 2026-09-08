# Modelo de datos VACA — Identidad, incidentes y entrega

## Nota de compatibilidad

El nombre `modelo-datos-fibe.md` se conserva temporalmente para no romper referencias existentes. **FIBE no es el modelo normativo de VACA**, no se almacena como formulario oficial y no determina beneficios, prioridad institucional ni elegibilidad.

Este documento define el modelo lógico permanente. Las tablas concretas pueden evolucionar mediante migraciones, pero deben preservar sus invariantes de privacidad, eventos append-only e idempotencia.

Se interpreta junto con `01-public-mvp-product-spec.md`, `02-hybrid-dtn-architecture.md` y `flujo-app.md`.

## 1. Principios

1. **Identificadores locales.** Incidentes, eventos y bundles nacen con IDs aleatorios en el dispositivo.
2. **Persistencia previa.** Incidente, evento y bundle inicial se confirman localmente antes de transmitir.
3. **Eventos append-only.** Actualización y cancelación crean eventos nuevos.
4. **Separación dominio/protocolo.** Las filas de dominio no se serializan directamente como contrato de red.
5. **Idempotencia global.** `messageId + payloadHash` identifica una aceptación lógica.
6. **Privacidad.** No se persisten RUT, documentos, biometría ni respuesta completa de KYC.
7. **Cifrado local y en tránsito.** Datos sensibles y medios usan almacenamiento privado y protección criptográfica adecuada.
8. **Intermediarios no confiables.** Relay y gateway sólo conservan bundles cifrados.
9. **Recibo verificable.** Entrega y reconocimiento institucional son entidades distintas.
10. **Migraciones explícitas.** Ningún dato capturado se elimina por una actualización silenciosa de esquema.

## 2. Enumeraciones de dominio

### IdentityAssurance

```text
unverified
verified
expired
revoked
```

### IncidentCategory

```text
sos
medical
person
hazard
coordination
```

### IncidentPriority

```text
p0  life safety
p1  urgent medical
p2  person/location
p3  hazard/infrastructure
p4  coordination
p5  bulk media
```

P0–P4 derivan de la categoría. P5 se reserva para medios y nunca bloquea señales compactas.

### LocationSource

```text
gps
manual
unavailable
```

### IncidentStatus

```text
draft
savedLocally
queued
relaying
uploading
receivedByServer
acknowledgedInstitutionally
cancelledLocally
cancellationQueued
cancellationReceived
expired
failedRetryable
```

### EventType

```text
created
updated
cancelled
receiptAttached
```

### AttachmentKind y AttachmentSyncStatus

```text
photo | thumbnail
pending | uploading | synced | failed
```

## 3. Relaciones

```text
IdentityProfile
  └─ 1:N Incident
          ├─ 1:N IncidentEvent
          ├─ 1:N Attachment
          └─ 1:N OriginBundle
                  ├─ 1:N DeliveryAttempt
                  ├─ 0:1 ServerReceipt
                  └─ 0:1 Tombstone

AndroidRelayCache
  └─ RelayBundle (sin relación de lectura con el dominio)
```

## 4. Entidades locales

### 4.1 IdentityProfile

| Campo | Regla |
| --- | --- |
| `id` | UUID local. |
| `opaqueSubjectId` | Referencia backend/provider-independent opcional. |
| `identityAssurance` | Estado de aseguramiento vigente. |
| `credential` | Credencial opaca firmada; nunca respuesta KYC. |
| `credentialExpiresAt` | Vencimiento verificable. |
| `devicePublicKey` | Clave pública para autenticación/firma. |
| `consentVersion` | Versión aceptada. |
| `createdAt`, `updatedAt` | Auditoría local. |

La clave privada permanece bajo protección de plataforma. El perfil no contiene nombres civiles, RUT, imágenes de documento ni biometría.

### 4.2 Incident

| Campo | Regla |
| --- | --- |
| `id` | UUID creado localmente. |
| `reporterProfileId` | Relación local con el perfil. |
| `category` | Categoría genérica, no código oficial. |
| `priority` | Derivada y validada. |
| `peopleCount` | Entero opcional y acotado. |
| `shortNote` | Texto opcional y acotado. |
| `latitude`, `longitude` | Opcionales; sensibles. |
| `accuracyMeters` | Precisión declarada por la fuente. |
| `locationSource` | GPS, manual o no disponible. |
| `status` | Estado visible del producto. |
| `identityAssurance` | Snapshot al crear la señal. |
| `createdAt`, `updatedAt` | Tiempos del dispositivo, no autoridad absoluta. |

### 4.3 IncidentEvent

| Campo | Regla |
| --- | --- |
| `id` | UUID del evento. |
| `incidentId` | Incidente padre. |
| `eventType` | `created`, `updated`, `cancelled` o `receiptAttached`. |
| `previousEventId` | Referencia opcional para ordenar la cadena. |
| `signerKeyId` | Identifica la clave sin exponer material privado. |
| `payloadHash` | Hash del contenido canónico del evento. |
| `signature` | Firma sobre campos protegidos. |
| `createdAt` | Tiempo local no confiable por sí solo. |

Los eventos transmitidos no se actualizan ni eliminan en sitio; las correcciones crean otro evento.

### 4.4 Attachment

| Campo | Regla |
| --- | --- |
| `id` | UUID. |
| `incidentId` | Incidente padre. |
| `kind` | Foto o thumbnail. |
| `localPath` | Ruta privada de la app. |
| `sha256` | Integridad del archivo. |
| `sizeBytes` | Tamaño real, validado antes de encolar. |
| `capturedAt` | Tiempo de captura con procedencia. |
| `syncStatus` | Estado independiente del incidente. |
| `remoteObjectKey` | Referencia opaca, nunca URL pública permanente. |

La ubicación del adjunto, si se conserva, es metadata sensible y no aparece en cabeceras de red.

### 4.5 OriginBundle

| Campo | Regla |
| --- | --- |
| `messageId` | Clave global de dedupe. |
| `incidentId`, `eventId` | Relaciones de dominio. |
| `priority` | P0–P5. |
| `protectedHeader` | Cabecera canónica protegida. |
| `ciphertextPath` o `ciphertextBytes` | Payload cifrado. |
| `payloadHash` | Hash del ciphertext ligado a la firma y recibo. |
| `expiresAt` | Vencimiento independiente del hop limit. |
| `hopLimit` | Máximo de saltos. |
| `copyBudget` | Copias máximas para routing. |
| `state` | Estado de entrega. |
| `createdAt`, `lastAttemptAt`, `nextAttemptAt` | Scheduling durable. |
| `serverReceiptId` | Referencia sólo después de verificar. |

### 4.6 DeliveryAttempt

```text
id
messageId
linkId
peerIdHash nullable
startedAt
finishedAt nullable
outcome
bytesTransferred
errorCode nullable
```

`errorCode` es acotado y no contiene endpoint con credenciales, paths, coordenadas, notas ni bytes del bundle.

### 4.7 ServerReceipt

```text
receiptId
messageId
payloadHash
serverReceivedAt
serverKeyId
signature
verifiedAt
```

La firma cubre todos los campos anteriores. Un recibo cuyo `messageId` o `payloadHash` no coincide se rechaza.

### 4.8 Tombstone

```text
messageId
payloadHash
expiresAt
createdAt
```

Su retención supera la ventana normal de encuentro/reintento y permanece acotada por política.

### 4.9 RelayBundle

Persistencia nativa Android independiente:

```text
messageId
protectedHeader
ciphertextPath | ciphertextBytes
payloadHash
priority
expiresAt
hopLimitRemaining
copyBudget
receivedFromPeerHash
receivedAt
lastForwardedAt
```

No contiene relaciones navegables hacia identidad o tablas de incidentes.

## 5. Invariantes transaccionales

### Crear señal

En una única transacción local:

1. Insertar `Incident`.
2. Insertar `IncidentEvent(created)`.
3. Crear y firmar el bundle compacto.
4. Insertar `OriginBundle(queued)`.
5. Confirmar la transacción.

Los adjuntos se procesan después y generan bundles independientes. Un fallo de cámara no revierte la señal P0/P1.

### Actualizar o cancelar

1. Leer el último evento autorizado.
2. Crear un nuevo evento con referencia al anterior.
3. Crear un nuevo bundle.
4. Persistir evento y bundle en la misma transacción.
5. Actualizar sólo la proyección local del estado.

### Aplicar recibo

1. Verificar firma y raíz de confianza.
2. Comparar `messageId` y `payloadHash`.
3. Insertar `ServerReceipt`.
4. Marcar bundle `delivered`.
5. Actualizar proyección del incidente.
6. Insertar `Tombstone`.

Todo ocurre atómicamente.

## 6. Bundle canónico

La representación normativa vive en `02-hybrid-dtn-architecture.md`. Como mínimo incluye:

```text
protocolVersion
messageId
incidentId
eventType
originCredentialRef
destination
messageType
priority
createdAt
expiresAt
hopLimit
payloadLength
payloadHash
fragmentIndex
fragmentCount
keyId
nonce
signature
```

La cabecera no contiene coordenadas exactas, nombres, documentos, notas ni medios en claro.

## 7. Backend autorizado

### 7.1 Identidades

```text
id
userId/authSubject
devicePublicKey
opaqueSubjectId
kycProviderRef
identityAssurance
credentialVersion
credentialExpiresAt
revokedAt
consentVersion
createdAt
updatedAt
```

La relación con el proveedor KYC vive únicamente en el backend y con acceso restringido.

### 7.2 Incidentes y eventos

El servidor persiste incidentes como proyecciones derivadas de eventos válidos. La autorización se vincula al sujeto autenticado y a claves registradas; no se confía en una clave pública enviada sin prueba de posesión.

### 7.3 Idempotencia

- ID nuevo: validar y procesar.
- Mismo ID + mismo hash: devolver la aceptación lógica existente.
- Mismo ID + hash distinto: rechazar como conflicto y auditar.

La ingesta de evento, bundle, idempotencia y recibo debe ser transaccional.

### 7.4 Adjuntos

- Bucket privado.
- Autorización de subida breve y ligada a usuario, incidente, hash y tamaño esperados.
- Validación de hash/tamaño después de subir.
- Acceso de operadores por rol y necesidad.
- Sin políticas generales para `anon` o cualquier usuario autenticado.

## 8. Privacidad, retención y eliminación

- No se considera anónimo un dato por estar hasheado.
- Ubicación exacta, notas, fotos y referencias enlazables siguen siendo datos personales o sensibles.
- Backups no deben exportar claves ni contenido sensible sin protección.
- Archivos temporales se eliminan tras copia durable o fallo.
- La eliminación local cubre DB, archivos, cachés y claves según la decisión del usuario.
- La eliminación remota exige autenticación y autorización por propietario.
- Retención, backups, auditoría y excepciones legales requieren política aprobada.
- Logs usan IDs opacos y códigos de error.

## 9. Migraciones

- Incrementar `schemaVersion` con cada cambio incompatible.
- Probar creación desde cero y actualización desde todas las versiones soportadas.
- Evitar resets destructivos fuera de entornos de desarrollo explícitos.
- Preservar eventos y bundles capturados en terreno.
- Validar código generado como parte de CI.
- Aplicar RLS y grants después de crear cada tabla backend.
- Restringir funciones `SECURITY DEFINER` con `search_path`, permisos mínimos y pruebas de abuso.

## 10. Criterios de aceptación

- Crear, actualizar y cancelar es atómico y append-only.
- Reiniciar el proceso no pierde outbox ni reintentos.
- La prioridad P0 se procesa antes que P5 bajo las reglas de fairness.
- Un duplicado conflictivo se rechaza.
- Un recibo inválido no cambia el estado.
- Relay y gateway no pueden consultar payload en claro.
- Un usuario no puede leer, modificar o borrar datos de otro.
- El borrado elimina los datos autorizados y conserva sólo lo exigido por política.
- No existen identificadores civiles sin protección en cliente, protocolo, logs o telemetría.
