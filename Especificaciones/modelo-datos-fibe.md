# Modelo de Datos VACA — Ficha Básica de Emergencia (FIBE)

> Especificación técnica del modelo de datos offline-first para la captura de reportes FIBE en la app mobile de VACA, su sincronización *store-and-forward* con el backend, y el contrato con Supabase.
>
> **Fuente normativa:** Resolución 113 Exenta (12-ABR-2025), SENAPRED — Ministerio de Desarrollo Social y Familia.
> **Alcance:** MVP Instaward — flujo damnificado/beneficiario (Deliverables 2–4 del SOW).
> **Stack:** Flutter · Drift (SQLite) · Riverpod · Clean Architecture · Supabase (Postgres + Storage) · Stellar testnet (`Soneso/stellar_flutter_sdk`).

---

## 1. Principios de diseño del modelo

1. **Fidelidad normativa.** Los `enum` y campos reflejan 1:1 la FIBE vigente. Los códigos numéricos oficiales se preservan (ej. tipo de vivienda 1–4) para facilitar la transición al catastro estatal.
2. **Offline-first.** El dispositivo es el nodo primario. Todo se persiste localmente en SQLite antes de existir cualquier conectividad. La nube es un espejo eventual, nunca la fuente de verdad en el "Día 0".
3. **Identidad soberana y privacidad (Ley 19.628).** El RUT nunca se almacena ni se transmite en claro. Se usa `rutHash` (SHA-256 con sal por evento). La evidencia fotográfica se referencia por hash (SHA-256), no se expone públicamente.
4. **Idempotencia.** Cada registro nace con un `UUID` v4 generado en el dispositivo. La sincronización es un *upsert* idempotente por UUID: reenviar nunca duplica.
5. **Trazabilidad y auditoría.** Cada registro guarda `deviceId`, timestamps de captura y de sync, y el `trustLevel` (verdad emergente).
6. **Alcance MVP.** Se implementa completo el Módulo 5 (apreciación del daño) + los módulos mínimos que lo sostienen (encabezado, M1 localización, M4 vivienda, identidad del beneficiario). Los módulos 2, 3 y 6 se modelan de forma mínima/opcional y se completan en fases posteriores.

---

## 2. Estructura oficial de la FIBE (referencia)

La ficha se compone de un encabezado + 6 módulos + identificación de responsables:

| Bloque | Contenido | Estado en MVP |
| --- | --- | --- |
| **Encabezado** | Identificación de la emergencia: nombre, fecha del evento, fecha de encuestaje, fecha de digitación, folio. | ✅ Completo |
| **Módulo 1 — Dirección del Hogar** | Región, comuna, ciudad/localidad, población/sector/AH, unidad vecinal, calle, número, depto, block, teléfonos, localización UTM WGS84 (huso, este, norte / long, lat), tipo de zona. | ✅ Completo (foco en geolocalización) |
| **Módulo 2 — Composición del Hogar** | Por integrante: documento, nombres, apellidos, nacionalidad, género, edad, estudios, condición laboral, pérdida de trabajo, rubro, discapacidad, dependencia, parentesco, N° embarazadas, N° enfermos crónicos, observaciones. | 🟡 Mínimo (jefe/a de hogar + conteos) |
| **Módulo 3 — Necesidades especiales** | Cuidado y dependencia; priorización de necesidades básicas. | 🟡 Opcional |
| **Módulo 4 — Información de la Vivienda** | Tipo de vivienda, ocupación del sitio, pérdida de servicios básicos, pernoctación post-emergencia. | ✅ Completo |
| **Módulo 5 — Apreciación del daño** | *Exclusivo del encuestador/a.* Afectación de enseres, afectación de la vivienda, daño significativo, habitabilidad. | ✅ Completo (núcleo del MVP) |
| **Módulo 6 — Redes y Participación** | Redes de apoyo; ayuda de familiares/amigos/vecinos a corto plazo. | 🟡 Opcional |
| **Identificación de responsables** | Encuestador/a (firma, nombre, cédula) y encuestado/a (nombre, firma, cédula, correo). | ✅ Referenciado vía operador + beneficiario |

**Nivel de emergencia (Tabla N°1):** `emergencia_menor` → `emergencia_mayor` → `desastre` → `catastrofe`. Se asocia al evento; conecta con el "Trigger ALFA" y la activación por severidad.

---

## 3. Catálogo de enums oficiales

