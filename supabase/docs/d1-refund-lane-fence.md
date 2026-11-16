# Permanent ownership across refund lanes

> Parent source adoption under S17 from peer commit `1928805aeff7169cf7ee95951498e9f4ed9e42b4`.
> Tests in this guide are retained definitions and historical peer-reported
> results only (048–054 scope). No parent tests, SQL application or independent
> verification ran during adoption. Compatibility with parent055 is unverified.
> Commands below are reference material, not permission to execute under S15.

Migration [040](../migrations/040_d1_refund_lane_fence.sql) gives each pool namespace one permanent refund owner: the original request, lane and candidate transaction hash. It reuses the existing initial-issuance locks and refund journals; it adds no executor, timer, signer or send path. A fence is exclusion evidence, **not permission to refund or spend**.

**Historical peer-reported status:** local legacy and current-admission fixtures passed after an observed missing-public-function RED (`42883`). Independent verification and the legacy differential remain pending. The `LOCAL UNVERIFIED SOURCE` marker is retained; this is not deployed or financial acceptance.

## Review path

1. Read the ownership and permission contract below, then the migration's shared helper and four insertion triggers.
2. Inspect the backfill and immutable-table guards separately from ordinary API permissions.
3. Run the [dedicated public-RPC fixture](../tests/integration/refund-lane-fence.test.cjs) in an owned disposable local PostgreSQL instance. Complete the remaining checks before acceptance; do not apply this migration to a live database as part of this unit.

The recovered SQL is sourced from `supabase/migrations/040_d1_refund_lane_fence.sql` in the read-only historical baseline `/home/danilo/worktrees/vaca-d1-wsl-baseline`. No production-contract adaptation is intended here.

## Ownership and permission contract

| Surface | Contract |
| --- | --- |
| `d1_refund_lane_fences` | One row per namespace; foreign keys bind the request to existing unsigned/issuance records. The lane is `full_gross_v1` or `verified_remainder_v2`; the candidate hash is lowercase hexadecimal SHA-256 text. |
| Private acquisition | Reuses `d1_load_issuance_outcome` and `d1_load_active_issuance_sequence` for current authorization, scope, pool locking and original issuance ownership. A new fence requires read committed isolation. |
| Exact acquisition replay | Returns the original receipt without changing its authorizer or granting new execution authority. A different request, lane or candidate hash conflicts. |
| Legacy insertion guards | Candidate, signing-attempt, signed-transaction and submission-attempt inserts all acquire the same `full_gross_v1` fence. Downstream hashes come from the stored candidate, not a caller-selected lane/hash shortcut. |
| API permissions | RLS is enabled. `PUBLIC`, `anon`, `authenticated` and `service_role` have no direct table access or execution grant on either private acquisition helper or the trigger functions. |
| Public lookup | Only `service_role` receives execute on `d1_load_refund_lane_fence(uuid,text)`; the function also invokes the existing authorization/scope chain. SQL role membership alone is not synthetic administrator authority. |
| Durability | UPDATE/DELETE row triggers and a TRUNCATE statement trigger reject mutation. There is no release, expiry, reassignment or retry API. Privileged owners capable of changing DDL are not made untrusted by these guards. |

Under048–054, scoped service actors may pass the underlying readers. That does not grant mutation: existing v1 public writers independently require current admin membership, and the private fence helpers remain ungranted. Any future caller must supply its own explicit write authority rather than inherit permission from a reader.

The four triggers are `d1_candidate_lane_fence`, `d1_signing_lane_fence`, `d1_signed_lane_fence` and `d1_submission_lane_fence`. They derive the actor from the inserting journal receipt. A later submission actor may differ from the original candidate actor; replay must still retain the original fence receipt.

### Lookup shape

`d1_load_refund_lane_fence(p_request_id uuid, p_authorized_by text)` returns:

- `kind: "d1_refund_lane_fence_lookup"`, `revision: 1`, and the requested `request_id`;
- the derived `namespace`, `network: "TESTNET"` and `pool`;
- `fence: null` if no fence exists, otherwise the original receipt.

The receipt has `kind: "d1_refund_lane_fence"`, `revision: 1`, `namespace`, original `request_id`, `network`, `pool`, original `authorized_by`, `lane` and `candidate_hash`. Lookup is by namespace: if a fence belongs to another original request, it is returned without relabeling its owner. Neither a missing fence nor a returned receipt establishes financial availability or send permission.

