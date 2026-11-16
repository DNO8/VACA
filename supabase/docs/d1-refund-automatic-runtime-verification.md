# Automatic refund runtime: offline evidence and remaining gaps

**T2aj is partial, not operational acceptance.** On baseline
`2c6ba304c7823cc2435ed47f88d4233b5108688b`, the new public-interface coverage passes
56 focused tests and 126 refund regressions. Offline compilation also passes.
The bounded correction batch adds nine tests covering native full-gross execution,
both lanes' settled inclusion, partial provider pages, traversal and v1 fences.
The earlier issued-asset full execution gap remains; see the handoff below.
No production source, SQL, migration, dependency, tracker or host wiring changed.
Independent verification remains parent-owned.

## Review first

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

## Public-interface coverage

| Spec | Observed coverage | Limitation |
|---|---|---|
| S1 | Both native lanes sign/send through the real page and executors. Full gross covers successful and failed original issuance; v2 acquires a genuine claim and current funding. Real included refunds settle both lanes. | New full financial journeys use native assets, not issued assets. |
| S5 | Genuine wallet signatures exercise both manual adapters. Exact 13-field status/error and financial execution/202 parity; both lanes expose real persisted settled status. 126 relevant regressions pass. | No new issued-asset full execution or settled journey. |
| S7 | Exact private route, method/Allow, query/fragment rejection, duplicate keys, body-size boundary, authentication before streamed-body reads and execution, strict lazy configuration, pool-matched signer, secret error sanitization. Invalid manual proof and actual RPC denial leave journals unchanged. | RPC admission here is a scripted external port, not evidence of actual SQL permissions/locks. |
| S11 | Real 019/024/032 validation, genuine039 acquisition/persistence, complete claim-set validation, funding, candidate, financial observations, signing and submission ownership, then 038/047 outcomes. Partial discovery/history pages stop further actions; existing v1 fence routes its exact candidate hash. | Not actual database replay/concurrency or deployed-provider proof. Partial-page tests prove bounded stops, not automatic eventual catch-up. |
| S20 | Foreground local deterministic tests and cached/frozen graph compilation, with retained preparation failures below. | Independent verification remains parent-owned; no operational acceptance. |

### Counts by new test file

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

## Exact validation commands

All commands ran in the foreground. The tool reports combined stdout/stderr;
separate stream attribution is unavailable. Successful test output contains the
individual named `ok` cases and summary below; no failure diagnostics occurred
in the final runs. Compilation returned no output. No `deno check --cached-only`
command was used.

### Focused

```sh
cd /home/danilo/projects/vaca-d1-t5b-proof/supabase && T=/home/danilo/projects/vaca-d1-t5b-proof/.tooling/d1-backend && env -i PATH=/usr/bin:/bin HOME="$T/home" TMPDIR="$T/tmp" DENO_DIR="$T/deno-cache" DENO_NO_UPDATE_CHECK=1 NO_UPDATE_NOTIFIER=1 "$T/deno-2.6.8/deno" test --cached-only --frozen --allow-env --deny-net tests/unit/refund-automatic*.test.ts tests/unit/refund-lane-selection.test.ts tests/unit/refund-execution.test.ts tests/unit/remainder-execution.test.ts
```

Final exit code **0**. ANSI-stripped summary:

```text
ok | 56 passed | 0 failed (1m9s)
```

### Relevant refund regressions

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

### Compilation only

```sh
cd /home/danilo/projects/vaca-d1-t5b-proof/supabase && T=/home/danilo/projects/vaca-d1-t5b-proof/.tooling/d1-backend && env -i PATH=/usr/bin:/bin HOME="$T/home" TMPDIR="$T/tmp" DENO_DIR="$T/deno-cache" DENO_NO_UPDATE_CHECK=1 NO_UPDATE_NOTIFIER=1 "$T/deno-2.6.8/deno" test --no-run --cached-only --frozen --deny-net functions/d1-custody/index.ts functions/d1-custody/refund-automatic-page.ts functions/d1-custody/refund-http.ts functions/d1-custody/remainder-http.ts
```

Exit code **0**, no output, four entrypoint graphs, **zero tests executed**.
Importing/running the server was not part of this check.

## Retained failures and test-first classification

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

## Remaining proof and handoff

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
