# October D1: demonstrable custodied aid
Objective: finish the October D1 testnet custody, expiry and refund evidence for the requested recording. Branch: `feat/october-d1-custody` in both repositories.
Delivery: `ask-on-risk`; selected chain: `feature-branch-chain`; no push, PR, merge or deployment authorized. Runners: web pnpm 9.15.0 / Playwright; backend isolated Deno 2.6.8 / PostgreSQL 17.11, with command evidence recorded below.

## Specs

### S1 — Prepare the current repositories

User request: "revisa este repo y el de vaca web para ver si hay que hacer pull".
User clarification: "deberia estar en workspace pero si no, no está clonado".
Check both local repositories, preserve unrelated work, and base authorized implementation on their current main branches.

### S2 — Complete October Deliverable 1

User request: "hay que terminar el D1 con urgencia hoy".
The identified repository scope is `instawards/Statement of Work (SOW)-Octubre.md:61`:
"Pool signer moved server-side (Edge Function) or documented multisig pool; claimable balances carry expiry predicates; refund sweep for unclaimed donations".
Evidence at line 109: "Stellar Expert links: CB creation with predicate + refund tx; deployed Edge Function; repo diff — no signing secret in client".
The application additionally requires public testnet transactions. Do not substitute the separate legacy multisig simulation or September prototype evidence for D1.
Accepted on 2026-10-27 through the single-select answer "Adoptar esta política", for new Testnet donations only:
> Firma del pool únicamente en el backend.
> Vencimiento de 5 minutos desde la confirmación del pago en la cadena.
> Devolución al donante original de todo remanente no reclamado, incluso si todavía no se emitió un claimable balance.
> Barrido restringido a administradores autenticados.
> Fondos históricos intactos y sin mezclarlos con las donaciones nuevas.
This authorizes local implementation only, not deployments, ledger transactions or a production default. Preserve existing reservation/allocation contracts when implementing this lifecycle.
Applicable checks: observed RED → GREEN → REFACTOR through the relevant public interfaces, existing behavior regressions, full applicable suites, and an independent verifier for security/concurrency changes. Exact backend commands are pending source recovery.

### S3 — Produce truthful recording evidence

User request: "debo grabar hoy mismo".
The recording must distinguish implemented code, locally observed checks, deployed behavior and public creation/refund transactions. Do not claim completion from unexecuted tests or documentation assertions. Obtain explicit destination, operation and credential/session authorization before deployment or remote ledger mutations; never place secrets in chat or tracked files.

### S4 — Testnet operating fees and reserves

User, verbatim:
> si, confirmo esa politica para testnet

Accepted policy: the team funds Stellar transaction fees and claimable-balance reserves from a separate operational balance, without reducing donations, beneficiary allocations or original-donor refunds and without consuming excluded historical funds. Testnet only. No concrete account, key, transfer, deployment or production default is authorized by this policy.

## Tasks

- [x] T1 — S1 — Route: inline Git preparation, then delegated read-only mapping because integration understanding exceeded the inline evidence budget. Current baselines and clean feature trees observed; commit: none, repository preparation only.
- [ ] T2 — S2 — Route: initial recovery/configuration slice inline; bounded backend writer under the long-session context backstop, not size/file count/parallelism. PARTIAL: local preparation tests pass, but signing/issuance/discovery/refunds remain missing. IN CHECKING: narrow source allowlist approved and checked; native assessment and independent verification of preparation are pending. B remains read-only until the full tested-foundation checkpoint. Parent owns integration/log/Git; Engram mirror pending. Commit: pending; `feature-branch-chain` selected, no publishing authorized.
- [ ] T3 — S2, S3 — Route: inline own checks plus one independent verifier for named high-risk security/concurrency behavior; long checks may use per-action workers. BLOCKED: implementation, applicable runners and explicit deployment/testnet authorization; capture real D1 proof and recording checklist. Commit: pending.

## Log

### L1 — User authorization, 2026-10-23

> deberia estar en workspace pero si no, no está clonado, hay que terminar el D1 con urgencia hoy, debo grabar hoy mismo

### L2 — Prior request context

> revisa este repo y el de vaca web para ver si hay que hacer pull

> tluego revisa como vamos con el deliverable 1 de octubre, si no sabes cual es hay que revisar en drive

### L3 — Repository preparation observed

VACA was clean and six commits behind. Public unauthenticated fetch and fast-forward moved main to `1c60386e4c51a8933303a19424911580cd65d5dd`; implementation branch created before custom writes. VACA Web was not present in the workspace; public clone created at `../VACA-web` with main `5029955ac047f61d9191095e1bdd752f60d381cc`. Its isolated implementation worktree is `../VACA-web-worktrees/october-d1`, based on main. The canonical web clone remains untouched on main.

### L4 — Backend source blocker and mapped invariants

Neither repository contains the current Supabase functions or migrations. `vaca_app/SETUP.md:123` locates them in Drive `VACA/01 Producto/Desarrollo y QA/supabase/`. Setup mentions migrations 001–010 while newer evidence mentions 013, so the current source is required. No Drive connector is available.
The web uses signed `vaquita-admin` actions; actual server authorization, schema constraints and replay protection cannot be verified from the client. Browser pool signing and unconditional balances remain in the baseline. Preserve donor wallet signing and beneficiary device signing; do not create a generic signing endpoint or a competing backend from assumed contracts.
The pooled aggregate does not retain safe per-donor refund allocations. TTL, refund authority, historical pools and unreleased/late donations require confirmed rules; no alternative has been selected. Mobile claim-by-ID already exists, so D3 claim UX is not added to this scope.

