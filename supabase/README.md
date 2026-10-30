# D1 local preparation foundation — incomplete lifecycle

This is a **new implementation based on recovered contracts**, not recovered original backend source. It implements verified-payment preparation only. **Do not deploy it or direct donations to this pool.** S2 remains incomplete; there is no S3 deployment or public-ledger evidence.

## What works locally

`GET /functions/v1/d1-custody/config` preserves the existing public response with exactly `network: "TESTNET"`, `pool_public_key` and `donation_ttl_seconds: 300`. It exposes no signing material.

`POST /functions/v1/d1-custody/prepare` verifies an admin wallet signature, loads a single successful Testnet payment and its successful transaction, then invokes `d1_prepare` once. That RPC checks current `admin_wallets` membership and atomically calls the **unchanged** recovered `reserve_release_request` and `allocate_donation_to_release_request` contracts. Allocation is not issuance, payment or refund.

## Wire contract, revision 1

The JSON object has exactly these fields:

| Field | Value |
|---|---|
| `version` | Integer `1` |
| `network` | `"TESTNET"` |
| `pool` | Configured new pool's G public key |
| `action` | `"prepare"` |
| `request_id` | Lowercase UUID, immutable reservation identity |
| `timestamp` | Integer Unix seconds, inclusive ±60 seconds |
| `wallet` | Signing admin's G public key |
| `payload` | Exact object below |
| `signature` | Base64, 64-byte Ed25519 signature |

Payload fields are exactly `amount`, `beneficiary`, `incident_id`, `operation_id`, `transaction_hash`. `amount` is the requested allocation with exactly seven decimal places, not a declaration of the payment amount. `beneficiary` must match the existing incident through the recovered reservation RPC. IDs retain the recovered validators' formats. Unknown envelope/payload fields are rejected, including destinations, signed XDR, URLs and claimed payment facts.

Signing uses UTF-8 canonical JSON of the envelope **without `signature`**: recursively sort object keys lexicographically, preserve string contents, no whitespace. Sign the SDK SHA-256 of `Stellar Signed Message:\n` followed by that JSON using SDK Ed25519. The bound message includes network, pool, action, request ID, timestamp, wallet and every payload field. No custom cryptography is used. Signature validity alone does not grant admin membership.

### New donation binding

For new D1 donations use `Memo.hash(SHA256(UTF8("vaca.d1.donation.v1\n" + fullIncidentId)))`. `\n` means one LF byte. Hash the exact full incident identifier, without trimming, truncation or normalization. The donor transaction must contain exactly one ordinary payment operation. Native and issued assets are supported; muxed and path payments, multi-operation transactions and unknown outcomes fail closed in this foundation.

Horizon HTTP targets are fixed to `https://horizon-testnet.stellar.org`. Redirects are forbidden. The backend derives payment identity, donor, destination, asset, amount, success, ledger and confirmation time from operation/transaction evidence. Neither body fields nor the legacy `vq:<first8>` memo are accepted as payment proof. The old helpers/endpoints are untouched.

The reservation deadline is **on-chain payment confirmation +300 seconds**, represented as whole-second UTC. A newly prepared request at that cutoff is rejected by the existing RPC. Exact stored replays remain readable after expiry; they never authorize signing. Money uses integer stroops/SQL numeric, not floating-point aggregation.

### Responses and errors

Success returns the stored immutable receipt:

```json
{
  "revision": 1,
  "state": "allocated",
  "request_id": "<uuid>",
  "allocation": "<unchanged allocation RPC JSON object>"
}
```

`allocation` is an object in actual responses, containing the existing reservation/payment/allocation receipt. No extra mutable aggregate counter or secret is returned. Same UUID + identical preparation input returns the same receipt; conflicting input returns `409` without changing the reservation, allocation or capacity. A retry after an unknown SQL response must reuse the same request identity and immutable payload; the transport timestamp/signature may be refreshed.

Errors are JSON `{ "error": "<code>" }`, with no raw exception diagnostics:

| HTTP | Codes |
|---|---|
| 400 | `invalid_request` |
| 401 | `stale_request`, `invalid_signature` |
| 403 | `unauthorized_admin_wallet` |
| 404 | `not_found` (including unimplemented issuance/sweep routes) |
| 409 | `idempotency_conflict`, `donation_binding_conflict`, `donation_payment_conflict`, `historical_request`, `historical_payment` |
| 410 | `deadline_expired` |
| 422 | `unsupported_payment`, `payment_mismatch`, `payment_binding_mismatch`, `payment_before_activation`, `pool_not_activated`, `donation_capacity_exceeded`, `donation_request_mismatch`, `beneficiary_mismatch`, `incident_not_promoted`, `invalid_preparation`, `invalid_release_request`, `invalid_donation_payment` |
| 503 | `not_ready`, `ledger_unavailable`, `serialization_failure`, `dependency_unavailable` |

SQL `40001` is propagated as `503 serialization_failure`, never retried internally. Horizon 404, timeout and unavailable outcomes are not evidence that money can be paid again. Errors and receipts do not prove ledger issuance.

## Database boundary

`015_d1_testnet_custody.sql` adds private activation/preparation overlay tables and service-role-only SECURITY DEFINER RPCs with empty search paths. It does not change the recovered functions/tables, backfill historical rows, release capacity on expiry, or invent new accounting counters.

`d1_activate_pool(namespace UUID, pool text, first_ledger bigint)` is an explicit immutable **operator-side** boundary, not an HTTP action. It rejects pools already present in historical accounting and conflicting activation replays. A future activation requires independent evidence that the pool is newly created and has no historical funds; an empty accounting table alone cannot establish that ledger fact. Payments before the boundary cannot enter preparation. No activation is performed on startup, and none has been performed remotely.