Extraídos de las tablas normativas (n1, n5, n8, n9). Se conservan los **códigos numéricos oficiales** como `value` persistido.

### 3.1 Nivel de emergencia (Tabla N°1)
| Código | Enum | Etiqueta |
| --- | --- | --- |
| 1 | `emergenciaMenor` | Emergencia menor (coordinación comunal) |
| 2 | `emergenciaMayor` | Emergencia mayor (coordinación provincial/regional) |
| 3 | `desastre` | Desastre (coordinación nacional) |
| 4 | `catastrofe` | Catástrofe (requiere asistencia internacional) |

### 3.2 Tipo de vivienda — Módulo 4 (Tabla N°5, versión codificada del formulario)
| Código | Enum | Etiqueta |
| --- | --- | --- |
| 1 | `casa` | Casa |
| 2 | `departamento` | Departamento |
| 3 | `mediagua` | Mediagua |
| 4 | `otro` | Otro (especificar en `viviendaOtroDetalle`) |

> Clasificación extendida del reglamento (referencia, no obligatoria en el formulario): Casa, Departamento, Pieza dentro de vivienda, Mediagua, Rancho/Ruca/Choza, Propiedad con destino principal habitacional, Viviendas fiscales, Viviendas colectivas. Se captura solo si se decide ampliar `tipoViviendaExtendido` en una fase posterior.

### 3.3 Ocupación del sitio — Módulo 4 (Tabla N°6)
| Código | Enum | Etiqueta |
| --- | --- | --- |
| 1 | `propio` | Propio |
| 2 | `arrendada` | Arrendada |
| 3 | `cedidaAllegado` | Cedida o Allegado |
| 4 | `ocupacionIrregular` | Ocupación irregular |
| 5 | `otro` | Otro (especificar) |

### 3.4 Pérdida de servicios básicos — Módulo 4 (Tabla N°7)
Booleano: `perdioServiciosBasicos` (Sí = true / No = false). `No` incluye el caso "no contaba con el servicio antes de la emergencia".

### 3.5 Pernoctación post-emergencia — Módulo 4
| Código | Enum | Etiqueta |
| --- | --- | --- |
| 1 | `domicilio` | Domicilio (residencia permanente) |
| 2 | `albergue` | Albergue |
| 3 | `otroDomicilio` | Otro domicilio |
| 4 | `viaPublica` | Vía pública (a la intemperie) |

### 3.6 Afectación de enseres — Módulo 5 (Tabla N°8)
| Código | Enum | Etiqueta | Criterio |
| --- | --- | --- | --- |
| 1 | `noAfectados` | No afectados | No hay enseres afectados |
| 2 | `pocoAfectados` | Poco afectados | Enseres menores (TV/radio, ropa, útiles escolares, utensilios de cocina) |
| 3 | `medianamenteAfectados` | Medianamente afectados | Entre 1% y 50% del total de enseres del hogar |
| 4 | `muyAfectados` | Muy afectados | Entre 51% y 100% del total de enseres del hogar |

### 3.7 Afectación de la vivienda — Módulo 5 (Tabla N°9)
| Código | Enum | Etiqueta |
| --- | --- | --- |
| 1 | `noAfectada` | No afectada |
| 2 | `pocoAfectada` | Poco afectada |
| 3 | `medianamenteAfectada` | Medianamente afectada |
| 4 | `muyAfectada` | Muy afectada |
| 5 | `destruida` | Destruida |

### 3.8 Causa/tipo de evento de la afectación — Módulo 5 (columnas Tabla N°9)
| Enum | Etiqueta |
| --- | --- |
| `sismosFenomenos` | Sismos / fenómenos naturales |
| `incendiosForestales` | Incendios forestales |
| `incendiosEstructurales` | Incendios estructurales |
| `erupcionesVolcanicas` | Erupciones volcánicas |

> ⚠️ **Pendiente de verificación fina:** el detalle textual de los criterios por celda de la Tabla N°9 es muy denso a resolución de pantallazo. Las etiquetas de nivel (3.7) y de causa (3.8) están confirmadas; los textos de ayuda por celda deben transcribirse desde el PDF original antes de cablearlos como *helper text* en el formulario.

### 3.9 Daño y habitabilidad — Módulo 5
- `danoSignificativo` : booleano (Sí/No).
- `puedeSerHabitada` : booleano (Sí/No).