### L5 — Verification and delivery state

No implementation source edits, dependency installation, tests, builds, deployment or ledger mutations have occurred. Node/npm and gentle-ai are available; Deno, Flutter and Supabase commands were not found; pnpm availability is unverified. Web-declared checks include `pnpm test:stellar-contracts`, `pnpm test:e2e`, and `pnpm build`; backend checks remain unknown. RDD is globally enabled; candidate consent remains required when native review is due.
Provisional forecast: 600–1,000 authored changed lines across backend, web, tests and docs, subject to backend recovery; this is advisory, not a hard cap. Strategy remains `ask-on-risk`; resolve any required chain choice before the next commit. No work-unit commit, reviewed boundary or PR slice exists yet. Baselines are recorded in L3.
Next action: obtain the current backend source folder without secrets, then reconcile its contracts and D1 rules before implementation. Mirror locator: `odd/october-d1-custodied-aid/tasks`, project `vaca`.

### L6 — Connect Drive first, 2026-10-24

> conectemos drive primero

OpenCode 2.1.4 currently connects codegraph, context7 and engram; Drive is not configured. Google's official Drive MCP is in Developer Preview and requires membership plus Cloud/OAuth setup. A local third-party option, Taylor Wilsdon's `workspace-mcp`, documents Drive-only readonly scopes; these allow reading every file accessible to the account, not just the VACA folder. Its default credential store is local plaintext JSON. Provider trust approval is pending before installation or registration; Google sign-in must remain user-controlled. No connector configuration, installation, authorization or Drive access has occurred.

### L7 — Local connector consent and prerequisites, 2026-10-24

> si dale

The user explicitly approved the proposed local third-party `workspace-mcp` connector, Drive readonly access to all accessible account files, and plaintext local token storage. This does not grant write scopes, select a Google account, authorize ambient token reuse, or authorize deployment/ledger mutations. Use a new protected integration directory outside the repository and a user-controlled Desktop OAuth client. Native Google consent remains required.
No usable Python, uv or uvx executable was found on PATH (only the Windows Store Python alias). Prepare an isolated, pinned `workspace-mcp==2.2.0` installation with a private managed Python runtime; do not modify global PATH or reuse unrelated Python environments. The parent owns OpenCode registration; a bounded per-action worker may install and check the tools without touching config or credentials.

### L8 — Restart recovery and verified local connector, 2026-10-24

The server restarted during the installation action. Read-only recovery found uv 0.13.5, CPython 3.12.15 and workspace-mcp 2.2.0 already installed; none were reinstalled. The dedicated integration is outside the repository in the user's OpenCode `integrations/drive-readonly` directory, restricted to the current user and SYSTEM. The global V2 `drive` server is registered and its MCP transport is connected; unrelated global configuration is semantically identical to its protected baseline backup.
The local launcher clears inherited Google client/default credentials and fixes Drive-only readonly/core/stdio arguments. Configuration uses a fresh token directory, a dedicated `oauth-client.json` path, a local credential store and loopback-only OAuth callback. No global PATH or other Python environment was changed. Reproducible `verify-setup.cjs` passed 13 structural checks; `verify-isolation.cjs` passed six sentinel-credential/exit-propagation cases with protected state unchanged. Both probes are retained beside the local launcher, outside application repositories.
An independent verifier confirmed OAuth `drive.readonly` scope enforcement, filtering to four Drive read tools, ACLs, unrelated configuration preservation and actual launcher isolation. Parent repeated the setup check and all six persisted isolation regressions. No application code, backend, deployment or public Testnet proof was produced. OAuth client JSON is absent and token directory is empty; MCP connectivity is not Google account authentication. Next prerequisite: the user creates/supplies a Desktop OAuth client locally, then completes Google sign-in. No OAuth file or secret should be pasted into chat.

### L9 — Verification diagnostic containment

One verifier assertion retained raw configuration diagnostics in a local tool-output artifact. Its contents were not repeated in chat. A boolean/count-only scan found zero hardcoded credential candidates; this is not a universal guarantee of no sensitive content. The exact artifact was preserved and restricted to current user and SYSTEM with inheritance disabled. The verifier's bounded recheck confirmed containment; no new sweep or account operation occurred. The exact verifier scratch directory was removed after regression checks. No report or publication was created.

### L10 — Accepted coordination before source edits

> Leé la memoria #34 del proyecto vaca y confirmá el reparto antes de editar archivos.

Observation 34 was read in full and A acknowledged the proposal in observation 44 before subsequent file edits. A owns source recovery, the tested custody/issuance/accounting foundation, refunds, integration and this sole canonical logbook/mirror. B owns read-only web readiness now; downstream client migration requires the working tested foundation, frozen source/API/error/state revision, exact isolated edit surfaces and authorization in B's own session. B must not edit A's existing october-d1 web worktree or this document/mirror. Serialize dependent behavior and server-backed browser tests unless explicitly isolated. No new writer or application change is authorized by the coordination note alone.

### L11 — Google Drive authorization verified, 2026-10-25

> prueba ahora

> revisa si se aprobó

A real authenticated readonly Drive query for `fundacioncamada@gmail.com` returned exactly one VACA folder, ID `1hBM8Mx2hEox2LSsTgmMhkE2Ai5KcbUen`. This confirms account access works; it does not claim production verification of the OAuth app. No secret, token, authorization code, state or PKCE material was exposed or persisted. The authorized source-recovery continuation resumed without reinstalling or changing the connector.