### Failure contract

| SQLSTATE | Error | Meaning |
| --- | --- | --- |
| `22023` | `invalid_refund_lane_fence` | Invalid scope, lane, hash or guarded receipt binding. |
| `55000` | `issuance_source_not_owned` | Request does not retain the original issuance owner. |
| `23505` | `refund_lane_fence_conflict` | Owner/lane/hash conflict, or downstream candidate-hash mismatch. |
| `25000` | `refund_lane_fence_isolation_required` | New acquisition or legacy insertion attempted outside read committed. |
| `23505` | `refund_lane_fence_history_conflict` | More than one historical candidate for a namespace. |
| `22023` | `invalid_refund_lane_fence_history` | Historical candidate receipt fails scope/hash/actor-key validation. |
| `55000` | `refund_lane_fence_immutable` | Attempted UPDATE, DELETE or TRUNCATE reaches an immutability guard. |

Existing authorization and journal-validation errors retain their own precedence. API-role table denials are distinct from the immutable-table trigger errors.

## Backfill and installation boundary

Installation must be separately authorized and quiesced: drain admin/pool users **before** acquiring journal DDL locks. The transaction locks `admin_wallets` and `d1_pools`, then all four refund journals, to avoid a pool owner waiting on a journal lock held by the migration.

Backfill considers **all** historical candidates, not only active/latest ones. It validates request, namespace, network, pool, transaction hash and original actor key, and creates new fence records without rewriting history. Historical actors need not still be current administrators. Ambiguous or malformed history aborts the transaction; there is no automatic repair, reassignment or selection of a preferred candidate.

The private `d1_acquire_verified_remainder_fence_private` wrapper only fixes the lane name. A later verified-candidate SECURITY DEFINER RPC must derive its arguments from actual database scope and verified candidate evidence. This migration neither exposes that acquisition to API roles nor proves the public v2 path exists.

## Local verification and remaining proof

The fixture uses built-in Node, `fixture-runtime.cjs`, the approved launcher and disposable loopback PostgreSQL. Initial schema/admin identity setup is fixture-only; domain history and candidates are created through real public RPCs. Every launcher command captures exit status, stdout and stderr. Rejections compare public receipts, ownership and discovery/history counters before and after; teardown removes only the owned temporary database resources.

Historical peer-side command (not run during parent adoption):

```sh
env -i PATH=/usr/bin:/bin D1_TOOL_ROOT=/home/danilo/.local/share/vaca-d1-toolchain /home/danilo/.local/share/fnm/node-versions/v22.23.3/installation/bin/node --test /home/danilo/projects/vaca-d1-auto-refund-isolated/supabase/tests/integration/refund-lane-fence.test.cjs
```

The default fixture applies015–038 and conditionally040, without039. Before040 exists, its first040-specific assertion calls the public lookup rather than failing on a missing migration file. The peer reported that both legacy mode and `D1_CURRENT_ADMISSIONS=1` passed the valid-backfill, new-candidate, four legacy insertion paths, ownership/hash/authorizer, replay and API-permission assertions. The latter mode applies actual048–054 and proves admitted service readers cannot create or replay legacy candidates. Its direct service-scope configuration is trusted fixture setup, not domain-history injection or a public enrollment API.

Acceptance still needs:

- Independent security/concurrency evidence, including owner-level UPDATE/DELETE/TRUNCATE guards. API-role permission denials do **not** exercise those guards.
- Backfill ambiguity/malformed-history and historical-actor cases beyond the valid public-RPC fixture, without silently injecting private state into its public-behavior claims.
- A base/candidate public-RPC differential for legacy candidate creation/replay/conflict, signing claim/replay, signed-byte recording/replay and submission claim/replay. Compare stdout, stderr, exit status and public owners/history/credit counters; committed tests must not read Git history.
- Independent confirmation of current048–054 compatibility. The local current-admission fixture passed with owned-resource teardown; it does not establish migration equivalence for a deployed database.
- Public verified-remainder contention once041 supplies that path; no v2 cross-lane race claim is made here.

This is a protection prerequisite for original-donor refunds, including eligible remainder, under [the parent source-integration task](../../odd/tasks/d1-automatic-refunds.md). It is not completion of automatic refund execution, service admission/composition, deployment, financial acceptance or movement of funds. The peer checkout and historical baseline remain read-only.