### 3.10 Estados internos (no FIBE)
| Enum | Valores |
| --- | --- |
| `SyncStatus` | `pending`, `syncing`, `synced`, `conflict`, `error` |
| `TrustLevel` | `nivel1SenalTemprana`, `nivel2Consenso`, `nivel3Validado` |
| `EvidenceKind` | `damageHouse`, `damageGoods`, `context`, `document` |

---

## 4. Modelo de entidades (visión general)

```
EmergencyEvent (evento de emergencia)
  └── 1:N  Household (hogar afectado / reporte de damnificado)   ← M1 + identidad beneficiario
              ├── 1:1  HousingInfo (Módulo 4)
              ├── 1:1  DamageAssessment (Módulo 5)               ← núcleo del MVP
              │          └── 1:N  Evidence (fotos que respaldan el daño)
              ├── 1:N  HouseholdMember (Módulo 2, mínimo en MVP)
              └── 1:N  Evidence (fotos de contexto / documento)
Operator (operador comunitario espontáneo)  ← keypair Stellar (CU1)
SyncQueueItem (outbox store-and-forward)     ← referencia polimórfica a cualquier registro
ClaimableBalanceRef (CU2/CU3, ayuda en Stellar testnet)
```

Regla de negocio: un `Household` es una unidad de reporte FIBE completa. El `DamageAssessment` (M5) es lo mínimo que dispara el resto del flujo de ayuda. La evidencia fotográfica puede colgar del `DamageAssessment` (foto que respalda un nivel de daño concreto) o del `Household` (foto de contexto/documento). Ver §6.bis para la regla de evidencia obligatoria por nivel de daño.

---

## 5. Esquema Drift (SQLite local)

Tablas en sintaxis Drift (Dart). Todos los `id` son `UUID` v4 en texto, generados en el dispositivo.

### 5.1 Operator (operador comunitario)
```dart
class Operators extends Table {
  TextColumn get id => text()();                       // UUID
  TextColumn get displayName => text().nullable()();
  TextColumn get stellarPublicKey => text().nullable()(); // CU1 (G...)
  // La secret key NO va en Drift: se guarda en flutter_secure_storage.
  DateTimeColumn get createdAt => dateTime()();
  @override Set<Column> get primaryKey => {id};
}
```

### 5.2 EmergencyEvent (encabezado)
```dart
class EmergencyEvents extends Table {
  TextColumn get id => text()();                       // UUID
  TextColumn get nombre => text()();                   // nombre de la emergencia
  TextColumn get folio => text().nullable()();         // folio FIBE (asignado por SISE)
  IntColumn  get nivelEmergencia => intEnum<NivelEmergencia>()();
  DateTimeColumn get fechaEvento => dateTime()();
  DateTimeColumn get fechaEncuestaje => dateTime().nullable()();
  DateTimeColumn get fechaDigitacion => dateTime().nullable()();
  TextColumn get saltForRutHash => text()();           // sal por evento (privacidad)
  DateTimeColumn get createdAt => dateTime()();
  @override Set<Column> get primaryKey => {id};
}
```

### 5.3 Household (Módulo 1 + identidad del beneficiario)
```dart
class Households extends Table {
  TextColumn get id => text()();                       // UUID
  TextColumn get eventId => text().references(EmergencyEvents, #id)();
  TextColumn get operatorId => text().references(Operators, #id)();

  // Identidad del beneficiario (privacidad Ley 19.628)
  TextColumn get rutHash => text()();                  // SHA-256(rut + saltForRutHash)
  TextColumn get jefeHogarNombre => text().nullable()();
  IntColumn  get numIntegrantes => integer().withDefault(const Constant(1))();

  // Módulo 1 — Dirección del hogar
  TextColumn get region => text().nullable()();
  TextColumn get comuna => text().nullable()();
  TextColumn get ciudadLocalidad => text().nullable()();
  TextColumn get poblacionSectorAh => text().nullable()();
  TextColumn get unidadVecinal => text().nullable()();
  TextColumn get calle => text().nullable()();
  TextColumn get numero => text().nullable()();
  TextColumn get departamento => text().nullable()();
  TextColumn get block => text().nullable()();
  TextColumn get telefono1 => text().nullable()();
  TextColumn get telefono2 => text().nullable()();

  // Geolocalización (UTM WGS84) — capturada por geolocator
  RealColumn get latitud => real().nullable()();
  RealColumn get longitud => real().nullable()();
  IntColumn  get utmHuso => integer().nullable()();
  RealColumn get utmEste => real().nullable()();
  RealColumn get utmNorte => real().nullable()();
  RealColumn get gpsAccuracyMeters => real().nullable()();
  TextColumn get tipoZona => text().nullable()();

  // Metadatos / sync / trust
  IntColumn  get trustLevel => intEnum<TrustLevel>().withDefault(const Constant(0))();
  IntColumn  get syncStatus => intEnum<SyncStatus>().withDefault(const Constant(0))();
  TextColumn get deviceId => text()();
  DateTimeColumn get capturedAt => dateTime()();
  DateTimeColumn get syncedAt => dateTime().nullable()();
  IntColumn  get schemaVersion => integer().withDefault(const Constant(1))();

  @override Set<Column> get primaryKey => {id};
}
```

