# Existing independent adjudication
Task: `mw5xdnlc-m-23er`. The following is its final output verbatim.

## ADMIT — scoped T1 only

Independent **read-only source and parent-runtime-evidence adjudication** of optional initial-issuance status at HEAD/baseline `2726872d37f1fd474aa0b245a661ee1fdb3a951d`.

**No in-scope source blocker or unproven L4 example found.** This is not whole-D1 acceptance, production activation, funds authority, approval, or native-review authority.

### Provenance and candidate SHA-256

All reads remained under `/home/danilo/projects/vaca-d1-t5b-proof`. Independently calculated live hashes match the parent GREEN and differential maps:

| Candidate path | SHA-256 |
|---|---|
| `supabase/functions/d1-custody/issuance-command.ts` | `dd3847dec684af7de8649a3ddb55337db49c2efbcfef68c53deadaf66fe32a69` |
| `supabase/functions/d1-custody/handler.ts` | `eb2c373e038c82626f71cd979718b2803c1a54fb42acb7fa0867b32fdc5b1ca1` |
| `supabase/functions/d1-custody/issuance-status-http.ts` | `542fa33b6293cb5066db94f71a88dd79e467f84118b5027847ca7c1b2e680497` |
| `supabase/tests/unit/issuance-status-http.test.ts` | `e2c935ddd4786f0bdb485f3d7cfd351c85cde1e1c2c968ded265767b199164ea` |
| `supabase/docs/d1-issuance-status.md` | `158ca19ca80e2b809dc55ca79e5e2bd1e67148c96ec792736b46a6c1b7d76383` |

Read the **whole feature document, S1–S5 and Logs L1–L9**, including the verbatim request.

### Parent executions inspected—not executed by this adjudicator

Inspected raw invocation/result/stdout/stderr and programmatically compared **every entry** of all before/after maps.

- **RED** `supabase/.temp/d1-issuance-status-red-x8y3azke`:
  actual exit **1**, `2.184369812s`, no timeout; **1 pass / 5 fail**. Failures are executable assertions observing status **404** instead of desired responses—not compilation failure. All 84 mapped inputs stable.
- **GREEN** `supabase/.temp/d1-issuance-status-green-ywem42si`:
  actual exit **0**, `12.459183149s`, no timeout; **55 pass / 0 fail**, eight public test entrypoints. Stderr contains the eight Deno `Check` entries. All 86 mapped inputs stable and match live files. New test hash is identical to RED.
- **Differential** `supabase/.temp/d1-issuance-status-differential-1njc759a`:
  parent aggregate exit **0**, `0.763621090s`; base/current exits **0/0**, `0.276454154/0.282470533s`, no timeout. Same probe bytes; exact stdout/stderr/exit equality.
  - Seven observations: prepare/issue/reconcile rejection, config, unmounted status, issue/reconcile proof rejection.
  - RPC/signer/source/fetch counters all **zero**.
  - Both stdout files: 843 bytes, SHA-256 `51f99ff882b9094977513d4a867d74fda8ea0bd5b78cd0b7f7d33d8e753cffd2`; stderr files empty.
  - Live 86 inputs and base/current copy maps unchanged. Independently compared **83 baseline mapped files** with `git show`; all comparisons matched, exits **0**.
  - Retained baseline additive-path `git show` failures are actual exits **128**, for status guide, module and test. These are expected absence, **not successful commands**.

Captured argv use the existing Node launcher with `deno test --config … --allow-env` for RED/GREEN and `deno run --config … --allow-env …/status-differential.ts` for differential; **no `--allow-net`**. Invocation records preserve 80-second budgets and five-second kill grace; differential records remaining execution budgets.

### Source and meaningful coverage

Paths below are relative to the authorized root.

