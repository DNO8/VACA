# Initial issuance outcome consistency

`parseInitialIssuanceOutcome(pool, savedSignedXdr, input)` is a **pure decoder**.
It does not submit transactions, read a database, prove consensus or authorize
release, refund, retry, signing or ownership changes. No runtime is mounted.

## Required boundary

A future backend consumer must load and validate the actual018/030 signed
journal internally, then provide those exact bytes and the configured pool.
Caller HTTP XDR, a result DTO or this returned object is never authority.
The expected envelope must be canonical ordinary-v1 Testnet, contain exactly
one create-claimable-balance operation sourced by the pool, and carry exactly
one valid pool signature with its correct hint.

The unchanged `parseIncludedTransaction` validates bounded detached JSON,
canonical envelope/result XDR, Testnet hash, actual charged fee versus bid,
source/sequence/fee payer, operation/result status, TOID and ledger/anchor DTO
consistency. Both the configured pool and the **complete signed envelope**
must match. These checks do not establish ledger ancestry or external truth.

## Result and errors

- `kind: "d1_initial_issuance_outcome"`, `revision: 1`.
- `observation` retains the validated included transaction and its raw records.
- `outcome: "success"`: `claimableBalanceId` is the result's canonical XDR hex
  ID, verified against SDK `Transaction.getClaimableBalanceId(0)`. This uses
  transaction source, sequence and operation index—not transaction hash alone.
- `outcome: "failed"`: `claimableBalanceId: null`. Actual charged fee and
  consumed sequence remain recorded. This alone does not settle liabilities.

The detached result is deeply frozen. Every invalid or unknown input yields
`initial_issuance_outcome_unavailable`503 without internal details. Missing
records, transport errors, timeout,404 and nonincluded result codes are **not**
failed issuance evidence and cannot cause automatic reads, retry or release.

This unit neither persists a request-to-CB mapping nor supplies authenticated
HTTP, submission, reconciliation, terminal accounting or live acceptance.