### L12 — Backend located; current source revision unavailable

Read-only mapping reached `VACA/01 Producto/Desarrollo y QA/supabase/`, folder ID `1tDMvZM4e_WZ4COcZ7mnfbW18eMeE_Mif`. It contains individual source files rather than an archive. The README identifies a Slice C3 demonstration/development reference; inspected source modification dates are in September 2026. Migration inventory ends at 010; 013, the beneficiary `stellar_pubkey` addition and the active claim-recording contract were not found in the bounded inspected scope. No Git revision or correspondence to the deployed backend was established.
Parent spot check corroborated that `functions/vaquita-admin/index.ts` allows only `check` and `set_status`, not the claim action consumed by the current web client. Existing device-auth nonce persistence and incident-ingestion idempotency are useful mapped helpers, not evidence of donation accounting or custody/refund completion. Do not replace the current backend with this older snapshot or invent missing contracts. Sanitized map: Engram observation 58.
No source files were downloaded, app code edited, tests/builds run, functions deployed or ledger operations performed. Current backend source and its provenance remain the blocker, along with the unresolved product rules already listed in S2/L4. Next action: obtain the actual revision containing 013 and active donation/claim contracts before designing the foundation or starting parallel client edits.

### L13 — Home source availability constraint

> si no me equivoco estan en mi repo local en un computador en casa, y ahora mismo estoy fuera del pais, asi que tenemos un problema con eso

The source location is a user-reported possibility, not a verified loss. No home-computer access or ambient credential inspection is authorized. Official Supabase capabilities can recover retained deployed function artifacts and current schema; historical SQL requires retained statements. Git history and never-deployed changes are not guaranteed recoverable. A current-state baseline must be explicitly identified as such, not passed off as original migration 013.

### L14 — Scoped Supabase recovery authorization, 2026-10-25

> https://tgqxxnldwiqisopiclmk.supabase.co

> si demosle

The user identified project reference `tgqxxnldwiqisopiclmk` and explicitly approved configuring the official readonly connection and inspecting deployed functions/schema/migration history through a new user-completed Supabase login. No business/user rows, secrets, writes, deployments or ambient session reuse are authorized. The user was informed that underlying OAuth may request broader organization permissions and must review native consent. The Supabase account/organization is not assumed from Google Drive.
Initial setup enables only the `functions` feature group with `read_only=true` and the exact project reference. SQL/database tools are not exposed at this stage; schema/history recovery remains a later bounded inspection. This preserves existing legacy OpenCode permission rules without a migration or override.

### L15 — Functions-only setup checked; native sign-in pending

Native OpenCode CLI registered global V2 server `supabase_vaca_readonly` at the official MCP endpoint with only `project_ref`, `read_only=true` and `features=functions`. A protected external `integrations/supabase-vaca-readonly` directory retains a baseline backup and reproducible setup/scope probes; no credential headers or manual OAuth client were added.
Observed missing-server RED before registration, 11 scope-guard cases passed, configured GREEN passed all 14 checks, and the persisted regression suite passed 18 tests. Unrelated configuration and both legacy/native permissions remain unchanged. Independent local checks and ACL checks passed. The verifier could not perform public-network corroboration because its runtime forbids network access; that unavailable proof and the actual post-login tool surface remain pending rather than fabricated as PASS.
Parent spot check confirms the server is listed as `needs authentication`, not connected. No Supabase account has been selected or authenticated in this conversation, and no private Supabase tool/data request, app edit, backend recovery, deployment or ledger transaction has occurred. Next required human action: `/mcps` in OpenCode, select `supabase_vaca_readonly`, and complete sign-in with an account/organization that can access the specified project. Never request tokens/passwords in chat or run shell-based auth. Recheck the effective readonly function tools before any source inspection. Exact verifier scratch is removed after checks.

### L16 — Authenticated deployed-source recovery, 2026-10-25

> conectado el supabase

The initial native login succeeded: `list_edge_functions` returned eight ACTIVE functions bound to the approved project. Read-only mapping obtained `vaquita-admin` v9, `vaquita-feed` v9 and `bundle-ingest` v19, including its shared validation helper: four source files, no local source downloads. Responses were pattern-sanitized before entering model context; zero matched credential patterns is not proof that all secrets are absent. Deployment bundle hashes identify artifacts, not source-file hashes or Git commits. Sanitized evidence: Engram 88/89; parent spot check confirmed admin `check`, `set_status`, `claim` and `stellar_pubkey`.
Live admin verifies signed messages and admin membership but records a transaction hash without verifying ledger contents, beneficiary or issuance; its conditional update does not check the affected-row count. Feed `claimable` only means a recorded hash. Ingestion forwards an optional beneficiary into `accept_bundle`; actual database validation and immutability remain unknown. No original Git history, tests, undeployed changes or migration 013 were recovered. Custody, expiry and donor refund decisions remain open; B stays read-only.

### L17 — Fixed metadata plan checked; expanded login pending, 2026-10-25

