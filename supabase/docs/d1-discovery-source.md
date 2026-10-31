# Read-only Testnet discovery page source

`HorizonDiscoverySource(fetcher = globalThis.fetch).readPage({ pool, firstLedger,
checkpoint })` reads one bounded Horizon operation page. All three arguments are
trusted backend registry/checkpoint context, never public wallet assertions. The
checkpoint is null or exactly `{ cursor, through_ledger, ledger_hash, closed_at }`
from migration 019. `firstLedger` is activation metadata, not a history filter.

The result is `{ page, complete }`. The page has exactly migration 019's fields:
`revision: 1`, `from_cursor`, `to_cursor`, `through_ledger`, `ledger_hash`,
`closed_at`, and `records`. Ledger sequences are numeric uint32 values, hashes
are lowercase 64-character hex, close times are numeric UTC epoch seconds.
Only parsed records advance the cursor; empty pages retain the input cursor.

## Fixed-origin consistency checks

Every request uses GET, omitted credentials, redirect rejection and the fixed
`https://horizon-testnet.stellar.org` origin. There is no caller URL or link
following. In order, the source reads:

1. `/ledgers?limit=1&order=desc` to select one closed-ledger anchor.
2. `/` to verify `Networks.TESTNET` and retained history: elder no later than
   activation, latest no earlier than the anchor. Activation cannot be in the future.
3. `/ledgers/{saved sequence}` if the saved anchor predates the current anchor.
   Saved sequence/hash/time must match; regression, reset, pruned required history
   and non-increasing close time across advancing anchors are rejected. A current
   anchor at the saved sequence must itself match exactly.
4. `/accounts/{pool}/operations?order=asc&limit=50&include_failed=false&cursor={saved or 0}`.
   At most 50 canonical uint64 tokens must strictly increase from the input cursor.
   A record newer than the anchor invalidates the entire snapshot: no skip or retry.
5. `/transactions/{validated lowercase hash}` for each distinct transaction in the
   list, cached only within this call. Existing `parseDiscoveredOperation` checks
   successful DTO/XDR consistency and retains exact raw JSON facts.

Each HTTP fetch and its streamed body share a 10-second deadline with a cleared
timer and abort signal. Each body is bounded to 1 MiB before strict UTF-8/JSON
decoding. Non-200 status, transport, malformed data, parser contradictions and
 invalid context all produce only `CustodyError("dependency_unavailable", 503)`;
 upstream error text, bodies and addresses are not exposed. There is no retry.

## Evidence limits

Historical, missing/wrong-memo, issued and unsupported operations are not filtered
out. Parser classification and activation metadata do not authorize funding,
release or refund. `complete` is true **only for an actually empty trusted operation
list**, never a short nonempty page. It is observed-empty-page/indexer consistency
evidence, not independent chain proof, durable history coverage or readiness.

This unit has no database writes, coordinator/runtime wiring, signer, clock-based
funding decisions or RPC integration. Durable coverage and subsequent ingestion
remain dependent work. Fake-fetch tests use ephemeral SDK-generated XDR; they
prove no deployed behavior, live Testnet transaction or full D1 completion.