- Optional route: `supabase/functions/d1-custody/handler.ts:106`; unchanged runtime forwards base configuration without lifecycle at `runtime.ts:18`.
- Action-specific proof shares the unchanged canonicalization/body validation implementation; diff adds only the status verifier and action union.
- `issuance-status-http.ts:16–35`: descriptor-first bounded capture rejects accessors before reading their values.
- `:57–69`: current-admin-bound initial lookup; exact null-data database denial handling; authenticated absence returns only `outcome_not_recorded/unverified`, then stops.
- `:70–89`: nonnull saved outcome uses cached lookup and request/admin-bound read allowlist. Unsupported reads/writes are rejected before underlying client calls. Existing SDK journal validation remains responsible for historical envelope/economic consistency.
- `:90–101`: selected historical DTO only; no XDR/private diagnostics or current availability. Public proof errors remain exact; other failures sanitize to `issuance_status_unavailable`; mounted responses use no-store.

Coverage is substantive, not just test count:

- `issuance-status-http.test.ts:87–100` compares serialized ownership/history/credit/records/persisted/signing/attempt/outcome state before/after, counters, exact response text/headers, RPC allowlist and bound parameters.
- `:109–120`: native/issued success, included failure, and absent outcome with exactly one authorized read.
- `:121–135`: invalid/stale/wrong-scope/cross-action proof before RPC; genuine database denial versus thrown impersonation.
- `:137–157`: contradictory scope/CB/envelope/economics, missing/extra fields, getters, cycles, oversized and erroneous replies; getter counters remain zero.
- `:159–171`: optional mounting and sibling behavior.
- Existing command boundary tests, runtime and issue/outcome/reconciliation tests also passed in the parent GREEN execution.

**Static import closure captured:** 32 local files reachable from the new public test; all covered by the GREEN input map, no unresolved local imports. External import identifiers are only `@stellar/stellar-sdk` and `node:buffer`; external toolchain/package files were not inspected. The closure includes the unchanged submission/signed/unsigned/coordinator/financial/history modules, so transitive imports were not mistaken for a fresh execution dependency.

### Verdict per spec

| Item | Scoped verdict |
|---|---|
| **S1** | **Met for T1’s additive status seam.** Optional authenticated historical lookup is evidenced. “Completar el D1” globally remains outside this unit. |
| **S2** | **Met.** Absence is explicitly unverified; no submission/history-save fallback, retry, refund or ownership release. State/counter assertions and restricted adapter support this. |
| **S3** | **Met for affected interactions.** No private signer dependency; original historical deadline is projected, not refreshed. Actual signing/lifecycle acceptance is out of scope. |
| **S4** | **Met as non-interference only.** No refund/disposition authority or mutation introduced. Implementing donor refunds is outside T1. |
| **S5** | **Met as non-interference only.** No financial accounting, fee-source or historical-fund mutation. Separate operating-fund execution acceptance is outside T1. |

### Read-only command accounting and limitations

Executed only `read` and bounded inspection commands: `pwd`, `git status --short`, `git rev-parse HEAD`, `git diff --stat`, scoped `git diff`, `git diff --name-only`, `git ls-files`, `git check-ignore -v`, bounded `find`, `sha256sum`, and read/hash/map/import-graph Python scripts including baseline `git show` comparisons. **All adjudicator shell calls exited 0**; `git check-ignore` specifically exited **0** and identified `supabase/.gitignore:2:*`.

The new guide is ignored and therefore absent from ordinary untracked status: parent must preserve it explicitly when committing. Candidate authored scope totals approximately **306 added lines**, below the 400-line target. No unrelated tracked changes observed.

No adjudicator tests, builds, typechecks, probes, network, PostgreSQL, chmod, snapshots, repository writes or Git mutations. **No scratch directories created.** Existing durable tests are adequate for the selected evidence route; no new regression test is proposed.

Evidence establishes mapped-input stability and fake-state nonmutation—not filesystem immutability, external toolchain identity, live database enforcement, consensus, production readiness or full-suite execution beyond the eight captured entries. No base-only/unrelated advisory is promoted to a blocker.
