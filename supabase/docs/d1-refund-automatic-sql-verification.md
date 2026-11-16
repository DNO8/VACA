# Automatic refund SQL: positive journeys and local regression checks pass

The isolated PostgreSQL checks now pass **15/15**, and the required combined
regression run passes **26/26**. The bounded partial-handoff batch closes the
previous missing positive032/038 and v2 candidate-through-outcome SQL examples. The complete retained014/20261011060218 +015–058
chain applies without changing production SQL, weakening a pin, or bypassing a
guard. This is T2ai self-verification under S20, **not independent approval or
operational readiness**. No remote database, deployment, activation, signer,
network submission or real funds were used.

## Reproduce locally

Run from `/home/danilo/projects/vaca-d1-t5b-proof/supabase`, with the existing
verified local toolchain. These are the exact foreground commands executed:

```sh
T=/home/danilo/projects/vaca-d1-t5b-proof/.tooling/d1-backend
NODE=/run/user/1000/fnm_multishells/532_1794824566512/bin/node
env -i PATH=/usr/bin:/bin HOME="$T/home" TMPDIR="$T/tmp" D1_TOOL_ROOT="$T" D1_CURRENT_ADMISSIONS=1 "$NODE" --test --test-concurrency=1 tests/integration/automatic-refund-admission.test.cjs
```

After focused GREEN:

```sh
env -i PATH=/usr/bin:/bin HOME="$T/home" TMPDIR="$T/tmp" D1_TOOL_ROOT="$T" D1_CURRENT_ADMISSIONS=1 "$NODE" --test --test-concurrency=1 tests/integration/automatic-refund-admission.test.cjs tests/integration/beneficiary-claim-membership.test.cjs tests/integration/refund-lane-fence.test.cjs tests/integration/refund-candidate-read-service-admission.test.cjs
```

The test uses `process.execPath`, `fixture-runtime.cjs`, and the unchanged
`run-isolated.cjs` launcher with an empty subprocess environment. Its only
executables are the launcher's initdb, pg_ctl and psql. Each cluster, SQL copy and
log lives in a fresh owned `.tooling/d1-backend/tmp/vaca-automatic-admission-*`
directory. Registered teardown stops that cluster, waits for its clients,
asserts the recorded PostgreSQL PID is gone, and removes only its own directory.
All observed runs, including failures, printed the successful cleanup marker.

## What was actually checked

| Scope | Observed public-interface evidence |
|---|---|
| Full chain | Two unique retained prerequisites; explicit ordered44-name manifest015–058, including `033_d1_issuance_sequence_ownership.sql`,039/040 before041, all041–047, all048–058. Exact directory/name/count comparison fails closed rather than filtering files by a broad regex. |
| 055/057/058 pins | Actual application executes every preflight metadata/body/ACL pin and post-body check. Separate fresh predecessor clusters054,056,057 test body, ACL and SECURITY DEFINER drift on one target each, plus reapplication. Exact P0001/message, whole public function catalog and public domain receipts remain unchanged on rejection. No production migration text is patched for these probes. |
| S7 permission boundary | Empty049 enrollment after bootstrap. Unenrolled and wrong-pool actors rejected across14 writer RPCs. Nine initial-issuance/preparation calls remain denied to an enrolled service, including existing initial-journal replay. Browser roles denied candidate/beneficiary/due RPCs. |
| S11 evidence | Service creates032 initial-outcome evidence from genuine saved initial submission/history fixtures, with a null outcome before insertion; it also creates039 beneficiary evidence and discovery/history pages. Manual/service replay preserves the original actor, acquisition and count. Unauthorized/revoked032 writes and initial submission re-grants remain denied. |
| S1/S5 v1 | Service creates034 candidate,035 financial observation,036 signing claim/signed bytes,037 submission claim and038 positive included-history outcome using public journal constructors. Outcome lookup starts null; creation binds the actual saved send attempt, signed envelope and complete history. Manual exact replay retains receipts. SQL fixture bytes are opaque, not cryptographically valid payment authorization. |
| S1/S5/S7/S11 v2 journey | Service creates039 acquisition,041 candidate,044 financial observation (executing042/043),045 signing claim/signed bytes,046 submission claim and047 positive outcome. Financial evidence captures actual public memberships including original snapshots,022 creation credit and complete history. Public read-back checks actor/nonce/hash/snapshot/history identity. No private journal injection or guard bypass. |
| V2 replay/revocation | Same-service financial/signed-byte replay passes while evidence is current; signing/submission claims replay without regrant. Admin candidate, claim, submission and outcome replay preserve the original actor; admin financial reads retain original evidence. Unauthorized/revoked writes preserve public receipts/counts. After history advances, old financial write replay rejects23505 `remainder_membership_conflict`, rather than renewing authority. |
| Risk item4: fences | Real v1 then v2 and v2 then v1 rejection with23505 `refund_lane_fence_conflict`. A concurrent v2 acquisition holds the pool lock; a v1 contender is observed via `pg_blocking_pids`, then rejected after commit. No alternate v1 candidate appears. |
| Risk item4: claims | Actual competing full-gross signing claims return exactly one `invoked:true`; competing submission claims return exactly one `claimed:true`. The losers retain the winner's immutable receipt. No signer or transport is invoked by the SQL tests. |
| Risk item2/item4: revocation | Revoked candidate, beneficiary, financial, signing and submission replays fail. An admitted058 reader blocks row deletion until transaction completion. Admission waiting behind deletion or pool rebinding observes the committed change and rejects42501 `unauthorized_admin_wallet`. |
| 056 enumeration | Future/due/future originals with limit1 produce empty-with-continuation, due-with-continuation, then empty exhaustion. Exercises limit50, null/0/-1/51, malformed UUID, end/beyond-end cursor, absent/wrong/revoked scope and no admin bypass. Preparation receipts remain unchanged. |
| S5 preservation | Existing beneficiary membership, permanent-fence legacy journals and053 service-reader/admin-writer suites pass unchanged with `D1_CURRENT_ADMISSIONS=1`. The053 suite also performs its existing manual differential checks. |

