# Remainder execution source recovered; integration and proof remain open

T2aa restores fifteen canonical TypeScript modules, not an automatic executor or host mount. Status: **partial / unverified**. This source-only unit supports S5–S7, S11, S15 and S18–S19; scoped service admission, executor extraction and integrated behavior remain outstanding.

## Provenance and review path

- Source: immutable Git objects at `954f1e3e4e87818f255c36287e167d23eb6332e3`, read through `/home/danilo/worktrees/vaca-d1-wsl-baseline`.
- Recovery fetched each exact `commit:path` with `git show`, retained bytes in memory, then wrote destinations with binary exclusive-create (`xb`). All fifteen destinations and this guide were checked absent before recovery; existing files were not overlaid.
- Only the modules below and this new guide were written. Parent dependencies, manual/full-gross/donor/status composition, migrations and the read-only source checkout were not edited. No canonical source adaptations were made.
- Read `remainder-http.ts` first, then its command boundary and the candidate → financial → signing → submission → outcome chain. References below are source observations, **not** functional or security findings.

## Six source packaging slices

All module paths below are relative to `supabase/functions/d1-custody/`. Counts describe copied source, not executed checks. Packaging belongs to the parent; this unit stages or commits nothing.

| Slice | Exact files | Source lines |
| --- | --- | ---: |
| 1 | `remainder-accounting.ts`, `remainder-funding-observation.ts` | 454 |
| 2 | `remainder-candidate-journal.ts`, `remainder-financial-observation.ts` | 548 |
| 3 | `remainder-authorized-signer.ts`, `remainder-submission-authorization.ts` | 483 |
| 4 | `remainder-submission.ts`, `remainder-outcome.ts`, `remainder-outcome-observation.ts` | 490 |
| 5 | `remainder-outcome-journal.ts`, `remainder-lifecycle-observation.ts` | 455 |
| 6 | `remainder-http-contract.ts`, `remainder-command.ts`, `remainder-http.ts`, `remainder-runtime.ts` | 471 |

Total: 2,901 canonical source lines. This guide is additional documentation, suitable for slice 6. These are packaging groups, not independently executable dependency-closed bundles.

## Actual factory and helper contracts for T2ab

There is **no `createRemainderExecutor` export** in this recovery. Execution and reconciliation currently live inside `createRemainderHttpHandler` (`remainder-http.ts:93`). Extract that genuine coordinator later; do not fabricate a `VerifiedRemainderCommand` to call the manual path.

