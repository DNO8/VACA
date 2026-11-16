# Automatic refund host composition

## Source implemented, not activated or verified

`functions/d1-custody/index.ts` now composes the existing private tick HTTP boundary with the real sequential page and both genuine refund executors. This source work does not establish operational readiness. No tests, probes, typecheck, build, SQL application, runtime requests, credential provisioning, scheduling, deployment or funds execution were performed under S15. Independent functional, security, concurrency and preservation proof remains outstanding.

## Request boundary

Only `/functions/v1/d1-custody/internal-refund-tick` is dispatched to the automatic handler. That handler enforces POST, no query/fragment, the dedicated `x-d1-refund-token`, and the bounded exact body `{ "afterRequestId": null }` or an original-request UUID cursor. Authentication precedes reading the body, enumeration, provider requests and any write. Gateway JWT verification remains a separate deployment requirement; the dedicated token is not a replacement for it.

An absent or false opt-in leaves the route unavailable. Malformed private settings also leave it unavailable with a sanitized 503. Neither condition changes the existing base/donor configuration. Do not interpret 503 as proof that no work happened: a failure during an enabled tick may follow durable evidence or journal writes. There is no request retry or fallback in the host.

See [private configuration](d1-refund-automatic-configuration.md) for the exact environment names, validation rules and defaults. No settings were populated by this implementation. Token shape does not establish entropy or correct provisioning.

## Financial path

The host constructs `HorizonDiscoverySource` and the private page factory once, without executing them. The page runs only after HTTP authentication:

1. Read one service-scoped056 original window, with a fixed server-selected maximum.
2. Process returned originals sequentially. A foreign permanent fence holds before evidence effects.
3. For an unfenced original, validate the saved original and unchanged confirmation-plus-300-second deadline; ingest bounded genuine discovery/history and record authentic initial032 inclusion. Missing or partial evidence holds, not a fabricated failure.
4. Select full-gross or verified remainder from authentic evidence. Match existing candidate/fence identity before actions.
5. Call only the selected genuine executor: status first, then at most one permitted execution or reconciliation action. No execution immediately after reconciliation and no opposite-lane fallback.
6. Return only processed/held counts and continuation. Every result not actually `settled`, including an acknowledged submission or observed refund, counts as held.

Construction expiry is generated per original, not captured at host startup. The configurable transaction lifetime is distinct from the original refund deadline and financial observation freshness. Existing candidates, attempts, ownership and hashes are never reset or renewed by this host. The factory-local overlap guard is not a distributed lock; SQL permanent fences and durable one-shot journals remain authoritative.

See [page composition](d1-refund-automatic-page.md), [lane selection](d1-refund-lane-selection.md), [full-gross execution](d1-refund-execution-core.md), and [remainder execution](d1-remainder-execution-core.md).

## Existing behavior and signing boundary

The existing `createCustodyRuntime(base, undefined, donorDependencies)` call and donor configuration stay intact. Other paths continue to the same base handler. The base receives only the public pool key; the refund-only private signer is captured inside the automatic page dependencies and never passed to preparation, donor reads or initial issuance.

The genuine manual refund/remainder adapters and their wallet proofs remain available as source. This index previously did not mount them and this change does not add a manual mount or activate initial issuance by supplying a lifecycle dependency. Preserving those source APIs is not evidence of deployed manual-route parity; deployment composition still needs explicit validation against the actual target.

## Separate activation and acceptance prerequisites

Before any authorized activation, establish all of the following separately:

- Verified SQL compatibility, including049 scoped membership and055/057/058 independent operation admission, without granting general administration or initial spending.
- The explicit service identity, matching private pool signer and high-entropy dedicated token, kept server-only.
- Gateway JWT policy and the exact deployed route behavior; no JWT disablement is introduced here.
- A separately authorized scheduler/caller that follows continuation even on empty due pages and restarts from null after a complete sweep. No scheduler was created.
- Functional, permission, concurrency and regression proof, followed by the agreed human-run app/web financial acceptance with original references, Explorer evidence, balances and conservation.

Local source commits and native risk assessments do not satisfy these prerequisites. Risk: item 2 (private signing/authentication), item 3 (host routing used by existing consumers), item 4 (durable ownership), and item 5 (environment/deployment composition).
