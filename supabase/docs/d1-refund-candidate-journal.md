# Read-only refund candidate history

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
fresh financial snapshot. No signing, funding, write, release or rearming occurs.
UnitB/save coordination is not present; real034 integration proof remains pending.