### 5.4 HousingInfo (Módulo 4)
```dart
class HousingInfos extends Table {
  TextColumn get id => text()();                       // UUID
  TextColumn get householdId => text().references(Households, #id)();
  IntColumn  get tipoVivienda => intEnum<TipoVivienda>()();
  TextColumn get viviendaOtroDetalle => text().nullable()();
  IntColumn  get ocupacionSitio => intEnum<OcupacionSitio>()();
  TextColumn get ocupacionOtroDetalle => text().nullable()();
  BoolColumn get perdioServiciosBasicos => boolean()();
  IntColumn  get pernoctacion => intEnum<Pernoctacion>()();
  @override Set<Column> get primaryKey => {id};
}
```

### 5.5 DamageAssessment (Módulo 5 — núcleo)
```dart
class DamageAssessments extends Table {
  TextColumn get id => text()();                       // UUID
  TextColumn get householdId => text().references(Households, #id)();
  // Exclusivo del encuestador/a
  TextColumn get operatorId => text().references(Operators, #id)();

  IntColumn  get afectacionEnseres => intEnum<AfectacionEnseres>()();      // Tabla N°8
  IntColumn  get afectacionVivienda => intEnum<AfectacionVivienda>()();    // Tabla N°9
  IntColumn  get causaAfectacion => intEnum<CausaAfectacion>().nullable()();
  BoolColumn get danoSignificativo => boolean()();
  BoolColumn get puedeSerHabitada => boolean()();
  TextColumn get observaciones => text().nullable()();

  // Evidencia fotográfica (ver §6.bis). minFotosRequeridas se deriva del nivel de
  // afectacionVivienda al momento de la captura; se persiste para auditar la regla vigente.
  IntColumn  get minFotosRequeridas => integer().withDefault(const Constant(0))();
  IntColumn  get fotosAdjuntadas => integer().withDefault(const Constant(0))();
  BoolColumn get evidenciaPendiente => boolean().withDefault(const Constant(false))();
  @override Set<Column> get primaryKey => {id};
}
```

### 5.6 HouseholdMember (Módulo 2 — mínimo en MVP)
```dart
class HouseholdMembers extends Table {
  TextColumn get id => text()();                       // UUID
  TextColumn get householdId => text().references(Households, #id)();
  // En MVP solo se captura lo esencial; el resto queda nullable para fases futuras.
  TextColumn get nombres => text().nullable()();
  TextColumn get apellidos => text().nullable()();
  TextColumn get documentoHash => text().nullable()(); // nunca en claro
  TextColumn get nacionalidad => text().nullable()();
  TextColumn get genero => text().nullable()();
  IntColumn  get edad => integer().nullable()();
  TextColumn get parentesco => text().nullable()();
  BoolColumn get discapacidad => boolean().nullable()();
  BoolColumn get dependencia => boolean().nullable()();
  BoolColumn get embarazada => boolean().nullable()();
  BoolColumn get enfermoCronico => boolean().nullable()();
  @override Set<Column> get primaryKey => {id};
}
```

