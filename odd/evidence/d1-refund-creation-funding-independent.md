# D1 creation and funding observation recovery

T2i is verified within its inert observation boundary. It does not complete or activate automatic refunds.

## Candidate

Local source commit: `9a9e96b8e80e67217925b31f4c74bcaec9fbfa40`, parent `15de2c32ac4551d762e0195220c6b22bd9c783da`. Four files, 533 additions; the dependency-ordered observers and their shared focused tests remain one coherent work unit. No publication.

| Path under `supabase/` | SHA-256 |
| --- | --- |
| `functions/d1-custody/refund-creation-observation.ts` | `e83fc5ca97ca50ca6f9db00974dec3092084bc7fe6fb8f429f1410663194dc1d` |
| `functions/d1-custody/refund-funding-observation.ts` | `361fac1c4bcadeefaf1a3f2d82a28b168c6ee6a9b28bc016f35493a9d7be1fc7` |
| `tests/unit/refund-creation-funding-recovery.test.ts` | `4bd5911ad061bb65efd90f1f0494ccc3f898055bca1ec9d1fbc5b013aef5fe90` |
| `docs/d1-refund-creation-funding-recovery.md` | `11e4bdfafe7b559b54872e0a6b95a9a7ee97e349f6ea4e9ea80bdec328de1144` |

Both production modules match the authorized read-only baseline byte-for-byte. Existing shared code, host composition, SQL and manual execution paths were not changed.

## Observed checks

- Writer `mwiln6qz-1-pubj`: RED exit 1 with exactly two TS2307 missing-module errors and **zero assertions**; this was not behavioral RED. GREEN/final exit 0, typecheck and 16 tests passed. Zero correction attempts.
- Independent verifier `mwilyvim-2-7lic`: one successful public-only preparation, 43 public files and 2,190 runtime/cache files, no symlinks or special files. Initial probe exit 1/TS2345/zero assertions: its provider fixture widened the network return type. One probe-only explicit `Promise<PoolAccountObservation>` return annotation corrected that defect without changing assertions. Corrected exit 0: 8 groups passed, 32 expected rejections, 620 ms reported test duration. Stderr contains the typecheck notice.
- Parent adopted the exact independent probe and executed it in the owned repository: exit 0, 8 passed/0 failed, 792 ms reported test duration; stderr contains the typecheck notice. No historical suites replayed.
- Independent final preservation exit 0: 2,233 original hashes and all 43 public copied inputs unchanged; original Git status unchanged. Existing transitive dependencies/config/lock matched committed HEAD. New files were bound to explicit candidate hashes, not falsely described as committed during verification.
- Source packaging job-1 exit 0: exact four-file staging, whitespace check, empty final index, 14 protected files and unrelated status preserved. Existing ignored guide was explicitly staged without changing ignore rules.
- Exact committed-range native assessment: medium, 4 paths/533 lines, `reviewDue:false`, `under_budget`, unknown/unconsumed. Coordinator returned `request-context-requires-fresh-review` after assessment only; no review, consent, forecast or approval. Earlier ambient assessment was unassessable due untracked declaration; security item 2 independently required the verification above.

All Deno checks were offline/cached/frozen and foreground with bounded timeouts. No timeout or source correction occurred.

## Coverage and exclusions

S5/S6 are met within additive recovery and public-only isolation. S7/S11 are met only within the inert capability and observation boundaries. S14 is advanced by this recovery, not completed.

Both exports were tested independently for captured inherited RPC/provider receivers, scope/clock/options snapshots before awaits, hostile getter avoidance, descriptor preservation, invalid options and symbols, trusted database 403 versus forged provider/transport 403 normalization, unknown/null/incomplete evidence, and wrong SDK creation destination. An actual two-operation SDK transaction with create-account at index 1 reached the absent-candidate boundary. Expected read sequences and zero unexpected provider calls/writes/retries were asserted.

Untested: the full successful asynchronous creation/funding chain, final funding clock and frozen result, final funding arithmetic composition, full provenance, signing/submission, service activation and integrated financial behavior. No authentication, live eligibility, principal settlement or automatic-execution readiness is inferred.

## Durable regression and retained receipts

Adopted probe: [`../../supabase/tests/unit/refund-creation-funding-independent-probe.test.ts`](../../supabase/tests/unit/refund-creation-funding-independent-probe.test.ts), 111 lines, SHA-256 `cb8236be0b6a8416662f12189e586470f9af9aa75a7699f413e83f18405753ae`.

Independent scratch remains at `/var/tmp/vaca-d1-verify/cf-kutqkapc`: original failed probe, both stdout/stderr/exit sets, pins, original status and preservation report. Parent adoption receipts remain under `/var/tmp/vaca-d1-verify/rf-otc_wkox/parent-adopt-creation-funding`; source commit receipts under `parent-source-commit`. These local scratch paths are retained evidence locations, not portable repository artifacts or a permanence guarantee. No cleanup was performed.

Risk: item 2 — captured capability and evidence-validation boundaries; bounded independent verification passed. Deployment and financial acceptance remain separate.
