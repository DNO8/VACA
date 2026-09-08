V.A.C.A - Vaquita of aid and coordination Active 

# **<mark>Statement of Work (SOW) — Instawards</mark>** 

> **Registro contractual histórico.** Este documento conserva íntegramente el alcance acordado en su fecha y no constituye la especificación vigente del producto. Para decisiones de arquitectura, datos, seguridad y flujos se debe usar la base permanente de `Especificaciones/`. Las referencias a FIBE, Stellar, wallets, tokenización o ayuda financiera no autorizan implementación activa.

## **1. Project & Team Information** 

|Project Name:|VACA (Vaquita de Ayuda y Coordinación Activa)|
|---|---|
|Builder / Team Name:|Danilo Contreras, Camilo Yonhson, Marcos Reyes|
|Primary Contact|Danilo -dcontrerasl@live.com|
||github: https://github.com/DNO8/VACA-demo|
||wallet:GDLA5QPZCDNWFQ4V7N3M2DERZ7SPPFWQZG6<br>FPZYWNTYWGRVYAJDQ6ATJ|
|Ambassador Chapter:|Chile|
|Ambassador Chapter|Bastian Koh|
|Lead:||
|Date Submitted:|June 26, 2026|
|Suggested Sprint Start|July 1, 2026|
|Date:||





V.A.C.A - Vaquita of aid and coordination Active 

## **<mark>2. Instawards Overview & Intent</mark>** 

### 2.1 Instawards Purpose 

Instawards are designed to support short, clearly scoped, execution‑focused work that helps a project make tangible progress toward building on Stellar. Instawards are meant to fund specific, achievable outcomes that can be completed and demonstrated within 30 days or less. 

This SOW represents a shared commitment between the Builder and the Ambassador Chapter Lead on what will be delivered, why it matters, and how success will be verified. 

## **3. Problem Statement & Objective** 

<mark>Problem Being Addressed</mark> The critical blocker for VACA is the lack of a functional offline‑first mobile application that can capture damage and needs data in the "Día 0" scenario—when telecommunications and institutional infrastructure collapse. Without this core intelligence layer, we cannot later integrate the Stellar financial rail (Claimable Balances, tokenized vouchers) and prove the end‑to‑end value proposition. This Instaward compresses our planned Q1 work into a single month to build the MVP that enables everything else. 

<mark>Objective of This Instaward</mark> VACA will have a demonstrable offline‑first mobile MVP (Flutter + SQLite) that allows community operators to capture FIBE‑standard damage reports without 

V.A.C.A - Vaquita of aid and coordination Active 

internet, store them locally, synchronise them to the cloud when connectivity is restored, and close a verified aid loop on Stellar testnet. 

## **<mark>4. Scope of Work (30‑Day Deliverables)</mark>** 

Important guidance: This scope must be achievable within 30 calendar days. If the work feels larger, it should be reduced or split into more achievable phases. 

4.1 In‑Scope Deliverables 

|Deliverable|Description (What will be built or<br>produced?)|Why this matters|
|---|---|---|
|Deliverable 1|Complete Brandboard & Technical|Branding is essential for|
|(Week 1)|Foundation|credibility with institutional<br>partners. Technical setup<br>reduces friction for the|
||- Defnitive brand identity: logo,<br>colour palette, typography,<br>component library.|following weeks. The<br>prospecting database<br>ensures disciplined|
||- Flutter project with Clean<br>Architecture + Riverpod + Drift<br>(SQLite) schema for FIBE M5|commercial outreach<br>without rushing into<br>premature meetings.|
||damage reports.||
||- Camera + GPS integration<br>foundation.||



V.A.C.A - Vaquita of aid and coordination Active 

||- Initial prospecting database:<br>mapping of municipal and<br>governmental actors (Chile and<br>selected LatAm countries).||
|---|---|---|
|Deliverable 2|Ofine Data Capture MVP & Wallet|This is the core intelligence|
|(Week 2)|Foundation|layer — capturing structured<br>data without internet is the|
|||fundamental differentiator.|
||- Visual prototypes and fnalised UI|The wallet foundation|
||for ofine FIBE forms (damage|prepares for the testnet aid|
||reports, geolocation, photo<br>capture).|loop.|
||- Fully functional ofine form<br>module that stores FIBE‑standard<br>records locally in SQLite, including<br>photo hashes and timestamps.||
||- Cloud backend (Supabase) with<br>tables and storage ready.||
||- Stellar testnet wallet: keypair<br>generation, secure storage,<br>friendbot funding, balance<br>visibility.||
|Deliverable 3|Store‑and‑Forward Sync & Security|The sync protocol|
|(Week 3)|Research|transforms isolated reports<br>into a "verdad emergente"<br>(emergent truth). Security|



V.A.C.A - Vaquita of aid and coordination Active 

