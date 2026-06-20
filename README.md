# V.A.C.A. — Vaquita de Ayuda y Coordinación Activa

Infraestructura cívica descentralizada para transformar la solidaridad ciudadana en una **autopista de resiliencia humanitaria** en Chile y América Latina.

> **La idea central:** cuando un desastre colapsa la información y el Estado tarda días en llegar, VACA permite que la comunidad genere el primer catastro, que los donantes envíen ayuda trazable y que los damnificados la reclamen directamente — sin que la fundación custodie el dinero.

## ¿Qué problema resolvemos?

- **El abismo del "Día 0":** la Ficha FIBE tarda entre 3 y 14 días en ejecutarse masivamente; mientras tanto, no hay datos confiables sobre quién necesita qué.
- **La "segunda catástrofe":** la solidaridad espontánea genera desorden logístico: basura humanitaria (ropa sucia, pañales vencidos), rutas saturadas y ayuda sin dirección.
- **La crisis de confianza:** los donantes desconfían del destino final de sus aportes por falta de trazabilidad en tiempo real.
- **El músculo estatal limitado:** SENAPRED cuenta con recursos mínimos y personal de terreno insuficiente.

## ¿Cómo funciona VACA?

El sistema se organiza en cuatro capas:

1. **Community Coordination Layer** — app mobile offline-first para que vecinos y damnificados generen el primer catastro durante el colapso de datos.
2. **Aid Distribution Layer** — donaciones en USDC y vouchers tokenizados sobre la red Stellar, distribuidos con Claimable Balances.
3. **Vaquita Insights** — capa analítica SaaS B2G/B2B para gobiernos, municipalidades y ONGs.
4. **Proof of Aid** — certificados de impacto inmutables que devuelven la confianza al donante.

## ¿Por qué Stellar?

- **Costos insignificantes y liquidación en segundos:** microtransacciones ideales para ayuda humanitaria.
- **Claimable Balances nativos:** permite reservar fondos para un RUT o wallet específico sin que la fundación los custodie.
- **Cuentas multifirma:** cada evento de emergencia puede tener una wallet que exija firmas conjuntas (plataforma + municipalidad) para prevenir fraudes.
- **Tokenización simple:** creación de assets específicos (`ITEM-AGUA`, `VOUCHER-HABITACION`) para vincular la donación con insumos concretos.
- **Cumplimiento regulatorio:** al no custodiar fondos, VACA evita la fricción de licencias bancarias transfronterizas.

## MVP Web (Stellar Testnet)

Este repositorio contiene el MVP web demostrable para el Instaward de Stellar. El demo ejecuta el riel completo de ayuda — **catastro → tokenización → donación → reclamo → Proof of Aid** — todo verificable en Testnet, sobre un **globo terráqueo interactivo** enfocado en las regiones de Chile.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **maplibre-gl 5** (proyección globo) + estilo CARTO dark-matter
- **TailwindCSS 4**
- **@stellar/stellar-sdk** (Horizon Testnet, friendbot, Claimable Balances)
- Gestor de paquetes: **pnpm**

## Cómo correr

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Para regenerar los límites de las regiones de Chile:

```bash
node scripts/build-regions.mjs   # escribe public/chile-regions.geojson
```

## Flujo del demo (sin wallet)

1. **Landing** con globo terráqueo → "Iniciar simulación".
2. El globo **vuela a Chile**; aparecen **focos de catástrofe** simulados (puntos pulsantes)
   y las **regiones** como polígonos clicables.
3. Al iniciar, la app crea/fondea **cuentas Testnet efímeras** (friendbot: Plataforma,
   Donante, Beneficiario y Municipalidad) y emite USDC de demo.
