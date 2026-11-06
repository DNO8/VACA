# Initial issuance HTTP: pending, SDK outcome, and optional presence

The optional backend route first checks the existing outcome journal. A validated historical outcome returns **200 / persisted_sdk_observation**; valid absence continues through the existing submission SDK gate and returns **202 / pending / unverified**. Explicit optional current-presence observation is described below. None of these responses is consensus, settlement, or permission to refund, retry, reset, or release ownership.

## Request and configuration

`POST /functions/v1/d1-custody/issue` uses the unchanged [wallet-proof parser](../functions/d1-custody/issuance-command.ts): canonical signed `issue` action, empty `payload`, trusted Testnet pool and namespace, request ID, timestamp, wallet, and signature. The proof is verified before any RPC, account source, signer, or transport call.

Configure `createCustodyHandler` with optional `issuance: { client, configuration, fetcher }`:

- `client` is the existing submission SDK RPC client; current database admin membership is authoritative, not dependency injection.
- `configuration` is `InitialSignerConfiguration` without `requestId` or `authenticatedAdmin`, with an explicitly required `source.readAccountAtCheckpoint` and controlled `loadPoolSigner`. Its pool must match the handler's public pool identity.
- `fetcher` is explicitly required; this HTTP adapter never selects a default network transport.
- Optional `availabilityFetcher?: typeof fetch` is a separate server-owned low-level transport, not an authorization/result callback. Configure it alongside `fetcher`; omission preserves the exact legacy response and performs no availability reads.

Each call derives a new configuration bound to the verified request ID and wallet. It does not mutate shared configuration or accept caller XDR, account facts, destinations, amounts, or authorization-result callbacks.

## Prerequisites and response

Existing preparation, immutable intent, sequence reservation, 018 unsigned journal, 027 fee commitment, complete financial histories, and verified operating-credit evidence remain prerequisites. This route does not create them or relax the financial gate.

After proof and trusted-dependency checks, the adapter loads 032 once with the verified request ID and wallet. Its exact seven-field scope and bounded descriptor-first JSON snapshot must validate; malformed, oversized, cyclic, getter-bearing, wrong-scope or error replies never fall back to submission. Only a valid `outcome: null` calls `submitInitialIssuance` directly. That SDK checks 031 first: a validated historical attempt does not access the account source, signer, or transport. Fresh execution signs through the financial gate and only the winning durable claim submits once.

Both absent-outcome submission branches return HTTP **202**, `Cache-Control: no-store`, and only:

```json
{"state":"pending","verification":"unverified","requestId":"<verified request ID>","transactionHash":"<SDK-validated transaction hash>"}
```

## Historical outcome and selected mapping

For an existing receipt, `recordInitialIssuanceOutcome` revalidates cached 032 against actual 031/030/018 and financial-observation loads. The wrapper forbids every write, current-history query, ingestion and provider action. It captures 018 separately from the SDK input and requires repeated captures to agree. Only after SDK success does it select the saved preparation mapping:

```json
{"state":"issuance_observed","verification":"persisted_sdk_observation","requestId":"<verified request ID>","transactionHash":"<validated issuance hash>","donor":"<original donor>","beneficiary":"<beneficiary>","asset":{"type":"native"},"amount":"1.0000000","paymentTransactionHash":"<saved payment hash>","deadline":"<saved deadline>","claimableBalanceId":"<SDK-derived ID>"}
```

Included failure returns **200** with `state: "issuance_failed_observed"` and the same selected mapping, but **omits** `claimableBalanceId`. Issued assets retain their validated code and issuer. Every response uses `Cache-Control: no-store`.

The canonical 64-hex payment hash is persisted metadata, not newly verified donation-chain proof. This selected mapping is not a full liability calculation, current CB/refund status or terminal accounting. Historical SDK validation does not use the financial clock, account source, signer or fetcher; no automatic outcome save or readback occurs.

## Optional current indexer presence

Only after canonical proof, current database admin membership, and cached 032 plus historical 031/030/018 SDK validation succeed may an included **success** use `availabilityFetcher`. The adapter constructs the concrete `HorizonDiscoverySource`; it never falls back to global fetch. Failed issuance, pending/fresh paths, invalid proof, revoked admin, and corrupt stored evidence perform no availability reads.

The reader captures only the internally validated mapping and trusted configuration clock/policy. It performs four fixed-Testnet GETs: root → latest header → `/claimable_balances/<SDK-derived ID>` → latest header. Root network/latest sequence and both headers must agree; the head cannot precede included issuance. Canonical positive 32-bit resource ledger numbers/strings are normalized. The head must remain within configured `maximumAgeSeconds` (positive, at most 30) and `futureToleranceSeconds` (0–2) at both freshness checks; the old financial snapshot anchor is not current evidence.

