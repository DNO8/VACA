# Automatic refunds: independent local verification

The independent verifier passed the local automatic-backend unit at candidate
`02d6268bc0ab7e74af9c3defe4e309dc748d3828`. This is not deployment,
activation, configured-provider readiness, web/mobile integration or live financial acceptance.

## Independent result

Verifier `mwjkk65r-1d-gnla`: **six tests passed, zero failed; four entrypoint graphs compiled**.
One isolated preparation, zero corrections, no writer-suite replay.
No reproduced blockers or advisories; no assigned in-scope check left unverified.

Five genuine-SDK runtime tests independently established:

- Authentication precedes request-body access. Caller-supplied actor/lane,
  duplicate keys and empty bodies return exact `400 {"error":"invalid_request"}`;
  unauthorized requests return exact `401 {"error":"unauthorized"}` with no effects.
- Issued full-gross journeys for successful and failed original issuance settle
  through authenticated ticks only, including partial discovery/history after
  candidate expiry. Each tick consumes at most one page per stream.
- Signing/submission occur exactly once; permanent ownership hashes remain unchanged.
  Unauthorized interruptions preserve public journals. Final amounts are donor
  `10.0000000`, beneficiary `0.0000000`, remainder `0.0000000`; later ticks are read-only.
- Changed 038 membership after operating-credit reads returns exact
  `503 {"error":"refund_unavailable"}` without journal/effect changes.
- Absent/error provider evidence cannot propose a lane. Altering saved deadline
  fields without changing original confirmation cannot bypass confirmation +300 seconds.

One real PostgreSQL security/concurrency test independently established:

- Retained prerequisites and complete migrations 015–058 apply with original pins/guards.
- Genuine public v2 candidate/financial journals feed competing signing and submission
  claims. Actual blocking is witnessed; exactly one `invoked:true` and one
  `claimed:true` win, and losers retain the winner's receipts.
- Opposite-lane creation rejects with `23505 / refund_lane_fence_conflict`.
- Unauthorized signing and service initial-issuance mutation reject with
  `42501 / unauthorized_admin_wallet`.
- A submission claimant waiting behind committed revocation rejects; reenrollment
  never regrants signing/submission. SHA256 public-journal snapshots remain unchanged
  after rejected operations. Owned PostgreSQL PID189757 was stopped and confirmed gone.

## Commands and source binding

Original verifier scratch was `/tmp/gphNdCyH/galUvwR2/dv-ba4nkntc` (`S`),
with `C=$S/candidate` and `R=$C/.tooling/d1-backend`.
All probes used a clean environment with explicit PATH, scratch HOME/TMPDIR,
NODE_COMPILE_CACHE, DENO_DIR, D1_TOOL_ROOT and update-notifier suppression.

| Command following the clean environment | Exit | Result |
|---|---:|---|
| `$S/deno test --config $C/supabase/deno.json --cached-only --frozen --allow-env --deny-net $C/supabase/tests/unit/refund-automatic-independent-probe.test.ts` | 0 | 5 passed |
| `$S/node --test --test-concurrency=1 $C/supabase/tests/integration/automatic-refund-independent-probe.test.cjs`, with `D1_CURRENT_ADMISSIONS=1` | 0 | 1 passed; 23.3 seconds; empty stderr |
| From `$C/supabase`: `$S/deno test --no-run --cached-only --frozen --deny-net functions/d1-custody/index.ts functions/d1-custody/refund-automatic-page.ts functions/d1-custody/refund-http.ts functions/d1-custody/remainder-http.ts` | 0 | Four Check notices; zero runtime tests |

142 public input files matched committed candidate bytes before copying and stayed
unchanged in original and scratch. 3,675 original runtime/cache files, Git HEAD
and original status were unchanged. No foreign untracked source was adopted.
The smaller complete public payload tested current behavior, not Git publication,
index semantics or a new Git baseline. The valid writer manual differential was
reused as evidence; no mandatory Git-baseline preparation was bypassed.

## Requirement verdicts

The verifier read the entire canonical feature document, including its Log.