Advanced the already-authorized schema/history recovery by changing only the existing server URL feature group from `functions` to `database,functions`; exact project and `read_only=true` remain fixed. A protected pre-metadata backup was saved. Unrelated configuration and both permission fields are unchanged. The fixed external `metadata-read-plan.json` permits native schema/migration inventory and eight reviewed catalog SELECTs only; no business/user-row queries, secret stores, procedure execution or mutations. History reads version/name/statement count, not raw historical SQL. `accept_bundle` is inspected with `pg_get_functiondef`, not executed. Returned literals must be sanitized before model/context output.
Observed metadata-mode RED before the URL change and all nine local checks GREEN afterward. Independent static review passed with 11 scratch tests. Parent syntax-checked and ran the persisted `verify-metadata-scope.test.cjs`: 11 passed, zero failed/skipped; parent spot check of `verify-metadata.cjs`: all nine checks true. Exact-text plan fingerprint: `6bc308700805d865683487848232be5904b5ef51ad1e2997b2853cd52db1b209`. This approves only the reviewed texts/local setup, not arbitrary SQL, remote confidentiality enforcement, live schema or D1. Only the exact retained metadata-verifier scratch directory was removed.
Current native status still reports `supabase_vaca_readonly` as `needs authentication`; no metadata/SQL request has been issued. Required next action: the user opens `/mcps`, selects this server and completes native sign-in for the expanded configuration. No shell auth or credential-store inspection. After connection, inspect actual tool schemas and target binding before the bounded reviewed metadata reads. Application source, deployment and ledger state remain unchanged; T2/T3 are not complete.

### L18 — Authenticated schema/history inventory, 2026-10-25

> autorizado

Native status now confirms the expanded server connected. The nine configuration checks and exact first-plan fingerprint passed before reads. Native migration inventory returned 15 versions, including `013 claimable_balances`, `014 release_requests` and `20261011060218 donation_allocations`; public inventory returned 13 RLS-enabled tables, including `release_requests`, `donation_payments` and `donation_allocations`. This resolves authentication, not D1 or original source provenance. Older web/Drive evidence must not be treated as proof that current database accounting is absent. Sanitized inventory: Engram 119.
The explorer executed the first eight exact SELECTs once each: history 15 rows, columns 51, constraints 12, indexes 14, triggers 1, policies 0, visible grants 0, `accept_bundle` definition 1. All eight succeeded; no retries. Retained statement counts are 5 for 013 and 1 each for 014 and donation allocations, without reading their contents yet. Zero visible grants does not prove no effective privileges. Current `accept_bundle` is SECURITY DEFINER with an empty search path, message-scoped advisory locking and receipt idempotency; its upsert permits replacement of a nonnull beneficiary key. Incident-scoped first-message exclusivity and complete privilege behavior were not established. Sanitized map: Engram 120/121.
The parent's one additional exact `accept_bundle` SELECT was issued, but its result could not be safely projected; that spot-check readback is unavailable, not PASS. No raw response was exposed or substitute verification started. Existing claim hash/row-count and feed interpretation gaps remain observations, not automatic authorization for unrelated fixes. No application rows, source downloads, application tests, deployments or ledger operations were performed by the completed mapping.

### L19 — Accounting recovery plan prepared; inspection blocked

A second protected external plan, `metadata-accounting-read-plan.json`, contains ten fixed reads covering discovered accounting/dependency columns and constraints, policies, effective API privileges, trigger definitions, routine access metadata and retained statements only for versions 013, 014 and 20261011060218. It reads catalogs/history, never business rows or executes application routines. Fingerprint: `09ed8d7c455bbb5b04bf3a4718d643c322548cd0aaed8ccd80beca0326e77c18`. The initial local probe failed from command-line quoting; passing the script through stdin then passed all four structural checks. This is fixed-plan readback, not a universal SQL sanitizer or a database test.
The bounded accounting explorer launch returned a connection-resolution error and no handoff. The ten-query stage has no attested execution results; do not claim its inspection completed or blindly repeat it within this turn. Preserve the plan and the failed child session identity for recovery. No applicable fallback permits continuing the broad mapping inline. Required proof is the accounting schema, effective access and retained D1 statements; product decisions and implementation remain pending until that inspection is available. No new Supabase login is required merely because of this connection failure. Application trees remain unchanged, with only the existing untracked `odd/` in VACA; no feature commit, deployment or ledger mutation occurred.

### L20 — SQL recovery resumed and captured, 2026-10-27

> continuemos con la inspeccion de las tablas para recuperar el SQL retenido, y continuemos con D1