### 5.7 Evidence (fotos)
```dart
class Evidences extends Table {
  TextColumn get id => text()();                       // UUID
  TextColumn get householdId => text().references(Households, #id)();
  // Enlaza la foto a la apreciación de daño que respalda (null si es contexto/documento).
  TextColumn get assessmentId => text().references(DamageAssessments, #id).nullable()();
  IntColumn  get kind => intEnum<EvidenceKind>()();
  TextColumn get localPath => text()();                // ruta en cache del dispositivo
  TextColumn get sha256 => text()();                   // hash del archivo (integridad)
  RealColumn get latitud => real().nullable()();
  RealColumn get longitud => real().nullable()();
  DateTimeColumn get takenAt => dateTime()();          // EXIF timestamp
  TextColumn get remoteUrl => text().nullable()();     // URL Supabase Storage tras sync
  IntColumn  get syncStatus => intEnum<SyncStatus>().withDefault(const Constant(0))();
  @override Set<Column> get primaryKey => {id};
}
```

### 5.8 SyncQueueItem (outbox store-and-forward)
```dart
class SyncQueueItems extends Table {
  TextColumn get id => text()();                       // UUID de la operación
  TextColumn get entityType => text()();               // 'household' | 'evidence' | ...
  TextColumn get entityId => text()();                 // UUID del registro afectado
  TextColumn get operation => text()();                // 'upsert' | 'delete'
  TextColumn get payloadJson => text()();              // snapshot serializado
  IntColumn  get attempts => integer().withDefault(const Constant(0))();
  DateTimeColumn get nextAttemptAt => dateTime().nullable()(); // backoff exponencial
  TextColumn get lastError => text().nullable()();
  IntColumn  get status => intEnum<SyncStatus>().withDefault(const Constant(0))();
  DateTimeColumn get createdAt => dateTime()();

  // Transporte (ver Especificaciones/mesh-comunicaciones.md §8). Permite que el mismo
  // ítem viaje por internet o por gossip BLE mesh; el dedupe por UUID lo hace idempotente.
  TextColumn get transportOrigin => text().withDefault(const Constant('local'))(); // local | mesh | internet
  TextColumn get meshMessageId => text().nullable()();  // dedupe de broadcast en mesh
  IntColumn  get ttl => integer().nullable()();          // saltos restantes (mesh, máx. 7)
  @override Set<Column> get primaryKey => {id};
}
```

> **Preparado para mesh (sin implementarlo en el MVP):** estos tres campos permiten añadir el transporte BLE mesh como *drainer* alternativo de la cola sin refactor. El mesh queda documentado en `Especificaciones/mesh-comunicaciones.md` y **fuera del alcance del Instaward**.

### 5.9 ClaimableBalanceRef (CU2/CU3 — ayuda en Stellar testnet)
```dart
class ClaimableBalanceRefs extends Table {
  TextColumn get id => text()();                       // UUID local
  TextColumn get householdId => text().references(Households, #id)();
  TextColumn get balanceId => text().nullable()();     // ID del Claimable Balance en Stellar
  TextColumn get beneficiaryPublicKey => text().nullable()();
  TextColumn get assetCode => text()();                // 'USDC' | 'ITEM-AGUA' | ...
  TextColumn get amount => text()();                   // string para precisión
  TextColumn get emissionTxHash => text().nullable()();
  TextColumn get claimTxHash => text().nullable()();
  TextColumn get status => text()();                   // 'reserved' | 'claimed'
  DateTimeColumn get createdAt => dateTime()();
  @override Set<Column> get primaryKey => {id};
}
```

---

## 6. Privacidad e identidad (Ley 19.628)

- **RUT → `rutHash`.** `rutHash = SHA-256(rutNormalizado + saltForRutHash)`. La sal vive en el `EmergencyEvent` y permite cruces dentro de un mismo evento sin exponer el RUT. El RUT en claro nunca se persiste ni se transmite.
- **Documentos de integrantes.** Mismo tratamiento (`documentoHash`).
- **Fotos.** Se guarda `sha256` para integridad y trazabilidad (Proof of Aid). El archivo va a un bucket privado de Supabase Storage; la exposición pública es solo el hash, opcionalmente anclado a IPFS en fases posteriores.
- **Encuadre de fotos de daño.** Guía de captura: encuadrar el daño (fachada, techo, estructura, enseres), **evitar rostros y datos identificatorios de personas**. Si aparece una persona de forma incidental, se recomienda difuminar antes de sincronizar. La foto respalda el daño, no identifica al damnificado (para eso está el `rutHash`).
- **Merkle Proofs (fase posterior).** El `rutHash` es el insumo para validar pertenencia a catastros institucionales (Foundation Adapter) sin publicar datos personales on-chain.

---

## 6.bis Regla de evidencia por nivel de daño

