# Statement of Work (SOW) — Instawards

---

## 1. Project & Team Information

| Field | Value |
| --- | --- |
| **Project Name** | VACA (Vaquita de Ayuda y Coordinación Activa) |
| **Builder / Team Name** | Danilo Contreras, Camilo Yonhson, Marcos Reyes |
| **Primary Contact** | Danilo - dcontrerasl@live.com |
| **Ambassador Chapter** | Chile |
| **Ambassador Chapter Lead** | Joaquín Farfán – Bastian Koh |
| **Date Submitted** | June 26, 2026 |
| **Suggested Sprint Start Date** | July 1, 2026 |

---

## 2. Instawards Overview & Intent

### 2.1 Instawards Purpose

Instawards are designed to support short, clearly scoped, execution‑focused work that helps a project make tangible progress toward building on Stellar. Instawards are meant to fund specific, achievable outcomes that can be completed and demonstrated within 30 days or less.

This SOW represents a shared commitment between the Builder and the Ambassador Chapter Lead on what will be delivered, why it matters, and how success will be verified.

---

## 3. Problem Statement & Objective

### Problem Being Addressed

The critical blocker for VACA is the lack of a functional offline‑first mobile application that can capture damage and needs data in the "Día 0" scenario — when telecommunications and institutional infrastructure collapse. Without this core intelligence layer, we cannot later integrate the Stellar financial rail (Claimable Balances, tokenized vouchers) and prove the end‑to‑end value proposition. This Instaward compresses our planned Q1 work into a single month to build the MVP that enables everything else.

### Objective of This Instaward

VACA will have a demonstrable offline‑first mobile MVP (Flutter + SQLite) focused on the **damnificado / beneficiary flow**: a community operator captures FIBE‑standard damage reports without internet, the data syncs to the cloud when connectivity is restored, and the beneficiary can claim a verified aid package on Stellar testnet.

---

## 4. Scope of Work (30‑Day Deliverables)

> Important guidance: This scope must be achievable within 30 calendar days. If the work feels larger, it should be reduced or split into more achievable phases.

### 4.1 In‑Scope Deliverables

#### Deliverable 1 (Week 1) — Complete Brandboard & Technical Foundation

**What will be built or produced?**

- Definitive brand identity: logo, colour palette, typography, component library.
- Flutter project with Clean Architecture + Riverpod + Drift (SQLite) schema for FIBE M5 damage reports.
- Camera + GPS integration: runtime permission handling for Android 10+; camera preview widget; capture photo to local cache with EXIF timestamp; retrieve GPS coordinates via `geolocator`; permission-denied fallback states.
- Initial prospecting database: mapping of municipal and governmental actors (Chile and selected LatAm countries).

**Why this matters**

Branding is essential for credibility with institutional partners. Technical setup reduces friction for the following weeks. The prospecting database ensures disciplined commercial outreach without rushing into premature meetings.

#### Deliverable 2 (Week 2) — Offline Data Capture MVP & Beneficiary Wallet Foundation

**What will be built or produced?**

- **Complete UI & navigation flow (beneficiary)**: the full connected screen flow (UI design) for the **damnificado / beneficiary flow**, taking a community operator from app launch to a saved FIBE M5 report — operator onboarding → Home → select/create emergency event → FIBE capture wizard (Module 1 identity + address + GPS, Module 4 housing, Module 5 damage level + habitability) → camera evidence → save → report list with per-report sync/trust status and a detail view.
- **Fully functional offline form module**: FIBE M5 standard records stored locally in SQLite with photo SHA-256 hashes, GPS coordinates, timestamp, device ID and beneficiary `rutHash`.
- **Cloud backend (Supabase)** with `reports` and `evidence` tables, storage bucket for photos, and device-token authentication ready for sync testing.
- **Stellar testnet wallet foundation for the beneficiary flow** with three defined use cases:
  - **CU1 — Operator onboarding**: keypair generation for the community operator, secure storage with `flutter_secure_storage`, friendbot funding, balance visibility.
  - **CU2 — Beneficiary view**: a beneficiary (or operator on their behalf) queries testnet balance and lists pending Claimable Balances linked to a validated report via `rutHash`.
  - **CU3 — Simulated aid distribution**: backend creates a demo Claimable Balance on Stellar testnet reserved for a specific beneficiary `rutHash` / public key, closing the local aid loop.

