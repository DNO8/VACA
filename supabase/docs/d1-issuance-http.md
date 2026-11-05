# Initial issuance HTTP returns pending, not chain confirmation

The optional backend route submits an already-prepared initial issuance through the existing SDK gate. Both a transport acknowledgement and a previously recorded submission attempt return **pending / unverified**. Neither proves current chain status, inclusion, success, failure, or permission to refund, retry, reset, or release ownership.

## Request and configuration

`POST /functions/v1/d1-custody/issue` uses the unchanged [wallet-proof parser](../functions/d1-custody/issuance-command.ts): canonical signed `issue` action, empty `payload`, trusted Testnet pool and namespace, request ID, timestamp, wallet, and signature. The proof is verified before any RPC, account source, signer, or transport call.

Configure `createCustodyHandler` with optional `issuance: { client, configuration, fetcher }`:

- `client` is the existing submission SDK RPC client; current database admin membership is authoritative, not dependency injection.
- `configuration` is `InitialSignerConfiguration` without `requestId` or `authenticatedAdmin`, with an explicitly required `source.readAccountAtCheckpoint` and controlled `loadPoolSigner`. Its pool must match the handler's public pool identity.
- `fetcher` is explicitly required; this HTTP adapter never selects a default network transport.

Each call derives a new configuration bound to the verified request ID and wallet. It does not mutate shared configuration or accept caller XDR, account facts, destinations, amounts, or authorization-result callbacks.

## Prerequisites and response

Existing preparation, immutable intent, sequence reservation, 018 unsigned journal, 027 fee commitment, complete financial histories, and verified operating-credit evidence remain prerequisites. This route does not create them or relax the financial gate.

The adapter calls `submitInitialIssuance` directly. The SDK checks 031 first: a validated historical attempt does not access the account source, signer, or transport. Fresh execution signs through the financial gate and only the winning durable claim submits once.

Both branches return HTTP **202**, `Cache-Control: no-store`, and only:

```json
{"state":"pending","verification":"unverified","requestId":"<verified request ID>","transactionHash":"<SDK-validated transaction hash>"}
```

| Error | HTTP response |
|---|---|
| Invalid request / invalid or stale proof | 400 / 401 with the existing parser error code |
| Exact current-admin database denial | 403 `unauthorized_admin_wallet` |
| Unknown write, RPC, transport, corrupt receipt, or dependency failure | 503 `initial_submission_unavailable` |

Responses never expose XDR, signing keys, financial snapshots, provider JSON, or arbitrary exception text. Unknown outcomes trigger no automatic retry, readback, ingestion, outcome save, ownership reset, or release. A later explicit authenticated request can load the retained attempt without resubmitting.

## Local boundary and next unit

Without optional dependencies, existing route/method, prepare, and config behavior remains unchanged. The production public-only `index.ts` is unchanged: no private provider is activated or deployment authorized. These local mocks are not live Stellar transaction evidence.

T4l adds read-only 032 SDK outcome validation and selected original-donor/deadline/claimable-balance mapping with observed success/failure responses. This submission unit neither looks up 032 nor infers an outcome from provider acknowledgements.