`d1_prepare(input JSONB)` accepts only backend-verified facts. It checks the versioned memo/deadline binding itself, rejects historical request/payment adoption, serializes preparations per pool, and preserves the recovered request/payment lock and allocation-capacity invariants. Only the service role can invoke it; wallet roles cannot execute or read its private state. This database lock is **not a Stellar source-sequence lock**.

The entrypoint reads `D1_POOL_PUBLIC_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in its runtime. No real values or secret pool seed are included. It deliberately constructs a **public-only** pool key, so this incomplete foundation cannot sign. Tests never execute the entrypoint, retrieve credentials, contact Horizon or connect to a remote database.

## Local verification

Prerequisites are the already prepared isolated Deno 2.6.8/PostgreSQL 17.11 toolchain and offline pinned dependency cache. No installation, global PATH edits, Docker, remote writes or deployment is needed. The integration harness uses Node built-ins; no npm test dependencies are added.

Run these foreground commands from PowerShell:

```powershell
node C:\Users\Danilo\.config\opencode\integrations\vaca-d1-toolchain\run-isolated.cjs deno task --config C:\Users\Danilo\Desktop\workspace\VACA\supabase\deno.json check
node C:\Users\Danilo\.config\opencode\integrations\vaca-d1-toolchain\run-isolated.cjs deno task --config C:\Users\Danilo\Desktop\workspace\VACA\supabase\deno.json test:unit
node --test C:\Users\Danilo\Desktop\workspace\VACA\supabase\tests\integration\*.test.cjs
```

For the separately prepared WSL/Linux toolchain (Deno 2.6.8/PostgreSQL 17.7), run from the repository root as a non-root user; PostgreSQL cannot initialize a cluster as root. These commands use only the frozen offline cache and fresh local fixtures, not a live database or testnet:

```bash
node --test supabase/tests/integration/fixture-runtime.test.cjs
node /home/danilo/.local/share/vaca-d1-toolchain/verify.cjs app-check
node /home/danilo/.local/share/vaca-d1-toolchain/run-isolated.cjs deno test --config /mnt/c/Users/Danilo/Desktop/workspace/VACA/supabase/deno.json --allow-env /mnt/c/Users/Danilo/Desktop/workspace/VACA/supabase/tests/unit
D1_TOOL_ROOT=/home/danilo/.local/share/vaca-d1-toolchain node --test supabase/tests/integration/preparation.test.cjs
```

Linux requires an explicit absolute `D1_TOOL_ROOT`; missing/relative values fail before any fixture is created with `Linux fixtures require an absolute D1_TOOL_ROOT.` Temporary fixtures use `TMPDIR` when set, otherwise `os.tmpdir()`; keep that directory outside the worktree. No ambient environment is forwarded to the Linux launcher. It supplies isolated credential/config paths, PostgreSQL shared libraries, and fixed `PGHOST=127.0.0.1`/`PGDATABASE=postgres`, so Linux psql calls omit the host/database overrides rejected by that launcher. Ports remain unique and explicit. The harness stops and verifies its cluster before removing its Linux fixture; the Linux launcher removes its own per-command scratch. This is environment isolation and loopback-only testing, not an OS network sandbox. No automatic retries, provisioning or live testnet checks are part of these commands. Windows defaults are covered structurally by resolver tests; that is not evidence of an actual Windows integration run.

The optional nonsecret `D1_TOOL_ROOT` environment value on Windows selects the already installed tool directory for the Node harness only. It is not a network URL or application setting. The harness forwards only Windows system-directory variables to the sanitized launcher, fixes PostgreSQL to `127.0.0.1`, reserves a fresh port, and never reads ambient DB credentials. It creates minimal fixture `admin_wallets`/`incidents`/roles, applies only the retained 014/latest statement strings and authored 015 locally, and probes the public RPCs. The recovery snapshot remains read-only; it is not a complete bootstrap. Parallel psql processes exercise capacity and replay races.

On Windows, fixtures and launcher scratch remain under `C:\Users\Danilo\AppData\Local\Temp\opencode`, never the worktree. Every harness run prints exact `FIXTURE`/`LAUNCHER_SCRATCH` paths for parent cleanup, stops its owned PostgreSQL in `finally`, and verifies stopped status `3`. The Windows harness does not delete scratch. PostgreSQL's Windows EDB archive still lacks an independently verified publisher checksum; the local hash is not publisher attestation. Engram mirroring remains pending.

## Required before any funding or client migration

The following are **not implemented or proven** here:

- Bounded paginated discovery and durable cursors for every new-pool donation, including donations with missing/wrong incident memos and donations never browser-notified.
- Claimable-balance issuance with complementary beneficiary-before/pool-not-before predicates at the payment-based deadline and transaction bounds strictly before expiry.
- Durable exact signed-envelope/hash intents before broadcast, cross-request source-sequence serialization and definitive outcome reconciliation after timeout or persistence failure.
- Authenticated admin sweep, atomic claim+original-donor payment for eligible issued balances, unissued remainder refunds and durable issued/unissued accounting. There is no refund fallback or generic signing endpoint.
- Integration guards preventing legacy service-role accounting callers from registering/allocating new D1 pool payments outside this overlay. Existing contracts are deliberately unchanged, so their direct use cannot be treated as D1 proof.

Risk item 2 (auth/fund guards), item 4 (ordering/idempotency), and item 5 (dependencies/environment) still need parent integration and independent verification. The local preparation tests do not close those full-lifecycle risks or authorize downstream web edits.