Presence requires the exact v0 ID, native or issued asset, full saved amount, and exactly the beneficiary-before-deadline and pool-NOT-before-deadline claimants. Predicates must match the immutable canonical RFC3339 deadline without extra branches; optional epoch metadata must agree. The unchanged transport enforces fixed origin, no redirects/credential forwarding, 1 MiB, and a 10-second whole-fetch/body deadline per GET.

Success preserves every outer field and appends only:

```json
{"availability":{"verification":"current_indexer_observation","state":"present","claimableBalanceId":"<SDK-derived ID>","observedLedger":12,"ledgerHash":"<current header hash>","observedClosedAt":1793102406}}
```

This is positive indexer presence, **not beneficiary eligibility, consensus, settlement, or disposition authority**. A 404, timeout, malformed/oversized response, wrong network, stale/future head or drift returns sanitized **503 `initial_submission_unavailable`** and stops: no retry, RPC readback/save, submission fallback, ownership release, claim/refund inference, or compensation.

Local flow: **prepare → issue → explicit reconcile → issue + positive presence**. Reconciliation may need multiple separately authenticated calls. Beneficiary claim, authorized recovery/full original-donor refund, terminal accounting, production runtime and clients remain pending; this flow is not live-chain evidence.

## Errors

| Error | HTTP response |
|---|---|
| Invalid request / invalid or stale proof | 400 / 401 with the existing parser error code |
| Exact null-data database `42501` / `unauthorized_admin_wallet` denial | 403 `unauthorized_admin_wallet` |
| Unknown write, RPC, transport, corrupt receipt, or dependency failure | 503 `initial_submission_unavailable` |

Thrown dependency errors, including a forged 403, remain sanitized 503. Responses never expose XDR, signing keys, financial snapshots, provider JSON, or arbitrary exception text. Unknown outcomes trigger no automatic retry, readback, ingestion, outcome save, ownership reset, or release. A later explicit authenticated request can load the retained attempt without resubmitting.

## Explicit reconciliation

`POST /functions/v1/d1-custody/reconcile` requires the same canonical envelope with signed action `reconcile` and empty `payload`. Issue and reconciliation proofs are not interchangeable. Configure optional `reconciliation: { client, configuration: { namespace, pool, now, source } }`; both `source.readPage` and `source.readTransactionPageAtCheckpoint` must be explicitly supplied. No default source or transport is selected, and the configured pool must match the handler's public identity.

After proof verification, the route requires SDK-valid historical 031/030/018/financial evidence through a load-only gate: fresh clock, key, account and action paths are disabled. Missing or corrupt attempts cannot create, sign, claim or submit. It then loads 032 once. An existing outcome is revalidated through the accepted SDK using cached 032 and historical loads only, without source calls or writes.

For valid absence, one discovery page is awaited. Incomplete discovery returns **202** with `{"state":"reconciliation_progress","requestId":"<verified ID>","transactionHash":"<validated hash>","stage":"discovery"}`. Complete discovery permits one transaction page at the newly saved income anchor; a nonempty page returns the same response with `stage: "transactions"`. Only an acknowledged empty, complete transaction page permits the SDK history reader and one outcome save. No page-fetch loops or automatic follow-up calls are added.

A validated existing or newly saved outcome returns **200** with only `{"state":"issuance_outcome_recorded","requestId":"<verified ID>","transactionHash":"<validated hash>","outcome":"success"}`; included failure uses `outcome: "failed"`. All responses use `Cache-Control: no-store`. Use the existing issue endpoint for the selected donor/deadline/CB mapping; reconciliation does not duplicate it.

Invalid requests and invalid/stale proofs retain 400/401 parser errors. Exact null-data database `42501` / `unauthorized_admin_wallet` denial returns 403; unknown, missing or malformed evidence and dependency failures return 503 `issuance_reconciliation_unavailable`. Neither missing transactions nor timeouts mean included failure. Unknown 019/024/032 saves stop that call without retry, readback or compensation, even if the write committed. Another explicit call may refresh discovery while retaining the old transaction cursor and records; head/state drift fails closed without automatic reanchoring.

Reconciliation never grants current CB availability, settlement, refund, retry or ownership-release authority and never automatically follows submission. Gross debt, financial gates and immutable execution receipts remain unchanged.

## Local boundary

Without optional dependencies, existing route/method, prepare, and config behavior remains unchanged. The production public-only `index.ts` is unchanged: no private provider is activated or deployment authorized. These local mocks are not live Stellar transaction evidence.

No outcome is inferred from provider acknowledgements. Mounted production runtime, terminal fee/principal/sequence accounting, ownership retirement, refunds and client integration remain separate work; local fixtures are not deployed or live transaction evidence.
