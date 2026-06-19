# V.A.C.A. — MVP Web (Stellar Testnet)

Infraestructura de resiliencia humanitaria post-catástrofe sobre **Stellar**. El MVP
demuestra el riel de ayuda: **catastro → tokenización → donación → reclamo → Proof of Aid**,
todo verificable en Testnet, sobre un **globo terráqueo interactivo** enfocado en las regiones de Chile.

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

## Estructura

- `src/app/page.tsx` — orquestador (landing, globo, panel, log de transacciones).
- `src/components/VacaGlobe.tsx` — globo maplibre + regiones + focos.
- `src/components/RegionPanel.tsx` — panel de tokenizar/donar/reclamar.
- `src/lib/stellar.ts` — capa Stellar (cuentas demo, tokenizar, donar, reclamar).
- `src/lib/chile.ts` — datos simulados de catástrofes y necesidades por región.
- `public/chile-regions.geojson` — límites de las regiones (fuente: jlhonora/geo).