**Why this matters**

This is the core intelligence layer — capturing structured data without internet is the fundamental differentiator. The wallet foundation and concrete use cases prepare the **beneficiary-side** testnet aid loop and make the demo verifiable.

#### Deliverable 3 (Week 3) — Store‑and‑Forward Sync & Passkeys Authentication

**What will be built or produced?**

- **Network status UI/UX**: clear feedback for offline, online, sync in progress, retry and success states.
- **Implementation of store‑and‑forward synchronisation**: Outbox queue with `SyncQueueItem` table, connectivity detection via `connectivity_plus`, manual sync trigger, retry with exponential backoff, idempotent batch upsert by UUID to Supabase (`POST /reports`).
- **Passkeys authentication (production-ready)**: seedless WebAuthn/Passkeys login built by hand and integrated with the Stellar SDK — passkey registration and authentication on device, secure binding/derivation to the operator's Stellar keypair (no seed phrases), and fallback handling.
- **Updated prospecting pipeline** with structured follow-up and status tracking.

**Why this matters**

The sync protocol transforms isolated reports into a "verdad emergente" (emergent truth). Production-ready Passkeys authentication enables privacy‑preserving, seedless access for operators and beneficiaries without complex seed phrases.

#### Deliverable 4 (Week 4) — Beneficiary Aid Loop Closure & Packaging

**What will be built or produced?**

- **Polished UI/UX and manual QA** for the beneficiary flow: empty-state, error-state and loading-state screens for all core flows; accessibility targets: contrast ratio ≥ 4.5:1, font scaling support up to 200%, touch targets ≥ 48×48 dp; manual QA pass on at least one mid-range Android device (e.g., Samsung Galaxy A14 or equivalent).
- **End‑to‑end testing** of the complete **beneficiary flow**: community operator captures offline → local store → manual sync → cloud receipt → backend acknowledgement → Claimable Balance available for the beneficiary.
- **Claimable Balance emission and claim demonstration** on Stellar testnet with verifiable transaction hashes (emission + claim).
- **Proof of Aid mock**: local badge/certificate referencing a simulated IPFS hash, generated after a successful claim.
- **APK build** targeting Android API 26+ (Android 8.0), optimised for low-end devices, with a target install size ≤ 35 MB; manual install and smoke test on at least one mid-range device.
- **Consolidated B2G Prospecting Pipeline document** (minimum 15‑20 prospects mapped and contacted) for Month 2 commercial outreach.

**Why this matters**

The MVP is tangible proof for Stellar and future partners. The beneficiary aid loop demo proves the value proposition: community intelligence + Stellar rails = transparent, dignified aid for the damnificado.

### Out‑of‑Scope (Explicitly Not Included)

- **Full Social Yield** (Defindex/Blend integration): DeFi yield automation will be added later.
- **NGO/municipality dashboard** (Vaquita Insights): Will be built as SaaS layer in subsequent phases.
- **Background sync** (automated without user action): MVP uses manual sync; background sync scheduled for Month 2.
- **Production‑grade security and scaling**: This is a validation MVP, not a hardened production system.
- **Real‑world CLP on/off‑ramps**: All financial operations are on Stellar testnet.
- **Donation / donor flow**: Donor-facing capture, donation and giving flows are **explicitly excluded from this sprint**; they are planned for a separate 1-month sprint after the beneficiary flow is validated and may be addressed in the SCF Build Award phase.
- **Sozu Pay live integration**: The MVP uses a `TestnetDistributionAdapter` to simulate Sozu's role; direct Sozu API integration is scheduled for Month 2/3.

---

## 4.2 Deliverable‑Aligned Budget Request

**Requested Budget Amount**

$4,985 USD

**Rationale for Budget Request**

- $1,800 Mobile Development (Danilo)
- $1,000 UI/UX Design (Camilo)
- $700 Management & Prospecting (Marcos)
- $400 Cloud & Backend (Supabase)
- $250 Passkeys Authentication (prod-ready, Stellar SDK)
- $200 Testing Devices & Build Tools
- $200 AI / LLM Tools
- $150 Documentation & Design Tools
- $150 Office & Connectivity
- $100 Domain + Hosting
- $35 Contingency

---

## 5. 30‑Day Execution Plan & Timeline

### 5.1 Weekly Breakdown

#### Week 1 — Bootstrap & Basic Capture

**Planned Work**

