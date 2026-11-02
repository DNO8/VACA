# Bind fee commitments to historical unsigned SDK evidence

`IssuanceFeeCommitmentDatabase.record(requestId, authenticatedAdmin)` composes027
and018 for trusted backend use. Its configuration contains the pool public key
and a backend-only `futureRefundFee()` quote. It does **not** authenticate HTTP
wallets, inspect current balances, establish funding or authorize signatures.

## One durable boundary

1. Load027's current-admin lookup; require an existing source owner.
2. Load018's durable unsigned journal; match full reservation and namespace.
3. Validate original Testnet v1 bytes/hash, preparation, sequence and deadline
   with `validateUnsignedTransaction`. Derive issuance fee from the SDK transaction,
   never from a caller amount or current fee provider.
4. If027 already contains an exact bound commitment, return it without consulting
   current quote policy, clock, account observations, planning or signing. Its
   original authorizer need not be today's authenticated admin.
5. Otherwise require an empty commitment set, call trusted refund quote policy,
   and await **one**027 save. Return only an exact matching immutable receipt.

017 currently allows one owner/request per namespace. Enumeration must be exactly
empty for first write or exactly the selected receipt for replay. Unexpected,
duplicate, omitted or other-request records fail closed; this adapter does not
silently sum or discard another owner's obligations. A future ownership model
requires an explicitly versioned adapter rather than relaxing this rule.

Positive canonical issuance/refund stroops and their sum must fit signed int64.
SQL still enforces first-write deadline after locks. Historical unsigned and
commitment evidence remains replayable after expiry; replay is not new authority.
Missing unsigned evidence does not cause a new plan or sequence acquisition.

## Uncertainty and response bounds

All dependency/shape/SDK/quote failures become
`issuance_fee_commitment_unavailable` (503). Only a bounded explicit RPC error
`42501` / `unauthorized_admin_wallet` becomes that same named403. Transport errors
cannot inject this authority classification or expose provider diagnostics.

Responses are detached before awaits: dense plain JSON only, no accessors, symbols,
cycles or object aliases. Limits:20,000 nodes/array entries,40 levels and1MiB encoded
JSON, with bounded cumulative string/key characters before serialization. Rejected
reads never call the save. Unknown save outcomes retain possible commitment and
ownership: no automatic retry, readback, compensation, refund or release follows.

## Local verification and remaining integration

Focused tests cover native/issued historical SDK fee binding, awaited persistence,
original-authorizer replay, missing/contradictory owner/unsigned evidence, complete
membership, exact monetary boundaries, malformed save results, sanitized errors,
lost committed responses and bounded snapshots. No old production helper changes.

A fresh owner-bound financial gate must still combine verified creation/account,
credits, actual fees, all commitments and protected remaining donor obligations.
This adapter does not settle commitments, submit transactions or prove the D1
beneficiary claim/refund lifecycle. No live keys, signing or deployment is implied.
