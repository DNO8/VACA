# Initial issuance HTTP: pending or a persisted SDK observation

The optional backend route first checks the existing outcome journal. A validated historical outcome returns **200 / persisted_sdk_observation**; valid absence continues through the existing submission SDK gate and returns **202 / pending / unverified**. Neither response is fresh consensus, current claimable-balance availability, settlement, or permission to refund, retry, reset, or release ownership.

## Request and configuration

`POST /functions/v1/d1-custody/issue` uses the unchanged [wallet-proof parser](../functions/d1-custody/issuance-command.ts): canonical signed `issue` action, empty `payload`, trusted Testnet pool and namespace, request ID, timestamp, wallet, and signature. The proof is verified before any RPC, account source, signer, or transport call.

Configure `createCustodyHandler` with optional `issuance: { client, configuration, fetcher }`:

- `client` is the existing submission SDK RPC client; current database admin membership is authoritative, not dependency injection.
- `configuration` is `InitialSignerConfiguration` without `requestId` or `authenticatedAdmin`, with an explicitly required `source.readAccountAtCheckpoint` and controlled `loadPoolSigner`. Its pool must match the handler's public pool identity.
- `fetcher` is explicitly required; this HTTP adapter never selects a default network transport.

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

The canonical 64-hex payment hash is persisted metadata, not newly verified donation-chain proof. This selected mapping is not a full liability calculation, current CB/refund status or terminal accounting. Historical reads do not use the financial clock, account source, signer or fetcher; no automatic outcome save or readback occurs.

## Errors

| Error | HTTP response |
|---|---|
| Invalid request / invalid or stale proof | 400 / 401 with the existing parser error code |
| Exact null-data database `42501` / `unauthorized_admin_wallet` denial | 403 `unauthorized_admin_wallet` |
| Unknown write, RPC, transport, corrupt receipt, or dependency failure | 503 `initial_submission_unavailable` |

Thrown dependency errors, including a forged 403, remain sanitized 503. Responses never expose XDR, signing keys, financial snapshots, provider JSON, or arbitrary exception text. Unknown outcomes trigger no automatic retry, readback, ingestion, outcome save, ownership reset, or release. A later explicit authenticated request can load the retained attempt without resubmitting.

## Local boundary

Without optional dependencies, existing route/method, prepare, and config behavior remains unchanged. The production public-only `index.ts` is unchanged: no private provider is activated or deployment authorized. These local mocks are not live Stellar transaction evidence.

No outcome is inferred from provider acknowledgements. Mounted production runtime, terminal fee/principal/sequence accounting, ownership retirement, refunds and client integration remain separate work; local fixtures are not deployed or live transaction evidence.