- **Brandboard & design system**: logo, palette, typography, component library.
- **Technical foundation**: Flutter project setup, Riverpod, Clean Architecture, Drift schema (`DamageReport`, `Evidence`, `SyncQueueItem`), basic FIBE M5 form.
- **Camera + GPS integration**: runtime permissions, camera capture, geolocation.
- **Prospecting**: municipality and provider database building; introductory info sending (no meeting requests).

**Expected Output**

- Complete brandboard document.
- GitHub repository with project structure and Drift schema.
- Prospecting database with initial leads (target: 15‑20 prospects identified).

#### Week 2 — Offline Capture Complete & Beneficiary Wallet Foundation

**Planned Work**

- **Complete UI & navigation flow (beneficiary)**: the full set of connected, navigable screens (UI design — not end-to-end testing, which runs in Week 4) taking a community operator from app launch to a locally-saved FIBE report. Path A→B: operator onboarding/identity → Home → create/select an emergency event → FIBE capture wizard (Module 1: beneficiary `rutHash` + address + GPS · Module 4: housing type/occupancy · Module 5: damage level + habitability) → camera screen to attach an evidence photo → save → Report List showing each report with its sync and trust status, plus a Report Detail view — defining exactly which screens exist and what the user does on each.
- **Offline FIBE capture**: save with photo + GPS + SHA-256 hash + beneficiary `rutHash`; sync states (`pending`, `synced`, `conflict`).
- **Cloud backend**: Supabase schema (project, tables, storage).
- **Stellar wallet (CU1/CU2/CU3)**: keypair, secure storage, friendbot, balance query, demo Claimable Balance emission.
- **Prospecting**: continue outreach.

**Expected Output**

- Interactive Figma prototypes with beneficiary E2E user flow.
- Functional offline form module in app.
- Supabase environment with `reports`/`evidence` tables and storage ready.
- Stellar testnet wallet with funded balance and demo beneficiary Claimable Balance use cases.

#### Week 3 — Sync to Cloud & Passkeys Authentication

**Planned Work**

- **Network status UI**: online, offline, sync in progress, error, success, retry.
- **Store‑and‑forward sync engine**: Outbox pattern; connectivity detection; manual sync of pending reports with idempotent batch upsert.
- **Passkeys authentication (prod-ready)**: implement a seedless WebAuthn/Passkeys flow by hand, integrated with the Stellar SDK (registration, authentication, keypair binding, fallback).
- **Prospecting**: structured follow-up; Pipeline document structuring.

**Expected Output**

- UI/UX for connectivity states and retry flows.
- Working sync queue (local → cloud) with manual trigger and retry logic.
- Working, production-ready Passkeys authentication flow integrated with the Stellar SDK.
- Updated prospecting pipeline with follow-up status.

#### Week 4 — Beneficiary Aid Loop Closure & Packaging

**Planned Work**

- **UI polish & QA (beneficiary flow)**: visual polish, full QA, empty/error states, accessibility basics, low‑end device optimisation.
- **E2E aid loop**: final cloud integration; end‑to‑end test of offline → sync → cloud; Claimable Balance emission and claim demo on Stellar testnet.
- **Proof of Aid & packaging**: Proof of Aid mock; APK build.
- **Commercial**: MVP packaging for Stellar showcase; final B2G Prospecting Pipeline document.

**Expected Output**

- Polished, stable MVP APK for the beneficiary flow.
- Claimable Balance transaction (emission + claim tx hashes verifiable).
- Demo video: community operator captures offline → sync → beneficiary claims aid.
- Prospecting Pipeline document with ≥15 prospects mapped and contacted.

---

## 6. Evidence of Completion (Required)

> Important guidance: Evidence should be clear, verifiable, and easy to review by the Ambassador Chapter Lead with minimal technical expertise.

### 6.1 Planned Evidence to Be Submitted

#### Deliverable 1 (Week 1)

**Evidence Type:** Working development build + public repository + brandboard

- **Working build (live demo):** short screen recording of the app compiling (`flutter run`) and launching on a physical Android device, showing the home screen, camera capture, and a captured evidence record with its SHA-256 hash, GPS coordinates and timestamp.
- **Public GitHub repository** (link + commit hash) with the Flutter project running: Clean Architecture, Riverpod, and the Drift/SQLite schema (`DamageReport`, `Evidence`, `SyncQueueItem`) committed and building.
- **Brandboard PDF**: logo, colour palette, typography, and reusable component library.
- **Prospecting spreadsheet** (CSV/Excel) with at least 15 mapped municipal/governmental contacts.

