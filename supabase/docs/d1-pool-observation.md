# Current Testnet pool observation

`HorizonDiscoverySource.readAccountAtCheckpoint(context)` returns a typed
`PoolAccountObservation` for the future trusted operating-budget assembler.
`PoolObservationContext` is backend registry data: `{ pool, firstLedger,
checkpoint }`. It is not a wallet-supplied facts endpoint or URL. The checkpoint
is required and exactly migration 019's `{ cursor, through_ledger, ledger_hash,
closed_at }`: canonical uint64 token (ledger component no newer than the anchor),
positive uint32 ledger, lowercase 64-hex hash and integral UTC epoch seconds.
Activation is a positive uint32 no later than the checkpoint. Scalars are copied
before awaiting any request; caller data is never modified.

## Request and consistency contract

The existing transport performs fixed-origin Testnet GETs with omitted credentials,
redirect rejection, no link following, 1 MiB strict UTF-8/JSON bodies and a 10-second
whole-fetch/body deadline per request. Requests occur exactly in this order:

1. `/`: require Testnet passphrase, retained elder no later than activation and
   history latest **equal** to the saved checkpoint ledger.
2. Internally constructed `/accounts/{validated pool}`: require both `id` and
   `account_id` to match, canonical nonnegative int64 sequence and positive
   last-modified ledger no later than the checkpoint.
3. `/ledgers?limit=1&order=desc`: require exactly one header matching checkpoint
   sequence, hash and close time. A newer, older or reset head rejects the entire
   observation. It requires a later explicit rescan, not retrying this observation.

Every failure is sanitized to `CustodyError("dependency_unavailable", 503)`.
There is no automatic fetch retry, database operation, funding or signing.

## Normalized result

- `pool`, `networkPassphrase` (Testnet), `anchor: { sequence, hash, closedAt }`,
  `sequence` (account sequence string), and `lastModifiedLedger` identify the facts.
- `baseFee` and `baseReserve` are canonical positive stroop strings from current
  header `base_fee_in_stroops` / `base_reserve_in_stroops` numeric uint32 fields.
- `native: { balance, sellingLiabilities }` and
  `issuedBalances: [{ code, issuer, balance, sellingLiabilities }]` contain canonical
  nonnegative int64 stroop strings, converted via BigInt from exact seven-decimal
  Horizon amounts without floating-point arithmetic or rounding. Issued order is
  preserved. Buying liabilities are validated with the same bounds, not budgeted.
- `account: { subentry_count, num_sponsoring, num_sponsored }` contains nonnegative
  numeric uint32 counts, shaped for the existing pure budget calculator.

Exactly one native balance is required. Every other balance must be an authorized
credit_alphanum4/12 with matching alphanumeric code length and valid G issuer.
Asset identity fields must be exact for that type; duplicate code/issuer pairs,
unsupported liquidity-pool shares, missing/malformed amounts or liabilities,
negative values and overflows reject the observation rather than discard facts.

The account must have exactly one `ed25519_public_key` signer matching the pool,
with positive uint8 weight covering all three uint8 thresholds. Multisig and a
disabled master fail closed. This proves only **indexed account configuration**,
not absence of off-chain copies of the secret or backend runtime key ownership.

## Evidence limits

No ambient clock is used: the later assembler must check close-time freshness,
complete historical coverage, provenance, donor/historical liabilities and durable
fee commitments. No funded/readiness boolean is returned. This read-only indexer
consistency evidence neither activates the budget/signer nor independently proves
chain state. Fake-HTTP unit tests and preserved discovery tests are local evidence
only; they are not deployed, transaction or full-D1 acceptance evidence (S1–S6).
