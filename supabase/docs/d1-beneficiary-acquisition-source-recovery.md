# Beneficiary acquisition: canonical source recovered, verification outstanding

Four missing modules were exclusive-created from immutable Git blobs for T2z (S5, S6, S11, S15, S18–S19). This is source recovery only, not functional/security approval, SQL proof, settled principal, or permission to spend. Human-reported peer/subagent inactivity permitted reassignment; it was not a runtime finding.

## Provenance and review path

Source repository (read-only): `/home/danilo/worktrees/vaca-d1-wsl-baseline`.
Canonical commit: `954f1e3e4e87818f255c36287e167d23eb6332e3`.
Each destination below is under `supabase/functions/d1-custody/`; bytes came directly from `git show <commit>:<path>` through exclusive-create redirection, without text conversion, mutable-file copying or overlays.

| File | Canonical blob |
|---|---|
| `beneficiary-transaction-source.ts` | `bb350070c53230108ca65ad283596cb976419cbf` |
| `beneficiary-claim-observation.ts` | `90c8ad3573e21484cb3d33a15743cfadf4cf7241` |
| `beneficiary-claim-acquisition.ts` | `d6a0c71ea60a0dfe16a4e7e4e75462d3b93e8ee1` |
| `beneficiary-claim-journal.ts` | `4b1cb60ce27f84518e0dec5df7a3bd218bf957af` |

Review the evidence boundary first, then acquisition bounds and journal replay. Parent owns packaging in approximately 400-line slices and later selector/executor composition. No host, route, selector, executor, donor UI or manual command was changed.

## Actual exports for later composition

The common scope is `{ namespace, pool, requestId, authenticatedAdmin }`. The client supplies the existing `rpc` interface; these values must come from trusted server composition, not a caller-provided approval DTO. `now()` returns integer epoch seconds.

| Module / export | Source contract |
|---|---|
| `HorizonBeneficiaryTransactionSource(fetcher = globalThis.fetch)` | Inert constructor; `readTransactionPageAtCheckpoint(context, fromCursor)` returns `Promise<BeneficiaryTransactionPage>`. Exports `BeneficiaryTransactionContext` (`pool`, `beneficiary`, `firstLedger`, `checkpoint`) and `BeneficiaryTransactionPage`. Account involvement is not a positive claim. |
| `parseBeneficiaryClaim(provenance, rawInput)` | Pure SDK consistency; exports `BeneficiaryClaimProvenance` with `namespace`, `pool`, `firstLedger`, `anchor`, `transactions`, `unsignedJournal`, `outcomeReceipt`. Supplied provenance is NOT authenticated. Returns a positive claim including original gross, claimed principal, gross less this claim, fee fields and parsed observation. |
| `observeBeneficiaryClaim(client, configuration, rawInput)` | Authenticates saved original/issuance membership via existing read RPCs and validates supplied inclusion; returns `positiveAcquisition: "not_wired"`, not acquired-provider evidence. |
| `acquireBeneficiaryClaim(client, configuration, { now, fetcher })` | Internally derives beneficiary/CB from saved lifecycle, uses the pinned account-history source, rechecks membership, returns `d1_beneficiary_claim_acquisition`. No supplied original, raw claim, source object or approval argument. |
| `loadBeneficiaryClaim(client, scope, { now })` | Returns `Promise<Readonly<BeneficiaryClaimReceipt> \| null>`; null is missing039 membership, not zero claimed or unclaimed eligibility. |
| `recordBeneficiaryClaim(client, scope, { now, fetcher })` | Returns `Promise<Readonly<BeneficiaryClaimReceipt>>`; acquires only when039 is absent, otherwise validates saved evidence. Receipt type is exported with scope, original actor, acquisition hash and acquisition payload. |

## Invariants visible in source, not execution-proven