- `createRemainderHttpHandler(dependencies: RemainderHttpDependencies): (request: Request) => Promise<Response>`. Required: `client` (the lifecycle helper's RPC client), `configuration: { pool, namespace, now }`. Optional: `source` exposing `readPage`, `readTransactionPageAtCheckpoint`, `readAccountAtCheckpoint`; `financial: { maximumAgeSeconds, futureToleranceSeconds, loadPoolSigner }`; `construction: { feePerOperationStroops, validUntil }`; `fetcher: typeof fetch`. Capabilities/settings and original receivers are captured before request awaits.
- `verifyRemainderCommand(request, configuration): Promise<VerifiedRemainderCommand>` (`remainder-command.ts:69`) is the actual manual Ed25519 proof boundary. The returned command has `kind`, `revision: 2`, `action` and scope. Downstream scope is **only** `{ namespace, pool, requestId, authenticatedAdmin }`; proof is not a database role grant. Keep exact routes, envelope, 8,192-byte body bound, 60-second skew, status/error mapping and no-store responses.
- `createRemainderRuntime({ remainder: RemainderHttpDependencies, custodyHandler: CustodyHandler }): CustodyHandler` (`remainder-runtime.ts:10`) is an inert wrapper, not a host mount. It routes only the three exact remainder paths and forwards other requests to the existing handler unchanged.

The following helpers take `(client, scope, options)` unless noted. Historical read options are `{ now: () => number }`.

| Source entry | Actual contract / extraction constraint |
| --- | --- |
| `remainder-accounting.ts:82,168` | `readAuthenticBeneficiaryClaimSet(client, Omit<scope, "requestId">, { now })` returns complete authenticated membership; `calculateCumulativeRemainders({ originals, claims, refunds })` is pure evidence accounting, not authority. |
| `remainder-funding-observation.ts:77` | `observeCurrentRemainderFunding(client, scope, RemainderFundingOptions)`; options are `{ source: { readAccountAtCheckpoint }, now, maximumAgeSeconds, futureToleranceSeconds }`. Policy bounds are 1–30 seconds and 0–2 seconds. Current source requires exactly one claim and one successful issuance encumbrance; do not imply general multi-claim execution support. |
| `remainder-candidate-journal.ts:267,272` | `loadRemainderCandidate(..., { now })` returns receipt or null; `ensureRemainderCandidate(..., { funding, feePerOperationStroops, validUntil })` returns a receipt using actual internal funding only on absent041. |
| `remainder-financial-observation.ts:96` | `observeAndSaveRemainderFinancialEvidence(..., RemainderFundingOptions)` returns `Readonly<RemainderFinancialReceipt>`; does not create a candidate. |
| `remainder-authorized-signer.ts:189,196` | `readRemainderSigningJournal(..., { now })`; `signAndSaveAuthorizedRemainder(..., { observation: RemainderFundingOptions, loadPoolSigner: (pool: string) => unknown })` returns signed receipt. The loader must produce the genuine matching signing Keypair; historical journals are not fresh permits. |
| `remainder-submission-authorization.ts:96` | `authorizeRemainderSubmission<T>(client, scope, signerConfiguration, sendCallback)` returns `Promise<RemainderSubmissionResult<T>>`: `invoked: false` with historical attempt, or `invoked: true` with attempt and callback value. Callback receives `{ signedXdr, transactionHash, attempt }`; it is not a reusable permission token. |
| `remainder-submission.ts:15` | `submitRemainder(client, scope, signerConfiguration, fetcher = fetch)` composes optional first signing, fresh evidence and one concrete Testnet POST through that authorization helper. Do not separately invoke signing in the coordinator. ACK remains `verification: "unverified"`. |
| `remainder-outcome.ts:94` | `parseRemainderOutcome(candidate, originalPayment, savedSignedXdr, includedTransactionInput)` is pure SDK consistency, not authenticated membership or settlement. |
| `remainder-outcome-observation.ts:177,186` | `readRemainderSubmissionState(..., { now })` returns private journal/attempt/evidence; `observeSavedRemainderOutcome(..., { now })` returns positive inclusion observation or null. Never serialize private state to HTTP. |
| `remainder-outcome-journal.ts:197,202` | `loadRemainderOutcome` and `observeAndSaveRemainderOutcome`, both with `{ now }`, return receipt or null; only the latter may write047. |
| `remainder-lifecycle-observation.ts:81` | `observeRemainderLifecycle(..., { now })` returns private observation with `.response: RemainderHttpResponse`; DB-only status composition, no ingestion/provider/key/financial write. |

## Invariants to carry into the genuine extraction

- Retain per-phase RPC allowlists, selected-request writes, namespace/actor binding, and necessary other-donor **reads** for full claim-set validation. Only captured real RPC denial establishes the public unauthorized response. Preserve the manual018 preflight and separate future service authorization; no broad administrator substitution.
- Retain positive039 acquisition, SDK exact one-payment reconstruction, gross = claimed + remaining, protected other-donor principal, operating-credit/fee/reserve accounting, PostgreSQL JSONB hash bindings and complete history membership. Absence is unknown, not zero or eligibility.
- Retain permanent040 lane binding through041, v1 exclusion,045 signing ownership and046 submission ownership. Orphan signing claims and existing attempts do not permit re-signing, resend, release, timeout reset or lane fallback. A positive046 acknowledgement and read-back precede transport; ambiguous writes/POSTs do not trigger automatic retry/read-back.
- Reconciliation ingests at most one discovery page and one history page, then uses fresh helper instances. Only qualified047 inclusion feeds observed refund/settlement projection; transport ACK is not inclusion and pure accounting is not authority.

## Verification debt and next step

S15 prohibits tests, probes, typechecks, builds, SQL/runtime execution, cache/scratch preparation, network, deployment and funds. None were performed. Recovery used Git-object reads/copying plus source self-review; no independent review or functional/security verdict is claimed. Compatibility with existing parent dependencies and service-admission migrations is unexecuted.

**Risk item 2 (security):** preserve manual proof and least-authority RPC boundaries; trusted service identity/admission and hostile-input behavior require later authorized proof. **Risk item 4 (durable ownership):** lane fencing, concurrent claims, replay, revocation locks and uncertain outcomes require later authorized database/concurrency proof.

Parent next: T2ab genuine shared-executor refactor without synthetic verified commands; coordinate independent058 SQL ownership separately, then authoritative lane selection and private host composition. Neither this recovery nor later source-only work grants activation or financial acceptance.
