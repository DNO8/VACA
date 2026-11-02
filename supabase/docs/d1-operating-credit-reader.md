# Revalidate the complete recorded operating-credit set

`readOperatingCredits(client, namespace, authenticatedAdmin, pool)` reads the026
receipt set and returns its captured `state`, original `receipts` and decimal
`observedCreditStroops`. These are revalidated historical observations, **not a
fresh approval, a spending reservation or proof of sufficient operating funds**.

## Read path

1. Load accepted current-admin discovery state. Require the expected pool and
   explicit complete coverage at a saved checkpoint.
2. Load026 credit state: exact namespace/network/pool, bounded receipt count,
   canonical SHA-256 membership identity, and the same discovery state.
3. Enumerate exclusive numeric operation-ID pages. Require identical full credit
   state on every page, ordered unique IDs, matching cursor and exact total count.
4. For every listed receipt, call the accepted `OperatingCreditDatabase.load`
   historical validator. It redecodes raw SDK/native `D1OPS` evidence and validates
   the amount and original authorizer. Require the point lookup and listed full
   receipt to match structurally; never require today's funders/provider on replay.
5. Bound the operation ledger/ID and original observation anchor by captured active
   coverage. Sum exact positive signed-int64 stroops; reject overflow.
6. Reload026 state under current authorization. Require it to be identical before
   returning anything. State/authorization drift rejects without retry.

## Bounds and failure

At most 1,000 receipts, 100 per query, a 1 MiB traversal budget per response and
8 MiB total original receipt JSON. Existing point lookup keeps its stricter
historical receipt bound. Over-limit evidence rejects, never truncates. Zero is
returned only for an explicitly empty, stable set under complete discovery.

Only discovery-state, credit-state, receipt-list and receipt-load RPCs are used.
No writes, provider calls, signing, automatic retries or ownership transitions
occur. Unknown failures are sanitized `operating_credit_unavailable` 503;
current-admin denial remains `unauthorized_admin_wallet` 403.

## Integration limits

026's hash identifies stored full receipt membership; it is not independently
recomputed as a chain commitment. Historical SDK consistency is not consensus,
signature verification or current financial authority. Original authorizers are
not replaced by the current reader.

Creation eligibility, full donor liabilities, actual pool-paid fees, durable
future commitments, freshness and owner-bound authorization remain separate gates.
A final stable read does not lock the account for later spending. No live or
full-D1 acceptance follows from this module. See
[receipt query](d1-operating-credit-query.md),
[journal](d1-operating-credit-journal.md) and [budget](d1-operating-budget.md).