| Specs | Verdict for this backend unit |
|---|---|
| S1 | Met locally: issued tick-only settlement, immutable deadline, positive selection; retained native/remainder evidence reused. |
| S2, S3, S4 | Out of scope: mobile navigation/listings and exclusive-owner web integration. |
| S5 | Met locally: genuine engines; valid four-paired-journey manual differential reused. |
| S6 | Met for isolation: public candidate-bound payload, no baseline-tree mutation. |
| S7 | Met locally: HTTP admission, scoped SQL authority/revocation/contention; server-only signer inspected and compiled. |
| S8–S10 | Out of scope: historical preparation/download/correction work. Existing tools reused only. |
| S11 | Met locally: SDK/history/credit joins, SQL memberships and independent late-membership drift rejection. |
| S12–S13 | Out of scope: historical targeted verification and web/vector coordination. |
| S14 | Overall backend/web/app completion is outside this backend-unit verdict. |
| S15 | Historical execution restriction superseded locally by S20. |
| S16–S19 | Historical source-only continuation, integration/reassignment and inactivity decisions; outside this functional verdict. |
| S20 | Met: isolated tests and graph compilation, no remote effects. |
| S21 | Met locally: independent issued tick-only recovery complements native-lane coverage. |
| S22 | Met locally: genuine issued settlement and independent outcome-membership drift rejection; manual differential reused. |

## Durable probe transfer

The verifier initially returned only scratch paths. Parent reads returned ENOENT
for both files after child completion. Follow-up `mwjkqywd-1e-ifxr` returned the
exact original creation-command contents, with **zero commands or new checks**.
The parent adopted those contents and verified both original SHA256 hashes exactly:

- `supabase/tests/unit/refund-automatic-independent-probe.test.ts`:
  `270db47500d43c74c866f39abce0ca3b072c3a934480288d93fefc9532c22f44`
- `supabase/tests/integration/automatic-refund-independent-probe.test.cjs`:
  `135b62db277aea6ea4630764f3443bdcfb7b42f3fafa2bdeae8af6ccfec3c26a`

Original temporary stdout/stderr receipts must not be presented as still available:
parent file reads established the returned probe paths were gone. The observed
verifier result and exact hash-matched probes are retained here. This retrieval
was not another verification attempt or a reset of correction limits.

## Parent final seam

Job49 exited **0** after 5m26s: **139 TypeScript tests and 27 PostgreSQL tests
passed, zero failed**. Both commands include the exact adopted independent probes.
SQL stderr was empty; TypeScript stderr contained successful Check notices.
All 157 recorded public inputs were byte-preserved. The source/migration diff
against independently verified candidate02d6268 remains empty.

Retained local receipts:
`.tooling/d1-backend/tmp/automatic-final-seam-33z0hapq/`
contains per-command argv/environment, stdout, stderr and exit files, `before.json`,
`result.json` and `cleanup-readback.json`.

The final cleanup readback observed no PostgreSQL processes and no postmaster PID
files under the owned tool temporary directory. The logged fence fixture's stop
returned0 and its data directory was absent. Two metadata-parser failures are
retained: plain JSON parsing skipped TAP-escaped diagnostics; the first correction
also attempted irrelevant multiline psql diagnostics. The scoped initdb/pg_ctl
readback then exited0. No database/test command was rerun for this readback.

## Limits and retained failures

Writer S21 retained behavioral RED57/5, then60/2 and regression130/2; S22 fixed the
remaining issued-settlement defect and passed64/134 plus types and manual differential.
Earlier fixture/type preparation failures and redundant historical evidence reruns
remain in the runtime/SQL guides. They are not retrospectively marked passing.
Native exact-unit assessments were not-due/unknown/unconsumed, not native approval.

Issued-v2 end-to-end variant coverage, live provider/configuration behavior,
publication/deployment, mobile/web integration and financial acceptance remain outside
this verdict. SQL opaque fixture bytes are not cryptographic evidence; the separate
SDK probes provide runtime cryptographic checks. Historical toolchain/source-isolation
debts #48/#56 and the separately reserved human-run acceptance #31 are not closed here.
