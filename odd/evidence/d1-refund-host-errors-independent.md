# D1 refund host-error verification

## Scoped outcome and candidate

T17/S18 has a scoped independent PASS with no reported blocker: host503 `custody_unavailable` and `initial_submission_unavailable` retain diagnostic identity without financial-state admission, automatic retry or release of the durable hold. This is offline source verification, not live acceptance.

- Base: `7ded3040c699f9ae3e113e25b378db0342c8b6f6`.
- Verified local source candidate: `7a22c9c8f19e8e0cef9c76478bda835f9f2e7569`; publication was not performed in this unit.
- Candidate scope: the three HTTP503 allowlists, the original 32 host-error tests and two guides. The adoption below adds no production changes and does not modify those 32 tests.

## Execution evidence

| Check | Executor / evidence | Observed result |
|---|---|---|
| Focused RED before production changes | Parent job1 | Exit 1, 6 seconds; 32 tests: 14 passed, 18 failed on host-error identity. No compile/setup failure. |
| Focused GREEN | Parent; `supabase/.temp/d1-host-errors-green-qohkiq3v` | 32/32 passed. |
| Full refund suite | Parent; same retained evidence directory | 100/100 passed. |
| Four-file targeted analysis | Parent; same retained evidence directory | Exit 0; zero errors/warnings, 17 INFO diagnostics: 16 existing and one new-test trailing comma. Not a zero-diagnostic result. |
| Independent standalone probes | Verifier `mwgzdnta-5-johf`; `/tmp/d1hv.zdSja5/probe.stdout`, `probe.stderr`, `probe.exit` | 2/2 passed, exit 0, empty stderr. The adoption writer read these result files; it did not rerun Flutter. |
| Adopted probe execution in the original worktree | Parent; `supabase/.temp/d1-host-errors-adoption-hwkmmyk6` | Exit 0; 2/2 passed in 4.167 seconds, empty stderr. Exact probe hash unchanged. |
| Adopted probe analysis | Parent; same adoption evidence directory | Exit 0 in 3.047 seconds; zero errors/warnings, three trailing-comma INFO diagnostics. Not a zero-diagnostic result. |

The parent supplied the RED/GREEN/analysis results. Independent probe stdout explicitly records both test names and `All tests passed!`. **The 100-test suite and two standalone independent probes are separate executions, not an observed 102-test suite run.**

## Independent setup and coverage

Initial verifier `mwgzasgh-4-vh9q` stopped before copying because the parent public payload omitted declared assets. This was a setup omission, not a failing product assertion. The sole corrected setup added 26 tracked assets; verifier `mwgzdnta-5-johf` then completed the two probes.

The parent/verifier handoff records a snapshot of 166 committed files totaling 7,644,939 bytes, with original/copy hashes for all 166 files, the six candidate files and ten unrelated paths unchanged. It used 215 existing cached dependency roots through public metadata, with no installs, Git metadata/history or private-file copying. `/tmp/d1hv.zdSja5/inputs.json` retains the source manifest. These preparation/integrity totals are attributed to that handoff, not a new adoption-time rehash of the full snapshot.

The reviewer-authored probes exercise:

1. **42 HTTP/cache/preflight combinations:** two host codes × seven response variants × v1, full v2 and passive v2. Only HTTP503 with `no-store` is recognized (including case-insensitive `private, NO-STORE`). Missing/no-cache headers and HTTP502/504/409/202 remain unverified. Each case checks one status request, no storage writes, unchanged synthetic storage hash and no admitted settlement.
2. **Cross-lane hold preservation:** for each host code, a failed v1 refund retains the raw synthetic storage hash and write count. A later explicit v2 refund intent observes status only, retains the v1 hold and never resubmits a refund.

## Exact probe adoption

The returned artifact was copied byte-for-byte, without retyping, formatting or refactoring, to [refund_host_boundary_independent_test.dart](../../vaca_app/test/refund_host_boundary_independent_test.dart).

- Source: `/tmp/d1hv.zdSja5/work/vaca_app/test/refund_host_boundary_independent_test.dart`.
- Size: **6,234 bytes**.
- SHA-256: `e0577feefed27f393e891a9f72d3d43b732deb965212852f361818bb4601da0c`.
- Adoption-time comparison: source and destination bytes, size and SHA-256 matched; exit 0.
- Parent post-adoption execution and analysis completed with the observed results above; the exact adopted hash remained unchanged. The verifier scratch `/tmp/d1hv.zdSja5` is retained as evidence, not required for running the durable regression tests.

## Review and limits

The parent reports the committed-range native assessment as medium risk, 325 lines across six paths, `reviewDue=false` / under budget. That is not native approval. The item-2 response-admission escalation required independent verification, now satisfied for this bounded S18 change; shared-transport behavior remains within the scoped evidence above.

No backend/provider/database proof, live endpoint or financial execution, device action, rebuilt APK, deployment or whole-D1 acceptance is established. Historical #48/#56 debts are not closed or retried by this unit. Existing ledger/accounting, admission guards, signing, queues and durable hold logic remain unchanged.