4. Click en una región afectada → **panel lateral** con el riel completo del pitch:
   - **1. Catastro · Verdad emergente** → valida los reportes comunitarios (confianza →
     100%) y **activa la capa de ayuda** (gating).
   - **2. Wallet multifirma del evento** → crea una cuenta **2-de-2** (Plataforma +
     Municipalidad) anti-fraude.
   - **3. Tokenizar** necesidades → emite assets `ITEM-*` (`AGUA`, `KITHAB`…) en Testnet.
   - **4. Donar USDC** → aporta al **pool multifirma** del evento.
   - **5. Liberar + Proof of Aid** → liberación con **doble firma** → **Claimable Balance** →
     el beneficiario reclama (prueba de entrega).
5. Cada transacción aparece en el panel inferior con enlace a **Stellar Expert** (Testnet).

### Cobertura de primitivas Stellar (Pitch, Diapositiva 5)

- **Claimable Balances (USDC)** ✅
- **Tokenización de insumos (`ITEM-*`)** ✅
- **Cuentas multifirma 2-de-2 por evento** ✅
- **Verdad emergente / confianza progresiva (Diapositivas 2–4)** ✅ (gating del Aid Layer)
- **Contrato Soroban de Proof of Aid** ⏳ pendiente (hoy el Proof of Aid usa primitivas nativas).

> Las llaves del modo demo son **solo Testnet** (sin valor real). La arquitectura objetivo es
> non-custodial (firma client-side del propio usuario); el modo demo firma por conveniencia.

## Tests E2E (Playwright)

```bash
pnpm exec playwright install chromium   # una vez
pnpm test:e2e                            # corre la suite (reusa el dev server)
pnpm test:e2e:ui                         # modo interactivo
```

La suite (`tests/e2e/flow.spec.ts`) cubre: landing + CTA, inicialización de Testnet,
región sin catástrofe, el **flujo completo** (validar → multifirma → tokenizar → donar →
liberar 2-de-2 + Proof of Aid) y el **gating** de pasos antes de validar el catastro.

Para que el E2E sea rápido y determinista hay dos afordancias (también útiles como deep-links):

- **`?mock=1`** — la capa Stellar responde con datos simulados (sin tocar la red Testnet).
- **`?start=1`** y **`?region=<COD_REGI>`** — saltan el landing y abren el panel de una región
  sin depender del click sobre el canvas del globo (ej. `/?start=1&region=5&mock=1`).

## Modelo de negocio

VACA opera bajo una **sostenibilidad híbrida**:

- **Gratis para ciudadanos y voluntarios:** la app comunitaria y el reclamo de ayuda no tienen costo.
- **SaaS B2G/B2B:** Vaquita Insights se vende a municipalidades, GOREs y ONGs como suscripción anual en UTM.
- **Non-custodial:** VACA no custodia los fondos; la ejecución financiera fluye por Stellar y rieles regulados como Sozu Pay, reduciendo la fricción regulatoria.
- **Social Yield:** los fondos en tránsito pueden generar rendimientos en DeFi para neutralizar comisiones de off-ramp y maximizar el impacto.

## Roadmap

- **Fase 1 (actual):** MVP Web — riel de ayuda y tokenización sobre Stellar Testnet.
- **Fase 2:** MVP Mobile — app offline-first con sincronización eventual para el "Día 0".
- **Fase 3:** Vaquita Insights — SaaS institucional con National Emergency Index (NEI).
- **Fase 4:** Gobernanza comunitaria y escalamiento regional (Chile → Colombia, Perú, Ecuador, Paraguay).

## Estructura

- `src/app/page.tsx` — orquestador (landing, globo, panel, log de transacciones).
- `src/components/VacaGlobe.tsx` — globo maplibre + regiones + focos.
- `src/components/RegionPanel.tsx` — panel de tokenizar/donar/reclamar.
- `src/lib/stellar.ts` — capa Stellar (cuentas demo, tokenizar, donar, reclamar).
- `src/lib/chile.ts` — datos simulados de catástrofes y necesidades por región.
- `public/chile-regions.geojson` — límites de las regiones (fuente: jlhonora/geo).
