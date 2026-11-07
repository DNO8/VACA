# Read-only initial-issuance status

`POST /functions/v1/d1-custody/status` is an optional backend-only lookup of a persisted initial-issuance outcome. It never submits, signs, reconciles, saves history, refunds or releases ownership. The production entrypoint is unchanged and does not activate this route.

## Compose without a private signer

Pass `status: { client, configuration: { namespace, pool, now } }` in the base configuration of `createCustodyHandler` or `createCustodyRuntime`. A public-only `poolSigner` is sufficient. No lifecycle signer, source or fetcher is required. Without this dependency the route returns the existing `404 not_found`.

## Authenticate every lookup

Use the same canonical Stellar Signed Message convention as issuance, but sign `action: "status"` and send to `/status`. The exact body fields are `version: 1`, `network: "TESTNET"`, `pool`, `namespace`, `action`, `request_id`, integer `timestamp`, empty `payload: {}`, `wallet` and base64 `signature`. Proof timestamps allow the existing ±60-second window; bodies retain the existing 8192-byte limit. Issuance and reconciliation signatures cannot authorize status, or vice versa. The database enforces current admin membership on reads; a wallet signature alone is not membership or durable permission.

## Interpret responses conservatively

- `200 outcome_not_recorded / unverified`: the authorized lookup returned no persisted outcome. This is **not** chain absence, pending submission, failure, unclaimed principal or permission to retry/refund/release.
- `200 issuance_observed / persisted_sdk_observation`: saved SDK-validated success, with request ID, transaction hash, original donor, beneficiary, asset, issued amount, payment transaction hash, original deadline and derived claimable-balance ID.
- `200 issuance_failed_observed / persisted_sdk_observation`: saved included failure with the same selected mapping, without a claimable-balance ID. No automatic retry follows.
- `400 invalid_request`, `401 stale_request` or `invalid_signature`: proof rejected before RPC.
- `403 unauthorized_admin_wallet`: exact validated current database denial, not a dependency-thrown exception.
- `503 issuance_status_unavailable`: unavailable or contradictory persisted evidence; no partial economics, XDR or provider diagnostics escape.

All mounted responses use `Cache-Control: no-store`. Saved results retain historical semantics and the original five-minute beneficiary deadline; this endpoint does not establish current claimability or observe a beneficiary claim. The SDK is invoked only for a validated nonnull saved outcome behind a scoped read-only RPC allowlist. No absent-outcome write fallback is reachable.

Local fake-RPC public tests assert exact HTTP responses and unchanged stored state/counters. Existing issue/reconcile/config/prepare behavior remains separate. Neither these tests nor indexer evidence establish live integration, consensus/authentication, fresh financial readiness, production delivery or whole-D1 acceptance.
