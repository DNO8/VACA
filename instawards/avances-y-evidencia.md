# Avances y evidencia — execution readiness

Lo que ya está construido y verificable. El Instaward financia el salto
de "funciona en demo" a "production-ready", no partir de cero.

## Core offline-first (fuera del scope Stellar, ya cerrado)

- **Outbox durable**: señal persistida en Drift/SQLite antes de
  transmitir; sobrevive kill de proceso y reinicio de dispositivo.
- **Entrega verificada**: `bundle-ingest` (Supabase Edge Function)
  valida la firma del bundle y emite **recibo Ed25519 firmado** que el
  dispositivo verifica localmente — el servidor no puede fingir recepción.
- **Idempotencia**: replay del mismo bundle produce un solo incidente
  (dedupe por `message_id`/`payload_hash` server-side).
- **Adjuntos independientes**: foto/thumbnail suben por canal separado
  sin bloquear la señal P0/P1.
- **Resultado medido** (guion de evidencia, Entregable 3): 4 bundles
  entregados con recibos válidos, replay idempotente confirmado, 3
  adjuntos recuperados tras interrupción.

## Flujo Stellar/Vaquita (testnet, real y on-chain)

- **Wallet auto-custodiada**: creada y fondeada (Friendbot) tras el
  onboarding sin fricción; recuperación para instalaciones antiguas;
  la app funciona sin wallet pero la señal lo advierte explícitamente.
- **Pubkey en el bundle**: el incidente lleva la clave pública Stellar
  del reportante dentro del payload cifrado → `incidents.stellar_pubkey`
  (migración 013). El backend nunca ve identidad civil por el canal.
- **Donación real testnet**: `donate.ts` envía XLM al pool con memo
  `vq:<incidentId8>` — verificable en Stellar Expert.
- **Claimable Balance nativo**: `claim.ts` crea el CB desde el pool a la
  wallet del reportante al promover/liberar; `vaquita-admin` registra
  `claim_tx_hash`.
- **Claim desde la app**: la pestaña Vaquita consulta los claimable
  balances de la wallet del usuario y permite reclamarlos.
- **Voto on-chain**: el voto comunitario es una tx testnet firmada por
  Freighter con cooldown server-side (`vaquita-vote`); umbral →
  promoción a `community`.
- **Web demo pública**: globo 3D + vista cards + filtros región +
  tour guiado + panel admin con wallet real (Freighter) + i18n ES/EN.
  Repo: `github.com/DNO8/VACA-web`.

## Operación / publicación

- Application ID `cl.vaca.app`; flavors `dev`/`public`/`municipalPilot`.
- AAB `publicRelease` firmado (~93 MB) listo para Google Play Console.
- AdMob restringido a "Acerca de VACA"; RevenueCat solo como boundary de
  tracking de anuncios (sin compras).
- Backend Supabase: 13 migraciones, 4 Edge Functions en producción.
- Auditoría externa del mesh GuacaMalla documentada como referencia de
  patrones para la fase relay BLE (`mesh-comunicaciones.md` §16).

## Gaps conocidos y declarados (lo que el sprint cierra)

- Secret del pool en `localStorage` del browser → **D1** del SOW.
- Sin TTL/refund en claimable balances → **D2**.
- Voto sin barrera anti-Sybil real → **D3**.
- Fuzzing por redondeo, no geohash formal → **D4**.
- Claim UX mínima, re-release sin idempotencia explícita → **D5**.

## Repos / artefactos públicos

- App: `VACA/vaca_app` (Flutter, monorepo del proyecto).
- Web demo: `github.com/DNO8/VACA-web` (Next.js, deploy público).
- Backend: Supabase (Edge Functions + migraciones versionadas).
- Specs: `VACA/Especificaciones/` (producto, DTN, Vaquita, mesh).
