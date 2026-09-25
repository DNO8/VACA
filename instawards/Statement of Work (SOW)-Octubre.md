# Statement of Work (SOW) — Instawards, October 2026

> Follow-on Instaward. September sprint delivered the offline capture →
> verified delivery pipeline and the testnet aid-loop prototype. This SOW
> hardens the aid rail for production readiness.

## 1. Project & Team Information

| | |
| --- | --- |
| Project Name | VACA (Vaquita de Ayuda y Coordinación Activa) |
| Builder / Team Name | Danilo Contreras, Camilo Yonhson, Marcos Reyes |
| Primary Contact | Danilo — dcontrerasl@live.com |
| Repository | github.com/DNO8/VACA-web (web demo) + VACA monorepo (app) |
| Wallet | GDLA5QPZCDNWFQ4V7N3M2DERZ7SPPFWQZG6FPZYWNTYWGRVYAJDQ6ATJ |
| Ambassador Chapter | Chile |
| Ambassador Chapter Lead | Bastian Koh |
| Date Submitted | October 2026 |
| Suggested Sprint Start | November 1, 2026 |

## 2. Instawards Overview & Intent

Follow-on Instaward to take the Vaquita aid rail — already functional on
Stellar testnet — to production readiness: real custody, fund lifecycle,
integrity gates, and a publishable mobile release. Execution-focused,
30-day bounded.

## 3. Problem Statement & Objective

**What's blocking us today.** VACA already captures emergency signals
fully offline, persists them durably, and delivers them with a
server-signed receipt the phone itself verifies — proven end-to-end on a
physical device. The aid-distribution rail exists in prototype form
(pool donations, claimable balances, on-chain votes) but is not yet
production-hardened: the pool signer lives client-side, claimable
balances have no expiry or refund path so unclaimed donations can be
orphaned, votes lack a real anti-Sybil gate, and public coordinates need
formal quantization. Beyond the rail itself: the app is release-ready
but not yet published to Google Play, and our receipt proves technical
reception by *our* backend — there is still no institutional responder
on the other end, the real product risk for a civic tool.

**What this 30-day sprint changes.** We close the aid loop end-to-end
and make it auditable: the full claim path in the mobile app on testnet
(claimable-balance discovery, claim, expiry handling), pool custody
moved server-side or multisig, TTL with donor refund on unclaimed funds,
wallet-age anti-Sybil on votes, geohash-level location privacy,
idempotent admin release, a publishable Play Store build, and a public
E2E evidence package.

**Success =** a citizen captures a signal offline → a donor funds it
on-chain → the beneficiary claims the aid before expiry — all
verifiable, none of it custodied by us.

## 4. Scope of Work (30-Day Deliverables)

### 4.1 In-Scope Deliverables

| Deliverable | What will be delivered | Why it matters |
| --- | --- | --- |
| **D1 — Custodied aid rail** (Week 1) | Pool signer moved server-side (Edge Function) or documented multisig pool; claimable balances carry expiry predicates; refund sweep for unclaimed donations | Today the pool secret lives in the browser (demo-only). No real funds can flow until custody is off the client and no donation can be orphaned |
| **D2 — Signal integrity** (Week 2) | Server-enforced wallet-age gate on community votes (freshly funded accounts rejected with an honest message); public feed coordinates quantized to ~1 km geohash | Without anti-Sybil the community promotion is farmable; without formal fuzzing, public points can re-identify rural homes |
| **D3 — Beneficiary claim experience + auditable release** (Week 3) | Vaquita tab lists pending claims with amount/expiry, claim + retry on testnet; admin "release aid" is idempotent (re-release never mints a second CB) with a curation audit trail | The beneficiary is the whole point — the claim must be reliable and every curator action must be auditable |
| **D4 — Publishable build + public E2E evidence** (Week 4) | Signed publishable Play Store build; documented end-to-end testnet run (offline signal → signed receipt → vote → promotion → donation → claimable balance → claim, plus the refund case) | Proves the loop to any third party without trusting our word — and puts the app in citizens' hands |

### Out of scope (explicitly not included)

- **Mainnet or real funds.** Everything ships on testnet; production use
  requires legal review of Chilean donations law and cross-border AML —
  documented as the next step.