- The source pins Testnet Horizon, ascending account transactions, saved checkpoint/head equality before and after each page, monotonic cursors and unique transaction hashes. Each GET has a 10-second deadline, 1 MiB body limit, bounded JSON depth, no redirects and omitted credentials.
- Acquisition captures RPC/clock/fetch capabilities and receivers before awaiting; read RPCs are allowlisted and scope-bound. It validates the entire page before selecting a positive claim, with at most five pages/500 records and a 30-second whole-work bound. Empty/exhausted/malformed history fails closed; absence is never negative claim evidence.
- SDK parsing binds the successful claim operation to the issued CB and beneficiary, after issuance and strictly before the original deadline. Existing original donor/gross/asset accounting and `confirmed_at + 300` seconds are retained through the unchanged lifecycle/accounting helpers; the arithmetic remainder is not spendable principal or settlement.
- The journal loads039 membership first. Existing membership uses no provider acquisition; absent read-only membership returns null. New recording performs one awaited `d1_record_beneficiary_claim` write, checks acknowledgement and readbacks, and validates against saved/current history. Unknown writes are not retried or reacquired. Stored PostgreSQL `jsonb::text` hashes and original actors are retained, not recomputed using JavaScript serialization.
- Acquisition explicitly carries `executionAuthority: false` and `settlementAuthority: false`. Authenticated saved membership plus pinned indexer/SDK consistency is not consensus, SQL semantic proof, a lane decision, signing authority or permission to spend.
- Errors are `beneficiary_transaction_observation_unavailable`, `beneficiary_claim_observation_unavailable`, `beneficiary_claim_acquisition_unavailable` and `beneficiary_claim_journal_unavailable` (503); the observation/acquisition/journal wrappers preserve recognized `unauthorized_admin_wallet` denials (403).

## Dependencies retained unchanged

- `refund-lifecycle-observation.ts`: `observeRefundLifecycle(client, scope, { now })`, including original accounting and ownership/history joins. `issuance-encumbrances.ts`: `calculateIssuanceEncumbrances`; `initial-issuance-outcome-journal.ts`: `recordInitialIssuanceOutcome`, used behind read-only capabilities here.
- `transaction-history-reader.ts`: `readTransactionHistory(client, namespace, authenticatedAdmin, pool)`; `transaction-observation.ts`: `parseIncludedTransaction(input)`; `transaction-ingestion.ts`: existing `TransactionHistoryDatabase(...).loadState()`. The journal reuses that state validator instead of inventing a stored-history shape.
- `beneficiary-claim-history-reader.ts`: existing `BeneficiaryClaimHistoryReader.read(input)` and `beneficiary-claim-projection.ts`: `projectBeneficiaryClaims(input)` / `BeneficiaryClaimProjection` remain untouched. They are the separate positive historical projection path, not direct imports of these canonical four modules and not substitutes for039 acquisition membership.
- Existing `handler.ts` (`CustodyError`), `discovery-source.ts` (`DiscoveryCheckpoint`) and `@stellar/stellar-sdk` remain the supporting contracts; no dependency versions changed.
- Existing039/040 and new057 scoped record admission remain source-only and unapplied. The journal uses `d1_load_beneficiary_claim` and `d1_record_beneficiary_claim`; read permission is not a write grant. Prior request/history/ownership RPC admission remains independently required. No principal was provisioned or permission granted. Disjoint041–047 recovery is owned by the separate SQL writer, not this change.

## Verification debt and next boundary

Self-review was limited to source reads and Git provenance/working-tree inspection. S15 prohibited tests, probes, typechecks, builds, SQL/runtime execution, caches/scratch, network calls, deployment and financial execution; none were performed. No RED/GREEN, functional, security, concurrency or differential evidence is claimed.

Risk item 2 remains open: evidence/capability security, trusted host identity, scoped RPC admission, malformed/stale/drifting evidence, provider bounds, journal replay/unknown-write behavior and exact dependency compatibility require later authorized verification. Parent still owns fence-first lane selection, genuine remainder execution, bounded page processing and private host composition. No missing evidence authorizes a fallback lane; S5/S11 end-to-end behavior and security acceptance remain unsatisfied by this source-only recovery.
