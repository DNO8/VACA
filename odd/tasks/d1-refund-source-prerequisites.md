# Integrate the approved refund source prerequisites

Local source/static integration only, from the immutable `0e15e933` review snapshot into the owned clone.
Baseline: `3f6b798234724c18608d1d604a0b2fc4e11a9bef`, branch `feat/d1-t5b-proof`. No operational acceptance.

## Specs

The user approved the following quoted proposal with the exact reply “dale con eso”. These are approved assistant proposal strings, not additional user-authored requirements.

- S1: “Incorporar los dos módulos faltantes de presupuesto de comisiones y principal protegido.” Adopt `refund-fee-earmark-budget.ts` and `refund-liquid-principal.ts` from the frozen public snapshot, byte-for-byte.
- S2: “Fusionar las ampliaciones de contabilidad e historial de candidatos, conservando las funciones existentes.” Add same-observation accounting provenance and candidate ensure APIs while preserving the old context API, historical loader, guards, immutable originals, deadline and no-retry semantics.
- S3: “Integrar fixtures y tests como archivos, sin ejecutarlos todavía.” Integrate related source definitions only; preserve existing test assertions. No RED/GREEN, typecheck, SDK execution or SQL execution is authorized.
- S4: “Mantener intactos nuestro `/status`, D3 y el cliente; **sin reemplazar `index.ts` ni activar endpoints**.” “sin SQL, claves, pruebas, montaje ni despliegue”. Preserve handler/runtime/index, all client/D3 and tooling state. No network, provider, environment, dependency or migration changes.

## Tasks

- T1 [done: SOURCE/STATIC] S1,S3,S4 — inline; two modules match frozen hashes, six test definitions UNEXECUTED, direct imports exist, 696 original tracked files/nine dirty paths unchanged; commit `d1a58240bd0aa31868844696dcefb1c852e5259d` (367 additions).
- T2 [done: SOURCE/STATIC] S2,S3,S4 — inline; delivered API hashes match, old loader suffix/accounting core and old test bodies structurally preserved, six additional definitions UNEXECUTED; commit `89c85204f200cbbc0f8f1cd3cb75d09c83387d2d` (203 additions/11 deletions). Risk: item 3 (shared accounting helper and historical candidate module).
- T3 [done: SOURCE/STATIC] S3,S4 — inline; two delivered file hashes match, all five recovery test definitions/body retained, default scaffold structurally equivalent and034 SQL suite unchanged; commit pending.
- T4 [in_progress] S1–S4 — parent structural checks plus one risk-scoped independent static verifier; native assessment/review only through its offered route; local work-unit packaging; commit pending.

## Allowed edit surfaces

- `supabase/functions/d1-custody/{refund-fee-earmark-budget,refund-liquid-principal,issuance-accounting-context,refund-candidate-journal}.ts`
- `supabase/tests/unit/{refund-source-arithmetic,issuance-accounting-context,refund-candidate-journal,recovery-refund-plan}.test.ts`
- `supabase/tests/fixtures/refund-initial.ts`
- `supabase/docs/{d1-refund-source-prerequisites,d1-issuance-accounting-context,d1-refund-candidate-journal}.md`
- This feature document and `odd/evidence/d1-refund-source-prerequisites*`.
- New metadata / isolated static-review scratch only under owned `supabase/.temp/`, never altering the frozen `d1-source-review-0e15e933` snapshot.

## Verification

- Explicit human exclusion: no tests, typechecks, SDK code, SQL, application commands, builds, providers or network are executed. Test definitions are NOT passing tests. A runnable suite existing does not override the exclusion.
- Parent metadata-only checks: selected snapshot SHA-256 versus `comparison.json`; copied byte equality; exact historical loader suffix; old accounting core preservation except wrapping the same result; unchanged old test bodies; relative-import existence; `git diff --check`; protected tracked-file byte inventory and dirty-file preservation.
- Independent verifier: S1–S4 static inspection only; one fresh scratch copy confined to owned `supabase/.temp/` if isolation is required. Never use external scratch or copy private/env/tooling data. No test/probe/typecheck execution or original-backend-root access. If the role cannot honor this source-only scope, return unavailable once.
- Functional/differential behavior checks remain explicitly unexecuted; structural equivalence is not a substitute for SDK/SQL/provider/runtime evidence. Existing #40/#48 and D1 acceptance remain separate.

