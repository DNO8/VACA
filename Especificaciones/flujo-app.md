# Especificación Funcional y de Flujos — App Mobile VACA

> Define **cómo se comporta** la app offline-first de VACA: actores, modos operativos, inventario de pantallas, flujos E2E, máquinas de estado y detalles técnicos. Amarra el modelo de datos y el sistema de diseño con el comportamiento real del producto.
>
> **Deriva de:** `Markdowns/*` (visión, problema, solución, plataforma, arquitectura, protocolo_emergencia, mapa_emergencia, gobernanza, stellar, tecnologia).
> **Se apoya en:** `Especificaciones/modelo-datos-fibe.md`, `Especificaciones/sistema-diseno-app.md`.
> **Alcance:** MVP Instaward — flujo damnificado/beneficiario (SOW Deliverables 2–4). El flujo donante, el dashboard Vaquita Insights y Social Yield quedan fuera (ver §11).

---

## 1. Principios de comportamiento

1. **Offline-first real.** Toda acción de captura funciona sin red. La conectividad es una ventana oportunista, nunca un requisito. El estado por defecto es *offline* (Día 0).
2. **El dispositivo es el nodo.** Cada teléfono es una "isla de información" que contiene su verdad local (SQLite) hasta poder mergearla.
3. **La información fluye antes que el dinero.** Primero se captura y sincroniza la verdad emergente; recién con confianza suficiente + evidencia se habilita el riel financiero (Claimable Balance).
4. **Non-custodial.** La app nunca custodia fondos. Genera/gestiona llaves y consulta/reclama en Stellar; los fondos viven en la blockchain.
5. **Cero fricción en terreno.** Ninguna validación bloquea la captura en el Día 0. Los faltantes (foto, red, validación) degradan el Trust Score, no impiden guardar.
6. **Privacidad por diseño (Ley 19.628).** RUT y documentos se hashean; las fotos evitan personas.

---

## 2. Actores

| Actor | Descripción | En MVP |
| --- | --- | --- |
| **Operador comunitario espontáneo** | Vecino/voluntario/damnificado que captura reportes FIBE en terreno. Es el usuario principal de la app en el Día 0. Tiene keypair Stellar (CU1). | ✅ Rol central |
| **Damnificado / Beneficiario** | Persona/hogar afectado sobre quien se levanta el reporte y que eventualmente reclama la ayuda. Identidad = `rutHash`. | ✅ (vista beneficiario CU2 + reclamo) |
| **Backend / Motor de verdad emergente** | Servicio que recibe reportes, detecta consenso geográfico y eleva Trust Score. | ✅ (Supabase + lógica de merge) |
| **Distribuidor de ayuda (simulado)** | `TestnetDistributionAdapter` que emite Claimable Balances en testnet (rol que en producción cumple Sozu Pay). | ✅ (simulado, CU3) |
| **Municipio / COGRID / SENAPRED** | Validador institucional (oráculo) y consumidor de Vaquita Insights. | ❌ Fase posterior |
| **Fundación (ej. Hogar de Cristo)** | Valida beneficiarios vía Foundation Adapter (Merkle Proofs). | ❌ Fase posterior |

---

## 3. Modos operativos de la app

Derivados de `protocolo_emergencia.md`. El modo cambia el énfasis de la UI, no el modelo de datos.

| Modo | Cuándo | Comportamiento |
| --- | --- | --- |
| **Solidaridad 365** | Estado normal, sin emergencia activa. | Foco en preparación: perfil de operador, wallet, material educativo, reportes previos. Captura disponible pero no priorizada. |
| **Emergencia** | Activado por trigger (ALFA/SENAPRED o institucional) o manualmente por el operador. | La captura FIBE pasa al centro. Banner de evento activo. Priorización de sincronización. Mapa de la zona afectada. |

> En el MVP el "Modo Emergencia" se activa **manualmente** (seleccionar/crear un `EmergencyEvent`). Los triggers automáticos (integración SENAPRED) son fase posterior.

---

## 4. Inventario de pantallas

| # | Pantalla | Modo dominante | Flujo |
| --- | --- | --- | --- |
| P0 | Splash | Marca | arranque |
| P1 | Onboarding + creación de identidad de operador | Marca | F1 |
| P2 | Home / Dashboard del operador | Operación | todos |
| P3 | Selección/creación de evento de emergencia | Operación | F2 |
| P4 | Formulario FIBE (wizard M1 → M4 → M5 → evidencia) | Operación | F2 |
| P5 | Captura de foto (cámara + GPS) | Operación | F2 |
| P6 | Lista de reportes (con filtros y estados) | Operación | F3 |
| P7 | Detalle de reporte (+ Trust Score + evidencia) | Operación | F3, F5 |
| P8 | Centro de sincronización | Operación | F4 |
| P9 | Wallet del operador (balance testnet) | Operación | F1/CU1 |
| P10 | Vista beneficiario (balance + Claimable Balances pendientes) | Operación | F6/CU2 |
| P11 | Reclamo de ayuda | Operación | F8 |
| P12 | Proof of Aid (certificado) | Marca | F8 |
| P13 | Ajustes / permisos / diagnóstico | Operación | soporte |

