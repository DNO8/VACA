# Postulación Instawards — respuestas de formulario (Octubre)

Respuestas redactadas para el formulario de Stellar Passport / conversación
con Bastian Koh (Chapter Lead Chile). Alineado al formato del SOW de
septiembre que ya fue aprobado.

## Team

- **Danilo Contreras** — Mobile & Backend Dev — dcontrerasl@live.com
- **Camilo Yonhson** — UI/UX
- **Marcos Reyes** — Management & Prospecting
- Chapter: Chile · Lead: Bastian Koh
- Wallet: GDLA5QPZCDNWFQ4V7N3M2DERZ7SPPFWQZG6FPZYWNTYWGRVYAJDQ6ATJ

## Problem & objective (aprobado)

> **What's blocking us today.** V.A.C.A already captures emergency
> signals fully offline, persists them durably, and delivers them with a
> server-signed receipt the phone itself verifies — proven end-to-end on
> a physical device. The aid-distribution rail exists in prototype form
> (pool donations, claimable balances, on-chain votes) but is not yet
> production-hardened: the pool signer lives client-side, claimable
> balances have no expiry or refund path so unclaimed donations can be
> orphaned, votes lack a real anti-Sybil gate, and public coordinates
> need formal quantization. Beyond the rail itself: the app is
> release-ready but not yet published to Google Play, and our receipt
> proves technical reception by *our* backend — there is still no
> institutional responder on the other end, the real product risk for a
> civic tool.
>
> **What this 30-day sprint changes.** We close the aid loop end-to-end
> and make it auditable: the full claim path in the mobile app on
> testnet (claimable-balance discovery, claim, expiry handling), pool
> custody moved server-side or multisig, TTL with donor refund on
> unclaimed funds, wallet-age anti-Sybil on votes, geohash-level
> location privacy, idempotent admin release, a publishable Play Store
> build, and a public E2E evidence package.
>
> Success = a citizen captures a signal offline → a donor funds it
> on-chain → the beneficiary claims the aid before expiry — all
> verifiable, none of it custodied by us.

## Deliverables (4 campos del formulario)

**Deliverable 1 — Custodied aid rail — pool + claimable balance lifecycle**
The Vaquita donation pool signer moves off the client (server-side
custody in an Edge Function, or a documented multisig pool). Claimable
balances gain a real lifecycle: expiry predicate on every CB plus a
donor-refund path for unclaimed aid.
Evidence: Stellar Expert tx links — CB creation showing the time
predicate + a refund tx of an expired donation; deployed Edge Function;
repo diff with no signing secret in the web client.

**Deliverable 2 — Signal integrity — anti-Sybil vote + location privacy**
Server-enforced wallet-age gate for community votes (freshly funded
accounts rejected with an honest message), and public feed coordinates
quantized to ~1 km geohash instead of ad-hoc rounding.
Evidence: rejected vote from a fresh Friendbot wallet + accepted vote tx
from an aged wallet (explorer links); feed response showing geohash
precision; unit tests.

**Deliverable 3 — Beneficiary claim experience + auditable release**
The app's Vaquita tab shows pending claims with amount and expiry,
supports retry, and claims on testnet; the admin release action is
idempotent (re-release never creates a second CB) with a curation audit
trail.
Evidence: screen recording of the claim flow on a physical device;
claim tx on explorer; demo of replayed release producing no duplicate CB.

**Deliverable 4 — Publishable build + public E2E evidence**
A publishable Google Play build of the app, plus a documented
end-to-end testnet run: offline signal → signed receipt → community
vote → promotion → donation → claimable balance → beneficiary claim
(and the expiry-refund case).
Evidence: signed AAB / Play Console track link; public evidence doc
with every step's explorer hash — reproducible by a third party.

## Boundaries & budget

**Out of scope — explicitly not included:**

- Mainnet or real funds — everything ships on testnet; production use
  requires legal review of Chilean donations law and cross-border AML.
- Municipal BLE mesh relay — the DTN relay architecture is specified;
  radio implementation is a separate phase.
- Stellar Disbursement Platform — evaluated and deliberately not used;
  native claimable balances suffice at this scope.
- iOS relay participation, institutional responder onboarding, KYC
  integration — iOS stays Internet-only; no municipality signs on inside
  this sprint; identity assurance stays backend-side.
- No new product surface — no chat, no resource points, no new incident
  categories; the sprint hardens what exists.

**Budget request — USD 5,000 (80/20 split, same structure as September):**

- Danilo Contreras (Mobile & Backend Dev) — $1,333 — pool custody, CB
  predicates + refund, anti-Sybil gate, geohash, admin idempotency,
  Play build.
- Camilo Yonhson (UI/UX) — $1,333 — claim/expiry UX, admin audit
  surfaces, store listing assets, E2E evidence video.
- Marcos Reyes (Management & Prospecting) — $1,333 — sprint leadership,
  municipal pilot path, pipeline follow-up, evidence packaging.
- Cloud & backend (Supabase) — $300 — Edge Function limits beyond free
  tier if required; Postgres/storage headroom.
- Test hardware — $300 — second physical Android device for
  delivery/claim testing (also required for the relay phase).
- Testing & operations — $400 — Play Console, testnet ops, evidence
  tooling, contingency.

## The 30-day plan

**Week 1 (required).** Move the Vaquita pool signer off the web client
into server-side custody (Edge Function) with a documented multisig
alternative; implement claimable-balance expiry predicates and the
donor-refund sweep for unclaimed funds. Exit criteria: pool secret
absent from the client, CB created with a time predicate, and an expired
donation refunded — all as public testnet transactions.

**Week 2.** Signal integrity: server-enforced wallet-age gate on
community votes (fresh Friendbot accounts rejected with an honest
message) plus geohash ~1 km quantization of public feed coordinates with
unit tests. Exit criteria: rejected fresh-wallet vote, accepted
aged-wallet vote on explorer, feed response at geohash precision.

**Week 3.** Beneficiary and admin surfaces: Vaquita tab lists pending
claims with amount and expiry, claim + retry on testnet; admin release
becomes idempotent (re-release never mints a second CB) with a curation
audit trail. Exit criteria: claim flow recorded on a physical device,
replayed release producing zero duplicates.

**Week 4.** Ship + prove: signed publishable Play Store build, full E2E
evidence run (offline signal → signed receipt → vote → promotion →
donation → claimable balance → claim, plus the refund case), public
documentation with explorer links. Exit criteria: AAB/Play track link
and a third-party-reproducible evidence doc.
