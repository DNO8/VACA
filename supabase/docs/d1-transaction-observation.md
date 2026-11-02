# Included Testnet transaction observations (T2g)

`parseIncludedTransaction({ transaction, ledger, context })` is a pure, bounded
consistency decoder using the pinned Stellar SDK. Backend-owned `context` contains
`pool` (ordinary G account), `firstLedger`, and `anchor: { sequence, hash, closedAt }`.
Inputs are snapshotted as strict JSON before use; no input references are returned.
No HTTP route, database write, signature verification or network request is added.

## Input and binding

Supply raw Horizon transaction and ledger records, including failed transactions.
Transaction fields required: `hash`, `ledger`, `created_at`, `source_account`,
`source_account_sequence`, `fee_account`, `fee_charged`, `max_fee`, `successful`,
`operation_count`, `paging_token`, `envelope_xdr`, `result_xdr`. Ledger fields:
`sequence`, `hash`, `closed_at`. Extra JSON metadata is retained, not authority.

Only ordinary v1 envelopes and classic operation types 0–23 are supported.
Fee-bumps, v0, muxed identities, Soroban/future operation semantics, noncanonical
base64/XDR, and ambiguous/nonincluded transaction results fail closed.
Canonical nonnegative int64 decimal stroops and positive int64 source sequences
are required. The transaction TOID is a canonical uint64 with positive transaction
position, zero operation offset, and the matching ledger. Ledger/time/hash must
match the supplied record and active range; at the anchor ledger, hash/time match
exactly. Earlier records are bounded by the anchor time, not proven ancestors.

## Output and safe use

`txSuccess` and `txFailed` yield `success` / `failed`, actual `feeChargedStroops`
from TransactionResult XDR, and the envelope source/consumed `sequence`.
Charged fees must equal the DTO and not exceed the envelope bid / DTO `max_fee`;
the bid is never substituted for actual fees. Result counts/types must agree;
success requires successful operation results, failure requires a failed operation.
Other result codes are rejected, never represented as zero-fee or owner release.

`feePayer` is the ordinary envelope source, even when it is not the pool.
`poolOperationSourceIndices` are zero-based effective source indices, including
overrides. A future assembler must freeze unexplained external pool activity;
other-payer fees must not become pool operating debits. `envelopeXdr` is neutral:
computed Testnet hash and record crosschecks do **not** authenticate signatures,
ledger execution, or chain consensus. Context and raw records are detached copies.

Every invalid/unsupported input throws sanitized `CustodyError` status **503**,
code/message **`transaction_observation_unavailable`**, without decoder details.
The combined JSON snapshot budget is 128 KiB with depth/node limits; no getters,
non-JSON values, sparse arrays or input mutation are accepted.

This is S1/S3–S6 local prerequisite evidence for T4, not T2 financial closure.
It proves neither complete Horizon coverage nor current freshness, credit approval,
signers, liabilities, commitments or spending readiness. A future fixed-origin
`include_failed` history reader and SQL fee journal must consume these observations;
the existing successful-income discovery parser and unsigned v1 remain unchanged.
No initial-sequence formula, journal, signing or external consensus claim is added.
