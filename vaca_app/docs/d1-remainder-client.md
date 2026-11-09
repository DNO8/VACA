# D1 remainder client

## Delivery status

This is source implementation, not operational acceptance. The human explicitly stopped further checks: no new tests, analyzer, typecheck, build, SDK/SQL, native review or device verification is run for this work. Existing passing checks do not cover these changes.

## Shared first-submission ownership

`RefundSubmissionGate` adds `d1.refund.submission.<sha256(original identity)>` alongside the existing `d1.refund.v1.*` records. The common record has exactly `version`, `lane`, and `baseline`. Its version describes this local container, not a relabeling of the backend receipt: a v1 baseline is parsed as v1; a v2 baseline as v2.

Both lanes use the same original TESTNET/namespace/pool/request identity and `RefundOperationQueue` in the current isolate. Reservation requires absence of both the shared hold and a legacy v1 record, a validated `not_started` baseline, acknowledged write and validated readback. Only then can the relevant journal mint a final, one-use permit. Transport consumes it before signing or network access.

A legacy record prevents a new v2 first POST without being modified. If the additive v1 hold survives but writing the old v1 record fails, the v1 consumer recovers from the shared baseline rather than acquiring a second permit. Conflicting or malformed records fail closed. There is no reset, deletion, TTL, lane switch, automatic retry or new original ID. Changing screens does not release the hold. Original donation facts and deadline must match subsequent observations, including across the two lane views.

This is local coordination only, not a cross-process/device CAS, backend idempotence or financial authorization. Another installation and actual provider/SQL/settlement behavior remain backend concerns.

## Pending source units

The following source units follow this shared-journal change: v2 one-shot signed command transport; durable first-submit/status/explicit reconciliation consumer; passive providers and the existing known-reference administrative screen. Their completion will be recorded in the feature task file and this guide. Nothing is enabled by importing the shared journal alone.

## Existing boundaries

The old passive `RemainderStatusClient` remains separate. No client signs with the pool key or constructs a pool transaction. No backend handler, `/status`, runtime, index, migration, provider capability, environment, dependency, D3 flow or phone setup is changed by this unit. Missing/unknown accounting is never zero and an observed refund is not full settlement.