### Mapa de navegación
```
P0 Splash
  └─ (primera vez) → P1 Onboarding → P2 Home
  └─ (recurrente)  → P2 Home
P2 Home
  ├─ "Reportar" ────────→ P3 Evento → P4 FIBE wizard → P5 Cámara ──┐
  │                                                                 └→ P6 Lista
  ├─ "Reportes" ────────→ P6 Lista → P7 Detalle
  ├─ "Sincronizar" ─────→ P8 Centro de sync
  ├─ "Mi wallet" ───────→ P9 Wallet operador
  ├─ "Ayuda / beneficiario" → P10 Vista beneficiario → P11 Reclamo → P12 Proof of Aid
  └─ "Ajustes" ─────────→ P13
```

---

## 5. Flujos E2E

Notación: cada flujo lista **precondición → pasos → postcondición**, con estados de datos (ver §7) y detalles técnicos.

### F1 · Onboarding e identidad del operador (CU1)
**Precondición:** app recién instalada.
**Pasos:**
1. P1 presenta el propósito (Modo Marca) y solicita permisos base (cámara, ubicación) con explicación previa.
2. Se genera un **keypair Stellar** (`KeyPair.random()` del `stellar_flutter_sdk`).
3. La **secret key** se guarda en `flutter_secure_storage` (Keystore Android); en Drift solo va `stellarPublicKey`.
4. Se financia la cuenta en testnet vía **Friendbot** (si hay red; si no, se difiere y se marca "pendiente de fondeo").
5. Se crea el registro `Operator` local.
6. **Passkeys/WebAuthn (prod-ready, Deliverable 3):** acceso seedless implementado a mano e integrado con el Stellar SDK (registro, autenticación y binding a la llave Stellar del operador); `flutter_secure_storage` como respaldo de la secret key.
**Postcondición:** operador con identidad y wallet testnet visible en P9.

### F2 · Captura FIBE offline
**Precondición:** operador creado; puede estar 100% offline.
**Pasos:**
1. P3: seleccionar un `EmergencyEvent` existente o crear uno (nombre, nivel, fecha). Esto genera la `saltForRutHash` del evento.
2. P4 wizard, un módulo por paso con progreso visible:
   - **Paso identidad+M1:** RUT del beneficiario (se hashea inmediatamente a `rutHash`, el claro no se persiste), nombre jefe/a de hogar, N° integrantes, dirección. **GPS** capturado con `geolocator` (lat/long + accuracy; UTM derivable).
   - **Paso M4 (vivienda):** tipo de vivienda, ocupación del sitio, pérdida de servicios básicos, pernoctación — vía chips/segmented (ver sistema de diseño §6.2).
   - **Paso M5 (daño):** afectación de enseres (Tabla N°8), afectación de vivienda (Tabla N°9), causa, daño significativo, habitabilidad. Al elegir el nivel de vivienda se calcula `minFotosRequeridas` (§6.bis del modelo de datos).
   - **Paso evidencia:** P5 cámara. Foto → caché local, se calcula **SHA-256**, se lee **EXIF timestamp** y se adjunta **GPS**. Se crea `Evidence(kind=damageHouse, assessmentId=...)`.
3. Guardar: se escriben `Household` + `HousingInfo` + `DamageAssessment` (+`Evidence`) con `syncStatus=pending`. Si falta la foto obligatoria → `evidenciaPendiente=true` (modo degradado, no bloquea).
4. Se encolan los `SyncQueueItem` correspondientes.
**Postcondición:** reporte local en estado `Capturado/Pending`, Trust Nivel 1.

### F3 · Lista y detalle de reportes
**Pasos:** P6 lista los reportes locales con chip de daño, estado de sync y badge de Trust. Filtros por evento/estado. P7 muestra el detalle, evidencia, Trust Score y acción "adjuntar foto" si `evidenciaPendiente`.

