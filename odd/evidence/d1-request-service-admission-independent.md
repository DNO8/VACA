# Request evidence admission: bounded independent verification

Candidate: `918866536e911ae5b6bd3e0339e4ae284138c997`.
Baseline: `b0128162e6787c9171ccee880df8e1a505179f02`.
Initial verifier: `mwi8c14x-x-8rvd` (partial). Human-authorized same-verifier continuation: `mwi8jj5k-y-hrnh` (targeted PASS). The initial failures below remain failures; the continuation resolves the remaining T2d proof gap, not overall automatic-refund readiness.

## Observed results

Parent job44 passed all 9 reported tests, exit0, empty stderr, no timeout. Inputs were preserved; owned PostgreSQL PID325761 was gone and its fixture removed. Job43 remains a failed run caused by a fixture calling a three-argument observation reader with two arguments. Only that fixture invocation was corrected; migration051 was unchanged.

Independent verification used selected committed inputs and an approximately87MiB isolated PostgreSQL17.7 runtime. It did not rerun parent or historical suites.

- First invocation: exit1, zero PostgreSQL tests, verifier-generated Python quoting error at probe.py:23. The verifier used its one permitted preparation correction.
- Second invocation: exit1 after 31 explicit passing assertions. At probe.py:77, a regex returned `None` while preparing the missing048-guard case. The initial handoff blamed the `$$` delimiter; the continuation corrected that diagnosis: original018 uses `create function`, whereas the failed regex required `create or replace function`. The delimiter itself was correct. The migration rejection assertion was not reached. No second repair/replay occurred.
- Six baseline/candidate administrator process comparisons matched exit/stdout/stderr. Public logical table digests and function metadata were preserved except the intended reader body.
- Scoped prepared/journaled reads and five descendants matched administrator outputs. Scope, ownership and candidate denials passed.
- Independent concurrent pool rebinding and membership deletion blocked the reader then produced exact authorization denial. An admitted reader blocked a later preparation deletion, which rolled back.
- 544 launcher receipts: 531 exit0 and 13 expected exit1; the outer Python process nevertheless failed. This is not 544 passing tests.
- Owned PostgreSQL PID328915 stopped and disappeared. Input hashes and repository state were preserved.

Second-run stdout:

```text
STOP (0, 'waiting for server to shut down.... done\nserver stopped\n', '')
PID 328915 GONE
INPUTS_PRESERVED True
RECEIPTS 544 EXITS {0: 531, 1: 13}
```

Outer stderr ended with `AttributeError: 'NoneType' object has no attribute 'group'`.

## Initial missing proof and disposition

S5 and S11 met within T2d SQL-read scope; S6 isolation met. S7 remains unverified for the independent actual-missing048 atomic-rejection case, not a reproduced production-code defect. Other feature specifications are out of this unit's scope. Parent033/034/ACL drift checks passed but do not replace the missing independent case.

Automatic verification stopped after the allowed setup correction was consumed. Any continuation requires the human's explicit bounded decision: same verifier, one correction only to its final guard-restoration fixture, then only the missing atomic-rejection case and direct preservation checks. No full-sweep retry, production migration edit, deployment or financial action.

## Provenance limits

- Migration051 SHA256: `66580f178309419eac5e10a86456b9cee4c9bd53eefa2af50e5f68615e154c77`.
- Executed corrected probe SHA256: `e700890d8ebf810071fdc0e6333d516b9936963190301b61aa86208cbf7b565f`.
- First failed probe SHA256: `94d85c4bbee8fa5018b72bd868ec05b9b99e84cff2e25ae9539cd3a5179170d4`.
- Launcher SHA256: `31bece74488bd8108da2fded80594147f5768a84cd96370edf083f49322850ae`.
- Scratch reported: `/tmp/gpZ73JRj/ga4CPCv7/tmp.mwPWDeCLoL`.

The initial verifier returned the exact executed probe inline in its tool handoff. Its bytes and raw receipts are not archived in this document; scratch availability is not assumed and missing evidence is not reconstructed. Suggested JavaScript regressions were not executed or adopted. Logical data hashes are not byte-identical PostgreSQL physical-file proof. No SDK, canonical ledger validation, host authentication, deployment, publication or financial acceptance follows from these results.

## S12 targeted continuation: PASS

Human `"sip"` authorized the same verifier to correct the final fixture once and execute only the missing case and its direct preservation checks. Task `mwi8jj5k-y-hrnh` used that allowance once, without a full-sweep replay or production edits. Previous scratch was absent; minimal committed schema/runtime inputs were recreated under `/tmp/gpZ73JRj/gadNX3vU/tmp.jSH1gYEKed`.

The corrected extraction matches original018 `create function` and its actual `$$` delimiter, replacing the creation clause only in isolated scratch SQL. One execution of `python3 "$s/targeted_probe.py"` with clean PATH/HOME/TMPDIR/NODE_COMPILE_CACHE/NO_UPDATE_NOTIFIER exited0 with empty outer stderr on PostgreSQL170007.

After restoring the actual original018 writer without its048 guard:

| Check | Exit | stdout | stderr |
| --- | --- | --- | --- |
| Apply051, terse errors | 1 | `BEGIN\n` | `ERROR:  unexpected_d1_request_service_definition\n` |
| Apply051, SQLSTATE errors | 1 | `BEGIN\n` | `ERROR:  P0001\n` |
| Enrolled service reads a real prepared request | 1 | `SET\n` | `ERROR:  unauthorized_admin_wallet\n` |

After each rejection, the complete public-function catalog, including comments, and all logical public table data remained unchanged. Logical-data SHA256 was `58dcfa3e4d1ced7b0701a7dc76a718ee9b592cac826144d70a82e9ea46113942`. The reader was not admitted. S7's remaining requirement is met; S12's correction/run bounds were respected. Earlier S5/S11 findings stand without a new sweep.

Cleanup reported owned PID334765 gone,1640 input hashes preserved,156 launcher receipts (153exit0/3expectedexit1), identical repository status and unchanged candidate sources. Raw receipts remain scratch-only, not archived.

The exact executed [targeted probe](d1-request-service-admission-targeted-probe.py) is retained with SHA256 `fa2e1bc521ef48f85082de74754dbcfceb3b11fde74eb7c74ed2c4641518d129`. Parent independently reproduced that hash, parsed its AST and confirmed three committed candidate sources unchanged (exit0), without replaying SQL. This is an evidence probe requiring separately prepared isolated baseline/candidate/tool directories, not a command to run from this evidence directory or against Supabase.
