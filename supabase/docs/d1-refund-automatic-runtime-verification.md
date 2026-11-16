# Automatic refund runtime: offline evidence and remaining gaps

**T2ak / S21 is partial. The one permitted correction is consumed.** Baseline
`86d3d973b520fb660385aba07840e2690f4de35d`. Automatic tick-only catch-up now passes
for both native lanes. Issued full-gross transactions sign, submit, reach real
SDK inclusion and persist successful038 outcomes, but remain `refund_observed`
instead of `settled`. The two failing tests remain enabled; no passing verdict
or independent/live financial acceptance is claimed.

## T2ak coverage and source correction

| Spec | Observed evidence | Remaining boundary |
|---|---|---|
| S1 | Both native lanes advance partial discovery then partial transaction history using only authenticated automatic ticks, reach persisted settlement and become read-only. | Issued full-gross settlement remains blocked. |
| S5 | All original56 focused cases pass. Issued successful/failed initial transactions have real manual/core signing, HTTP202, partial reconciliation503 and included-outcome HTTP200 parity. | Both issued settled-state assertions fail; their later settled/no-resend assertions are not reached. |
| S7 | Partial catch-up refuses foreign/mismatched fences, current018 denial and malformed coverage without provider/write/sign/send effects or journal changes. | Scripted RPC admission is not independent SQL permission proof. |
| S11 | Genuine019/024 state readers, bounded ingestion and actual038/047 producers handle catch-up; attempts/fences remain unchanged even at saved candidate expiry+1. Ambiguous save ends the tick without readback. | Issued settlement accounting still lacks sufficient recognized setup evidence. |
| S20 | Focused tests, relevant regressions and offline graph compilation executed with isolated environment and real network denied. | Failing checks block completion; independent verification remains parent-owned. |
| S21 | Both requested gaps were exercised; one reproduced page blocker corrected, no preparation failure or extra correction. | A second reproduced blocker remains outside the allowed source surface and exhausted allowance. |

`functions/d1-custody/refund-automatic-page.ts:300` now positively validates
incomplete019/024 coverage for an existing fenced candidate before requiring a
status DTO. A matching fence/candidate permits **only** the genuine reconciliation
action. Unknown coverage or a status error does not trigger retry/fallback.
The existing core still checks current018 admission. There is no execution after
reconciliation, second page per stream, renewed authority, fence release or new
sign/send. Manual cores and shared financial validators are unchanged, so the
conditional manual base-versus-candidate differential was not applicable and was
not run. Existing manual behavior tests remain passing.

The new HTTP tick tests expose only provider-side inclusion between ticks; they
never call `ingestPosted`, ingestion helpers, manual reconciliation, or write RPCs
to advance stored history. Three successive inclusion ticks assert exact200
bodies/no-store, bounded writes, cursor/coverage progress and immutable submission
journals; only the third settles. A further tick is read-only. Public core status
is read only after the ticks have settled, to check exact financial amounts.

## T2ak retained check outputs

All outputs are retained separately under the owned directory:
`.tooling/d1-backend/tmp/t2ak-issued-catchup-86d3d973/` (repository relative).
Each stem below has `.stdout`, `.stderr`, and `.exit`; read those files rather
than rerunning to recover output. The commands are exactly the three documented
Deno commands retained below, wrapped only in foreground stdout/stderr/exit
capture with shell noclobber. No launcher/configuration/dependency changes.

| Stem | Check | Exit | Observed result |
|---|---|---:|---|
| `focused-red` | Original focused command, before source edit | 1 | 57 passed / 5 failed (1m24s); all62 tests executed, no compilation error |
| `focused-after` | Same focused command, after the one correction | 1 | 60 passed / 2 failed (1m29s); both tick-only cases and ambiguous-resume case now pass |
| `regression` | Original relevant refund regression command | 1 | 130 passed / 2 failed (1m41s); same two issued settlement failures only |
| `compile` | Original four-entrypoint `test --no-run` command | 0 | Empty stdout; stderr has four `Check` lines; zero tests executed |

There are62 focused tests: configuration5, HTTP10, page18, selector10, v1
execution11, v2 execution8. Six cases were added in T2ak. No failure was hidden,
skipped, converted to an expected-success assertion or repaired with fixture
history omission. The first run was meaningful behavioral RED, not preparation
failure. The one correction changed only automatic page composition; the second
blocker remains. Prior preparation failures and redundant evidence reruns are
retained in the historical snapshot below and are not reset by S21.

## Remaining blocker and bounded handoff

Both issued cases in `tests/unit/refund-execution.test.ts:109` fail at line141:

```text
actual:   {"state":"refund_observed","unresolved":"unmatched_namespace_activity"}
expected: {"state":"settled","unresolved":null}
```

They already asserted actual generated-key signatures, correct USD/issuer/donor
and full10.0000000 payment, one POST, manual/core parity, parsed submitted-XDR
inclusion, and persisted successful038 donor-returned amount. They preserve the
successful pool ChangeTrust before donor income rather than inventing a trustline
with no history.

The remaining source seam is
`functions/d1-custody/refund-settlement-observation.ts:122`: settlement calls the
real encumbrance calculator with `operatingCredits: []`. Consequently creation
funding is considered protected income before ChangeTrust, and the exact setup
operation remains unmatched at lines139–142. This is not permission to ignore
unmatched activity, assume zeros, or substitute a settled DTO. This file was
**not** in the delegated allowed edit surfaces and was not edited.

Proposed continuation for explicit human authorization only: same scoped writer,
add exactly `supabase/functions/d1-custody/refund-settlement-observation.ts` to the
existing fixture/v1-test/runtime-guide surfaces, at most one correction of this
remaining reproduced accounting blocker, no unrelated changes. Reuse genuine
credit/history validators and their membership invariants; do not globally waive
setup operations or expand database privileges. Validate with the same three
commands and a temporary owned-scratch manual base/candidate differential if
shared behavior is changed. The parent must explicitly authorize that differential
command/scratch preparation. Current S21 allowance is exhausted; this proposal
is not permission to continue. Any further required source surface must be
reported, not silently added.

Self-review: production change is confined to automatic page scheduling. New
success assertions use real engines and SDK-derived posted envelopes, not fake
permits or settled DTOs; the independent expected issued-settlement assertion is
still red. RPC journals, digests and inclusion transport remain modeled external
ports, not a PostgreSQL or deployed-provider proof. Issued coverage targets the
previous full-gross gap; no issued-v2 end-to-end claim is made. All foreign
tracked/untracked changes and parent tracker edits were preserved. Retained
scratch contains reports only, for parent cleanup; no tests allocate filesystem
state. Prior fixture/document artifacts are now tracked in the parent commits.

## Historical T2aj snapshot — retained, not the current verdict

The following records the pre-S21 handoff and its original commands/results.
Its pending tick-only gap is superseded by the T2ak evidence above; its failures,
correction counts and redundant reruns remain historical facts.

**T2aj was partial, not operational acceptance.** On baseline
`2c6ba304c7823cc2435ed47f88d4233b5108688b`, the new public-interface coverage passes
56 focused tests and 126 refund regressions. Offline compilation also passes.
The bounded correction batch adds nine tests covering native full-gross execution,
both lanes' settled inclusion, partial provider pages, traversal and v1 fences.
The earlier issued-asset full execution gap remains; see the handoff below.
No production source, SQL, migration, dependency, tracker or host wiring changed.
Independent verification remains parent-owned.

### Historical review first

1. `tests/fixtures/automatic-refund.ts` models external RPC journals and provider
   transport, reusing `initial-financial-authorization.ts`. It does not replace
   imported observers, selectors, coordinators, signers or submission engines.
2. `tests/unit/refund-automatic-page.test.ts` includes the actual private HTTP →
   page → selector → remainder executor → SDK signing → one scripted POST path.
3. `tests/unit/refund-execution.test.ts` and
   `tests/unit/remainder-execution.test.ts` compare real signed-wallet HTTP and
   private execution results, including exact HTTP 202 financial DTOs and settled
   status. The v1 tests cover successful and failed original issuance.
4. Inclusion is built from the actually posted signed XDR using SDK success
   result XDR, then parsed and persisted through real discovery/history ingestion
   interfaces. Real executors derive and persist 038/047 outcomes; no settled DTO
   or verified command is substituted. Settlement tests ingest the provider pages
   before invoking reconciliation; they do not prove automatic tick-only catch-up.

All keys are deterministic generated fixture keys, never deployment keys. All
provider responses are scripted in memory; Deno denies real network access. No
actual environment configuration, credentials, server execution, deployment,
activation or real funds were used. Tests allocate no filesystem scratch.

### Historical public-interface coverage

