# Persist exact signed bytes before any future submission

Migration030 adds a private, immutable, one-row-per-request journal. It stores
opaque bytes only: no SDK validation, signature proof, broadcast, confirmed
outcome, claimable-balance mapping, owner release or fee/status mutation occurs.

## Internal backend API

Only `service_role` may execute these SECURITY DEFINER RPCs; both fix search_path
to empty and require current admin membership through018. Signed bytes must stay
internal to the backend, never in an HTTP response or client signing flow.

| RPC | Result |
| --- | --- |
| `d1_load_signed_transaction(request_id, authorized_by)` | `d1_signed_transaction_lookup` revision1; request/namespace/TESTNET/pool and nullable `transaction`. |
| `d1_record_signed_transaction(request_id, authorized_by, snapshot_hash, signed_xdr)` | Original immutable `d1_signed_transaction_journal` revision1 receipt. |

The receipt binds request/namespace/network/pool, original `authorized_by`,
018 `transaction_hash` and `reservation`,028 `snapshot_hash`, exact `signed_xdr`,
and `envelope_hash` (lowercase SHA256 of decoded envelope bytes, NOT Stellar tx hash).
The table has foreign keys to018 unsigned bytes and the same request's028 snapshot.
RLS is enabled; public, anon, authenticated and service_role have no direct table access.

## First write versus historical replay

1. Reuse018 admin → pool → preparation/intent → owner/unsigned locks. The pool
   serializes missing journal rows and competing writers; locks last until commit.
2. Validate lowercase64-hex snapshot hash and canonical nonempty Base64, bounded
   to65536 ASCII bytes. Roundtrip rejects whitespace/pad aliases (minimum valid4).
3. Existing exact bytes/hash return the original actor/receipt before isolation
   and freshness checks. Different bytes or snapshot hash conflict; no replacement.
4. A first write requires READ COMMITTED, current ownership, saved unsigned bytes,
   and an existing028 snapshot.029 revalidates that original snapshot's current
   unsigned hash, reservation, fees, history, credits, expiry and deadline after
   lock waits.028 historical replay alone is insufficient. Then insert exactly once.

New errors: `invalid_signed_transaction` (22023), `signed_transaction_conflict`
(23505), `signed_transaction_isolation_required` (25000), and
`d1_initial_financial_observation_not_found` (22023). Existing018/028/029 errors
propagate unchanged, including authorization, missing owner/unsigned, conflict,
expiry and deadline errors. Replay still requires a currently authorized admin.

## Evidence boundary and next step

The regression uses opaque NON-SDK fixtures; local results are not deployed or
on-chain evidence. A future SDK adapter MUST independently decode and compare
against actual018 unsigned bytes, verify the Testnet transaction hash and pool
signature, and revalidate persisted bindings before use. Historical receipts
are not fresh spending permission; unknown outcomes retain ownership and do not
authorize retry, replan, refund or release. Reconciliation and actual transaction
links remain later T4/T5 work;030 alone does not complete D1 or authorize submission.
