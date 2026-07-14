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

| Deliverable | Description (What will be built or produced?) | Why this matters |
| --- | --- | --- |
| **Deliverable 1 (Week 1)**<br>Complete Brandboard & Technical Foundation | - Definitive brand identity: logo, colour palette, typography, component library.<br>- Flutter project with Clean Architecture + Riverpod + Drift (SQLite) schema for FIBE M5 damage reports.<br>- Camera + GPS integration: runtime permission handling for Android 10+; camera preview widget; capture photo to local cache with EXIF timestamp; retrieve GPS coordinates via `geolocator`; permission-denied fallback states.<br>- Initial prospecting database: mapping of municipal and governmental actors (Chile and selected LatAm countries). | Branding is essential for credibility with institutional partners. Technical setup reduces friction for the following weeks. The prospecting database ensures disciplined commercial outreach without rushing into premature meetings. |
| **Deliverable 2 (Week 2)**<br>Offline Data Capture MVP & Beneficiary Wallet Foundation | - **User-oriented UI design and E2E user flow** for the **damnificado / beneficiary flow**: a community operator captures FIBE M5 damage reports (damage level, geolocation, photo) offline on behalf of a beneficiary.<br>- **Fully functional offline form module**: FIBE M5 standard records stored locally in SQLite with photo SHA-256 hashes, GPS coordinates, timestamp, device ID and beneficiary `rutHash`.<br>- **Cloud backend (Supabase)** with `reports` and `evidence` tables, storage bucket for photos, and device-token authentication ready for sync testing.<br>- **Stellar testnet wallet foundation for the beneficiary flow** with three defined use cases:<br>&nbsp;&nbsp;• **CU1 — Operator onboarding**: keypair generation for the community operator, secure storage with `flutter_secure_storage`, friendbot funding, balance visibility.<br>&nbsp;&nbsp;• **CU2 — Beneficiary view**: a beneficiary (or operator on their behalf) queries testnet balance and lists pending Claimable Balances linked to a validated report via `rutHash`.<br>&nbsp;&nbsp;• **CU3 — Simulated aid distribution**: backend creates a demo Claimable Balance on Stellar testnet reserved for a specific beneficiary `rutHash` / public key, closing the local aid loop. | This is the core intelligence layer — capturing structured data without internet is the fundamental differentiator. The wallet foundation and concrete use cases prepare the **beneficiary-side** testnet aid loop and make the demo verifiable. |
| **Deliverable 3 (Week 3)**<br>Store‑and‑Forward Sync & Security Research | - **Network status UI/UX**: clear feedback for offline, online, sync in progress, retry and success states.<br>- **Implementation of store‑and‑forward synchronisation**: Outbox queue with `SyncQueueItem` table, connectivity detection via `connectivity_plus`, manual sync trigger, retry with exponential backoff, idempotent batch upsert by UUID to Supabase (`POST /reports`).<br>- **Auth Passkeys research**: technical feasibility document for seedless access using WebAuthn/Passkeys in Flutter, including limitations, alternatives and roadmap for production implementation.<br>- **Updated prospecting pipeline** with structured follow-up and status tracking. | The sync protocol transforms isolated reports into a "verdad emergente" (emergent truth). Security research enables privacy‑preserving beneficiary identity without complex seed phrases. |
| **Deliverable 4 (Week 4)**<br>Beneficiary Aid Loop Closure & Packaging | - **Polished UI/UX and manual QA** for the beneficiary flow: empty-state, error-state and loading-state screens for all core flows; accessibility targets: contrast ratio ≥ 4.5:1, font scaling support up to 200%, touch targets ≥ 48×48 dp; manual QA pass on at least one mid-range Android device (e.g., Samsung Galaxy A14 or equivalent).<br>- **End‑to‑end testing** of the complete **beneficiary flow**: community operator captures offline → local store → manual sync → cloud receipt → backend acknowledgement → Claimable Balance available for the beneficiary.<br>- **Claimable Balance emission and claim demonstration** on Stellar testnet with verifiable transaction hashes (emission + claim).<br>- **Proof of Aid mock**: local badge/certificate referencing a simulated IPFS hash, generated after a successful claim.<br>- **APK build** targeting Android API 26+ (Android 8.0), optimised for low-end devices, with a target install size ≤ 35 MB; manual install and smoke test on at least one mid-range device.<br>- **Consolidated B2G Prospecting Pipeline document** (minimum 15‑20 prospects mapped and contacted) for Month 2 commercial outreach. | The MVP is tangible proof for Stellar and future partners. The beneficiary aid loop demo proves the value proposition: community intelligence + Stellar rails = transparent, dignified aid for the damnificado. |

