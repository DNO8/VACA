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

## Explicit consumer and recovery

`RemainderClient` exposes `status`, `requestRefund`, and `reconcile`. Every operation uses the same original-scope isolate queue as v1. A first refund intent observes a fresh status, binds its original donation/deadline to previously observed facts, requires `not_started` plus the explicit server action, then persists the common hold and consumes its one-use permit. Any existing v1 or v2 hold turns another refund intent into a status-only observation; it never selects the other lane or issues a second refund POST.

Errors stay unknown, never settled or zero. A recorded uncertain attempt permits explicit signed status or explicit observational reconciliation, not automatic retry. Repeated views retain the same original facts in memory; durable holds bind them after restart. Current observations must match both the provided prior DTO and stored original facts. Raw transport cannot mint a permit.

## Administrative integration

`remainderClientProvider` passively composes the consumer, shared storage journal and existing personal-wallet signer. It uses the existing public configuration provider, never a service-role key. `remainderHttpClientFactoryProvider` is an injectable construction seam; its factory must return a fresh owned client. `remainderHttpClientProvider` retains that transport for the container lifetime and closes it on disposal. Construction alone does not read a seed, persist a hold, sign or send a command.

The existing known-reference `RefundAdminScreen` mounts `RefundRemainderPanel` alongside the v1 panel with the same original scope. Neither opening the screen, building either panel nor changing the reference triggers a command. The panels share the durable submission gate; showing both lanes is not permission to submit through both.

The remainder panel offers explicit status, advertised first-refund intent with confirmation, and explicit observational reconciliation. It passes its retained original DTO into the consumer, captures scope/generation across asynchronous work and ignores obsolete view results. Changing the view clears presentation only, never durable storage or an already dispatched operation. Busy feedback is local UI state, not backend authorization or distributed exclusion.

Original donor/payment references, original positive gross/deadline and nullable settlement facts remain visible. Unknown stays unknown, not zero or settled. After an uncertain recorded attempt, recovery is explicit observation/reconciliation rather than a second first POST. No automatic polling, lane switch, release, reset or new original identity is offered.

These are authored source paths only: the provider graph, dialogs, populated widgets and financial journeys have not been executed or analyzed for this unit. Historical v1/passive-status/layout evidence does not validate the new integration. Actual backend/private-provider activation, app execution and operational acceptance remain separate. See [the v1 integration guide](d1-refund-client.md) for the unchanged wire contract and historical evidence boundaries.

## Existing boundaries

The old passive `RemainderStatusClient` remains separate. No client signs with the pool key or constructs a pool transaction. No backend handler, `/status`, runtime, index, migration, provider capability, environment, dependency, D3 flow or phone setup is changed by this unit. Missing/unknown accounting is never zero and an observed refund is not full settlement.