### F4 · Sincronización store-and-forward (CU network)
**Precondición:** existen `SyncQueueItem` en `pending`.
**Pasos:**
1. `connectivity_plus` detecta red **o** el operador pulsa "Sincronizar" en P8 (MVP = disparo manual).
2. Se procesa la cola: `POST /reports` por lotes, upsert idempotente por UUID; las fotos suben al bucket privado (`storage_path`).
3. Reintentos con **backoff exponencial** (`attempts`, `nextAttemptAt`). Errores recuperables → reencola; conflicto → estado `conflict`.
4. Al recibir ACK: `syncStatus=synced`, `syncedAt` fijado, `SyncQueueItem` eliminado.
**Postcondición:** reportes reflejados en el backend; UI muestra "N sincronizados".
**Estados UI:** banner de red (offline / online / syncing / success / error) — sistema de diseño §6.5.
**Transporte futuro (fuera de MVP):** el mismo `SyncQueueItem` podrá drenarse por **BLE mesh (gossip P2P)** hacia un nodo gateway cuando no haya internet propio. La arquitectura idempotente ya lo soporta. Ver `mesh-comunicaciones.md`.

### F5 · Verdad emergente (Trust Score)
**Pasos:**
1. Backend recibe reportes y busca **consenso geográfico**: múltiples reportes en un radio → eleva a **Nivel 2 (consenso)**.
2. **Nivel 3 (validado)** requiere Foundation Adapter/institución → fase posterior; en MVP se puede simular una validación manual.
3. El dispositivo **solo sube** de nivel al sincronizar el trust actualizado; nunca lo baja localmente.
4. Reglas duras: un reporte con `evidenciaPendiente=true` **no supera Nivel 1**.
**Postcondición:** `trustLevel` reflejado en P7 con "olas de confianza".

### F6 · Vista beneficiario (CU2)
**Precondición:** existe un reporte validado con `rutHash`.
**Pasos:**
1. P10: el beneficiario (o el operador en su nombre) consulta el **balance testnet** y **lista Claimable Balances pendientes** vinculados a su `rutHash`/public key.
2. Consulta vía `stellar_flutter_sdk`: `server.claimableBalances().forClaimant(publicKey)`.
**Postcondición:** el beneficiario ve la ayuda reservada para él.

### F7 · Distribución simulada de ayuda (CU3)
**Precondición:** `DamageAssessment` con Trust suficiente y **sin** `evidenciaPendiente`.
**Pasos:**
1. El `TestnetDistributionAdapter` (rol Sozu simulado) crea un **Claimable Balance** en testnet reservado para la public key/`rutHash` del beneficiario (asset `USDC` de prueba o `ITEM-AGUA`).
2. Se registra `ClaimableBalanceRef` con `emissionTxHash`, `status=reserved`.
**Postcondición:** ayuda reservada on-chain; visible en F6.
**Detalle técnico:** operación `CreateClaimableBalanceOperation` con predicado de reclamante = beneficiario.

### F8 · Reclamo de ayuda + Proof of Aid
**Precondición:** existe un Claimable Balance `reserved` para el beneficiario.
**Pasos:**
1. P11: el beneficiario se autentica (Passkeys / secure storage) y reclama.
2. `ClaimClaimableBalanceOperation` firmada con la llave del beneficiario → `claimTxHash`, `status=claimed`.
3. P12: se genera el **Proof of Aid** (mock): badge/certificado local referenciando un hash IPFS simulado + el `claimTxHash` + evidencia del daño.
**Postcondición:** ciclo cerrado; transacciones (emisión + reclamo) verificables en testnet.

---

## 6. Recorrido demo (guion del video del Deliverable 4)
`Operador captura offline (sin red) → guarda en SQLite → recupera conectividad → sincroniza a Supabase → backend acusa recibo → se emite Claimable Balance para el beneficiario → beneficiario reclama → Proof of Aid`. Debe mostrar los **tx hashes** de emisión y reclamo en testnet.

---

## 7. Máquinas de estado

### 7.1 Ciclo de vida de un reporte
```
Borrador ──guardar──▶ Capturado(pending, trust1)
Capturado ──adjuntar foto obligatoria──▶ Completo(pending, trust1)
Completo ──sync OK──▶ Sincronizado(synced, trust1)
Sincronizado ──consenso geográfico (backend)──▶ Validado L2(trust2)
Validado L2 ──validación institucional (fase post)──▶ Validado L3(trust3)
[cualquier pending] ──error red──▶ Reintentando(pending) ──▶ (vuelve a pending)
[sync divergente] ──▶ Conflicto(conflict) ──resolución──▶ Sincronizado
evidenciaPendiente=true ⇒ trust bloqueado en L1 y ayuda (CU3) deshabilitada
```

### 7.2 Conectividad / sync (por `SyncQueueItem`)
```
pending ──procesar──▶ syncing ──ACK──▶ synced (se elimina el item)
syncing ──error recuperable──▶ pending (backoff: nextAttemptAt)
syncing ──conflicto──▶ conflict (requiere resolución)
syncing ──error fatal──▶ error (visible en P8, acción reintentar)
```

