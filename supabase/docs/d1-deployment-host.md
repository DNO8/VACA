# Preserve the deployed D1 host when adding automatic refunds

`functions/d1-custody/deployment-index.ts` is the proposed delivery entrypoint. It combines the retained v4 issuance/manual host with the verified automatic-refund engine. **It is not deployed or independently verified yet.** The existing `index.ts` and shared runtime remain unchanged; they are not interchangeable deployment entrypoints.

## Preserved boundaries

| Boundary | Composition |
|---|---|
| Public scope | Selected Testnet project, pool, namespace, first ledger, creation operation and funder are pinned in `deployment-runtime.ts`. Environment mismatch prevents startup. |
| Initial issuance | Verify the wallet proof, read outcome/attempt, then prepare only on absence: complete discovery/history, genuine creation credit, matching account checkpoint, coordinator and fee commitment. Existing engines still own signing/submission. |
| Manual refunds | Both existing runtime wrappers mount all six exact paths, forwarding the original request. Fee100, request-time expiry+60, financial freshness30/2 and future-refund commitment300 preserve v4 policy. These do not change original donation TTL300. |
| Signing | Initial/manual signer lazily reads `D1_POOL_SECRET_SEED`, verifies the requested pool and secret-derived key. It never borrows automatic-refund credentials. |
| Automation | Only the exact `internal-refund-tick` pathname reaches the existing automatic HTTP handler. Disabled/malformed configuration leaves it503 without disabling initial/manual routes. Authentication, paging and lane eligibility remain in their existing modules. |
| Public responses | Config keeps its exact three fields, wildcard CORS and no-store. No `/status` or donor route is newly enabled in this deployment host. Startup failure remains503 `custody_unavailable`; tick-only failure remains503 `refund_tick_unavailable`. |

## Local evidence and outstanding checks

- RED against current preparation-only composition: `/issue`404 rather than400; donor route503 rather than retained404.
- Parent focused/regression run:41 tests passed, zero failures; proposed entrypoint graph compiled successfully. This covers invalid/stale/wrong-scope proofs, membership denial, config, all manual proof boundaries and disabled/malformed tick isolation.
- Three earlier typecheck failures remain recorded: test SDK seed type, host RPC type and test duplicate spread. None was counted as behavioral RED or suppressed with `--no-check`.
- Independent verification, fresh-preflight positive coverage and retained-live-host differential remain outstanding. Existing automatic-engine proof is not rerun merely to refresh it.

## Delivery gate

The retained live v4 public source is `supabase/.temp/d1-recording-live-v4-tzoej630/index.js`, SHA256 `5275452af36aa8e6990123d42bc7b2ec0ed4d996b07d1187bbaa0829dcf4b6df`. Keep this recovery artifact and bind one reviewed candidate before replacement; do not publish the experimental entrypoint by default.

Follow [recording readiness](../../odd/tasks/d1-recording-readiness.md): reconcile the peer's stable remainder handoff/web ownership, validate ordered migrations and recovery, then publish one backend. Service enrollment, scheduler activation and existing-fund exposure need their own validated scope. Human rehearsal still requires agreed cases/accounts/amounts/operating budget. No secret value belongs in this guide, browser, APK or delivery manifest.
