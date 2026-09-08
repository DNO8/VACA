# Especificación — Comunicaciones DTN y relay BLE municipal

## Propósito y autoridad

Este documento define la capacidad permanente de comunicación tolerante a interrupciones de VACA. Complementa y no sustituye `02-hybrid-dtn-architecture.md`, que es la fuente normativa del protocolo de bundles, seguridad y semántica de entrega.

El nombre “mesh” se conserva por reconocimiento histórico, pero VACA **no implementa Bluetooth SIG Mesh ni flooding epidémico sin límites**. La solución es un DTN de aplicación con BLE, store-carry-forward y routing spray-and-wait acotado.

Los planes de entrega pueden habilitar esta capacidad por etapas. Que una etapa no la incluya no la elimina de la arquitectura del producto.

## 1. Objetivo

Permitir que una señal compacta y cifrada sobreviva cuando el dispositivo de origen no tiene Internet y llegue eventualmente a un servidor autorizado mediante relays Android y un gateway municipal certificado.

La capacidad prioritaria es la propagación de señales. El chat humano, canales públicos, Nostr, Wi-Fi Direct, LoRa, satélite y gateway público no forman parte de este protocolo.

## 2. Principios

1. Un bundle se persiste antes de ofrecerlo a un enlace.
2. El mismo formato canónico funciona por HTTPS y BLE.
3. Relays y gateways no pueden descifrar el payload.
4. Los recursos de batería, memoria, almacenamiento y radio están acotados.
5. Inventario y validación de cabecera ocurren antes de transferir payload.
6. La red evita flooding mediante dedupe, expiración, hop limit, copy budget y tombstones.
7. La prioridad favorece P0/P1 sin producir inanición permanente de P2–P5.
8. El servidor, no el relay ni el gateway, produce la confirmación de entrega.
9. El flavor público no puede habilitar funciones de relay o gateway.
10. Toda identidad de red es efímera o seudónima; no se anuncia PII.

## 3. Arquitectura

```text
Flutter application
  ├─ incident domain
  ├─ canonical bundle codec
  ├─ origin outbox
  ├─ receipt verifier
  └─ DTN coordinator
       ├─ InternetLinkAdapter
       └─ AndroidRelayAdapter
              │ platform boundary
              ▼
        AndroidRelayEngine
          ├─ foreground service
          ├─ BLE discovery
          ├─ authenticated sessions
          ├─ relay cache
          ├─ inventory/chunks
          ├─ spray-and-wait
          └─ certified gateway
```

El engine Android posee discovery, sesiones, replay protection, routing, caché, custody, límites y temporización. Flutter recibe eventos de alto nivel y reconcilia estado de producto.

## 4. Fronteras de componentes

### 4.1 DTN coordinator

Coordina múltiples enlaces simultáneos. No selecciona una única implementación global.

```dart
abstract interface class DtnCoordinator {
  Future<void> start();
  Future<void> stop();
  Future<EnqueueResult> enqueue(Bundle bundle);
  Stream<BundleEvent> get events;
  Stream<NetworkSnapshot> get network;
}
```

### 4.2 Link adapter

```dart
abstract interface class LinkAdapter {
  String get id;
  LinkCapabilities get capabilities;
  Future<void> start();
  Future<void> stop();
  Future<TransferResult> offer(BundleReference bundle);
  Stream<LinkEvent> get events;
  Stream<LinkHealth> get health;
}
```

### 4.3 AndroidRelayEngine

Operaciones mínimas:

```text
start(config)
stop()
importBundle(encryptedBytes, metadata)
removeOriginBundle(messageId)
networkSnapshot()
```

Eventos mínimos:

```text
PeerObserved
PeerLost
BundleStored
BundleForwarded
GatewayObserved
ServerReceiptObserved
NetworkHealthChanged
SecurityViolation
```

La API nunca recibe ni emite RUT, documentos, biometría, nota en claro, coordenadas exactas en claro o medios sin cifrar.

## 5. Roles

| Rol | Capacidad |
| --- | --- |
| Origen | Crea, cifra, firma y conserva el bundle. |
| Relay | Valida metadatos protegidos, persiste y reenvía sin descifrar. |
| Gateway certificado | Recibe bundles y los entrega por HTTPS. |
| Servidor autorizado | Descifra, valida, deduplica y firma recibos. |

Un mismo dispositivo piloto puede actuar como origen y relay. El modo gateway exige configuración y certificado institucional; nunca se activa mediante un toggle público.

## 6. Descubrimiento

El advertisement contiene únicamente información compacta:

```text
protocolVersion
ephemeralNodeId
capabilityBits
batteryClass
queuePriorityBitmap
gatewayScoreBucket
gatewayBeaconSequence
advertisementSignature
```

No contiene identidad civil, incident IDs, coordenadas, tamaño exacto de cola, batería exacta ni grafo de vecinos. RSSI representa calidad de enlace, no distancia física.

## 7. Sesión autenticada