### 7.3 Ayuda (Claimable Balance)
```
(sin ayuda) ──CU3 emite──▶ reserved ──beneficiario reclama──▶ claimed ──▶ Proof of Aid
```

---

## 8. Reglas de negocio transversales

1. **Evidencia por nivel de daño** (modelo de datos §6.bis): foto obligatoria para vivienda nivel ≥3; modo degradado con `evidenciaPendiente`.
2. **Trust gating de ayuda:** CU3 solo procede con reporte sin `evidenciaPendiente` y con Trust suficiente (mínimo configurable; recomendado ≥ Nivel 2 en producción, Nivel 1 aceptable para la demo).
3. **Idempotencia:** UUID de dispositivo como clave; reenviar no duplica.
4. **Privacidad:** `rutHash` (SHA-256 + sal por evento); fotos sin rostros; bucket privado.
5. **No bajar Trust en cliente:** solo el backend eleva; el cliente refleja.
6. **Tolerancia Día 0:** nada bloquea la captura por falta de red, GPS o foto.

---

## 9. Detalles técnicos por área

| Área | Paquete / API | Notas |
| --- | --- | --- |
| Persistencia | `drift` (SQLite) | Esquema en `modelo-datos-fibe.md`. |
| Estado | `riverpod` | Providers por flujo; repos en capa de dominio (Clean Architecture). |
| Cámara | `camera` / `image_picker` | Guardar a caché, calcular SHA-256 (`crypto`), leer EXIF (`exif`). |
| GPS | `geolocator` | Permisos runtime Android 10+; fallback si denegado. |
| Conectividad | `connectivity_plus` | Detección de ventana de red; sync manual en MVP. |
| Almacenamiento seguro | `flutter_secure_storage` | Secret key Stellar / device-token. |
| Backend | Supabase (Postgres + Storage) | `POST /reports` idempotente; bucket privado `evidence/`. |
| Blockchain | `stellar_flutter_sdk` (Soneso) | Keypair, Friendbot, `claimableBalances().forClaimant()`, `CreateClaimableBalanceOperation`, `ClaimClaimableBalanceOperation`. Red: **testnet**. |
| Hashing | `crypto` | SHA-256 de RUT, documentos y fotos. |
| Auth | WebAuthn/Passkeys (prod-ready) + `flutter_secure_storage` | Login seedless integrado con el Stellar SDK (Deliverable 3). |

---

## 10. Trazabilidad a los Deliverables del SOW

| Deliverable SOW | Flujos / pantallas cubiertos |
| --- | --- |
| **D1 — Fundación técnica + brandboard** | Scaffolding, esquema Drift, `sistema-diseno-app.md`, permisos cámara/GPS (parte de F2). |
| **D2 — Captura offline + wallet beneficiario** | F1 (CU1), F2 (captura FIBE offline), F6 (CU2), F7 (CU3 emisión demo), backend Supabase. |
| **D3 — Sync store-and-forward + Passkeys** | F4 (sync + estados de red), autenticación Passkeys prod-ready, P8. |
| **D4 — Cierre del loop + empaquetado** | F5, F8 (reclamo + Proof of Aid), demo E2E (§6), APK, tx hashes testnet. |

---

## 11. Fuera de alcance del MVP (fases posteriores)

- **Flujo donante** (captura/donación/giving) — sprint separado.
- **Vaquita Insights** (dashboard B2G, NEI, mapa de calor institucional).
- **Social Yield** (Defindex/Blend) y **Sozu Pay live** (aquí simulado con `TestnetDistributionAdapter`).
- **Triggers automáticos** SENAPRED/ALFA (aquí activación manual del evento).
- **Foundation Adapter / Merkle Proofs** (validación institucional Nivel 3 real).
- **Gobernanza comunitaria** (tokens de priorización de ayuda).
- **Sync en background** automático (MVP = manual).
- **Capa de comunicaciones mesh** (BLE offline: mensajería + gossip sync P2P) — especificada en `mesh-comunicaciones.md`, agendada como fase/award dedicado. La arquitectura del MVP queda preparada para incorporarla sin refactor.

> Nota: la **autenticación con Passkeys/WebAuthn** dejó de ser "fuera de alcance": ahora es un entregable **prod-ready del Deliverable 3** (login seedless integrado con el Stellar SDK).

---

*Documento de referencia para el diseño E2E (D2) y la implementación de flujos. Debe leerse junto con `modelo-datos-fibe.md` (qué se guarda) y `sistema-diseno-app.md` (cómo se ve). Ante conflicto, el modelo de datos manda sobre el detalle de flujo, y este sobre el diseño visual.*