||- UI/UX for network status|research enables|
|---|---|---|
||feedback (ofine/online) and sync|privacy‑preserving|
||progress indicators.|benefciary identity without|
||- Implementation of<br>store‑and‑forward synchronisation:<br>queued report packages sent to<br>the cloud when connectivity is<br>restored.|complex seed phrases.|
||- Technical feasibility document:<br>biometrics (local_auth) + Passkeys<br>for seedless access.||
||- Updated prospecting pipeline<br>with structured follow‑up.||
|Deliverable 4|Final MVP & Aid Loop Demo|The MVP is tangible proof|
|(Week 4)|- Polished UI/UX, full QA,|for Stellar and future<br>partners. The aid loop<br>demo proves the value|
||empty/error states, accessibility<br>basics.<br>`- End‑to‑end integration:`|proposition: community<br>intelligence + Stellar rails =<br>transparent, dignifed aid.|
||`offline capture → store →`||
||`sync → cloud receipt.`||
||- Claimable Balance emission and<br>claim demonstration on Stellar<br>testnet (tx hashes verifable).||



V.A.C.A - Vaquita of aid and coordination Active 

- Proof of Aid mock (NFT/IPFS reference). - APK build optimised for low‑end Android devices (manual testing on at least one mid‑range device). - Consolidated B2G Prospecting Pipeline document (minimum 15‑20 prospects mapped and contacted) for Month 2 commercial outreach. 

V.A.C.A - Vaquita of aid and coordination Active 

### **<mark>Out‑of‑Scope (Explicitly Not Included)</mark>** 

<mark>- Full Social Yield (Defndex/Blend integration): DeFi yield automation will be added later.</mark> 

- NGO/municipality dashboard (Vaquita Insights): Will be built as SaaS layer in 

subsequent phases. 

- Background sync (automated without user action): MVP uses manual sync; 

background sync scheduled for Month 2. 

- Production‑grade security and scaling: This is a validation MVP, not a hardened 

production system. 

<mark>- Real‑world CLP on/off‑ramps: All fnancial operations are on Stellar testnet.</mark> 



<mark>4.2 Deliverable‑Aligned Budget Request (80/20 Split)</mark> 

V.A.C.A - Vaquita of aid and coordination Active 

|Category|Item|Amount|Rationale|
|---|---|---|---|
|Operational & Core<br>Team (80%)|Danilo (Mobile<br>Development)|$1,333|Flutter MVP, Drift/SQLite<br>schema, store‑and‑forward sync,<br>Stellar testnet wallet, backend<br>integration.|
||Camilo (UI/UX Design)|$1,333|Brandboard, ofine‑frst interface<br>design, QA, and user fows for<br>high‑stress environments.|
||Marcos (Management<br>& Prospecting)|$1,333|Sprint leadership, B2G<br>prospecting, commercial<br>validation, Pipeline document.|
|Technology &<br>Infrastructure (20%)|Cloud & Backend<br>(Supabase)|$500|Postgres, Auth, Storage for sync<br>testing and data reception.|
||Security Research<br>(Biometrics/Passkeys)|$300|Feasibility study for seedless<br>access.|
||Testing & Operations|$200|Test devices, domains,<br>certifcates, build tools.|



V.A.C.A - Vaquita of aid and coordination Active 

|Total|$5,000|Compressed Q1 roadmap into|
|---|---|---|
|||one month, delivering a tangible|
|||MVP for validation.|



V.A.C.A - Vaquita of aid and coordination Active 

## **<mark>5. 30‑Day Execution Plan & Timeline</mark>** 

### 5.1 Weekly Breakdown 

|Week|Planned Work|Expected Output|
|---|---|---|
|Week 1 — Bootstrap &|Camilo: Brandboard (logo, palette,|- Complete brandboard|
|Basic Capture|typography, component library).|document.|
||Danilo: Flutter project setup, Riverpod,<br>Clean Architecture, Drift schema, basic<br>FIBE M5 form, camera + GPS<br>integration.<br>Marcos: Start cold prospecting —<br>municipality and provider database<br>building; introductory info sending (no<br>meeting requests).|- GitHub repository with<br>project structure and<br>Drift schema.<br>- Prospecting database<br>with initial leads (target:<br>15‑20 prospects<br>identifed).|
|Week 2 — Ofine|Camilo: Visual prototypes of ofine|- Visual prototypes.|
|Capture Complete &<br>Wallet Minimum|forms; capture fows; report list and<br>statuses.<br>Danilo: Core ofine FIBE capture (save<br>with photo + GPS); sync states (pending,<br>synced, confict); Stellar wallet (keypair,|- Functional ofine form<br>in app.<br>- Supabase environment<br>ready.|
||secure storage, friendbot).<br>Marcos: Cloud infrastructure setup<br>(Supabase); continue prospecting<br>outreach.|- Stellar testnet wallet<br>with balance.|



V.A.C.A - Vaquita of aid and coordination Active 