1. Observar advertisement compatible.
2. Aplicar política de batería, cuota y backoff.
3. Validar firma/certificado cuando corresponda.
4. Negociar versión.
5. Establecer una sesión cifrada mediante una construcción revisada.
6. Intercambiar inventarios acotados.
7. Solicitar sólo bundles faltantes y elegibles.
8. Validar cabecera, firma, expiración, hop limit y tamaños antes de reservar payload.
9. Transferir chunks reanudables.
10. Persistir completamente antes del custody ACK.
11. Cerrar sesiones ociosas con rapidez.

## 8. Routing

VACA utiliza **priority-aware bounded spray-and-wait** con gradiente hacia gateways certificados.

Un bundle se ofrece sólo cuando:

- El peer no confirma posesión.
- Ambos soportan una versión compatible.
- El bundle no está vencido y conserva hop limit.
- El peer tiene capacidad para esa clase.
- Existe mejor gradiente de gateway o copy budget disponible.
- No hay backoff de seguridad, batería o congestión.

P0/P1 pueden tener mayor redundancia, siempre bajo máximos configurados. Aging evita que P2–P5 queden indefinidamente sin servicio.

## 9. Gateway certificado

El beacon de gateway contiene:

```text
certificateReference
lastAuthorizedServerReachability
gatewaySequence
loadBucket
hopEstimate
expiresAt
signature
```

Se rechazan beacons sin firma, vencidos, repetidos o emitidos por raíces no autorizadas. Declarar `internetAvailable` no es suficiente.

Controles antiestampida:

- Jitter y backoff aleatorio.
- Cupos de capacidad anunciados.
- Máximo de sesiones concurrentes.
- Inventario antes de payload.
- Solicitudes de IDs faltantes en vez de push masivo.
- Cuotas por peer.
- Histeresis al cambiar de gateway.
- Scheduling justo por prioridad y antigüedad.

## 10. Persistencia nativa

El relay mantiene una caché separada de las tablas de dominio:

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

La caché impone límites globales y por origen. La expulsión considera vencimiento, prioridad y antigüedad; no elimina silenciosamente una copia cuya custodia se prometió sin producir un evento auditable.

## 11. Semántica de entrega

| Evento | Significado |
| --- | --- |
| `storedLocally` | El origen persistió el bundle. |
| `custodyAccepted` | Un relay persistió una copia válida. |
| `forwarded` | Terminó una transferencia de enlace. |
| `gatewayAccepted` | Un gateway certificado persistió la copia. |
| `serverReceiptVerified` | El servidor autorizado firmó un recibo válido. |
| `institutionAcknowledged` | Un flujo institucional posterior aceptó o revisó el incidente. |

Sólo `serverReceiptVerified` permite mostrar “recibida por VACA”. Custodia no es entrega institucional.

## 12. Seguridad

- Payload cifrado de extremo a extremo para el servidor autorizado.
- Firma de origen sobre cabecera protegida y hash del ciphertext.
- Sesión hop-by-hop autenticada independiente del cifrado E2E.
- Nonces, secuencias, expiración y cachés contra replay.
- Credenciales seudónimas rotables; KYC permanece en backend.
- Límites previos a asignación contra payloads maliciosos.
- Códigos de seguridad sin dumps de bundles.
- Sin claves privadas del servidor en la aplicación o gateway.
- Sin confianza automática por prioridad declarada.

## 13. Plataforma y ciclo de vida

### Android municipal

- Foreground service visible y control de detención.
- Permisos BLE sólo en el flavor autorizado.
- Duty cycle según batería, carga, temperatura y restricciones del sistema.
- Bulk relay se detiene antes que señales compactas críticas.
- Recuperación tras reinicio y muerte de proceso.

### Android/iOS público

- Conservan codec, outbox, receipt verifier y HTTPS.
- No anuncian participación en relay municipal.
- iOS no incluye relay multi-hop mientras no exista una implementación aprobada con garantías equivalentes.

## 14. Criterios de aceptación

- Dos dispositivos aprobados descubren y autentican una sesión.
- Un bundle sobrevive después de que el origen abandona el rango.
- Tres dispositivos demuestran origen → relay → gateway → servidor.
- Rutas duplicadas producen un solo incidente remoto.
- Relay y gateway no descifran payloads.
- Firmas inválidas, bundles vencidos, tamaños excesivos y gateways falsos se rechazan.
- El recibo firmado vuelve al origen cuando aparece una ruta.
- Caché, servicio y política de batería sobreviven escenarios reales documentados.
- El build público no contiene una ruta operativa para iniciar relay o gateway.

## 15. Decisiones excluidas

No se implementan como parte de esta arquitectura:

- Bluetooth SIG Mesh.
- Flooding epidémico ilimitado.
- Chat público o mensajería social.
- Nostr como transporte del incidente.
- Wi-Fi Direct/Aware, LoRa o satélite dentro del engine BLE.
- Gateway público o autoproclamado.
- Reutilización de código de terceros con licencias incompatibles.

Cualquier nuevo enlace se incorpora como `LinkAdapter` y debe conservar formato canónico, límites, confidencialidad y recibos.
