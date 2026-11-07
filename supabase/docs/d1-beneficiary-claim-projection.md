# Positive beneficiary-claim projection

`projectBeneficiaryClaims({ initial, claims })` is a pure Testnet SDK consistency projection.
`initial` is the raw input of `calculateIssuanceEncumbrances`, never a precomputed basis.
Each positive selection contains `requestId`, zero-based `operationIndex`, raw Horizon
`transaction`, and corresponding `ledger`. Supply 1–100 selections within bounded JSON.
The initial anchor must cover every selected observation.

The function revalidates issuance lineage, successful canonical claim XDR/result,
exact issuance-derived balance ID, effective beneficiary source, original deadline
and ledger/operation ordering. Inherited sources, explicit personal operation sources
and different selected balances in a multi-operation transaction are supported.
Wrong, missing, duplicate, expired or malformed evidence throws
`CustodyError("beneficiary_claim_projection_unavailable", 503)` without input disclosure.

The frozen output contains the unchanged accounting `basis` and positive `claims`.
A claim of 1 from a donation of 10 records only that issued 1; the original gross and
unissued 9 remain unchanged. Quarantine is not removed. This is NOT settlement,
refund eligibility, atomic freshness, permission to spend, or independent consensus.
Trusted reader provenance is required. No database, clock, signing or release API exists.

Retrieve positive candidates from Horizon claimable-balance history operations or
transactions, then validate canonical evidence. Do not assume pool-stream coverage.
Empty/pruned history, timeout or 404 never means unclaimed or permits ownership release.