### Out‑of‑Scope (Explicitly Not Included)

- **Full Social Yield** (Defindex/Blend integration): DeFi yield automation will be added later.
- **NGO/municipality dashboard** (Vaquita Insights): Will be built as SaaS layer in subsequent phases.
- **Background sync** (automated without user action): MVP uses manual sync; background sync scheduled for Month 2.
- **Production‑grade security and scaling**: This is a validation MVP, not a hardened production system.
- **Real‑world CLP on/off‑ramps**: All financial operations are on Stellar testnet.
- **Donation / donor flow**: Donor-facing capture, donation and giving flows are **explicitly excluded from this sprint**; they are planned for a separate 1-month sprint after the beneficiary flow is validated and may be addressed in the SCF Build Award phase.
- **Sozu Pay live integration**: The MVP uses a `TestnetDistributionAdapter` to simulate Sozu's role; direct Sozu API integration is scheduled for Month 2/3.

---

## 4.2 Deliverable‑Aligned Budget Request (70/30 Split)

| Category | Item | Amount | Rationale |
| --- | --- | --- | --- |
| **Operational & Core Team (70%)** | Danilo (Mobile Development) | $1,800 | Flutter MVP, Clean Architecture, Drift/SQLite schema, store‑and‑forward sync engine, Stellar testnet wallet, Claimable Balance integration, backend API contract, APK build. Highest technical load in the sprint. |
| | Camilo (UI/UX Design) | $1,000 | Brandboard, offline‑first interface design, E2E user flows, network status UI, QA, accessibility for high‑stress environments. |
| | Marcos (Management & Prospecting) | $700 | Sprint leadership, B2G cold prospecting, commercial validation, structured follow-up, final Pipeline document. |
| **Technology & Operations (30%)** | Cloud & Backend (Supabase) | $400 | Postgres project, Auth, Storage bucket for evidence, bandwidth and compute for sync testing during the month. |
| | Security Research (Passkeys) | $250 | Feasibility study, documentation and prototype exploration for seedless WebAuthn/Passkeys access in Flutter. |
| | Testing Devices & Build Tools | $200 | Mid‑range Android test device, USB cables, certificates, build tooling. |
| | Domain + Hosting | $100 | Domain registration for landing/download page and hosting for demo backend/landing during the sprint. |
| | AI / LLM Tools | $200 | GitHub Copilot / Cursor / Claude API for accelerated development, code review and documentation assistance. |
| | Documentation & Design Tools | $150 | Figma Pro, Notion/Excalidraw, PDF export tools for brandboard and technical memos. |
| | Office & Connectivity | $150 | Internet backup, communication tools, backup power for uninterrupted sprint work in a distributed team. |
| | Contingency | $35 | Buffer for unexpected tooling, SDK or service costs. |
| **Total** | | **$4,985** | Compressed Q1 roadmap into one month, delivering a tangible MVP for validation with balanced human effort and operational infrastructure. |

---

## 5. 30‑Day Execution Plan & Timeline

### 5.1 Weekly Breakdown

