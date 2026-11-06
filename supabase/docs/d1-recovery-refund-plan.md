# Unsigned original-donor recovery/refund plan

`planRecoveryRefund(client, scope, configuration)` is an internal backend constructor,
not refund authorization. Scope selects a request/current admin; one accepted observer
validates held historical SDK journals, fee commitment, sequence owner and history.

## Construction contract

Backend-owned configuration contains only `sourceSequence`, `feePerOperationStroops`,
`now` and `validUntil`; plain own data fields are snapshotted before any observation.
The canonical positive int64 sequence must equal the included consumed sequence and
permit its successor. Positive uint32 per-operation and total fees must fit the held
future-refund commitment; that cap is not funding approval. Safe-integer `now` must
reach the original deadline; minimum time stays that deadline and maximum time is
explicit `validUntil > now`, never a renewed five-minute window.

Original donor, asset, gross principal and issued/unissued partition come only from
uniquely matched held preparation and SDK accounting. Included success constructs
exactly ClaimClaimableBalance then full-gross Payment to the original donor; included
failure constructs only that Payment, for native or issued assets. Unknown, missing
or contradictory evidence never selects payment-only or releases ownership.

The detached frozen result contains unsigned ordinary Testnet XDR, hash and identity
facts. Only accepted-observer DB denial returns `403 unauthorized_admin_wallet`;
other failures return `503 recovery_refund_unavailable`. No signing, submission or retry.
[Stellar transaction lifecycle](https://developers.stellar.org/docs/learn/fundamentals/transactions/transaction-lifecycle)
documents included fees/sequence consumption and atomic rollback: claim failure blocks
payment; payment failure rolls back the claim, not included fees. This is not a consensus
test, account/trustline proof, eligibility, settlement or release. Team funds must cover
fees/reserves, not principal. Financial gate, execution/disposition and clients remain unfinished.
