# Require evidence of a newly created pool

`observePoolCreation(client, namespace, authenticatedAdmin, pool)` produces
anchor-scoped creation evidence only for a pool whose current account incarnation
was successfully created within complete active transaction history. Existing
pool activation is **not** creation evidence. This observer is a prerequisite for
the later financial authorization gate, not a runtime signer or activation API.

## Evidence path

1. Read the accepted, complete, SDK-revalidated transaction history under the
   current authenticated administrator. Income and transaction coverage must
   share the saved anchor; their independent cursors are not compared as equal.
2. Require the first recorded pool transaction to be successful and contain an
   actual ordinary-v1 `createAccount` operation with destination equal to pool.
   Its ledger must be at/after the configured first ledger. Derive the funder,
   positive exact starting stroops, transaction hash, operation index and TOID
   from the envelope—not caller facts or a caller-selected creation ID.
3. Require exactly one successful destination-pool creation across history and
   reject every successful pool-source `accountMerge`, including create/merge/
   recreate sequences inside one multi-operation transaction. Failed operations
   do not create or merge accounts. Other accounts' merges do not merge the pool.
4. Use the fixed Testnet account source to observe the currently controlled
   account at the same anchor. Require matching pool/network/header and a last
   modification no earlier than creation or later than the anchor.
5. Reload the complete history state after the provider await. Reject any state
   or authorization drift; never retry, reanchor, write or release ownership.

An optional account-source dependency exists for isolated fixtures, not request
input. Its JSON snapshot rejects accessors/non-JSON/oversized values before field
access. History inherits the reader's 1,000-record/8 MiB bounds; the account/state
snapshot has a 128 KiB traversal budget. Unavailable or contradictory evidence
returns sanitized `pool_creation_unavailable` 503. Current-admin denial remains
`unauthorized_admin_wallet` 403.

## Meaning and limits

The returned `d1_pool_creation_evidence` revision1 contains namespace, TESTNET,
pool, firstLedger, anchor and the derived creation facts. It establishes a
**new current incarnation within the covered trusted-indexer history**, not that
this public key has never existed before unavailable retention. Missing coverage,
old-only accounts, missing creation, merge/recreation and provider drift fail
closed. No account-sequence/genesis formula fills a history gap.

SDK/result/DTO consistency is not cryptographic consensus or independent ancestry
verification. Current master-only account configuration is not proof of backend
secret possession. Creation funding is not automatically approved operating
credit; donor liabilities, commitments, freshness and durable owner-bound financial
authorization remain necessary. A stable final read is not a spending reservation.

This unit does not change existing prepare/unsigned replay contracts, activate a
signer, create/fund a real account, or claim deployed D1 acceptance. Runtime
financial authorization must require this evidence rather than accepting an
existing-pool baseline override.

See [historical reader](d1-transaction-history-reader.md) and
[pool account observation](d1-pool-observation.md).