## Delivery

Forecast: approximately 800 authored diff lines, mostly previously delivered source and fixture movement, in focused local work-unit commits (roughly 300–400 lines each where cohesive), not a single accumulated feature-branch review. No publication/PR is requested. Do not compress source, omit assertions or import unrelated SQL cases to fit a budget. Native authority and consent are separate.

Local slice boundaries: feature base `3f6b798234724c18608d1d604a0b2fc4e11a9bef` → arithmetic slice `d1a58240bd0aa31868844696dcefb1c852e5259d` (367 authored additions, Risk: none). Shared-helper slice: `d1a58240bd0aa31868844696dcefb1c852e5259d` → `89c85204f200cbbc0f8f1cd3cb75d09c83387d2d` (214 authored lines, Risk: item 3). The fixture slice starts at that exact commit. The accumulated historical branch is not this candidate and is not resubmitted for review. Publication/PR shape remains unselected because no publication was requested.

## Log

- L1 — Original user request, verbatim: “hay algo que puedas anvanzar en cuanto aintegracion enparalelo ?”
- L2 — Approved proposal: “Sí: integrar la fuente ya revisada en nuestro clon, en paralelo al trabajo del otro agente sobre el host. Son tareas separadas, sin duplicar su escritura.” The four approved steps and exclusions are quoted in S1–S4.
- L3 — Human authorization, verbatim: “dale con eso”. This authorizes this bounded own-clone incorporation, not the full 113-file backend packet, real host mounting, functional verification or the other session's grants.
- L4 — Exploration: own Git common directory `.git`, feature branch and baseline confirmed. Nine pre-existing dirty paths (original seven plus two coordination trackers) preserved. `command -v gentle-ai` returned 1; no CLI was run or installed. Snapshot comparison diffs returned 1 as expected, not failures.
- L5 — Scope resolution: incoming `refund-candidates.test.cjs` adds 389/deletes20 lines and depends on migrations034–047. This first source-prerequisite unit does not import those migrations or future suites; retain the owned034 test unchanged. Adopt only related pure/API test definitions and the saved-initial/recovery extraction. This is not the complete backend import or complete test merge.
- L8 — T3 metadata check exit0: frozen fixture/recovery source copied only after matching both snapshot hashes, preserving the complete old `type H`-onward assertion body and default setup text after normalizing only the optional pre-observation creation flag. Five existing test definitions retained;034 SQL suite unchanged. Direct imports exist and diff check0/empty. All functional execution remains UNEXECUTED.
- L7 — T2 metadata check exit0: both API files match delivered hashes; old loader suffix byte-identical; old accounting core identical after normalizing only its return wrapper; two old test bodies preserved, six new definitions UNEXECUTED. Exactly six allowed original files changed, 690 others and nine dirty paths unchanged; direct imports exist and diff check0/empty. Shared-helper risk item3 escalation produced high/native unassessable and requires one independent verifier at T4; candidate null/outcome unknown, no reviewDue/continuation supplied, no native approval. A failed documentation edit had no write and was corrected against an actual file read.
- L6 — T1 metadata check exit0: two snapshot hashes/direct imports match; 696 original tracked files and nine dirty paths unchanged; six new test definitions are UNEXECUTED; `git diff --check` exit0/empty stdout/stderr. The fixture `equal` uses JSON.stringify, so BigInt assertions use decimal strings. Native assessment returned medium/native unassessable, untracked-declaration error, candidate null/outcome unknown; no approval or review route inferred. One committed-range assessment of the new367-line slice returned the same limitation, not approval. Initial `git add` exit1 identified the existing `supabase/.gitignore:2:*` documentation rule; an explicit force-add of only the authorized new guide preserved ignore files. No hooks path is configured; only sample hooks exist. Corrected local commit exit0, no SDK/tests invoked.
