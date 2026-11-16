# Donor issuance prefix: scoped independent evidence

**T4e2b / S4, S14: scoped PASS across separate executions, not a new full-suite pass.** The unchanged private prefix validator has independent evidence for intent → reservation → unsigned transaction consistency. This report adopts the completed [107-line probe](../../supabase/tests/unit/donor-issuance-prefix-independent-probe.test.ts) byte-for-byte; adoption is structural/hash verification, not new runtime proof. No production correction was made.

## Candidate and adoption identity

- Source HEAD: `7f06216aa90f27ebac3a28019ec1d3430a5e329f` (local).
- Base: `36f0a5ae5653f1bf794f3422cd5b88c029e97a89`.
- Source range: four new files, 277 added lines: `supabase/functions/d1-custody/donor-issuance-prefix.ts`, `supabase/tests/fixtures/donor-issuance.ts`, `supabase/tests/unit/donor-issuance-prefix.test.ts`, and `supabase/docs/d1-donor-issuance-prefix.md`.
- Parent source packaging job 7 reported exit 0, 13 protected paths preserved and an empty index.
- Read-only adoption source: `/var/tmp/vaca-d1-verify/ip-wg609feq/work/supabase/tests/unit/donor-issuance-prefix-independent-probe.test.ts`.
- Adopted SHA-256: `b3e8eec66eef1db669b84b40bfde876a5b6e68b0b2f6c94f68b656c020b84095`.

## Execution record (attributed parent/verifier evidence)

| Execution | Observed result and limits |
| --- | --- |
| Parent RED → GREEN | 40 PASS / 11 FAIL → 109 PASS (51 prefix + 58 unchanged allocation). Subsequent strict getter-identity strengthening: targeted 1 PASS / 50 filtered. |
| Original verifier `mwio74x9-a-w9lh`, initial | Typecheck TS2339 on `xdr.SequenceNumber`; exit 1, zero tests. |
| Original verifier, one test-only correction | Replaced the unavailable type with `xdr.Int64`; exit 1, 5 PASS / 1 FAIL, 762 ms. The SDK group's explicit no-op assertion failed because `maxTime = closedAt + 299` was already valid. This was a probe defect, not a source finding. |
| Replacement `mwj50xep-1-nvot` | Scoped PASS for S4/S14. Used 1 of the newly authorized 2 test-only corrections: only `maxTime +299` → `+300`. Ran only `independent: SDK body mutations`: exit 0, 1 PASS / 5 filtered, 613 ms; stderr contained only the Check notice. All assertions, including the no-op guard, remained intact. |

The original run observed **77 hash-preserving exact 503 rejections**, including four native SDK mutations before failure; three getter rejections were checked separately. The replacement observed **23 exact 503 hash-preserving rejections**: nine native SDK, nine issued SDK, three receipt-field and two trailing-XDR mutations. These counts overlap; do not sum them as distinct cases. Five previously passing groups plus the targeted passing SDK group cover all six groups **across executions**, not in a fresh full-suite run.

The five original passing groups cover native/issued stages 0–3 after expiry; sequence/fee boundaries; 0/100/101 allocations; coherent nested, row and scope mutations; lossless JSON; inert getters; frozen/detached results; and retained but unvalidated later descendants. Rejections assert the exact public error `503 / donor_payment_unavailable / donor_payment_unavailable`, unchanged fixture hashes and payment counters where applicable. Getter cases separately assert zero invocation and preserved descriptors. Read-only inspection also confirmed that migration 033 historical request reservations are independent of the active owner.

## Continuation and integrity

The original cycle stopped because the newly discovered no-op defect was outside its prior correction rule. The human approved a bounded continuation, but routing rejected `subagent_continue` before execution because the session home cwd was not a Git repository. No continuation ran or consumed budget. [Task history L104–L106](../tasks/d1-automatic-refunds.md#log) records the subsequent explicit replacement authorization; no passing group was replayed.

The replacement reported preservation of 2,243 original input hashes (44 public + 2,199 runtime), all 44 isolated public copies, all four source pins, Deno, and fresh Git status/HEAD. It performed no new setup, network access, installation, SQL, provider calls, parent writes or cleanup. Retained scratch is `/var/tmp/vaca-d1-verify/ip-wg609feq`, including `stdout-sdk-replacement`, `stderr-sdk-replacement`, `probe-before-sdk-correction.ts` and earlier receipts. Those runtime receipts are attributed evidence, not independently replayed by this adoption.

Adoption checks are limited to exact probe SHA/bytes/line count, source pins against the candidate commit, the four-file/277-line range, structural readback and Git whitespace/status checks. The original scratch probe remains unchanged. No parent replay was performed, honoring the instruction not to repeat passing groups.

## Review and remaining limits

Security item 2 was escalated to high risk. Native assessment reported medium / 277 lines, `reviewDue=false`, under budget, unknown/unconsumed; none of these is review approval.

This is a **private source-prefix consistency boundary only**. It does not prove final issuance status, current claimable-balance availability, refund eligibility, settlement, original clock/provider authenticity, host authentication/wiring, deployment, funds movement or full D1 readiness. Later raw descendants are retained, not certified. S4/S14 are covered only within this bounded unit; web/app integration and the remaining automatic-refund obligations stay open. Tracker updates, review disposition and any commit remain parent-owned.
