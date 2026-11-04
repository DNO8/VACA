# Immutable initial issuance outcome storage

Migration032 is **opaque storage**, not SDK approval, financial settlement or
consensus proof. Its isolated SQL fixture intentionally uses non-SDK XDR bytes.
A future backend coordinator must internally validate actual018/030 bytes,
031 attempt and the raw ingested record with `parseInitialIssuanceOutcome`
before saving, and revalidate persisted evidence before using it.

## Private API

Only `service_role` may execute:
- `d1_load_issuance_outcome(request_id, authorized_by)` returns the seven-field
  `d1_issuance_outcome_lookup` scope envelope with `outcome: null | receipt`.
- `d1_record_issuance_outcome(request_id, authorized_by, observed_outcome)`
  returns the immutable12-field `d1_issuance_outcome_journal` receipt: kind,
  revision, request_id, namespace, network, pool, original authorized_by,
  attempt_id, transaction_hash, envelope_hash, outcome_hash, observed_outcome.

RLS is enabled; all direct table DML/reads are revoked, including service_role.
Current administrator authentication happens first via031→030→018 pool/owner
locks, even for malformed input or historical replay. Exact replay preserves
original authorship before new-write isolation/state checks. Changed evidence
conflicts. New writes require READ COMMITTED and an actual immutable031 attempt.

The exact five-field decoder output is bounded to1MiB. Its observation must
match the entire already-ingested024 record in the same namespace, including
actual030 signed envelope, pool source/payer, reserved sequence and single CB
operation. Success IDs require canonical type0 XDR hex; failed outcomes require
JSON null. **SQL cannot establish the ID derivation or verify the signature.**
`outcome_hash` is SHA256 of PostgreSQL canonical JSONB text encoded as UTF8.

New-write errors are `invalid_issuance_outcome`22023,
`issuance_outcome_isolation_required`25000,
`d1_submission_attempt_not_found`22023 and
`d1_transaction_observation_not_found`22023. Scope, record or immutable-replay
mismatches return `issuance_outcome_conflict`23505. Existing authentication
errors propagate; they are not changed by this migration.

No fresh-spending029 call or deadline check is made: late evidence of a past
execution must not become permission to spend again. Financial-snapshot expiry
is exercised by the fixture; passing the original five-minute donor deadline
is structurally reviewed, not waited in this bounded test.

The RPC changes no owner, sequence, preparation, fee, reserve or principal data.
Unknown outcomes cannot synthesize a failure or CB ID; no retry, readback,
reset, refund or release API exists here. Recording opaque evidence does not
complete durable SDK reconciliation, terminal accounting or live acceptance.