Reconciled the full local feature document with mirror 26 through L19 before writes. Both repository baselines and feature branches remain unchanged. The exact readonly project binding and ten-query plan fingerprint passed current local checks; native Supabase status is connected. The project skill registry exists and was read; installed skill identifiers were passed to the explorer.
The continued explorer recovered its earlier accounting results: nine metadata responses were retained from October 25, not freshly revalidated. It freshly reread the three authorized history entries on October 27. Counts are 41 columns, 16 constraints, 9 indexes, 0 accounting policies, 13 table security rows, 39 API-role privilege rows, 1 trigger, 1 trigger definition, 10 public routine inventory rows and 3 history entries. These results resolve the previous missing handoff, not original-source provenance.
Existing accounting preserves declared donor/payment facts, a bounded allocation counter and one allocation per request. The reservation and allocation RPCs perform their existing validation, replay binding and request/payment locking; they do not prove payment consensus, issue balances or refund funds. API-role DML/EXECUTE observations and retained SQL are distinct from runtime tests. Do not rebuild a competing accounting model or infer a fixed TTL from the synthetic validation date.
Parent independently reread the exact retained history query, decoded the embedded JSON array and captured seven statements from versions 013, 014 and 20261011060218 in `recovery/supabase/2026-10-27/retained-migrations.json`. Their original internal line endings and boundaries are preserved. `manifest.json` records all three statement-array hashes and five current routine-body hashes; `README.md` documents provenance, limits and a local integrity check. This isolated evidence folder is not a deployable migration directory or complete bootstrap.
A separate read-only explorer query freshly inspected the five current reservation/allocation/helper bodies and flags. Parent extracted the corresponding retained bodies and compared exact UTF-8 hashes: all five match. All three retained statement-array hashes also match the independently observed source identities. The documented local integrity command passed after both JSON files were written. Zero known sensitive-pattern matches were observed before source output; this is not a universal absence guarantee.
Only recovery evidence and this logbook were written. No application behavior, Supabase state, ledger state, dependencies, branch commits or deployed functions changed. No meaningful behavioral RED or application suite applies to a passive source capture; exact source identities, JSON parsing, body comparison and structural readback are the checks performed. Custody authority, deadline origin/duration, refund destination, sweep authority and historical/unreleased/late-donation treatment remain product decisions; no proposed defaults have been accepted as requirements.
Engram write attempts could not confirm session registration in both parent and explorer. The local record is preserved; the full mirror and setup-state update are pending, not synchronized. Do not invent a session identity or discard this newer local document when reconciling the older mirror. No feature task is checked off by the recovery evidence alone.
Native review mode remains on. The initial assessment required an explicit untracked scope; a lens-bearing preflight was refused until selection was declared. Canonical inventory then listed exactly this feature document and the three recovery files. The explicit four-path assessment returned `medium`, 367 changed lines and `review_due: false` / `under_budget` before this passive log note. No START, candidate consent, reviewer, authority or receipt was created. This does not mark D1 verified or complete.
Risk: none (isolated evidence capture; no shared runtime code or live data changed).

### L21 — Pending D1 lifecycle decision

Unaccepted proposal for new Testnet donations only: backend-only pool signing; a five-minute deadline measured from on-chain payment confirmation; return every unclaimed remainder, including unissued funds, to the original donor; sweep restricted to authenticated administrators; historical funds excluded and not mixed. No production default, deployment or ledger-operation authorization is implied. This proposal is not an S2 requirement unless the user accepts it. Implementation remains blocked on that product decision.

### L22 — Testnet lifecycle accepted, 2026-10-27

Native question answer, verbatim:
> Adoptar esta política

The user selected the complete five-rule new-Testnet-only policy presented above. S2 now records those exact rules; T2 is reopened for local implementation, not checked off. Existing source and schema evidence still apply. No permission for production defaults, deployments or ledger transactions was inferred. The Engram mirror remains pending; this local document is newer than observation 26.

### L23 — Local verification prerequisites

Current local inspection found Node, npm and pnpm, but no Deno, Docker or psql. Neither web checkout has the Stellar SDK installed, and the reserved web tree has no Playwright dependency installation. Current deployed admin v9 was reread safely: it uses Supabase JS 2.115.0, noble curves 2.3.0 and Stellar SDK 13.3.0, preserving the existing signed five-line admin challenge. No backend source folder exists locally yet.
Real Edge Function and PostgreSQL transaction/concurrency tests need local tools and dependencies. No binary/package download or installation has been authorized or started. Request explicit anonymous-download permission for isolated Deno, EDB portable PostgreSQL and required npm dependencies; no ambient credential reuse, global PATH changes, Windows services, live Supabase writes or ledger operations. Official documentation supports manual Deno ZIP/checksum downloads and EDB's Windows binary archive. Installation authority must be resolved before tool downloads; accepted lifecycle rules remain unchanged.

### L24 — Isolated test environment authorized, 2026-10-27

Native question answer, verbatim:
> Autorizar entorno aislado

The user explicitly approved anonymous Deno downloads from GitHub releases/API and the listed GitHub asset hosts, EDB portable PostgreSQL from `sbp.enterprisedb.com` / `get.enterprisedb.com`, and required npm dependencies from `registry.npmjs.org`. Tools/caches must remain isolated; temporary PostgreSQL uses only `127.0.0.1` and test data. No global PATH or Windows services, ambient credentials, unnecessary install scripts, live Supabase writes, deployments or Stellar transactions. The pre-launch forecast disclosed downloads, disk use and network-dependent preparation time. A bounded per-action worker may prepare and smoke-test the runtime without editing repository source; parent owns all manifests, source and Git.

### L25 — Server restart reconciled without repeated work

> The server restarted while you were working. Continue from where you left off without repeating completed work.

Read-only recovery confirmed both baseline commits and reserved feature trees unchanged, with only the existing untracked `odd/` and `recovery/` in VACA. The local S2 policy and L22/L24 approvals survived; mirror 26 is still older through L19 and must not replace them. Engram write registration remains unavailable after the restart.
The existing toolchain worker is `ses_e827d0923ffeB6ELKQakdFMVLl`; it was not relaunched. Its owned manifest and files already contain Deno 2.7.0 and PostgreSQL 17.11. Deno archive SHA-256 is `e7895110bab2d77c4ae9878d1c75d44d0b5219f13f337322b210ebcc8867e6ff`; EDB archive hash is `80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f` with no independent publisher checksum. A one-time restart snapshot found its own PostgreSQL smoke processes still running; do not stop or duplicate that in-flight work. No completed SQL reads or downloads were repeated during recovery. Wait for the bounded worker's terminal handoff before claiming the toolchain complete.
A separate read-only local source map found no actual implementation/tests of `parseReleaseRequest` or the recovered reservation/allocation symbols in the selected application trees. A new honestly labelled `supabase/functions/` implementation is needed; the captured history is not a deployable bootstrap. Existing web donation/admin/claim interfaces and mobile beneficiary claiming were identified without rereading their full implementation or altering them.
Before writing behavior tests, confirm the public testing/API boundary: proposed new `d1-custody` signed HTTP commands, the existing reservation/allocation RPC contracts, and decoded Stellar transaction shapes. The alternative is extending the existing `vaquita-admin` action contract, with additional compatibility tests. This is a pending technical design choice, not another vote on the already accepted fund policy or download authorization.