La FIBE oficial **no exige fotos**; la evidencia fotográfica es un valor agregado de VACA para sustentar la "verdad emergente", el Trust Score y el Proof of Aid. Esta regla define cuándo la foto es obligatoria, sin bloquear nunca la captura en terreno (Día 0).

### 6.bis.1 Mínimo de fotos por `afectacionVivienda`
| Nivel de vivienda | `minFotosRequeridas` | Obligatoriedad |
| --- | --- | --- |
| 1 · No afectada | 0 | Opcional |
| 2 · Poco afectada | 0 | Opcional (recomendada) |
| 3 · Medianamente afectada | 1 | **Obligatoria** |
| 4 · Muy afectada | 1 | **Obligatoria** |
| 5 · Destruida | 1 | **Obligatoria** |

- La foto obligatoria debe ser `EvidenceKind.damageHouse` y quedar ligada al `DamageAssessment` vía `assessmentId`.
- Para daño de enseres alto (`muyAfectados`) se **recomienda** (no obliga) al menos una foto `damageGoods`.
- `minFotosRequeridas` se calcula al elegir el nivel y se **persiste** en el `DamageAssessment` para auditar bajo qué regla se capturó el reporte (la regla puede evolucionar entre versiones).

### 6.bis.2 Modo degradado (Día 0 tolerante)
Si el operador no puede tomar la foto (sin cámara, sin batería, contexto de riesgo):
1. Se permite **guardar el reporte igual** con `evidenciaPendiente = true`.
2. El reporte no puede superar **Trust Nivel 1** hasta adjuntar la evidencia obligatoria.
3. La UI marca el reporte como "evidencia pendiente" y ofrece adjuntar la foto más tarde (antes o después de sincronizar).
4. `fotosAdjuntadas >= minFotosRequeridas` ⇒ `evidenciaPendiente = false` y el reporte queda habilitado para elevar su Trust Score.

### 6.bis.3 Efecto en el flujo de ayuda
- Un `DamageAssessment` con `evidenciaPendiente = true` **no habilita** la emisión de Claimable Balance (CU3): la ayuda trazable exige respaldo visual del daño.
- El backend valida la regla al recibir el reporte (`afectacion_vivienda >= 3` ⇒ debe existir al menos una `evidence` con `kind = damageHouse` ligada a ese assessment) y refleja `evidencia_pendiente` en `reports`.

---

## 7. Contrato de sincronización (store-and-forward)

### 7.1 Flujo
1. **Captura offline:** se escribe el `Household` + `HousingInfo` + `DamageAssessment` + `Evidence` en SQLite con `syncStatus = pending`.
2. **Encolado:** por cada entidad se inserta un `SyncQueueItem` (`operation = upsert`) con el snapshot JSON.
3. **Detección de conectividad:** `connectivity_plus`. Ante una ventana de red (o disparo manual en el MVP), se procesa la cola.
4. **Envío por lotes idempotente:** `POST /reports` (batch) con upsert por `UUID`. Reintentos con *backoff* exponencial (`nextAttemptAt`, `attempts`).
5. **Evidencia:** las fotos suben al Storage bucket; se actualiza `remoteUrl` y `syncStatus = synced`.
6. **Confirmación:** al recibir ACK del backend, el registro pasa a `synced` y su `SyncQueueItem` se elimina. Ante error recuperable → `pending` reencolado; ante conflicto → `conflict` para resolución.

### 7.2 Reglas
- **Idempotencia:** la clave natural remota es el `UUID` del dispositivo. Reenviar el mismo UUID actualiza, no duplica.
- **Orden:** primero `households` (padre), luego dependientes (`housing_info`, `damage_assessment`, `evidence`). El backend valida FK por `household_id`.
- **Merge / verdad emergente:** el backend puede elevar `trust_level` al detectar múltiples reportes en un radio geográfico (Nivel 2 consenso). El dispositivo no baja el nivel; solo el backend lo sube.
- **Reloj:** se usan timestamps del dispositivo (`capturedAt`) como verdad de captura; el backend agrega `receivedAt`. No se depende de reloj sincronizado.

---

## 8. Backend Supabase (espejo en la nube)

Postgres. Nombres en `snake_case`. Todas las tablas replican el `id` (UUID) del dispositivo como PK.

