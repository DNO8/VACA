# Compose one private automatic-refund page

`createRefundAutomaticPage` composes the existing due-original reader, lane selector, and full-gross/remainder executors. It returns an async `runPage(afterRequestId, limit)` function. Construction is inert: no clock call, RPC, provider request, key loading, signing, or submission. **Calling the returned function can cause financial execution; source delivery does not authorize activation.**

## Private host API

```ts
import {
  createRefundAutomaticPage,
  type RefundAutomaticPageDependencies,
} from "../functions/d1-custody/refund-automatic-page.ts";

// Supplied only by the trusted host, never assembled from an HTTP body.
declare const dependencies: RefundAutomaticPageDependencies;
const runPage = createRefundAutomaticPage(dependencies);

// Illustrative invocation after independent caller authentication/authorization:
const page = await runPage(null, 10);
// { processed, held, nextAfterRequestId }
```

The exported dependency interface requires:

| Binding | Contract |
|---|---|
| `client`, `namespace`, `pool`, `actor`, `network` | Private RPC client; fixed canonical UUID, Stellar public keys, and literal `"TESTNET"`. No per-page scope or actor override. |
| `now` | Trusted Unix seconds, safe integer; nondecreasing during a page. |
| `source` | Real `HorizonDiscoverySource`, or its `readPage`, `readTransactionPageAtCheckpoint`, `readAccountAtCheckpoint`, and `readClaimableBalance` methods. |
| `financial` | `maximumAgeSeconds`, `futureToleranceSeconds`, and the existing `RefundSignerConfiguration["loadPoolSigner"]` signature: `(pool: string) => unknown`. The genuine signers await the result and require a signing SDK `Keypair` matching the fixed pool. |
| `feePerOperationStroops` | Canonical positive decimal string, at most `4294967295`; no leading zero. Existing financial helpers impose their additional fee/budget constraints. |
| `transactionLifetimeSeconds` | Integer `1..600`, used as trusted current time plus lifetime for **new** candidate construction. |
| `maxBatchSize` | Integer `1..50`; each call requires an integer limit in `1..maxBatchSize`. |
| `fetcher` | Explicit trusted transport used by the genuine acquisition/submission helpers. No implicit transport configuration. |

Financial freshness requires age `1..30` seconds and future tolerance `0..2` seconds. The original donation deadline remains its saved `confirmed_at + 300` seconds; refund transaction lifetime is a separate private host policy, not an extension of that deadline. Existing candidates receive no construction policy and are never renewed.

Policy scalars, methods, and their original receivers are captured synchronously without invoking accessors; mutable RPC JSON is bounded and detached. The host remains responsible for the internals of its trusted client, source, clock, signer provider, and transport. No environment/configuration module is imported.

## Authenticate outside the page

This is **not** an authentication boundary. The dedicated automatic HTTP handler remains mandatory for HTTP callers. The parent host may compose it without changing manual routes:

```ts
import { createRefundAutomaticHttp } from "../functions/d1-custody/refund-automatic-http.ts";

declare const dedicatedToken: string; // Privately supplied; never a request field.
const maximum = dependencies.maxBatchSize;
const automaticHandler = createRefundAutomaticHttp({
  token: dedicatedToken,
  maxBatchSize: maximum,
  runPage: after => runPage(after, maximum),
});
// Exact-route mounting, opt-in configuration, and activation belong to the host.
```

A fixed actor is a binding, not proof of authentication. Database service-scope admission and current authorization checks remain mandatory. No broad administrator grant, secret provisioning, endpoint mounting, or manual-command replacement is included here.

## What one call does

1. Read exactly one actual056 due-original page; process its IDs sequentially. A strict040 fence lookup comes first for each original. A foreign owner holds before providers or writes. An existing fence routes directly to its selected genuine engine without neutral stream refresh.
2. For an unfenced original, require actual018 admission, matching request/namespace/pool/network and the saved original deadline. Ingest at most one discovery page; only a complete acknowledgement permits at most one transaction page. Only complete acknowledgements permit the genuine `recordInitialIssuanceOutcome`032 helper. Partial or uncertain saves hold immediately, without retry or readback.
3. After that positive evidence path, call the real lane selector. Null evidence is not eligibility. The neutral RPC capability permits only the actual evidence reads and `d1_record_discovery_page`, `d1_record_transaction_page`, `d1_record_issuance_outcome`; it cannot initiate issuance, create a candidate, sign, submit, or administer anything. Its request reads/writes are selected-original-only. Namespace accounting reads of other originals are available only to the genuine remainder helper graph, not to neutral refresh or to other-original writes.
4. Construct the selected real executor afresh for this original, then call status first. Compare stored034/041 candidate hashes with the strict040 fence before further action, including a candidate racing a proposal. Choose at most one allowed action from the returned `safeActions`: execute if allowed, otherwise reconcile if allowed. Never execute after reconcile, resend a pending attempt, or fall back to the other lane. Generic discovery/transaction source-call budgets are shared across neutral refresh and the selected engine.
5. Return only counts and the reader's unchanged continuation. Any per-original error or uncertainty increments `held` and processing continues with the next original. Enumeration failure rejects the page with `refund_tick_unavailable` rather than inventing a cursor/result.

The existing cores still own financial observation, funding, signing, durable submission attempts, and outcome/settlement validation. A null fence is not a lock or spending permission. SQL permanent fences and journals resolve races and retain ownership after expiry; the page never releases ownership or resets journals. The factory-local busy guard rejects overlapping calls to this one instance, **not** calls in other processes or instances.

## Counts, continuation, and bounds

- `processed` is exactly the returned `requestIds.length`, not the requested limit or scanned SQL window size.
- `held` includes **every** processed original not reported `settled` by its genuine selected core, including errors, unknown/pending, and `refund_observed`. An ACK, saved observation, or completed evidence stream is not settlement.
- Preserve `nextAfterRequestId` even when `processed` is zero. SQL may have scanned a window containing no due originals.
- There is no internal cursor loop. A later caller advances with the returned cursor; after a terminal null cursor, a later sweep starts at null again. Held work is not retried within this call.
- One source page is not one HTTP request: the existing sources may fetch supporting ledger/account evidence, and genuine historical validators may read bounded stored-history pages. This module adds no provider cursor loop or retry mechanism.

## Source-only delivery and remaining proof

This T2af source composition covers S1/S5 automatic handling while preserving the manual engines; S7/S11 fixed-scope execution and authentic evidence refresh; and the S15/S18/S19 source-only integration constraints. Host wiring and activation are separate work, not completed by this module.

Under S15, no tests, probes, typecheck, build, SQL execution, runtime invocation, network requests, deployment, or funds movement were performed. Source inspection is not functional, security, concurrency, or financial acceptance. In particular, scoped capability/signing boundaries (risk item 2), durable ownership under competing callers (item 4), actual database admission, and end-to-end success remain unverified.
