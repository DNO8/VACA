# D1 included-transaction page source (local T2h)

`HorizonDiscoverySource.readTransactionPageAtCheckpoint(context, transactionCursor)`
reads **one** bounded Testnet transaction page. This is read-only indexer consistency
and actual-fee evidence; it is not spending readiness, independent chain proof,
SQL persistence or durable history coverage.

## Backend inputs and pinned requests

Supply the backend pool, active `firstLedger`, and committed discovery checkpoint.
The transaction cursor is separate from `checkpoint.cursor` (an income-operation
TOID). It must be `"0"` or a canonical uint64 transaction TOID: positive ledger and
transaction position, zero operation offset, inside the active-to-anchor range.
Do not substitute an operation cursor, infer an initial sequence, or assume an
unknown historical baseline is zero. Context/cursor are captured before awaits;
invalid context/clone failures are sanitized.

The accepted current-account reader verifies Testnet/history retention, the pool
account configuration and the current head against the saved checkpoint first.
The new reader then requests only:

```text
https://horizon-testnet.stellar.org/accounts/{encodedPool}/transactions?order=asc&include_failed=true&limit=100&cursor={transactionCursor}
```

It uses the existing bounded GET/UTF-8/JSON transport (1 MiB, 10-second whole
request/body deadline, no redirects or credentials). Untrusted pagination hrefs
are ignored. There is no next-page fetch, arbitrary URL, retry or actual network
operation in the synthetic tests.

## Returned facts and fail-closed behavior

`TransactionPageObservation` contains `page`, `complete`, and the verified current
`account`. The page has revision 1, independent `from_cursor`/`to_cursor`, saved
anchor fields, and canonical `IncludedTransactionObservation` records. Every DTO
(up to 100) must be strictly numerically ascending beyond the input cursor, with
no duplicate, malformed TOID or record outside the active/saved ledger bounds.
TOID gaps do not establish missing records or continuity. No record is skipped.

Each distinct ledger header is fetched once per call. Every record is passed to
the accepted, unchanged `parseIncludedTransaction` decoder, binding its ordinary
v1 Testnet envelope/result, hash, sequence, actual charged fee, outcome, TOID and
creation time to that header and anchor. Success and included failure both count;
other-source fee payers remain other-source payers, even with pool operation
source overrides. No donation or operating-credit inference is made.

The final current head must still equal the saved anchor, including on an empty
page. Only a verified empty list returns `complete: true` and an unchanged cursor.
Every nonempty page returns `complete: false`, even below 100 records, with the
last validated transaction TOID as its next cursor. Any unsupported record,
contradiction, stale head, missing history or transport failure rejects the whole
call as `CustodyError("dependency_unavailable", 503)`, with no page/cursor result,
silent skip, write or retry.

Local tests use ephemeral keys and synthetic fetches only. Durable fee journals,
history coverage, historical liabilities, commitments and financial assembly
remain separate work; this reader does not complete T2 or D1 delivery.
