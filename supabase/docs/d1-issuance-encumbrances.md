# Original principal after initial issuance

`calculateIssuanceEncumbrances(input)` is a pure SDK consistency projection. It
separates issued principal from the unissued remainder **without reducing the
original donor obligation**. It does not authorize spending, signing, source
handoff, beneficiary settlement, recovery or refunds.

## Inputs and validation

Provide the existing original-obligation inputs plus `issuances`, at most1000
entries containing `{ unsignedJournal, outcomeReceipt }`. These must come from
trusted internal018 and accepted T4h loaders, not HTTP caller facts or a
`verified` flag. The function authenticates no wallet and performs no RPC.

The unchanged original-obligations calculator first validates incoming principal,
operating-credit exclusions, history consistency and quarantined activity.
For each issuance, the new projection checks:

- Exact018 reservation/intent/preparation and032 receipt shapes and scope.
- The actual original payment operation/hash, donor, asset, amount, ledger and
  confirmation time; team credits cannot become original donations.
- The original confirmation-based300s deadline, beneficiary and exact saved
  unsigned transaction, using the unchanged historical unsigned SDK validator.
- A matching history transaction with the same ordinary signed body, pool
  signature and envelope hash, redecoded by the existing outcome parser.
- The SDK-derived successful CB ID, or null for an included failed issuance.
- Unique request/attempt/transaction/CB identifiers and aggregate successful
  issuance no greater than the original donation's amount.

Inputs are bounded to8MiB, snapshotted without invoking getters, never mutated;
results are detached and deeply frozen. Invalid or contradictory evidence yields
sanitized `issuance_encumbrances_unavailable`503, not partial accounting.

## Outputs and limits

`original` preserves the complete old gross-principal result, including its
original quarantine. `donations` adds `issuedStroops` and `unissuedStroops`.
`encumbrances` maps successful issuance to the original donor/payment, beneficiary,
asset, amount, deadline, transaction and CB ID. `failedIssuances` retains actual
included fee/sequence evidence but creates no encumbrance. `unmatchedActivity`
removes only exact successful mapped CB creation from the old quarantine.

An encumbrance does not prove the CB currently exists or remains unclaimed, nor
that a beneficiary or donor has received funds. Fees are not subtracted from
principal; complete history remains the authority for the existing cumulative
fee sum. The opaque JSONB outcome hash is an identifier, not an SDK-generated
cryptographic database attestation. The initial financial gate is unchanged and
still rejects post-issuance activity. Durable terminal states, reserve/commitment
reconciliation, source succession, runtime and complete refund journeys remain
separate integration work; unknown outcomes never permit retry or release.
