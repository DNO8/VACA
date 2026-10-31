# Observe designated team operating credit without approving it

`observeOperatingCredit` provides read-only, checkpoint-bound provenance for a
single designated native team receipt. It does **not** approve credit, make it
spendable, prove funding readiness, or activate any signing or transfer path.
This is local T2c work under [S1–S6](../../odd/tasks/d1-local-completion.md).

## Backend API

```ts
observeOperatingCredit(database, operationId, teamFunders, source?)
```

- `database` is the accepted `DiscoveryDatabase`, bound to the backend namespace
  and currently authenticated administrator. The function first calls its
  validated `loadState()` (`d1_load_discovery_state`, migration 021).
- `operationId` is a canonical positive decimal uint64 Horizon operation ID.
  The ID must already be within the ingested cursor and between the registry's
  `first_ledger` and checkpoint ledger; coverage must be complete at that anchor.
- `teamFunders: readonly string[]` is an explicit, nonempty, unique allowlist of
  backend-configured G public keys. Pool self-funding is rejected. No concrete
  keys are supplied here and no allowlist may come from a public request.
- `source` defaults to `new HorizonDiscoverySource()`. Injection is a trusted
  backend/test seam, not a request facility; it accepts neither caller account
  facts nor a funded boolean nor a caller-supplied operation record.

The result includes `namespace`, `network`, `pool`, `funder`, `operationId`,
`transactionHash`, `ledger`, exact decimal `amountStroops`, `anchor` (sequence,
ledger hash, close time), and the normalized discovery `record` with raw DTOs.
These are observation inputs suitable for **later** exact SQL matching, not an
approval receipt. No database writes or counters are performed.

## Provenance and eligibility

`HorizonDiscoverySource.readOperationAtCheckpoint(context, operationId)` snapshots
backend context before awaiting, then reuses `readAccountAtCheckpoint` to validate
Testnet history retention, registry/checkpoint consistency and the current
controlled pool account. It uses the existing fixed-origin bounded HTTP helper:

1. GET root, account, and latest ledger via the accepted account observer.
2. GET `/operations/{operationId}` then `/transactions/{validatedHash}`.
3. Decode using unchanged `parseDiscoveredOperation`, binding the requested ID,
   successful XDR, DTO identities, transaction hash and active ledger range.
4. GET the latest ledger **after** both lookups; sequence, hash and close time
   must still exactly equal the saved checkpoint. A changed head fails closed.

There is no retry, historical-header substitution, new cache, or clock-based
freshness assertion. Indexer consistency is not independent chain execution proof.
The outer observer re-decodes returned raw DTOs and rejects contradictory record
classification, identity, or memo rather than trusting injected normalized facts.

Only decoded native `incoming_payment` from an allowlisted donor, or
`account_created` by an allowlisted funder, qualifies. The SDK envelope memo must
be exactly `{ type: "text", value: "D1OPS" }`. Positive native amounts are converted
to stroops with BigInt and bounded by signed int64; no floating point or coercion.
Issued assets, outgoing/self payments, unrelated/quarantined operations, failed
transactions, historical receipts, missing/wrong/hash memos and unlisted sources
fail closed. The existing donation provider's HASH memo contract is unchanged:
D1OPS TEXT operating receipts are intentionally disjoint from prepared donations.

## Failure and completion boundary

Observer failures become `CustodyError("operating_credit_unavailable", 503)`;
raw transport, parser and RPC errors never escape. The sole preserved exception
is the validated load-first adapter's current-admin denial,
`CustodyError("unauthorized_admin_wallet", 403)`. A source-time 403 is not preserved.
The standalone source follows the existing `dependency_unavailable` / 503 contract.

No approval SQL, durable credit, fee commitments, liability assembly, historical
fund protection accounting, funding readiness or deployed evidence is delivered
by this observer. Those remain later D1 units; a deadline is not an automatic
refund. Tests use fake RPC/HTTP and ephemeral unsigned SDK XDR with no real requests.