| Spec | Observed coverage | Limitation |
|---|---|---|
| S1 | Both native lanes sign/send through the real page and executors. Full gross covers successful and failed original issuance; v2 acquires a genuine claim and current funding. Real included refunds settle both lanes. | New full financial journeys use native assets, not issued assets. |
| S5 | Genuine wallet signatures exercise both manual adapters. Exact 13-field status/error and financial execution/202 parity; both lanes expose real persisted settled status. 126 relevant regressions pass. | No new issued-asset full execution or settled journey. |
| S7 | Exact private route, method/Allow, query/fragment rejection, duplicate keys, body-size boundary, authentication before streamed-body reads and execution, strict lazy configuration, pool-matched signer, secret error sanitization. Invalid manual proof and actual RPC denial leave journals unchanged. | RPC admission here is a scripted external port, not evidence of actual SQL permissions/locks. |
| S11 | Real 019/024/032 validation, genuine039 acquisition/persistence, complete claim-set validation, funding, candidate, financial observations, signing and submission ownership, then 038/047 outcomes. Partial discovery/history pages stop further actions; existing v1 fence routes its exact candidate hash. | Not actual database replay/concurrency or deployed-provider proof. Partial-page tests prove bounded stops, not automatic eventual catch-up. |
| S20 | Foreground local deterministic tests and cached/frozen graph compilation, with retained preparation failures below. | Independent verification remains parent-owned; no operational acceptance. |

#### Historical counts by new test file

| File under `tests/unit/` | Tests |
|---|---:|
| `refund-automatic-configuration.test.ts` | 5 |
| `refund-automatic-http.test.ts` | 10 |
| `refund-automatic-page.test.ts` | 14 |
| `refund-lane-selection.test.ts` | 10 |
| `refund-execution.test.ts` | 9 |
| `remainder-execution.test.ts` | 8 |
| **Focused total** | **56** |

The v2 positive fixture has a native original gross of `10.0000000`, authentic
beneficiary claim of `1.0000000`, and an SDK payment of `9.0000000`. Its HTTP result
is pending/unverified, with no invented donor-returned or remaining-settlement
amount. Eight scripted GET calls acquire claim evidence; one scripted POST sends
the refund. A second tick does not load a signer or send again.
After actual submitted-XDR inclusion and 047 persistence, settlement reports
beneficiary `1.0000000`, donor `9.0000000`, remaining `0.0000000`. V1 signs/sends
once and, after 038 persistence, reports beneficiary `0.0000000`, donor
`10.0000000`, remaining `0.0000000`. Both settled manual status responses match
private-core results exactly and perform no new writes/signatures/submissions.

The page tests also cover empty-due-window continuation, batch bounds, saved
confirmation plus 300-second deadline, foreign fence, existing v2 hash mismatch,
one generic source page per stream, expired-candidate reconciliation without
execution/renewal/fallback, ambiguous019/024/032/039 acknowledgements, and no
readback after an ambiguous real v2 POST. Stored-state preservation is checked by
reading the fixture's RPC port; effect counters record external calls.
The correction batch additionally traverses two ordered originals, continues
past a held original, preserves the returned cursor and consumes an empty next
window. Its second original is deliberately held by a mismatched fence, not
fabricated as a second successful payment. A genuine existing v1 candidate/fence
routes without another write. Nonempty discovery and transaction pages stop
reconciliation after one save, leaving submission ownership unchanged.

### Exact validation commands (reused by T2ak; following results are historical)

All commands ran in the foreground. The tool reports combined stdout/stderr;
separate stream attribution is unavailable. Successful test output contains the
individual named `ok` cases and summary below; no failure diagnostics occurred
in the final runs. Compilation returned no output. No `deno check --cached-only`
command was used.

#### Focused

```sh
cd /home/danilo/projects/vaca-d1-t5b-proof/supabase && T=/home/danilo/projects/vaca-d1-t5b-proof/.tooling/d1-backend && env -i PATH=/usr/bin:/bin HOME="$T/home" TMPDIR="$T/tmp" DENO_DIR="$T/deno-cache" DENO_NO_UPDATE_CHECK=1 NO_UPDATE_NOTIFIER=1 "$T/deno-2.6.8/deno" test --cached-only --frozen --allow-env --deny-net tests/unit/refund-automatic*.test.ts tests/unit/refund-lane-selection.test.ts tests/unit/refund-execution.test.ts tests/unit/remainder-execution.test.ts
```

Final exit code **0**. ANSI-stripped summary:

```text
ok | 56 passed | 0 failed (1m9s)
```

#### Relevant refund regressions

```sh
cd /home/danilo/projects/vaca-d1-t5b-proof/supabase && T=/home/danilo/projects/vaca-d1-t5b-proof/.tooling/d1-backend && env -i PATH=/usr/bin:/bin HOME="$T/home" TMPDIR="$T/tmp" DENO_DIR="$T/deno-cache" DENO_NO_UPDATE_CHECK=1 NO_UPDATE_NOTIFIER=1 "$T/deno-2.6.8/deno" test --cached-only --frozen --allow-env --deny-net tests/unit/refund-*.test.ts tests/unit/recovery-refund-plan.test.ts tests/unit/remainder-execution.test.ts
```