| Week | Planned Work | Expected Output |
| --- | --- | --- |
| **Week 1 — Bootstrap & Basic Capture** | **Camilo**: Brandboard (logo, palette, typography, component library).<br>**Danilo**: Flutter project setup, Riverpod, Clean Architecture, Drift schema (`DamageReport`, `Evidence`, `SyncQueueItem`), basic FIBE M5 form, camera + GPS integration.<br>**Marcos**: Start cold prospecting — municipality and provider database building; introductory info sending (no meeting requests). | - Complete brandboard document.<br>- GitHub repository with project structure and Drift schema.<br>- Prospecting database with initial leads (target: 15‑20 prospects identified). |
| **Week 2 — Offline Capture Complete & Beneficiary Wallet Foundation** | **Camilo**: User-oriented UI design and E2E user flow for the **beneficiary flow**; capture flows; report list and statuses.<br>**Danilo**: Core offline FIBE capture (save with photo + GPS + SHA-256 hash + beneficiary `rutHash`); sync states (`pending`, `synced`, `conflict`); Supabase backend schema; Stellar wallet CU1/CU2/CU3 for the beneficiary flow (keypair, secure storage, friendbot, balance query, demo Claimable Balance emission).<br>**Marcos**: Cloud infrastructure setup (Supabase project, tables, storage); continue prospecting outreach. | - Interactive Figma prototypes with beneficiary E2E user flow.<br>- Functional offline form module in app.<br>- Supabase environment with `reports`/`evidence` tables and storage ready.<br>- Stellar testnet wallet with funded balance and demo beneficiary Claimable Balance use cases. |
| **Week 3 — Sync to Cloud & Security Research** | **Camilo**: Network status UI (online, offline, sync in progress, error, success, retry).<br>**Danilo**: Store‑and‑forward sync engine (Outbox pattern); connectivity detection; manual sync of pending reports to backend with idempotent batch upsert.<br>**Marcos**: Structured follow-up to prospects; Pipeline document structuring.<br>**Research**: Technical memo on Passkeys/WebAuthn feasibility for Flutter. | - UI/UX for connectivity states and retry flows.<br>- Working sync queue (local → cloud) with manual trigger and retry logic.<br>- Updated prospecting pipeline with follow-up status.<br>- Passkeys feasibility memo. |
| **Week 4 — Beneficiary Aid Loop Closure & Packaging** | **Camilo**: Visual polish for the beneficiary flow, full QA, empty/error states, accessibility basics, low‑end device optimisation.<br>**Danilo**: Final cloud integration; end‑to‑end test of offline → sync → cloud; Claimable Balance emission and claim demo on Stellar testnet for the beneficiary; Proof of Aid mock; APK build.<br>**Marcos**: MVP packaging for Stellar showcase; final B2G Prospecting Pipeline document. | - Polished, stable MVP APK for the beneficiary flow.<br>- Claimable Balance transaction (emission + claim tx hashes verifiable).<br>- Demo video: community operator captures offline → sync → beneficiary claims aid.<br>- Prospecting Pipeline document with ≥15 prospects mapped and contacted. |

---

## 6. Evidence of Completion (Required)

> Important guidance: Evidence should be clear, verifiable, and easy to review by the Ambassador Chapter Lead with minimal technical expertise.

### 6.1 Planned Evidence to Be Submitted

| Deliverable | Evidence Type | Description |
| --- | --- | --- |
| **Deliverable 1 (Week 1)** | Brandboard document + GitHub repo link + prospecting spreadsheet | - PDF with logo, palette, typography, and component library.<br>- GitHub repository with Flutter project, architecture, and Drift schema.<br>- CSV/Excel with at least 15 mapped municipal/governmental contacts. |
| **Deliverable 2 (Week 2)** | Figma prototypes + screen recording + backend screenshot + Stellar wallet evidence | - Interactive Figma prototypes with E2E user flow.<br>- Short screen recording of offline data entry and local save.<br>- Screenshot of Supabase `reports`/`evidence` tables.<br>- Screenshot of Stellar testnet wallet with funded balance and/or Claimable Balance transaction. |
| **Deliverable 3 (Week 3)** | App screenshots + sync demo + technical memo + updated pipeline | - Screenshots showing online/offline status and sync UI.<br>- Video demonstrating queued data sync to Supabase upon reconnection.<br>- PDF with Passkeys/WebAuthn feasibility assessment.<br>- Updated prospecting pipeline with follow-up status (≥15 contacts). |
| **Deliverable 4 (Week 4)** | APK + full demo video + Stellar tx hash + B2G Pipeline document | - Download link to APK (Android).<br>- Complete walkthrough video (3‑5 min): community operator captures offline → sync → beneficiary claims Claimable Balance.<br>- Stellar testnet transaction hashes (emission + claim).<br>- B2G Prospecting Pipeline document (≥15 prospects with contact details, outreach status, and Month 2 strategy). |

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