Rejection helpers assert exact native psql exit status, stdout, stderr and
SQLSTATE in separate terse/sqlstate executions. Public snapshots include
preparation/allocation receipts, initial/active ownership, history records and
counts, credit state, fees, beneficiary sets, v1/v2 journals and permanent fences;
known v1 and v2 financial hashes are also read back. Catalog queries are used only for
migration atomicity, and PostgreSQL activity views only to witness real lock
waits. Domain rows are constructed through public RPCs, not private-table inserts.
Only trusted fixture-owner configuration enrolls/revokes service identities.

## Run history — failures retained

Baseline supplied by parent: `2c6ba304c7823cc2435ed47f88d4233b5108688b`.
No production defect was reproduced, so no055–058 production correction or
production RED→GREEN claim is made. These are new regression/verification tests
of already-authored behavior; source changes remained test-only.

| Execution | Exit / TAP result | Evidence |
|---|---|---|
| Initial compilation-only focused run | 0;1 pass,0 fail | 3047.660071ms; full chain and no seeded service actor. |
| First expanded focused run | 1;1 pass,6 fail | 38836.777654ms. Five groups failed in shared fixture setup: `ERROR:  invalid_transaction_page`. The earlier payment's ledger900 timestamp and current page anchor disagreed. Enumeration assertion omitted native ` at character 223`. These are fixture/assertion errors, not migration defects. |
| First fixture correction run | 1;11 pass,1 fail | 72523.475109ms. Payment is observed under a later901 anchor without changing its actual900 inclusion timestamp. Remaining failure: sqlstate verbosity correctly emits `ERROR:  22P02\n`, not `ERROR:  22P02 at character 223\n`. |
| Prior final focused run | 0;13 pass,0 fail | 93943.163369ms. Second assertion correction limits the character position to terse output. Added existing-shape full-gross financial/claim contention case also passes. |
| Prior required combined run | 0;24 pass,0 fail | 165316.348315ms;11 top-level tests including subtests. All11 clusters stopped and owned directories removed. |
| Bounded completion batch: focused | 0;15 pass,0 fail | 130363.183357ms;10 top-level tests. Previous13 retained,032 creation and v2 journey added, existing v1 journey extended through038. First run GREEN; all10 clusters stopped/removed. |
| Bounded completion batch: combined | 0;26 pass,0 fail | 195528.008452ms;13 top-level tests. Exactly one combined run after focused GREEN; all13 clusters stopped/removed. |

The runner transcript retains stdout/stderr. Large outputs were retained by the
harness at `/tmp/gphNdCyH/gaBeGOgC/pi-bash-a61918d67ed9469c.log` (first expanded
failure) and `/tmp/gphNdCyH/gaBeGOgC/pi-bash-1f526025c604685f.log` (combined pass).
These are local session artifacts, not durable repository evidence or fixture
scratch to delete. The bounded batch's combined stdout/stderr is retained at
`/tmp/gphNdCyH/gagIuOOH/pi-bash-299b9a6c05a35825.log`; focused output is in the
runner transcript. No known baseline failure was waived. The original two
test-only correction cycles remain recorded, not reset. This one authorized
partial-handoff completion batch needed no failure correction or second cycle;
no production correction cycles were needed.

## Limits and handoff

- **Previous SQL proof gaps closed:**032 service creation,038 service creation
  and the positive v2 financial/signing/submission/outcome path now pass through
  actual public RPCs. The extended seed reuses the own public constructor chain
  and existing019/022 normalized operation patterns, adding an actual recorded
  creation credit and complete operation/history membership.042/043 independently
  check the supplied projections; there is no fabricated approval flag, private
  helper execution, GUC authorization, production credential or remote call.
- Cross-namespace global nonce contention, full malformed-evidence matrices,
  every individual pin's drift permutation, issued-asset/multi-donation v2
  financial variants and v2-specific signing/submission contention are not
  exhaustively covered. Actual v1 competing claims and cross-lane contention
  remain covered; the new v2 success path is sequential.
- The new056 test proves observable bounded-window behavior, not an execution
  plan/large-dataset performance bound or repair of malformed stored rows.
- Existing SQL seeds contain deliberately opaque `AQID`/`AAAA`/`BAUG` bytes. They
  reuse the genuine public fixture constructor paths, **not** real chain evidence,
  SDK signature verification or spending authority. Monetary input fixtures are
  locally constructed, not live account balances. This is SQL authorization,
  membership and arithmetic proof only. TS verification is separately
  parent-owned; no TS files were edited by this writer, and the mutable
  `automatic-refund.ts` fixture is not a dependency.
- Independent review remains parent-owned. S1/S5/S7/S11 have the local coverage
  above, not full end-to-end acceptance; S20 permits these local runs only.
- `supabase/tests/fixtures/automatic-refund-admission.cjs` and this guide are
  matched by `supabase/.gitignore:2` (`*`). Preserve both when packaging;
  this worker neither changes ignore rules nor stages files.

Next: parent review the two test files and this evidence, retain the remaining
SQL-only/variant limitations above, and arrange the separately authorized
independent review. Do not infer deployment, service
provisioning, scheduler activation or financial acceptance from these passes.
