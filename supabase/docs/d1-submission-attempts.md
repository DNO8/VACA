# D1 private one-shot submission claims

Migration031 adds durable claim storage before any broadcast. It does not mount
runtime routes, activate signing, submit a transaction, or establish chain evidence.
Only `service_role` can execute the RPCs; no API role has direct table privileges.
The table has RLS enabled. Both RPCs authenticate current administrator membership
through030/018 before handling claim metadata, retaining their pool/owner locks.

## Private RPC contract

- `d1_load_submission_attempt(request_id uuid, authorized_by text)` returns exactly
  `kind`, `revision`, `request_id`, `namespace`, `network`, `pool`, `attempt`.
  Kind is `d1_submission_attempt_lookup`, revision is1, attempt is null or a receipt.
- `d1_claim_submission_attempt(request_id uuid, authorized_by text,
  snapshot_hash text, attempt_id uuid)` returns exactly `kind`, `revision`,
  `claimed`, `attempt`. Kind is `d1_submission_claim`, revision is1.
- Each attempt has exactly13 fields: `kind`, `revision`, `request_id`, `namespace`,
  `network`, `pool`, `authorized_by`, `transaction_hash`, `envelope_hash`,
  `snapshot_hash`, `attempt_id`, `claimed_at`, `reservation`.
  Kind is `d1_submission_attempt`, revision is1, network is `TESTNET`.
  `claimed_at` is numeric safe-integer UTC epoch seconds, not a timestamp string.

There is one immutable attempt per request and a globally unique UUID nonce.
Only the first insert acknowledgement has `claimed: true`. Every subsequent claim
returns `claimed: false` and the original actor, nonce, timestamp and all other
receipt fields, even with another current administrator, nonce or snapshot.
Historical replay precedes new-write isolation/freshness checks and never rearms.
It makes no business-state changes under Repeatable Read or Serializable; actual
SQL READ ONLY transactions remain incompatible with inherited FOR UPDATE locks.

New claims require Read Committed and an existing030 signed journal. Snapshot B
may differ from signed snapshot A, but must bind the same unsigned transaction and
reservation. The stored B observation is revalidated by029 after inherited locks,
including current fees/history/credits/deadline. A final clock check precedes
insertion; another check rejects expiry during a unique-index wait atomically.
Only the attempt row is added: no principal, sequence, fee or owner state changes.

New errors are `invalid_submission_attempt`, `submission_attempt_isolation_required`,
`submission_attempt_conflict` and `d1_signed_transaction_not_found`. Missing B uses
`d1_initial_financial_observation_not_found`;029 errors retain their existing names.
Nonce collision is a controlled conflict, leaving no new attempt or business changes.

## Required future backend boundary — not implemented here

The future trusted SDK adapter must validate the actual signed artifact using the
accepted signed-journal composition and fresh financial gate, generate and bind a
unique nonce internally (never accept HTTP nonce/bearer permission), and validate
the complete acknowledgement. After return, recheck freshness and consume a known
`claimed: true` acknowledgement ONCE. Never expose signed bytes or service grants.

An unknown first acknowledgement retains ownership: no automatic fetch, retry,
readback or release. Expiry after a known acknowledgement also means NO broadcast,
not permission to reset. Historical receipts are evidence, never fresh spending
permission. A claim proves neither broadcast, confirmation, failure nor a claimable
balance. Submission/reconciliation, terminal fees and CB mapping remain separate
work; local opaque SQL fixtures are not SDK, deployment or on-chain acceptance proof.
