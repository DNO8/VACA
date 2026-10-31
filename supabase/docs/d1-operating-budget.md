# D1 operating budget — pure arithmetic only

`calculateOperatingBudget(input: OperatingBudgetInput): OperatingBudget` lives in
`functions/d1-custody/operating-budget.ts`. This T2a component implements the
ring-fencing arithmetic for S3–S5; it is not funding proof, readiness, release
permission, or completion of D1 (S1/S2/S6). It does not change the unsigned v1 planner.

## Normalized input contract

Every monetary field is a canonical nonnegative int64 **stroop string**:
`"0"` through `"9223372036854775807"`. No decimal amounts, leading zeros, signs,
whitespace, numbers, floating-point calculations, or rounding. `baseReserve`,
`baseFee`, transaction fees, and an issue's future refund fee must be positive.
Objects have exactly the documented own data fields, without extra fields or
custom prototypes. Account counts are uint32 integer numbers, not monetary values.

- `native`: current `balance`, `sellingLiabilities`, full `donorLiabilities`, and
  separately protected `excludedHistorical` amounts. The categories must not overlap.
- `issuedBalances`: entries with exact `code`, `issuer`, current `balance`, and
  `sellingLiabilities`. Codes are case-sensitive 1–12 ASCII alphanumeric characters;
  issuers are valid Stellar Ed25519 public account addresses.
- `issuedObligations`: entries with the same exact `code` and `issuer`, full
  `donorLiabilities`, and separate `excludedHistorical`. Both arrays must contain
  precisely the same asset set, without duplicates. Explicit zero obligations are
  required even for an otherwise unencumbered trustline. Missing assets are not zero.
- `approvedTeamCredits`: cumulative approved team native operating credits, NOT
  donation receipts or unidentified native inflows.
- `confirmedPoolFeesSpent`: cumulative fees actually spent by this pool, deducted
  from those credits (not fees merely planned or charged to another account).
- `otherFutureFees`: all other pending future-fee commitments. For a selected refund,
  the assembler must already exclude its released commitment, with later durable
  evidence. The calculator applies no additional release or refund discount.
- `baseReserve`, `baseFee`: current ledger values, never guessed constants.
- `account`: current `subentry_count`, `num_sponsoring`, `num_sponsored`.
- `action`: `{ kind: "issue", transactionFee, futureRefundFee }`,
  `{ kind: "issued_refund", transactionFee }`, or
  `{ kind: "unissued_refund", transactionFee }`. Fees are transaction totals.

## Rules and output

`currentMinimum = baseReserve * (2 + subentry_count + num_sponsoring - num_sponsored)`.
A negative multiplier is invalid; zero is allowed. A v1 issue adds **two** claimant
reserves (`2 * baseReserve`, CAP-0023), not one generic reserve. Issue and unissued
refund fees must cover at least one base fee; issued refunds must cover at least two.
Issue also commits at least two base fees for the eventual issued refund. Neither
refund adds a new claimant reserve or a new future-refund commitment.

`requiredOperating = currentMinimum + otherFutureFees + newClaimantReserve + transactionFee + newFutureRefundFee`.
`teamCap = approvedTeamCredits - confirmedPoolFeesSpent`.
`physicalCap = native.balance - sellingLiabilities - donorLiabilities - excludedHistorical`.
`availableOperating = min(teamCap, physicalCap)`. Availability must cover the full
requirement; equality passes and one stroop short fails. Each issued asset separately
must cover selling liabilities plus donor liabilities plus excluded historical funds.
Issued assets and donation growth never offset native operating requirements.

The result contains only the exact string breakdown: `currentMinimum`,
`otherFutureFees`, `newClaimantReserve`, `transactionFee`, `newFutureRefundFee`,
`requiredOperating`, `teamCap`, `physicalCap`, `availableOperating`, and
`remainingOperating` (availability minus requirement). Negative or int64-overflowing
monetary results, invalid inputs, or insufficient coverage throw only sanitized
`CustodyError("operating_funds_unavailable", 503)`. No input is mutated.

## Trust boundary and remaining work

The trusted backend must derive **all** inputs from complete anchored coverage,
verified team-credit provenance, fresh account/header observations, complete native
and issued donor/historical obligations, and durable fee commitments. Supplying
numbers through dependency injection does not prove funding or the absence of
unreported liabilities. This module has no clock, HTTP/RPC, SQL, signing, ledger
submission, or persistence. Runtime integration, commitment release accounting,
backend-only signing, original-donor refunds, and deployed/transaction evidence
remain separate work. Passing local tests is not public acceptance evidence.