### 8.1 Tablas
```sql
-- reports: aplana Household + HousingInfo + DamageAssessment para el MVP.
create table reports (
  id                    uuid primary key,          -- UUID del dispositivo (idempotencia)
  event_id              uuid not null,
  operator_id           uuid not null,
  device_id             text not null,
  rut_hash              text not null,
  jefe_hogar_nombre     text,
  num_integrantes       int  default 1,

  -- Módulo 1
  region                text, comuna text, ciudad_localidad text,
  poblacion_sector_ah   text, unidad_vecinal text, calle text, numero text,
  departamento          text, block text, telefono1 text, telefono2 text,
  latitud               double precision, longitud double precision,
  utm_huso              int, utm_este double precision, utm_norte double precision,
  gps_accuracy_meters   double precision, tipo_zona text,

  -- Módulo 4
  tipo_vivienda            smallint,   -- 1..4
  vivienda_otro_detalle    text,
  ocupacion_sitio          smallint,   -- 1..5
  perdio_servicios_basicos boolean,
  pernoctacion             smallint,   -- 1..4

  -- Módulo 5
  afectacion_enseres    smallint,      -- 1..4
  afectacion_vivienda   smallint,      -- 1..5
  causa_afectacion      smallint,
  dano_significativo    boolean,
  puede_ser_habitada    boolean,
  observaciones         text,
  min_fotos_requeridas  smallint default 0,
  fotos_adjuntadas      smallint default 0,
  evidencia_pendiente   boolean default false,

  trust_level           smallint default 0,
  captured_at           timestamptz not null,
  received_at           timestamptz default now(),
  schema_version        int default 1
);

create table evidence (
  id            uuid primary key,      -- UUID del dispositivo
  report_id     uuid not null references reports(id),
  assessment_id uuid,                  -- daño que respalda (null si contexto/documento)
  kind          smallint not null,     -- 0 damageHouse · 1 damageGoods · 2 context · 3 document
  storage_path  text not null,         -- ruta en el bucket
  sha256        text not null,
  latitud       double precision, longitud double precision,
  taken_at      timestamptz not null,
  received_at   timestamptz default now()
);
```

### 8.2 Endpoint de sync
- **`POST /reports`** — cuerpo: `{ reports: Report[], evidence: EvidenceMeta[] }`. Upsert idempotente (`insert ... on conflict (id) do update`). Responde `{ accepted: uuid[], conflicts: uuid[] }`.
- **Storage:** bucket privado `evidence/`. El binario de la foto sube por separado (multipart) con `storage_path = evidence/{report_id}/{evidence_id}.jpg`.
- **Auth:** Passkeys/WebAuthn (prod-ready, Deliverable 3) integrado con el Stellar SDK, acceso seedless; device-token como respaldo.

### 8.3 Índices sugeridos
```sql
create index on reports (event_id);
create index on reports (rut_hash);
create index on reports (latitud, longitud);   -- consenso geográfico / verdad emergente
create index on evidence (report_id);
```

---

## 9. Versionado y migraciones

- `schemaVersion` en cada registro permite evolucionar el esquema sin romper datos capturados en terreno.
- Migraciones Drift versionadas (`MigrationStrategy`). Nunca se borra una columna con datos de campo sin migración explícita.
- El backend acepta `schema_version` y aplica *defaults* tolerantes para registros de versiones anteriores.

---

## 10. Alcance MVP vs fases posteriores

| Elemento | MVP (Instaward) | Fase posterior |
| --- | --- | --- |
| Encabezado + M1 + M4 + M5 | ✅ | — |
| Identidad beneficiario (`rutHash`) | ✅ | Merkle Proofs / Foundation Adapter |
| Evidencia con SHA-256 + GPS | ✅ | Anclaje IPFS del hash |
| Sync manual (outbox + backoff) | ✅ | Sync en background automático |
| Stellar CU1/CU2/CU3 (testnet) | ✅ | Sozu Pay live, Social Yield |
| Módulo 2 completo | 🟡 mínimo | ✅ composición completa del hogar |
| Módulos 3 y 6 | 🟡 opcional | ✅ necesidades y redes |
| Auth | Passkeys/WebAuthn (prod-ready) + device-token de respaldo | Hardening / multi-dispositivo |

---

*Documento base para el Deliverable 1 (esquema Drift) y Deliverable 2 (captura offline + backend Supabase). Los criterios textuales por celda de la Tabla N°9 deben transcribirse desde el PDF original antes de usarse como texto de ayuda en el formulario.*
