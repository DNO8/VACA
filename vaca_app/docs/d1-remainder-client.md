# D1 remainder client

## Delivery status

This is source implementation, not operational acceptance. The human explicitly stopped further checks: no new tests, analyzer, typecheck, build, SDK/SQL, native review or device verification is run for this work. Existing passing checks do not cover these changes.

## Shared first-submission ownership

`RefundSubmissionGate` adds `d1.refund.submission.<sha256(original identity)>` alongside the existing `d1.refund.v1.*` records. The common record has exactly `version`, `lane`, and `baseline`. Its version describes this local container, not a relabeling of the backend receipt: a v1 baseline is parsed as v1; a v2 baseline as v2.

Both lanes use the same original TESTNET/namespace/pool/request identity and `RefundOperationQueue` in the current isolate. Reservation requires absence of both the shared hold and a legacy v1 record, a validated `not_started` baseline, acknowledged write and validated readback. Only then can the relevant journal mint a final, one-use permit. Transport consumes it before signing or network access.

A legacy record prevents a new v2 first POST without being modified. If the additive v1 hold survives but writing the old v1 record fails, the v1 consumer recovers from the shared baseline rather than acquiring a second permit. Conflicting or malformed records fail closed. There is no reset, deletion, TTL, lane switch, automatic retry or new original ID. Changing screens does not release the hold. Original donation facts and deadline must match subsequent observations, including across the two lane views.

This is local coordination only, not a cross-process/device CAS, backend idempotence or financial authorization. Another installation and actual provider/SQL/settlement behavior remain backend concerns.

## V2 transport

`RemainderHttpClient` signs a fresh v2 personal-wallet proof for each explicit action and posts once to `/functions/v1/d1-custody/refund-remainder`, `refund-remainder-status` or `refund-remainder-reconcile`. It never relabels a v1 proof. A refund requires a final journal-issued one-use permit; it is consumed before signing, including when signing or transport subsequently fails.

Requests are limited to 8192 bytes, responses to 16384 bytes, with a 10-second transport cancellation timer, JSON/no-store admission, duplicate-key rejection and exact DTO/error validation. Status admits 200; reconcile admits 202 for pending/unknown, otherwise 200; refund admits 202 for pending/unknown, 409 for not_due/blocked, otherwise 200, never not_started. Observed refund facts must match the permit's original baseline. No interceptor retries, redirect, polling, protocol fallback or automatic reconcile exists.

## Pending source units

The durable first-submit/status/explicit reconciliation consumer and passive providers/known-reference administrative commands follow this transport. Source completion is recorded in the feature task file. Importing transport or journals does not send any command.

## Existing boundaries

The old passive `RemainderStatusClient` remains separate. No client signs with the pool key or constructs a pool transaction. No backend handler, `/status`, runtime, index, migration, provider capability, environment, dependency, D3 flow or phone setup is changed by this unit. Missing/unknown accounting is never zero and an observed refund is not full settlement.
