# Private opt-in configuration for automatic refunds

**Source only and unverified.** `readRefundAutomaticConfiguration` captures a fixed,
TESTNET-only server configuration for the existing full-gross and remainder
executors. It does not mount an endpoint, authenticate an actor, provision keys,
schedule work, deploy code, or move funds. The schema below is a new private
implementation policy, not an existing public API contract.

## Composition boundary

1. The trusted server supplies `getEnv: (name: string) => string | undefined` and
   its already configured public pool address. This module never reads the actual
   environment, files, or globals itself.
2. Call the reader once during private host composition and retain the result
   privately. Do not refresh configuration on each request. Import alone does not
   create keypairs, invoke the callback, or perform financial work.
3. `null` means disabled: the reader has read only the enable flag, without even
   validating `publicPool`. Preserve existing lazy base/manual/donor host
   configuration; do not eagerly load their unrelated settings for this feature.
4. A configuration error must make only the private endpoint unavailable. The
   parent-owned mount must catch it without logging values or exception details
   and use the existing unconfigured automatic HTTP handler for sanitized HTTP
   503 (`{"error":"refund_tick_unavailable"}`, `cache-control: no-store`) on an
   otherwise valid tick request. Do not fail the base host, fall back to a manual
   financial action, or treat malformed configuration as enabled. Mounting is not
   implemented by this module.

Source: [`refund-automatic-configuration.ts`](../functions/d1-custody/refund-automatic-configuration.ts).
HTTP boundary: [`refund-automatic-http.ts`](../functions/d1-custody/refund-automatic-http.ts).

## Exact private schema

Defaults apply only to absent optional settings. No whitespace trimming, numeric
normalization, signs, leading zeros, fractions, exponent notation, or coercive
acceptance is allowed. Blank strings are invalid, including the enable flag.

| Name / input | Required when enabled | Default and exact acceptance |
|---|---|---|
| `D1_AUTOMATIC_REFUNDS_ENABLED` | No | Absent or exact `false`: disabled; exact `true`: validate all enabled configuration; every other string: error. |
| `D1_NAMESPACE` | Yes | Existing namespace setting; lowercase UUID in `8-4-4-4-12` hexadecimal form. |
| `publicPool` argument | Yes | Existing host public pool; SDK-valid canonical Stellar `G` address. Not a new environment setting and never a request-provided pool. |
| `D1_REFUND_SERVICE_ACTOR` | Yes | SDK-valid canonical Stellar `G` address; fixed service identity, not proof of authorization. |
| `D1_REFUND_TICK_TOKEN` | Yes | Exactly 43 base64url characters encoding exactly 32 bytes, with canonical round trip and no padding. Same rule as the automatic HTTP boundary. |
| `D1_REFUND_POOL_SECRET_KEY` | Yes | Canonical Stellar `S` secret accepted by `Keypair.fromSecret`; secret round trip must match and derived public key must equal `publicPool` exactly. |
| `D1_REFUND_MAX_BATCH_SIZE` | No | Default `1`; canonical decimal integer `1..50`. |
| `D1_REFUND_FEE_PER_OPERATION_STROOPS` | Yes | No default; canonical positive uint32 decimal `1..4294967295`. Returned as a string for existing construction APIs. |
| `D1_REFUND_TRANSACTION_LIFETIME_SECONDS` | Yes | No default; canonical decimal integer `1..600`. |
| `D1_REFUND_MAX_AGE_SECONDS` | No | Default `15`; canonical decimal integer `1..30`. |
| `D1_REFUND_FUTURE_TOLERANCE_SECONDS` | No | Default `0`; canonical decimal integer `0..2`. |

The transaction lifetime is a private construction policy, **not** the original
300-second donation deadline and not a claim about an existing protocol maximum.
It is a duration, not a startup-captured absolute `validUntil`. The parent page
composition must construct fresh per-original deadlines for the genuine engines.
The network is fixed to `TESTNET`; there is no configurable network override.

All invalid values, SDK failures, and callback failures become exactly
`Error('automatic_refund_configuration_unavailable')`, without a nested cause or
raw diagnostics. The reader never logs or serializes configuration or secrets.

## Captured signer and immutable result

The returned object and nested `financial` object are frozen. They contain only
`namespace`, `pool`, `actor`, `network`, `token`, `maxBatchSize`,
`feePerOperationStroops`, `transactionLifetimeSeconds`, and
`financial: { maximumAgeSeconds, futureToleranceSeconds, loadPoolSigner }`.
No raw pool secret is a returned field. All settings are captured, and signer
loading does not call `getEnv` again.

Both existing dependency contracts resolve to the synchronous callable signature
`loadPoolSigner: (pool: string) => unknown`. The new financial type is derived
from both `RefundExecutionDependencies['financial']` and
`RemainderExecutionDependencies['financial']` with type-only imports; there is no
dependency on the parallel page module. The provider returns a fresh SDK
`Keypair`, as required by the existing authorized signers. It rejects any pool
argument not exactly equal to the captured public pool, using the same sanitized
configuration error. The requested pool never selects or replaces a key.

The private closure retains the saved secret. The returned SDK signer is itself a
sensitive capability; only the genuine authorized signing paths may consume it.
Freezing the configuration does not make the token or signer public-safe. Never
log, serialize, spread into public/base runtime configuration, or send this
configuration in a response. Never place the private key or dedicated token in
app/web code, public environment variables, or client-visible configuration.

## Separate activation prerequisites

- Database migration **049** service enrollment for the exact actor, namespace,
  pool, and TESTNET scope is separate. Merely setting the actor field grants
  nothing; do not substitute general administrator membership.
- Scoped database admission from **055**, **057**, and **058**, with their existing
  migration dependencies and current database guards, remains mandatory. This
  reader neither applies SQL nor bypasses admission, fences, or financial checks.
- Supabase gateway JWT requirements and a valid gateway credential remain
  separate from the dedicated HTTP tick token. Neither is replaced by the actor
  address or the pool signing key.
- Secure token entropy and provisioning remain operational responsibilities:
  canonical 32-byte shape does **not** establish randomness, confidentiality, or
  appropriate provisioning. No token or key is generated here.
- Parent-owned private mount, genuine page composition, and any scheduler require
  separate integration/activation work. No scheduler or provisioning/deployment
  was performed as part of this source delivery.

## Review and remaining proof

This T2ag source supports S1/S5's additive automatic path and S7/S11's fixed,
scoped service composition without modifying manual handlers or granting new
authority. S18–S19's integration scope is respected; S15 prohibits executable
verification. Only source readback/self-review was performed: **no tests, probes,
typecheck, build, SQL, runtime execution, scratch/cache preparation, network,
deployment, or funds movement**. Functional, type-level, secret-isolation,
security, and integrated host behavior remain unproved. This document is not
operational acceptance or permission to activate.