### L26 — Toolchain handoff and bounded correction

The original worker returned `partial`: cached import/typecheck, dependency-free Deno smoke and a PostgreSQL 17.11 loopback fixture passed; its fixture was stopped and owned PostgreSQL process count returned to zero. Initial Deno version/cache outputs were lost during the restart. The revised file-backed PostgreSQL launcher path was not tested. EDB's hash remains locally computed without independent publisher-checksum proof.
Parent read the launcher and README, then performed the required single spot-check: isolated `deno --version` exited 0 but reported `deno 2.7.0+fb4db33 (canary, release, x86_64-pc-windows-msvc)`. This contradicts the stable-runtime setup premise; do not describe it as stable. One bounded correction may replace only Deno with a verified stable official 2.x artifact and check the previously untested PostgreSQL launcher path. Preserve the installed PostgreSQL and dependency cache; do not repeat SQL recovery, full installation or unrelated verification. All download/network/isolation limits from L24 still apply.

### L27 — Public seams confirmed and stable runtime rechecked

Native question answer, verbatim:
> New endpoint (Recommended)

The user chose a new `d1-custody` Edge Function, preserving the existing `vaquita-admin` action contract. Confirmed behavior-test seams are signed HTTP requests, existing reservation/allocation RPC contracts and decoded Stellar transaction shapes, not private helpers. No deployment or ledger permission was added.
The bounded correction returned complete: one different official Deno 2.x archive was verified, stable 2.6.8 replaced the canonical runtime, the old canary/history were retained, cached pinned imports passed offline, and the unchanged PostgreSQL launcher started/queried/stopped a fresh loopback fixture. Parent's limited recheck observed explicit stable 2.6.8 and canonical executable SHA-256 `3c53c061724194360f71b45e1dd227128750fe5c167ce314fa9c64110e690598`, matching the corrected artifact. Official Deno ZIP hash: `febe91c13a3bd5509f77058f1376bff99c76b518046ebd46fe385bbf81b836d9`. PostgreSQL remains 17.11 without an independently verified publisher checksum. No full install or SQL recovery was repeated.
Parent starts the first behavior slice inline: a public configuration HTTP contract exposing Testnet routing and the five-minute duration, never the pool secret. Source is a new provenance-labelled backend, not a claim of original source recovery. No behavioral RED/GREEN result is claimed before the actual runner executes.

### L28 — First public contract RED/GREEN; bounded backend continuation

The new public configuration test first failed with `not_implemented` after dependency/type resolution. Minimal handler implementation then passed the focused HTTP test. Initial CLI plumbing errors (`deno cache --cached-only` unsupported and PowerShell stderr capture) were corrected without claiming them as behavioral RED. A frozen-lock mismatch during typecheck was resolved by normalizing both declared pinned imports before final checks. Final observed results: focused configuration test 1 passed, declared `check` task passed, full current `test:unit` suite 1 passed. This is only routing/no-secret evidence, not signing, expiry, accounting or refunds completion.
The next coherent backend lifecycle unit is delegated for the context backstop: the parent already carries recovered SQL and multiple restart/runtime-recovery histories. The writer owns its code, SQL, tests and backend documentation together, reuses the retained reservation/allocation RPCs and preserves the agreed public HTTP/SQL/transaction seams. Parent will check its exact surface, run native risk assessment, obtain independent verification for the concrete security/concurrency/dependency risks and spot-check a reported command. No model-effort, price, size or native tier alone justifies that verifier. No parallel dependent behavior is called independent.
The agreed scope requires verified chain payment identity, payment-based five-minute expiry, durable idempotent signing/submission/reconciliation, original-donor refunds including unissued remainders, and no historical-fund reuse. Existing eight-character legacy memos cannot prove a full incident identity; new D1 donations may use a versioned full-incident hash binding while leaving the legacy helper/output untouched. Unknown ledger outcomes must fail closed, never cause a second payout. Local testnet implementation only; no remote backend/ledger writes or publishing.

### L29 — Feature-branch chain selected

Native question answer, verbatim:
> Feature branch chain (Recommended)

Cache `delivery_strategy: ask-on-risk` with `chain_strategy: feature-branch-chain`. Future dependent review slices stay off main until integrated, with a draft/no-merge tracker only if PR publication is separately authorized. This choice permits no push, PR creation, merge or deployment. Parent still owns local work-unit commits and will make one honest cohesive slicing pass rather than reducing tests or code quality for a line budget.

### L30 — Preparation slice returned partial; source visibility decision

