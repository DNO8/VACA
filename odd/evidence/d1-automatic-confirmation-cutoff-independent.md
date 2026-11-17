# Fixed automatic-confirmation cutoff: local independent evidence

Independent local verification covers the automatic-only inclusive cutoff at **2026-11-15T03:00:00Z**, including existing recovery and unchanged original-confirmation +300 seconds. This is not deployment, activation, successful live manual reconciliation or financial acceptance.

## Bound source

| Binding | Value |
|---|---|
| Original baseline | `e7f870540bf8bd91df49de7869ca8f343689d9bd` |
| Original candidate | `2f0cf0978c5399c41c17ee748e75a04438932765` |
| Public fixture baseline | `eca3694069aca3524a6a021e9faafcad58ee0b14` |
| Public fixture candidate | `c361b0f026e7e1d29e13d7af1314ad6843a7f6d2` |
| Public manifest SHA-256 | `36ce3a7086e9f9715851895e0094dc47ca503d6307dbc75a001cd8e5869d4f00` |
| Original/fixture complete diff SHA-256 | `2b77062be4c369bd379dee6b2525b82f87dede0ca283587cc7066a6f03e2e8f8` |

The approved public fixture contains 99 baseline / 100 candidate files and its own two-commit history. The mandatory preparer operated on that fixture, not original private configuration or repository history. The verifier checked 199 original/fixture snapshot bindings, 100 prepared candidate files and 99 prepared baseline files; original HEAD/index/status and clean two-commit fixture were preserved.

## Observed independent checks

| Execution | Actual outcome | Scope |
|---|---|---|
| `mwjzg4tn-7-hwqp` | Eight passed, one probe URL failure; entrypoint no-run graph exit 0 | Fixed date, before/equal/after both lanes, +300 boundary, old/new and recovery exclusions, inert invalid policy, unchanged durable effects |
| `mwk0pwlz-9-u001` | Corrected HTTP/cursor test passed; new baseline compatibility probe failed | Exact HTTP DTO rejection, cursor continuation, foreign-fence priority and unchanged excluded effects |
| `mwk18nw9-a-npan` | Baseline and candidate each one passed / zero failed, exit 0 | Corrected compatibility probe: 18 full observation records matched, raw stdout/stderr byte-identical |

Earlier checks were not rerun for freshness. The writer's 41 passing tests remain separately attributed writer evidence.

Nine cases per lane compare omitted-policy new execution, pending work, three manual routes, three partial discovery/history recovery steps and settlement. Records include exact results/errors, action calls separately from measurement reads, counters and before/after durable hashes. HTTP observations retain status, headers, raw body and secret-read counters. Synthetic signing/submission occurs through the existing fixtures; no network or financial service is called.

Manual status/execute/reconcile returned **200 / 202 / 503**, identically in baseline and candidate for each lane. Reconcile's three transport calls and zero writes were compared, not discarded. The fixture's 503 does **not** establish successful manual reconciliation. Tick-only recovery reached settlement in both lanes without another signature/submission.

## Durable sources and exact hashes

Adopted regression source: [cutoff-compatibility.test.ts](../../supabase/tests/unit/cutoff-compatibility.test.ts). It does not read Git history. The two-tree comparison runner is retained as local evidence, not a regression test requiring a historical commit.

| Artifact | SHA-256 |
|---|---|
| Adopted compatibility source | `df97d106a382343f720f0df4070bd4cb387fad7bf3f9b3008402923d264ca2c1` |
| Independent baseline and candidate stdout | `b4dad8ed910678046e448ddbfd9d3b3ec4571d3f1bfede08d77c008207e7d5a5` |
| Independent baseline and candidate stderr | `a7ef0f9e715b3d4fbdfbd8674e94be6493673209bc57d296527b6338783b4887` |
| Full 18-record domain comparison | `1a992a34db242cfaf5dd54458f857230aaca0486a2bfcb62da5fe3aff26c47cf` |
| Corrected HTTP/cursor source | `23c3846a1087e5a14cd00c0c40760c28336170bd4f286910360b242be7265889` |

Local receipt root: `.tooling/d1-backend/tmp/cutoff-public-git-dfmlmm2r/`. `verification/continuation-l21/` retains the revised probe, complete outputs, observation records, comparison runner, invocations, preparation and preservation receipts. `verification/continuation-l19/` retains the corrected HTTP probe and six date fixtures. These files are not claimed published or portable across machines; temporary child workspaces are not relied on for evidence retention.

The parent read the full revised source/receipt, matched all 100 original public files against the fixture, and verified the four independent output-file hashes before adoption. Parent adoption execution and final packaging are recorded in the [task log](../tasks/d1-automatic-confirmation-cutoff.md).

## Failures retained, not relabeled

- Earlier preparer incompatibility stops produced no independent tests; the approved public-only Git fixture resolved that constraint without altering the helper.
- Policy admission denied an initial preparation command before execution; the subsequent closed allowlist received explicit human approval.
- Parent preparation's final status assertion initially counted newly owned evidence; its authorized correction preserved original state.
- The first HTTP probe used `/internal-refund-tick` instead of the full function pathname and failed 404 versus expected 400.
- A resumed child lacked its previous temporary directory; assertion/cd failed before any Deno execution. Its `HTTP_EXIT=1` was not a test result.
- The first compatibility probe incorrectly required all manual HTTP responses to be 200; baseline returned 202. Candidate comparison was not run in that attempt.
- Each correction/reconstruction followed the separate recorded human authorization. No failure is erased by later passing checks.

## Remaining release gates

Runtime packaging/transport, source readback, explicit window release, service enrollment, signer/token/budget configuration, scheduler and human-run financial acceptance remain in [recording readiness](../tasks/d1-recording-readiness.md). SQL delivery must not be replayed. Historical proof debts #48 and #56 are not closed by this unit. Native assessment is separate and is not inferred from these functional results.

Risk: item 2 (financial execution scope guard), item 3 (shared automatic-page compatibility). This evidence package changes no production execution code.