- **Municipal BLE mesh relay.** The DTN relay architecture is specified
  (benchmarked against an externally audited mesh); radio implementation
  is a separate phase.
- **Stellar Disbursement Platform.** Evaluated and deliberately not used —
  native claimable balances suffice at this scope.
- **iOS relay participation, institutional responder onboarding, KYC
  integration.** iOS stays Internet-only; no municipality signs on inside
  this sprint; identity assurance stays backend-side.
- **No new product surface.** No chat, no resource points, no new
  incident categories — the sprint hardens what exists.

### 4.2 Deliverable-Aligned Budget Request (80/20 Split)

| Category | Item | Amount | Rationale |
| --- | --- | --- | --- |
| Operational & Core Team (80%) | Danilo (Mobile & Backend Dev) | $1,333 | Pool custody, CB predicates + refund, anti-Sybil gate, geohash, admin idempotency, Play build |
| | Camilo (UI/UX) | $1,333 | Claim/expiry UX, admin audit surfaces, store listing assets, E2E evidence video production |
| | Marcos (Management & Prospecting) | $1,333 | Sprint leadership, municipal pilot path continuation, pipeline follow-up, evidence packaging |
| Technology & Infrastructure (20%) | Cloud & backend (Supabase) | $300 | Edge Function limits beyond free tier if required; Postgres/storage headroom |
| | Test hardware & devices | $300 | Second physical Android device for relay/delivery and claim testing |
| | Testing & operations | $400 | Play Console, testnet ops, evidence tooling, contingency |

| Total | $5,000 | Continuation of the September sprint structure — funds execution, not exploration |
| --- | --- | --- |

## 5. 30-Day Execution Plan & Timeline

| Week | Planned work | Expected output |
| --- | --- | --- |
| **Week 1 — Custody & lifecycle** | Danilo: pool signer to Edge Function custody; CB expiry predicates; refund sweep. Camilo: claim/expiry UX states. Marcos: chapter check-in; pilot-path outreach continues | Pool secret out of client; CB with time predicate + refund tx on testnet explorer |
| **Week 2 — Integrity gates** | Danilo: wallet-age gate (Horizon account age) on `vaquita-vote`; geohash quantization on `vaquita-feed` + unit tests. Camilo: rejection/empty states for gated votes. Marcos: privacy rationale documented for partners | Fresh-wallet vote rejected; aged-wallet vote tx; feed at ~1 km precision |
| **Week 3 — Beneficiary claim + admin audit** | Danilo: claim list with expiry/retry in app; idempotent `recordClaim`; curation audit log. Camilo: claim screens polish, store assets. Marcos: evidence structure, pipeline update | Claim recorded on physical device; replayed release = zero duplicates |
| **Week 4 — Ship & prove** | Danilo: signed publishable build; E2E run + tx hash collection. Camilo: demo video + screenshots store-ready. Marcos: evidence package + municipal handoff memo | Publishable build; public E2E doc with explorer links |

## 6. Evidence of Completion

| Deliverable | Evidence |
| --- | --- |
| D1 | Stellar Expert links: CB creation with predicate + refund tx; deployed Edge Function; repo diff — no signing secret in client |
| D2 | Rejected fresh-wallet vote + accepted aged-wallet vote (explorer); feed response at geohash precision; unit tests |
| D3 | Screen recording of claim flow on physical device; claim tx hash; demo of replayed release producing no duplicate CB |
| D4 | Signed AAB / Play Console track link; public evidence doc — every step's tx hash, third-party reproducible |

## 7. Next-Step Alignment

After this Instaward: **SCF Build Award** application (mainnet legal
review, municipal pilot execution, institutional responder onboarding)
or a second follow-on Instaward. The September B2G pipeline (15+
prospects) continues toward a first pilot agreement.

## 8. Instawards Constraints Acknowledgement

- This scope will be completed within 30 days or less.
- Instawards support execution, not open-ended exploration.
- A project may receive no more than two follow-on Instawards.
- Each Instaward is capped at $5,000; total may not exceed $15,000.

Contact: dcontrerasl@live.com — Team: Danilo (Mobile & Backend),
Camilo (UI/UX), Marcos (Management & Prospecting)