Backend writer `ses_e822bbd83ffeMkeIp1hQuU7iAE` returned partial relative to the requested lifecycle. It implemented signed preparation HTTP, strict envelope/payload and trusted Testnet payment binding, payment-confirmed +300-second deadlines, and a private activation/preparation overlay atomically calling the existing reservation/allocation RPCs. Reported closure: typecheck passed, unit suite 9 passed, real PostgreSQL integration scenario passed including replay/rollback/historical isolation/concurrent-capacity probes; all four owned fixtures stopped. SQL's initial RED was only structural missing-file evidence, not behavioral RPC RED.
Missing behavior remains substantial: paginated discovery/cursors, issuance and predicates/time bounds, durable signed intents/sequence/outcome reconciliation, authenticated sweep, issued/unissued refunds and submit-success/save-failure proof. No tested full foundation exists yet, no S2/S3 completion is claimed, and downstream client migration remains gated. Keep this preparation-only endpoint unfunded and undeployed.
Parent surface inspection found 11 backend files within the delegated surface, but all are excluded by the original root `.gitignore:15` rule `/supabase/`. The repository documents a Drive-only backend/source convention. No force-add, ignore-policy change, commit, native assessment over a misleading empty source diff or independent-verifier PASS was performed. Before review/commit, ask whether to change only `.gitignore` and `supabase/.gitignore` to allowlist D1 source, while retaining private env/cache/other Supabase exclusions, or preserve the current exclusion and choose an external backend repository. Assessment, parent spot-check and independent verification remain pending until the actual implementation can be represented honestly.

### L31 — D1 source allowlist approved and checked

Native question answer, verbatim:
> Allowlist D1 here (Recommended)

The user approved changing only the two ignore files to version the listed D1 source, not all Supabase contents. Parent removed the root blanket exclusion and replaced the nested ignore file with a closed-by-default allowlist for D1 TypeScript, its migration, unit/integration tests and documented manifests. Environment files remain excluded even inside source directories; unrelated Supabase files, caches and binaries stay ignored. No force-add or publishing occurred.
Observed source-visibility RED before edits: all 11 source paths ignored, private guards active. After edits: all 11 approved paths visible; 10 hypothetical private/unrelated Supabase paths and 6 existing keystore/tooling/documentation guards remain ignored. No credential files were created or read. Parent also reran the writer-reported unit suite through the isolated launcher: 9 passed, zero failed. Native assessment and the independent security/concurrency verification now target the actual visible preparation source; this is not full-lifecycle acceptance.

### L32 — Preparation verification gate

After canonical untracked inventory, parent explicitly selected the 15 owned untracked paths plus the tracked root ignore change. Native assessment returned `high` over 16 paths / 2,331 changed lines, with explicit item-2 escalation for signed admin/payment/historical-fund/privacy guards. The reason for independent verification is those concrete security changes, plus item-4 transaction ordering and item-5 dependency/environment changes, not the tier or writer model. No review START or authority was created.
The independent verifier must read every S# and report S2 as incomplete overall. Its candidate is the implemented preparation slice and source visibility, not imaginary issuance/refunds. Declared missing lifecycle behavior remains pending; change-caused defects or unmet implemented-contract behavior are blockers. Probes must run in fresh external scratch against realistic public HTTP/RPC inputs, preserve rejected-command state hashes and baseline legacy RPC output, and leave the workspace untouched. Native outside review, commit and downstream client migration remain pending.

### L33 — Revised guide adopted and WSL verification enabled, 2026-10-30

User, verbatim:
> genial entonces el revised sera nuestra guia, hay que emepzar a trabajar en el

After the Windows launcher could not resolve Node, the user authorized isolated WSL tools and minimal runner adaptation:
> dale con todoo

Drive October Revised (file 17vxYtjIHmxs13IGUvDgfX8RCHr5J3qz5) is the development guide, not proof of approval/funding or completion. It specifies backend-controlled Testnet releases, authorized recovery and original-donor refunds. No deployments, ledger writes or keys authorized. Original submission status remains uncertain.
Isolated Linux tools at /home/danilo/.local/share/vaca-d1-toolchain provide verified Deno2.6.8 and signed Ubuntu PostgreSQL17.7 (not the former Windows17.11). Tools, frozen cache and launcher isolation were independently verified; no OS-wide sandbox claim. Windows tooling and global installs untouched.
Portable fixture adaptation touched only supabase/README.md and tests/integration/{preparation.test.cjs,fixture-runtime.cjs,fixture-runtime.test.cjs}. Observed writer and independent Linux results: focused8/unit9/PostgreSQL1/typecheck all exit0; parent focused8 passed. Independent probes confirmed empty child environments, rejected-root state preservation, loopback-only PostgreSQL and stopped PID/fixture cleanup. Actual Windows execution unavailable. Original before-edit scratch was auto-cleaned; exact historical byte-comparison of SQL/assertions remains unavailable, not PASS and not a reproduced defect.
All four source paths are untracked; authored portability delta is106 changed lines but full four-file candidate497 lines includes inherited source. Native inspect after selecting exactly those four untracked paths still projects unrelated tracked changes throughout the checkout. No START, review consent, receipt, staging or commit occurred. Do not review or commit that mixed workspace as the portability unit. Next: isolate a truthful candidate and resolve treatment of inherited backend source before further issuance changes. Full S2/T2 lifecycle remains partial and no public D1 proof exists.
WSL tracking: /home/danilo/odd/tasks/vaca-d1-wsl-toolchain.md and Engram odd/vaca-d1-wsl-toolchain/tasks.

### L34 — Isolated imported preparation checkpoint, 2026-10-30

User accepted isolation and coherent initial baseline size:
> vamos con ese aislamiento,
> configuremos el git, es DNO8 y dcontrerasl@live.com
> no tengo problema con que subamos un commit grandw

