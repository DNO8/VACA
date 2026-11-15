# Scoped discovery-service admission: independent evidence

**Verdict:** verifier `mwi6blme-v-ns4m` found no reproduced blocker for T2c's SQL observation-admission boundary. S5/S7/S11 met within this unit; S6 isolation respected. This is not host authentication, external SDK/ledger validation, deployed-schema compatibility, activation or financial acceptance.

## Immutable candidate

- Baseline: `4a028ab9aee28941aeeab383f34da026a3c0e306`.
- Source candidate: `8cb731f82c584ad759e7dac1872d4abc6f0b38cd`; exactly three paths, 274 additions / 6 deletions.
- [Migration050](../../supabase/migrations/050_d1_discovery_service_admission.sql): SHA-256 `5f7fc1ad1033044cbc354ae2721d715145c8eb73fb489d93c3643128e2f4b20a`.
- Original candidate [fixture](../../supabase/tests/integration/discovery-service-admission.test.cjs): SHA-256 `61602bdf5df37da1c30589cbff0e05fd2139d6aa299ffb881bf7cca5d23910d6`. Subsequent adopted regressions change this fixture, not migration050.
- [Scope guide](../../supabase/docs/d1-refund-service-scope.md): SHA-256 `d0d8eca5fb60c0eb5c9db96ffc4ff1e12f344f3f979d8781a6bcba3e2b5af345`.

## Observed results and limits

Parent corrected RED: exit1, 2 pass / 7 fail; intended missing service admission. Parent GREEN job36: exit0, 9 pass / 0 fail, empty stderr, PID291119 gone. Twelve identical administrator queries compared exit/stdout/stderr before/after050 on rollback-isolated state. Public counters/state, scoped nonempty discovery/history writes, immutable replay/conflicts, exclusions, ACL/OID preservation and concurrent revocation were exercised.

Independent execution: **28 passing checks**, exit0, empty outer stderr. The verifier designed its own probes and did not rerun the parent or historical suites:

- Restored the actual original022 definition captured before048;050 rejected the missing independent guard atomically with exact `P0001 / unexpected_d1_discovery_service_definition`. Data/catalog stayed unchanged; service reader still denied.
- Four same-input baseline/candidate comparisons: two successful batches covering nonempty writes, pagination and replay; two exact pagination-boundary errors. Identical initial state restored by rollback.
- Scoped discovery with two records and failed-transaction history with two operation types; original receipts preserved across service/admin replay.
- All eight issuance/credit writers denied despite admitted shared-reader access. Administrator revocation did not become implicit service membership.
- Actual public reader blocked behind membership deletion, then denied. Actual reader blocked behind pool rebinding, then denied the changed authoritative scope.
- Logical all-public-table contents preserved after synchronous rejections; final counters/receipts restored after concurrency probes. Public-function catalog differed only in the intended reader body, including unchanged OIDs and ACLs.

The verifier reported 170 launcher receipts: 122 exit0 and 48 expected exit1, including four concurrent commands. PostgreSQL17.7 PID297441 stopped and ESRCH verified; all26 copied source/launcher pins and candidate fixture/guide remained unchanged. One unexecuted scratch `PLACEHOLDER` authoring mistake was corrected before the sole probe execution; no failing database probe was retried.

## Retained provenance

The exact executed [Python probe](d1-discovery-service-admission-independent-probe.py) was returned inline. Parent retained it and independently matched SHA-256 `8422bf469087df5a18903f9aa1e260402b5a3fd938369714c1d60aa7a6e428e6` and parsed its AST; **the parent did not re-execute that sweep**.

Verifier scratch was unavailable at the parent's one retention attempt. Raw170 receipts and pins were therefore **not archived or reconstructed**. Reported scratch-only hashes: receipts `ad012c6fd65ba081d7f159acf27f3d2a513b015eed94ac6d61f4f47e8fac7037`; pins `457d0f41a450d57f52948c829b1918f8e1ea338e4e814f370c5fc8cf09999070`. These hashes do not substitute for unavailable bytes.

The archived probe expects its own freshly prepared minimal scratch root, `pins.json`, retained schema and local PostgreSQL runtime. Do not run it from this evidence directory or against Supabase. Its NON-SDK bytes establish storage behavior only. Logical table preservation is not physical database equality; public-function checks are not an audit of every catalog.

## Parent adoption and delivery

The parent adopted actual missing022-guard rejection, both real-reader waiting orderings and all-eight-writer exclusion into the focused fixture. First adoption job38 exited1: 8 pass / 2 fail because the newly added original022 filename omitted `_observations`; concurrency checks passed, but the missing-guard case did not run. That preparation failure is retained, not GREEN. Only that filename was corrected. Expanded fixture job39 then exited0 in47.058s: **10 pass / 0 fail / 0 skip**, empty stderr, no timeout, inputs preserved, PID305204 gone and fixture removed. This includes the actual missing022 guard, both new wait orderings and all eight writer denials; no migration or guard-source change. See [the feature task](../tasks/d1-automatic-refunds.md).

Native source assessment: medium / under-budget / review not due; explicit security escalation required the completed independent verifier. Unknown/unconsumed is **not native approval**. Source publication and evidence-candidate disposition are separate from this report. No migration was applied remotely and no service principal or scheduler was provisioned.
