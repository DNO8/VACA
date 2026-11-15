# Independent evidence: inert refund-service scope boundary

**T2b prerequisite only.** This does not establish production service admission, automatic evidence ingestion, financial execution or deployment readiness.
Independent verifier: `mwi479f9-t-dc7r`; baseline `678cfe4a25181e97cb67a0e7487a03b5660687f9`; candidate `b8854ba909187d5b54d7f0fdafefb8d99ad69def` (three additive files, 254 lines).

## Observed results

| Check | Observed result |
| --- | --- |
| Parent RED, job30 | Exit1; 0 pass / 9 fail. New checker/table absent; database setup and teardown succeeded. |
| Parent GREEN, job31 | Exit0; 9 pass / 0 fail / 0 skip; 18.623s, empty stderr, inputs preserved, PID271194 gone, fixture removed. |
| Independent PostgreSQL17.7 probes | Exit0; 21 pass / 0 fail; empty outer stderr; PID274858 gone. |
| Adopted regressions, parent job32 | Exit0; 11 pass / 0 fail / 0 skip; 24.978s, empty stderr, input hashes preserved, PID280136 gone, fixture removed. |
| Native exact source assessment | Medium, under-budget, review not due; security-item2 escalation required the independent verifier above. Unknown/unconsumed is not approval. |

S7 and S11 were met for the inert prerequisite only. S6 isolation was respected; existing manual discovery compatibility was checked. Other feature requirements, including actual ingestion and execution, are outside this unit's verdict.

## Independent coverage

- Exact actor/namespace/pool isolation, malformed keys and inert mismatched provisioning.
- Administrator membership alone does not confer service membership.
- Application roles cannot delete registry rows or call the private checker, including `service_role` with BYPASSRLS.
- Registry enrollment alone cannot access the unchanged production discovery reader.
- Ambient search path and spoof schema/functions cannot bypass the qualified private assertion.
- Committed deletion denies subsequent admission; exact reinsertion restores it.
- An actual pool update held the lock while an assertion waited; after the changed binding committed, the assertion denied access.
- Existing manual-reader output and original public-function catalog rows remained identical across migration.
- Every synchronous acceptance/rejection preserved logical public-table contents and the public-function catalog snapshot.

565 recorded synchronous launcher invocations: 549 exit0 and 16 expected exit1. Two concurrent invocations exited0 and expected1. Authorization failures asserted exact exit1, `SET\n`, and `ERROR:  unauthorized_admin_wallet\n`; direct ACL errors matched exact table/function messages. These counts are verifier-reported evidence, not parent re-execution or a retained raw receipt archive.

## Provenance and boundaries

[Exact executed probe](d1-refund-service-scope-independent-probe.py), SHA256 `946433902a6037501eda54fa235ed4889a6291a7ceab57b21bda0b0202bc682c`, was returned inline by the verifier. It requires its own isolated source/runtime root; **do not run it from the repository or against Supabase**. It reads no Git history and is not an automatically collected suite test.

The verifier created only `/tmp/gpZ73JRj/galZzMve/tmp.SrIEUTXrKD`, established runtime symlink closure and capacity, then copied 1,582 runtime files / 85,565,260 bytes on its first preparation attempt. No install/network/setup retry occurred. Scratch persistence is not promised. The probe ran with a clean environment, explicit scratch HOME/TMPDIR/cache and NODE, using the copied project launcher and real PostgreSQL17.7.

All eight selected source/launcher inputs stayed unchanged. Key candidate pins:

| File | SHA256 |
| --- | --- |
| `049_d1_refund_service_scope.sql` | `e330c390a2b162a370df2698117aa871187c82f623b1e52cfe9e80ba02fd25de` |
| Original 183-line fixture at b8854ba | `6170261d4750ed59849806d32effea39bf4348196e86fc6d45d9797d6b723149` |
| Scope contract guide | `d52faa96d1a266156b6263cedc6b8c1852ad1c80a8d082d1d295685431a1bc2b` |

The independent result covers logical SQL snapshots, not physical database equality or every system catalog. No whole-project build/typecheck ran; SQL creation and execution did. Full-schema compatibility and trusted host identity binding remain separate prerequisites. No reproduced blocker was reported.

Two suggested JavaScript regressions (administrator-not-implicit and pool-change-during-wait) were initially unexecuted translations. Parent adoption retains all original cases and uses the existing six-second simulated-work interval for the pool race. The expanded fixture passed in job32 as recorded above; migration and guide bytes remain unchanged. The archived Python probe's exact returned SHA was checked before that run; it was not re-executed. Publication is tracked in [the feature document](../tasks/d1-automatic-refunds.md).