|Week 3 — Sync to|Camilo: Network status UI (online,|- UI/UX for connectivity|
|---|---|---|
|Cloud & Security|ofine, sync in progress, error, success).|states.|
|Research|Danilo: Store‑and‑forward sync engine<br>(Outbox); connectivity detection; manual<br>sync of pending reports to backend.|`- Working sync`<br>`queue (local →`<br>`cloud).`|
||Marcos: Structured follow‑up to<br>prospects; Pipeline document<br>structuring.|- Updated prospecting<br>pipeline.|
||Research: Technical memo on<br>biometrics + Passkeys feasibility.|- Passkeys feasibility<br>memo.|
|Week 4 — Aid Loop|Camilo: Visual polish, full QA,|- Polished, stable MVP|
|Closure & Packaging|empty/error states, accessibility basics.|APK.|
||Danilo: Final cloud integration;<br>Claimable Balance emission and claim<br>demo on Stellar testnet; Proof of Aid<br>mock; APK build.|- Claimable Balance<br>transaction (tx hash<br>verifable).<br>`- Demo video:`|
||Marcos: MVP packaging for Stellar<br>showcase; fnal B2G Prospecting<br>Pipeline document.|`offline → sync →`<br>`aid loop.`|
|||`- Prospecting`<br>`Pipeline document`<br>`with ≥15 prospects`<br>`mapped and`|
|||`contacted.`|



V.A.C.A - Vaquita of aid and coordination Active 

V.A.C.A - Vaquita of aid and coordination Active 

## **<mark>6. Evidence of Completion (Required)</mark>** 

Important guidance: Evidence should be clear, verifiable, and easy to review by the Ambassador Chapter Lead with minimal technical expertise. 

### 6.1 Planned Evidence to Be Submitted 

|Deliverable|Evidence Type|Description|
|---|---|---|
|Deliverable 1 (Week 1)|Brandboard document + GitHub<br>repo link + prospecting spreadsheet|- PDF with logo, palette,<br>typography, and component library.|
|||- GitHub repository with Flutter<br>project, architecture, and Drift<br>schema.|
|||- CSV/Excel with at least 15<br>mapped municipal/governmental<br>contacts.|
|Deliverable 2 (Week 2)|Figma prototypes + screen<br>recording + Stellar wallet<br>screenshot|- Interactive Figma prototypes.<br>- Short screen recording of ofine<br>data entry and local save.|
|||- Screenshot of Stellar testnet<br>wallet with funded balance.|
|Deliverable 3 (Week 3)|App screenshots + sync demo +<br>technical memo + updated pipeline|- Screenshots showing<br>online/ofine status and sync UI.|
|||- Video demonstrating queued data<br>sync to Supabase upon|



V.A.C.A - Vaquita of aid and coordination Active 

||reconnection.|
|---|---|
||- PDF with Passkeys/biometrics<br>feasibility assessment.|
||`- Updated prospecting`<br>`pipeline with follow‑up`<br>`status (≥15 contacts).`|
|Deliverable 4 (Week 4)<br>APK + full demo video + Stellar tx<br>hash + B2G Pipeline document|- Download link to APK (Android).<br>`- Complete walkthrough video`<br>`(3‑5 min): offline capture →`|
||`sync → Claimable Balance`|
||`claim.`|
||- Stellar testnet transaction hashes<br>(emission + claim).|
||`- B2G Prospecting Pipeline`|
||`document (≥15 prospects with`|
||`contact details, outreach`|
||`status, and Month 2`|
||`strategy).`|



V.A.C.A - Vaquita of aid and coordination Active 

### <mark>6.2 Evidence Verifcation Checklist (For Ambassador Use)</mark> 

|Deliverable|Evidence|Evidence|Evidence|Comments|
|---|---|---|---|---|
||Present|Partial|Missing||
|Deliverable|☐|☐|☐||
|1|||||
|Deliverable|☐|☐|☐||
|2|||||
|Deliverable|☐|☐|☐||
|3|||||
|Deliverable|☐|☐|☐||
|4|||||



## **7. Next‑Step Alignment** 

7.1 Anticipated Next Step After Completion 

After this Instaward, the most likely next step is: 

☒ Apply to SCF Build Award (to integrate the full Stellar financial layer: Claimable Balances, voucher tokenization, Social Yield, and NGO dashboard) 

☐ Continue development independently 

☐ Apply for a follow‑on Instaward (if eligible) 

☐ Seek other ecosystem support 

V.A.C.A - Vaquita of aid and coordination Active 

☒ Other: Activate the prospecting pipeline — initiate active commercial meetings with municipalities and NGOs using the functional MVP. The goal is to secure at least one pilot agreement in Month 2, with a live deployment for a real disaster or emergency simulation. 

## **8. Instawards Constraints Acknowledgement** 

By submitting this SOW, the Builder acknowledges: 

☒ This scope will be completed within 30 days or less. 

☒ Instawards support execution, not open‑ended exploration. 

☒ A project may receive no more than two follow‑on Instawards. 

☒ Each Instaward is capped at $5,000. 

☒ Total Instawards funding may not exceed $15,000. 

Contact: dcontrerasl@live.com Team: Danilo (Mobile Dev), Camilo (UI/UX), Marcos (Management & Prospecting) Project: VACA — Infraestructura Cívica de Resiliencia 

