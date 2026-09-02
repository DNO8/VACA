# Especificación — Capa de Comunicaciones Mesh Offline

> Define la capa de comunicación descentralizada de VACA para el "Día 0": una red **Bluetooth LE mesh** que funciona sin internet ni servidores, inspirada en la arquitectura de [bitchat](https://github.com/permissionlesstech/bitchat). Cubre dos funciones: **mensajería entre personas** y **sincronización de datos P2P (gossip)** de reportes FIBE.
>
> **Deriva de:** `Markdowns/problema.md` (apagón de datos, islas locales), `Markdowns/arquitectura.md` ("el dispositivo es el nodo", store-and-forward), `Markdowns/tecnologia.md`.
> **Se integra con:** `Especificaciones/modelo-datos-fibe.md` (SyncQueueItem, idempotencia por UUID), `Especificaciones/flujo-app.md` (transportes de sync).
>
> ⚠️ **Nota de licencia (crítica):** bitchat se publica mayormente como **dominio público**, pero al menos un repositorio de la organización aparece bajo **GPLv3** (copyleft). Antes de reutilizar cualquier línea de código de `bitchat-android` hay que **verificar la licencia exacta de ese repo**. Un protocolo (formato de paquete, reglas de ruteo) no es copyrightable y puede reimplementarse libremente; el *código fuente* sí está sujeto a su licencia. Ver §6. *Contenido de fuentes externas parafraseado por cumplimiento de licencias.*

---

## 1. Por qué VACA necesita un mesh

El documento `problema.md` describe el "apagón de datos": en las primeras horas tras un desastre, telecomunicaciones e infraestructura institucional colapsan, dejando **"islas locales de información"**. Hoy la doc de VACA resuelve la sincronización con "ventanas de conectividad (Starlink, antena móvil o **traslado físico del dispositivo**)".

El mesh **mejora radicalmente** ese modelo: en vez de trasladar físicamente un teléfono hasta encontrar señal, los datos **saltan de dispositivo en dispositivo** por Bluetooth hasta que alguno alcanza un punto con internet (o hasta que la información simplemente circula entre los afectados en terreno). Convierte las "islas" en un **archipiélago conectado** sin necesidad de infraestructura.

Encaja con tres pilares ya escritos:
- **"Comunidad como sensor"** → ahora también canal de comunicación entre sensores.
- **"El dispositivo es el nodo"** → el nodo ahora también **enruta** tráfico de otros.
- **"Store-and-forward"** → el mesh es el transporte natural del store-and-forward P2P.

---

## 2. Doble función del mesh en VACA

A diferencia de bitchat (solo mensajería), en VACA el mesh transporta **dos tipos de carga**. **El propósito primario del producto es la propagación resiliente de datos FIBE, no el chat.**

> **Posicionamiento del producto:** VACA no es "un chat offline" (hay decenas). VACA es **un sistema de replicación distribuida de información crítica para desastres**: garantiza que un reporte capturado en la zona cero **sobreviva y llegue eventualmente** a un gateway con conectividad, saltando entre dispositivos aunque nunca haya habido red. La mensajería humana es una **consecuencia natural** del mismo transporte, no el objetivo.

### 2.1 Sincronización de datos P2P — *gossip / epidemic sync* (diferenciador central)
Los reportes FIBE se propagan por el mesh: cada `SyncQueueItem` viaja como payload, se replica entre peers y se **deduplica por UUID** (la idempotencia ya está en el modelo de datos). Eventualmente un **nodo gateway** (dispositivo que recupera internet) sube el lote a Supabase. Este es el diferenciador que define el valor de VACA.

### 2.2 Mensajería humana (coordinación) — subproducto del mismo transporte
Chat descentralizado para operadores, voluntarios y damnificados cuando no hay red:
- Coordinación de terreno ("necesitamos agua en el cuadrante 3", "ruta bloqueada en calle X").
- Canal local de emergencia por zona.
- Mensajes directos cifrados entre operadores.

Se construye sobre la misma capa de transporte; se prioriza su UI **después** del gossip de datos.

```
Operador A (sin red) capta reporte  ──BLE──▶  Operador B  ──BLE──▶  Operador C (con Starlink)
        [UUID:r1]                     gossip        [UUID:r1]  gossip      │
                                                                          ▼
                                                             POST /reports (gateway)
```
Esto es posible **gracias al diseño idempotente ya definido**: inundar la red con el mismo UUID nunca duplica; el primer gateway que lo suba gana, el resto se descarta por conflicto benigno.

---

## 3. Decisión arquitectónica: Transport Layer abstracto

**El resto de VACA nunca habla de "BLE mesh".** Habla de un **Transport Layer** genérico. Todo el sistema (modelo de datos, sync, UI) consume únicamente una interfaz estable:

```
Transport.send(packet)
Transport.receive() → stream de paquetes
Transport.status()  → disponibilidad / salud
```

Detrás de esa interfaz se enchufan **transportes intercambiables**, sin que cambie el modelo de datos, la sincronización ni la UI:

```
                 ┌───────────────────────────────┐
   VACA app ───▶ │        Transport Layer         │
                 └───────────────────────────────┘
                   ├── Internet (Supabase)      ✅ MVP
                   ├── Bluetooth LE Mesh         ▶ Fase Mesh
                   ├── Nearby / WiFi Direct      ○ futuro
                   ├── LoRa (radio larga dist.)  ○ futuro
                   ├── Satellite Gateway         ○ futuro
                   └── Nostr (internet)          ○ descartado / muy posterior
```

**Por qué es una decisión de hoy:** agregar WiFi Direct, UWB o LoRa en dos años no debe tocar el modelo de datos ni la UI. Es un costo arquitectónico mínimo ahora con impacto enorme en la evolución del proyecto. En el MVP existe **una sola** implementación (`InternetTransport`), pero la interfaz `Transport`/`MeshTransport` queda definida para incorporar el resto sin refactor.

### Ruteo inteligente (orden de preferencia)
1. **Datos FIBE:** Internet directo (gateway propio) → si no, **mesh gossip** hacia un gateway → si no, cola local `pending`.
2. **Mensajes directos:** Mesh (si el peer está en rango/multi-hop) → cola con entrega diferida → (internet, si aplica).

> El ruteo reutiliza la cola `SyncQueueItem` existente: cada transporte es simplemente **otro *drainer*** de esa cola. En el MVP el único drainer es `POST /reports`.

---

## 4. Modelo de red mesh (BLE LE)

Basado en el patrón de bitchat (parafraseado):
- **Descubrimiento automático** de peers cercanos; conexión sin emparejamiento manual.
- **Relay multi-salto** con límite de saltos (bitchat usa **máx. 7 hops**); cada paquete lleva un **TTL** que decrementa en cada reenvío.
- **Deduplicación** por ID de mensaje (message-ID) para evitar tormentas de broadcast.
- **Protocolo binario compacto** optimizado para las restricciones de BLE LE (MTU pequeño, fragmentación).
- **Duty cycling adaptativo** por batería (modo bajo consumo).
- **Roles simultáneos:** cada dispositivo actúa a la vez como **central** (escanea/lee) y **periférico** (anuncia/sirve GATT). Esto es clave y es la principal dificultad en Flutter (ver §6/§7).

### Tipos de canal (adaptado de bitchat)
| Canal | Transporte | Alcance | Uso en VACA |
| --- | --- | --- | --- |
| `#mesh` local | BLE | Dispositivos en rango multi-salto | Coordinación offline en zona cero. |
| Canal por zona (geohash) | Nostr (internet) | Área geográfica por precisión de geohash | Coordinación comunal/regional al reconectar. Mapea a comuna/cuadrante. |

Precisión geohash de referencia (bitchat): bloque (7 chars) → barrio (6) → ciudad (5) → provincia (4) → región (2). En VACA puede alinearse a **cuadrante / unidad vecinal / comuna / región**.

---

## 5. Seguridad

Mantiene el estándar de bitchat (parafraseado de fuentes públicas):
- **Cifrado E2E en mesh:** Noise Protocol (identidad con Curve25519, cifrado autenticado AES-GCM), con *forward secrecy*.
- **Cifrado en Nostr:** NIP-17 (mensajes "gift-wrapped"), claves efímeras por área geográfica.
- **Sin cuentas ni identificadores persistentes** para la mensajería; identidad criptográfica, no PII.
- **Emergency wipe / panic:** gesto rápido para borrar todos los datos locales del dispositivo (relevante en contextos de riesgo).

### Ajustes propios de VACA
- **Los datos FIBE que viajan por mesh van cifrados**; el `rutHash` (no el RUT) es lo único identificatorio, y las fotos viajan como referencia/hash o cifradas, nunca PII en claro.
- La **identidad Stellar del operador** (§F1 del flujo) y la **identidad de mensajería mesh** son **distintas**: la de mesh puede ser efímera; la de Stellar es la cuenta de ayuda. No mezclar.

---

## 6. Reutilización de bitchat: realidad técnica y legal

### 6.1 Qué existe
- `permissionlesstech/bitchat` — app nativa **iOS/macOS (Swift)**.
- `permissionlesstech/bitchat-android` — app nativa **Android (Kotlin)**, **API 26+**, compatibilidad de protocolo con iOS. → coincide con el target Android del SOW.
- `bitchat-web` — experimental sobre Web Bluetooth, con limitaciones reconocidas.
- Existen experimentos Flutter *inspirados* (ej. `mahesh-bora/ripple`), pero **no** implementan el mismo protocolo.

### 6.2 El problema de fondo: VACA es Flutter, bitchat es nativo
No se puede "importar" bitchat en Flutter. Además, el mesh exige rol **central + periférico simultáneo**, y los paquetes BLE de Flutter (ej. `flutter_blue_plus`) son fuertes en rol **central** pero débiles/limitados en rol **periférico** (advertising + GATT server), que es imprescindible para mesh.

### 6.3 Decisión de licencia: implementación clean-room (no copiar código)
**Decisión tomada:** VACA implementa el mesh como una **implementación limpia (clean-room) compatible con el protocolo**, reutilizando **únicamente la especificación del protocolo y el comportamiento observable** (formato de paquete, TTL, reglas de relay, handshake). **No se reutiliza código fuente de bitchat, aunque la licencia lo permitiera.**

Motivos:
- **Elimina el riesgo legal** por completo (evita la ambigüedad dominio público / GPLv3).
- Evita **dependencias** y **forks difíciles de mantener**.
- El protocolo en sí **no es complejo**; la complejidad real está en el manejo de BLE, que de todas formas hay que resolver en nuestro propio código.
- Mantiene a VACA con **licencia permisiva**, coherente con la capa comercial B2G de Vaquita Insights.

> Un protocolo (interoperabilidad, formato de paquete) no es copyrightable; reimplementarlo es legítimo. Copiar el código fuente sí está sujeto a su licencia — por eso no lo hacemos.

---

## 7. Opciones de implementación (tradeoffs)

| Opción | Descripción | Pros | Contras |
| --- | --- | --- | --- |
| **A — Módulo nativo Android + Platform Channels** | Implementar el mesh en Kotlin (protocolo reimplementado clean-room) y exponerlo a Flutter por MethodChannel/EventChannel, sin una API abstracta formal. | Rol BLE dual bien soportado en Android nativo; alcanza API 26+. | Solo Android; acopla Flutter al detalle de plataforma; sin la disciplina de API de la Opción D. *(La Opción D es una evolución de esta.)* |
| **B — Dart puro + paquete BLE dual-role** | Reimplementar el protocolo en Dart usando un paquete que soporte periférico (ej. `bluetooth_low_energy`) además de central. | Cross-platform, un solo lenguaje, sin dependencia de licencia de bitchat. | Rol periférico en Flutter es frágil/inmaduro; mayor esfuerzo; performance BLE mesh no probada. |
| **C — Nearby Connections API (Google)** | Usar la API de Nearby Connections (BLE+Wi-Fi Direct) vía plugin. | Mesh-P2P de alto nivel, robusto, multi-transporte. | Dependencia de Google Play Services; Android-céntrico; menos control del protocolo; no interopera con bitchat. |
| **D — Mesh Engine desacoplado (RECOMENDADA)** | Definir un **Mesh Engine** como componente independiente detrás de una **API estable**; la implementación por plataforma (`AndroidMeshEngine` en Kotlin hoy, `IOSMeshEngine` en Swift mañana) queda oculta. Flutter nunca sabe qué hay detrás. | Protocolo 100% separado del SO; Android-first sin cerrar la puerta a iOS; sin fugas de detalles BLE hacia Flutter; probable/portable a Rust si conviene. | Requiere disciplina de diseño de API por adelantado. |

**Recomendación: Opción D.** No se trata de "hacer un módulo Kotlin", sino de **definir un Mesh Engine autocontenido** detrás de una API estable:

```
Flutter UI
   ↓
Application Layer (Dart)
   ↓
Mesh API (interfaz estable):  start() · stop() · send() · onMessage() · onPeer()
   ↓
Mesh Engine  ── AndroidMeshEngine (Kotlin)   [hoy]
             └─ IOSMeshEngine (Swift)         [futuro, sin reescribir la app]
```

### 7.1 Dónde vive la lógica (corrección importante)
La lógica de red **NO se parte entre Dart y Kotlin.** El **Mesh Engine es autocontenido** y posee: **Discovery, Routing, TTL, Gossip, ACK y Relay**. Razón: TTL, routing y relay dependen fuertemente del estado en vivo de las conexiones BLE; si esa lógica viviera en Dart, se enviarían **cientos de eventos por MethodChannel**, frágil y lento.

Flutter recibe **solo eventos de alto nivel**, no el detalle BLE:
```
PeerFound · PeerLost · PacketReceived · PacketDelivered · NetworkHealth
```
La capa de aplicación en Dart se limita a: entregar payloads a enviar (`SyncQueueItem`), consumir esos eventos y actualizar el modelo de datos/UI. El dedupe de negocio por UUID sigue en Dart (idempotencia de datos), mientras que el dedupe de **broadcast** (`meshMessageId`, anti-tormenta) vive en el engine.

> Corrige la versión anterior de este documento, que sugería mantener cola/dedupe/gossip en Dart. La coordinación de red pertenece al engine; Dart orquesta datos, no paquetes.

---

## 8. Integración con el modelo de datos

El mesh **no cambia** el esquema; lo **reutiliza**. Frontera clara entre lo que gestiona el **engine** y lo que gestiona **Dart**:

- **Payload (Dart → engine):** la capa de aplicación entrega el `SyncQueueItem.payloadJson` como bytes a `Transport.send()`. Es la unidad que viaja por gossip.
- **Dedupe de negocio (Dart):** por `id` (UUID) del registro. Ya es idempotente ⇒ el gossip es seguro por diseño y un mismo reporte nunca se duplica en el backend.
- **Dedupe de broadcast + TTL + relay (engine):** el `meshMessageId` y el `ttl` (máx. 7 saltos) son **estado transitorio interno del engine**, no lógica de Dart. El engine mantiene la tabla de `messageId` vistos con expiración y aplica el backoff de reenvío.
- **Nodo gateway:** cualquier dispositivo capaz de `POST /reports`. Al subir, emite por mesh un ACK ligero (`delivered:UUID`) → el engine propaga `PacketDelivered` y los peers dejan de reenviar ese ítem.

Persistencia en el modelo de datos (extensión menor del `SyncQueueItem`, ver `modelo-datos-fibe.md §5.8`):
```
transportOrigin : 'local' | 'mesh' | 'internet'   ← persistido en Dart (auditoría: qué transporte entregó)
meshMessageId   : nullable                          ← opcional, solo para depuración/auditoría
ttl             : nullable                          ← opcional; la fuente de verdad del TTL vive en el engine
```
> `meshMessageId` y `ttl` son propiedad del engine; sus columnas en Drift existen solo para auditoría/debug, no como estado operativo que Dart deba gestionar.

---

## 9. Nostr en VACA (opcional / evaluación)

Nostr da alcance global resistente a censura y canales por geohash, pero **requiere internet** — justo lo que falta en el Día 0. Como VACA ya tiene Supabase como transporte de internet para datos, el valor incremental de Nostr es principalmente:
- **Mensajería resiliente** (no depende del backend de VACA).
- **Canales geográficos** públicos por zona.

**Recomendación:** tratar Nostr como **fase posterior y opcional**. El foco del valor diferencial está en el **BLE mesh** (offline) + gossip de FIBE. No invertir en Nostr hasta validar el mesh.

---

## 10. Requisitos y consideraciones Android

- **API 26+ (Android 8.0)** — alineado con el APK del SOW.
- **Permisos BLE (Android 12+):** `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT` (runtime); en < 12, permisos de ubicación para escaneo BLE. Manejo de denegación con estados de fallback.
- **Foreground service** para mantener el mesh activo en segundo plano (con notificación persistente).
- **Batería:** duty cycling adaptativo; advertir el consumo; permitir apagar el mesh.
- **Gama baja:** limitar conexiones concurrentes; paquetes compactos; sin trabajo pesado por frame.

---

## 11. Alcance y roadmap (recomendación honesta)

El mesh es un **feature grande** (BLE dual-role + protocolo binario + cifrado Noise + multi-hop + gossip). Meterlo completo en el Instaward de 30 días **pondría en riesgo** el alcance ya comprometido (captura offline + sync + loop Stellar).

**Propuesta de fases:**
- **MVP Instaward (actual):** **NO** implementar mesh. Mantener sync manual + (opcional) "traslado físico". Sí **dejar la arquitectura preparada** definiendo la **interfaz `Transport` / `MeshTransport`** (§3) con `InternetTransport` como única implementación. La cola `SyncQueueItem` y la idempotencia por UUID permiten sumar el mesh como otro transporte **sin refactor**.
- **Spike técnico (1–2 semanas, paralelo o post-MVP):** validar la Opción D con 2–3 teléfonos Android: `AndroidMeshEngine` mínimo (descubrimiento, 1 salto, envío de un `SyncQueueItem`, ACK de gateway) detrás de la Mesh API. Clean-room, sin código de bitchat.
- **Fase Mesh (award/sprint dedicado):** gossip multi-salto de FIBE (prioridad), luego mensajería `#mesh`, cifrado E2E, foreground service, panic wipe.
- **Fase futura (opcional):** transportes adicionales (WiFi Direct, LoRa, satélite) sobre la misma Transport Layer; Nostr solo si aparece una necesidad real.

`Markdowns/roadmap.md` ya incorpora la **"Fase 2.5: Capa de Comunicaciones Mesh"**.

---

## 12. Decisiones tomadas

Resueltas con el feedback de arquitectura (antes eran preguntas abiertas):

1. **¿Mesh en el MVP?** → **No.** Se desarrolla como sprint independiente **inmediatamente después** del MVP. El MVP deja preparada la interfaz `MeshTransport` para evitar refactors, sin comprometer el alcance del Instaward.
2. **Licencia objetivo.** → **Licencia permisiva** para VACA. **Implementación clean-room** compatible con el protocolo; **cero código GPL/bitchat**. Elimina el riesgo legal (§6.3).
3. **Android-only vs cross-platform.** → **Android-first con arquitectura multiplataforma.** No se desarrolla iOS ahora, pero la Mesh API (Opción D) se diseña desde hoy para que `IOSMeshEngine` sea posible sin reescribir la app.
4. **¿Nostr?** → **Descartado** por ahora (agrega complejidad, requiere internet, redundante con Supabase, no aporta al Día 0). Reevaluar mucho más adelante.
5. **¿Mensajería o gossip?** → **El objetivo primario es la propagación resiliente de datos FIBE** (replicación distribuida de información crítica). La mensajería humana es un subproducto del mismo transporte; su UI se construye después. Este framing también mejora el pitch del proyecto (ver §2).

---

*Documento de arquitectura de la capa de comunicaciones. Decisiones cerradas: Transport Layer abstracto (Opción D, Mesh Engine desacoplado autocontenido), clean-room sin código de terceros, Android-first multiplataforma, foco en propagación de datos. El mesh se apoya en el diseño idempotente de `modelo-datos-fibe.md` y se implementa fuera del MVP Instaward, con la arquitectura preparada para incorporarlo sin refactor.*
