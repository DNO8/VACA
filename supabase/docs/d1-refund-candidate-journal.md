# Historical refund candidates and one-shot construction

`loadRecoveryRefundCandidate(client, scope)` validates saved unsigned Testnet history.
Scope contains exactly `namespace`, `pool`, `requestId`, and `authenticatedAdmin`.
The current-admin034 lookup runs first; a bound null candidate with null child owner
returns `null` without planner reads. Unknown or malformed data is never absence.

## Receipt and errors

The detached, frozen receipt has exactly fourteen fields:
`kind`, `revision`, `request_id`, `namespace`, `network`, `pool`, `authorized_by`,
`initial_transaction_hash`, `initial_outcome_hash`, `source_sequence`,
`transaction_sequence`, `deadline`, `unsigned_xdr`, and `transaction_hash`.
Only an exact returned database42501 `unauthorized_admin_wallet` denial yields
`CustodyError("unauthorized_admin_wallet", 403)`. Other failures yield
`CustodyError("refund_candidate_unavailable", 503)`; thrown403 is not authority.

## Historical consistency, not spending permission

Accepted SDK planning revalidates initial history, held fees, original donor gross
and current observed ownership. Captured032 payloads are SDK-validated, but their
`outcome_hash` is an opaque database identifier, not an SDK-recomputed JSONB digest.
Original authorizer and expired maxTime survive unchanged. Reads are not an atomic
fresh financial snapshot. The historical loader does not sign, fund, write,
release or rearm anything. Its implementation remains unchanged.

## Ensure only after validated absence

`ensureRecoveryRefundCandidate(client, scope, construction)` is an additive source
API. It snapshots and validates scope/construction before the first await, then
uses the historical loader. Existing validated history is returned without
replacing original bytes, deadlines or authorizer with new construction facts.
Only validated absence can enter the accepted planner and request one034 save.

There is no retry or readback after that potentially committed save. A lost or
malformed response is unavailable, not absence or permission to create again.
Only exact returned database denial yields403; a helper-thrown403 is sanitized.
An identical receipt owned by another legitimate actor can be returned without
changing its immutable history. A receipt is not fresh eligibility or authority
to sign or submit. Host wiring, fresh financial guards and real034 proof remain
separate. New public API test definitions are present but **unexecuted**; this
source incorporation invokes no RPC, SDK transaction or SQL.