Final exit code **0**. ANSI-stripped summary:

```text
ok | 126 passed | 0 failed (1m25s)
```

The foreign untracked `refund-claimable-independent-probe.test.ts` was run by the
authorized glob and was not edited. Other foreign tracked/untracked changes were
preserved, including the parallel writer's integration test.

#### Compilation only

```sh
cd /home/danilo/projects/vaca-d1-t5b-proof/supabase && T=/home/danilo/projects/vaca-d1-t5b-proof/.tooling/d1-backend && env -i PATH=/usr/bin:/bin HOME="$T/home" TMPDIR="$T/tmp" DENO_DIR="$T/deno-cache" DENO_NO_UPDATE_CHECK=1 NO_UPDATE_NOTIFIER=1 "$T/deno-2.6.8/deno" test --no-run --cached-only --frozen --deny-net functions/d1-custody/index.ts functions/d1-custody/refund-automatic-page.ts functions/d1-custody/refund-http.ts functions/d1-custody/remainder-http.ts
```

Exit code **0**, no output, four entrypoint graphs, **zero tests executed**.
Importing/running the server was not part of this check.

### Historical retained failures and test-first classification

This is coverage of already-working behavior, **not a fabricated RED/GREEN bug
fix**. No production defect was reproduced or corrected. Two test-preparation
corrections were made; neither establishes a behavioral RED:

1. Initial focused invocation: exit **1**, **zero tests executed**, four compiler
   diagnostics: TS2352 at fixture line151 (missing required `account` in the
   transaction-page source result); TS7053 at configuration test line33 (string
   index on inferred object); two TS2345 diagnostics at line44 (`Uint8Array`
   instead of SDK `Buffer`). Corrected the actual source-result shape and test
   types, without bypassing checking. Next run: **37 passed / 0 failed** (3s).
   First regression run: **107 passed / 0 failed** (15s).
2. Expanded claim-transport fixture: focused exit **1**, **zero tests executed**,
   three TS2339 diagnostics at fixture line213: `method`, `credentials`, and
   `redirect` were not common properties of the overloaded fetch-init union.
   Corrected with property-existence narrowing, not `--no-check`. Next run:
   **40 passed / 0 failed** (5s).

Earlier focused expansions passed **43/0** (9s), **46/0** (32s), and **47/0**
(33s); earlier regressions passed **117/0** (44s). Historical diagnostic line
numbers refer to the version at the failing invocation. No correction budget
was reset; there were two historical test-only preparation corrections and zero
production-source correction cycles.

The bounded continuation adds nine tests without a source fix or another
preparation correction. After context compaction obscured the earlier output
tails, the exact commands were rerun without code changes to retain directly
visible final summaries: **56/0** (1m9s), **126/0** (1m25s), and compilation exit
**0** with no output. These are evidence reruns, not a fresh correction budget.

### Historical remaining proof and handoff

- Native full-gross signing/submission and manual/core financial parity are now
  proved, including successful and failed original issuance. Issued-asset full
  financial execution remains unproved by these new tests. Existing regression
  tests cover issued-asset planning, candidate validation and arithmetic, not a
  complete issued-asset send/settlement journey.
- Both native lanes now prove submitted-XDR inclusion → real 038/047 persistence
  → settled DTO. ACK still does not count as settlement. Production ingestion
  explicitly advances partial pages before the positive reconciliation tests;
  repeated automatic ticks alone reaching a complete head are not demonstrated.
- Nonempty/partial provider-page holds, multi-original cursor traversal and
  positive existing full-gross fence routing are now covered. This is not proof
  of two different successful financial executions in one batch.
- Independently verify authorization/private keys (risk item2), unchanged manual
  contracts (item3), and permanent one-shot ownership (item4). SQL admission and
  concurrent ownership remain outside this fixture model and owned separately.

No additional batch or retry is authorized by this document. Parent disposition
is required for remaining proof: a narrowly scoped writer continuation could
extend the existing fixture and refund execution/page tests for issued-asset
financial execution, using the same three checks, but only with explicit new
human authorization and a stated correction limit. This handoff does not reset
the exhausted historical preparation budget, authorize deployment, or supply
an independent-review verdict.

Self-review found no production edits or helper substitutions. The fixture
models SQL-supplied opaque hashes; it does not verify PostgreSQL JSONB digest
semantics. Repository ignore rules hide new fixture/document files: the parent
must explicitly account for `tests/fixtures/automatic-refund.ts` and this document
when packaging. No staging or commit was performed by this writer.