Clean same-clone worktree /home/danilo/worktrees/vaca-d1-wsl-baseline, branch feat/october-d1-wsl-baseline, baseline1c60386e. Windows source files remain untouched. Exact17-file import identities are recorded in odd/evidence/d1-wsl-isolation.json as a snapshot at import time; this subsequent log addition intentionally advances the copied task document beyond that snapshot.
Work-unit boundaries: fcd6ba37eb57318780d5a13d48adcebfdd92f300 contains passive recovered evidence (205 lines); 90795e7ea2a39dcd9d30632a5e151ef93f2fc09a contains coherent initial runtime source/tests/docs (1964 additions/1deletion,432 lock lines). Oversized initial import explicitly accepted, not silently represented as106 authored portability lines. No push or deployment authorized/performed.
Independent verifier mvvcb9zw-8-u5t0 accepted preparation-only source:9 unit tests,1 real PostgreSQL fixture,offline typecheck passed; independent signature mutation/malformed input/current membership/expiry/rollback/capacity/privilege/legacy behavior probes passed. Full S2 remains incomplete; public ledger proof absent. Historical Windows before-edit comparison and actual Windows execution remain unavailable.
Native assessment remains unassessable because it requests an untracked declaration even after inspect excluded remaining odd/ files. Agent security escalation required the independent verifier, which completed; native assessment failure is not a PASS or a closed review. No START, consent, authority or receipt created. Do not repeatedly run the same failed assessment. Next scoped implementation may proceed under observed independent verification; report native review unavailable for this checkpoint.

### L35 — Pure unsigned issuance planner verified, 2026-10-30

Work-unit commit8eecba7b3f92ea2713a8770dd2dc515b3a1a3ba5 (304 changed lines) adds an unwired unsigned Testnet claimable-balance planner using existing Preparation/VerifiedPayment types. It enforces exact allocated asset/amount, immutable confirmed-at+300 deadline, complementary beneficiary-before/pool-not-before predicates and maxTime deadline-1. No HTTP/signing/broadcast or storage added; pool recovery is not an original-donor refund.
Writer observed behavioral RED6fail then focused6/full15/typecheckpass. Independent verifier mvvcxaj5-a-xzgo accepted exact73ab8f3..8eecba7 range: focused6/full15/base9/typecheck and2 adversarial probes passed; no blockers/advisories. Parent focused6 passed. No SQL/shared implementation changed; PostgreSQL not rerun for this unit. Runtime native assessment now succeeds with no untracked source: native medium, item2 escalation high requiring independent verifier, reviewDuefalse under_budget. No review START or receipt needed/claimed.
Slices: initial oversized import accepted separately;8eecba7 is the next bounded304-line security unit. Full S2 remains partial. Before connecting durable signing/submission, clarify operational fees/reserves funding so donation/beneficiary/refund amounts and historical-fund exclusions are not silently changed. Recommend a separately funded operational balance; no account, credential, transfer or production policy inferred.

### L36 — Testnet policy confirmed and request intents verified, 2026-10-30

User confirmed the policy recorded in S4. Request-intent work-unit7089bc785b1156d388bf788e8b0d9cec93aed1b7 adds private016 RPC/table,221changedlines with tests/docs. It derives bindings only from savedD1preparation/allocation, checks currentadmin evenreplay, firstcreationDBdeadline and immutableexpiredreceipt replay. No fee deduction, sequence, envelope, signer, broadcast or refund implemented.
Writer observed realRPCmissingfunction RED thenGREEN; verifier mvvmcoqw-d-3srg accepted immutable22bcbf5..7089bc7 with combinedrealPGfixture,15offlineunit,typecheck and independentauthorization/concurrency/lockwait/searchpath/stateinvariance probes. Parentjob-3 repeated realPGfixture:exit0 in14s,serverstoppedPIDgonefixturegone. Native assessment medium,securityescalationhigh requiring verifier(done),reviewDuefalse. Initial parentbaseid error corrected using actualGitHEAD^; not an applicationfailure. No nativeSTART/authority/receipt.
Next bounded unit is durable exclusive pool sequence ownership, preserving currentadmin and immutableintent bindings and refusing automaticrelease/reuse onunknownoutcomes. This is not yet signing, submission or funding-proof readiness. FullS2 and publicledgerproof remain incomplete.

### L37 — Exclusive source-sequence ownership verified, 2026-10-30

Work-unit e7c0d2a11699167abce5bf8a9f97ba00a7baaac7 (257changedlines) adds private017 reservation of one sequence owner per storedpool andrequest intent. It enforces currentadmin replay, exactboundeddecimalintegerincrement, storedsourcebinding, postlockdeadline, immutableexactreplay and conflictingrequest exclusion without monetarycounterchanges. Ownership has no automaticexpiry/recycle; futureverifiedreconciliation is required before reuse. This is not Horizonconsensus or fundingproof.
Writer actualrealRPCmissingfunction RED→GREEN and15offlineunit/typecheck passed. Independent verifier mvvn0v9h-f-x6oi accepted immutable0dd5c59..e7c0d2a, realPGfixture,15units/typecheck and adversarialbigint/authorization/searchpath/concurrentownership/stateprobes; no blockers/advisories. Parentjob-4samecombinedPGfixtureexit0 in26s:SEQUENCE_CASES andINTENT_CASES passed,serverstoppedstatus3,PID49171absent,fixturegone. No remotesigning/ledger/network operations. Nativeassessmentmedium,item4escalationhigh requiring verifier(done),reviewDuefalse under_budget; no nativeSTART/receipt.
Current bounded local units are verified; completeS2 still lacks durablesignedenvelopes, trustedaccount/operationalfundingchecks, submission/outcome reconciliation, expiry recovery and original-donor refunds. No fullD1 or deployment/publicproof claim. SourceWindowscheckout preserved and branchunpublished.