#### Deliverable 2 (Week 2)

**Evidence Type:** Live offline-capture demo + deployed backend + funded Stellar wallet

- **Live demo (video):** device in airplane mode captures a FIBE M5 report offline (damage level, geolocation, photo) and saves it locally, showing the stored record with photo SHA-256 hash, GPS, timestamp and beneficiary `rutHash`.
- **Deployed cloud backend (working):** live Supabase project with `reports` and `evidence` tables and a storage bucket — link/screenshot of the deployed instance and schema.
- **Funded Stellar testnet wallet:** operator public key with a verifiable link on a testnet explorer (e.g., stellar.expert/testnet), plus a demo Claimable Balance emission (CU3) with its transaction hash.
- **Interactive Figma prototype** (shareable link) with the beneficiary E2E user flow.

#### Deliverable 3 (Week 3)

**Evidence Type:** Live sync demo + working development build + live Passkeys authentication demo

- **Live sync demo (video):** capture offline → reconnect → manual sync → data appears in Supabase (before/after view of the cloud tables), showing the network status UI states (offline, syncing, success, retry).
- **Working development build** with the store-and-forward sync engine, published as a tagged GitHub release / updated repository (link + version).
- **Live Passkeys authentication demo (video):** production-ready seedless login with WebAuthn/Passkeys integrated with the Stellar SDK — passkey registration + authentication shown end-to-end on device, with the code available in the repository.
- **Updated prospecting pipeline** with structured follow-up status (≥15 contacts).

#### Deliverable 4 (Week 4)

**Evidence Type:** Full live demo + official production domain + downloadable APK + verifiable on-chain proof

- **Full end-to-end live demo (video, 3‑5 min):** community operator captures offline → local store → manual sync → cloud receipt → beneficiary claims a Claimable Balance → Proof of Aid generated.
- **Official domain in production:** live landing/download page hosted on the official VACA domain, serving the public APK download and reachable demo backend.
- **Downloadable APK (public link)** targeting Android API 26+, installable on a mid-range device, with a smoke-test recording of install + launch.
- **Verifiable Stellar testnet transaction hashes** (Claimable Balance emission + claim) with explorer links anyone can open.
- **Tagged GitHub release** of the MVP (source + APK artifact).
- **B2G Prospecting Pipeline document** (≥15 prospects with contact details, outreach status, and Month 2 strategy).

### 6.2 Evidence Verification Checklist (For Ambassador Use)

| Deliverable | Evidence Present | Evidence Partial | Evidence Missing | Comments |
| --- | --- | --- | --- | --- |
| Deliverable 1 | ☐ | ☐ | ☐ | |
| Deliverable 2 | ☐ | ☐ | ☐ | |
| Deliverable 3 | ☐ | ☐ | ☐ | |
| Deliverable 4 | ☐ | ☐ | ☐ | |

---

## 7. Next‑Step Alignment

### 7.1 Anticipated Next Step After Completion

After this Instaward, the most likely next step is:

- ☒ **Apply to SCF Build Award** (to integrate the full Stellar financial layer: Claimable Balances, voucher tokenization, Social Yield, donor flow, and NGO dashboard).
- ☐ Continue development independently.
- ☐ Apply for a follow‑on Instaward (if eligible).
- ☐ Seek other ecosystem support.
- ☒ **Other**: Activate the prospecting pipeline — initiate active commercial meetings with municipalities and NGOs using the functional MVP. The goal is to secure at least one pilot agreement in Month 2, with a live deployment for a real disaster or emergency simulation.

---

## 8. Instawards Constraints Acknowledgement

By submitting this SOW, the Builder acknowledges:

- ☒ This scope will be completed within 30 days or less.
- ☒ Instawards support execution, not open‑ended exploration.
- ☒ A project may receive no more than two follow‑on Instawards.
- ☒ Each Instaward is capped at $5,000.
- ☒ Total Instawards funding may not exceed $15,000.

---

**Contact:** dcontrerasl@live.com  
**Team:** Danilo (Mobile Dev), Camilo (UI/UX), Marcos (Management & Prospecting)  
**Project:** VACA — Infraestructura Cívica de Resiliencia
