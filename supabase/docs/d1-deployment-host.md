# Preserve the deployed D1 host when adding automatic refunds

`functions/d1-custody/deployment-index.ts` is the proposed delivery entrypoint. It combines the retained v4 issuance/manual host with the verified automatic-refund engine. **The historical issuance/manual/automatic composition has local evidence; the new donor mount is source-only and unverified. This candidate is not deployed.** The existing `index.ts` and shared runtime remain unchanged; they are not interchangeable deployment entrypoints.

## Preserved boundaries

| Boundary | Composition |
|---|---|
| Public scope | Selected Testnet project, pool, namespace, first ledger, creation operation and funder are pinned in `deployment-runtime.ts`. Environment mismatch prevents startup. |
| Initial issuance | Verify the wallet proof, read outcome/attempt, then prepare only on absence: complete discovery/history, genuine creation credit, matching account checkpoint, coordinator and fee commitment. Existing engines still own signing/submission. |
| Manual refunds | Both existing runtime wrappers mount all six exact paths, forwarding the original request. Fee100, request-time expiry+60, financial freshness30/2 and future-refund commitment300 preserve v4 policy. These do not change original donation TTL300. |
| Signing | Initial/manual signer lazily reads `D1_POOL_SECRET_SEED`, verifies the requested pool and secret-derived key. It never borrows automatic-refund credentials. |
| Automation | Only the exact `internal-refund-tick` pathname reaches the existing automatic HTTP handler. Disabled/malformed configuration leaves it503 without disabling initial/manual routes. The selected runtime always supplies the fixed original-confirmation policy below; authentication, paging and lane eligibility remain in their existing modules. |
| Public responses | Config keeps its exact three fields, wildcard CORS and no-store. Administrative `/status` remains disabled. The signed historical donor route is mounted as described below. Startup failure remains503 `custody_unavailable`; tick-only failure remains503 `refund_tick_unavailable`. |

## Signed historical donor lookup

The host now supplies its existing private RPC client and trusted pool/namespace/clock
to the existing `donorPaymentHttp` through `createCustodyHandler`. Both
`/donor-payment-status` and `/functions/v1/d1-custody/donor-payment-status`
require the existing personal `donor_payment_status` proof and known original
payment transaction hash plus operation ID. This does not enable administrative status.

The reader authenticates the wallet before the single `d1_capture_donor_payment`
capture, then validates stored ownership, original payment, allocations and issuance
evidence before returning the allowlisted historical DTO. No new SQL, signer,
provider lookup, execution, automatic retry or reconciliation is added.

The current implemented error contract is 400 `invalid_request`, 401
`invalid_signature` or `stale_request`, 405 `method_not_allowed`, and sanitized
503 `donor_payment_unavailable` for capture/projection failure, including absent
or foreign payment evidence. Migration054 cannot certify the older proposal's
404 `payment_not_found`; consumers must not treat503 as proof of absence.

Historical issuance success and `readAt` do not establish live claimable-balance
availability, refund eligibility or permission to clear a financial hold.
Wallet-wide discovery is not provided. The new composition regression definition
has not been executed because further verification was stopped by the human.
Earlier v4 parity evidence below predates this intentional donor-route difference;
it is not verification of this new mount.

## Supabase RPC transport boundary

The delivery entrypoint projects the real SDK response to its own `data` and
`error` value properties before passing it to the host. SDK `status`, `count`
and other transport metadata do not belong to the financial DTO envelope.
Missing, inherited or accessor-only payload properties are rejected without
invoking getters. The RPC receiver stays bound; the adapter adds no retry.

This changes neither the payload nor database error identity. Existing strict
DTO validation, wallet proofs, membership checks and exact 403/404 mappings
remain downstream. The automatic page retains its existing normalization.
No engine, SQL, dependency pin, credential or deadline changes are involved.

The focused regression uses the pinned real Supabase client with synthetic
PostgREST responses, including its actual metadata, through the delivery
entrypoint. Network, signing-secret and unintended RPC effects are forbidden.
This local correction is not deployment or activation evidence.

## Fixed automatic confirmation scope

`DEPLOYED_ORIGINAL_CONFIRMATION_POLICY` in `deployment-runtime.ts` pins the inclusive original Stellar confirmation lower bound to **2026-11-15T03:00:00Z** (`1794711600` Unix seconds), equivalent to 2026-11-15 00:00 in Chile continental time (UTC−03:00). This is the agreed absolute instant, not a moving “yesterday”. There is no new environment variable or secret and no HTTP override; the request remains exactly `{ "afterRequestId": null }` or a cursor UUID.

The automatic page checks the saved original after foreign-fence rejection and before providers, writes, status/reconcile, signing or submission, for new and existing full-gross/remainder candidates alike. Pre-cutoff pending, settled and partial-history recovery stays held without mutating saved state or clearing permanent fences. Enumeration and continuation still advance. Missing/malformed/inconsistent originals fail closed. The original confirmation+300 deadline and every initial/manual route remain unchanged. Reusable page consumers that omit this optional policy retain their legacy behavior; the selected deployment does not omit it.

Local tests use genuine timestamp-consistent fixtures with policy boundaries at original confirmation ±1 second, plus equality. The fixed deployment policy is asserted separately and manual status is compared with genuine core output in both lanes. This is local source proof, not activation, deployed-credential validation or live execution acceptance.

## Local evidence and outstanding checks

- RED against current preparation-only composition: `/issue`404 rather than400; donor route503 rather than retained404.
- Parent focused/regression run:41 tests passed, zero failures; proposed entrypoint graph compiled successfully. This covers invalid/stale/wrong-scope proofs, membership denial, config, all manual proof boundaries and disabled/malformed tick isolation.
- Three earlier typecheck failures remain recorded: test SDK seed type, host RPC type and test duplicate spread. None was counted as behavioral RED or suppressed with `--no-check`.
- Independent verification passed seven probes:45 exact v4 route/proof comparisons plus genuine preflight, attempt/outcome replay, manual forwarding/expiry, wrong-pool signer rejection and startup503. Parent adoption ran all seven with the four focused cases:11PASS, zero failures.
- Positive preflight starts from genuinely parsed populated history and an existing unsigned journal, completes empty pages, and creates the operating-credit receipt/fee commitment. It does not prove first-ever backfill or first-time sequence reservation. Manual ACK remains `unknown`, not inclusion.
- The snapshot differential lives outside normal unit discovery at `tests/probes/deployment-live-parity.ts`; it requires the retained public v4 artifact below. Run explicitly with `deno test --cached-only --frozen --allow-env --deny-net tests/probes/deployment-live-parity.ts` from `supabase/`. The portable positive regressions are in `tests/unit/deployment-completion-regression.test.ts`. See [independent evidence](../../odd/evidence/d1-deployment-host-independent.md). Existing automatic-engine proof was not rerun merely to refresh it.

## Delivery gate

The retained live v4 public source is `supabase/.temp/d1-recording-live-v4-tzoej630/index.js`, SHA256 `5275452af36aa8e6990123d42bc7b2ec0ed4d996b07d1187bbaa0829dcf4b6df`. Keep this recovery artifact and bind one reviewed candidate before replacement; do not publish the experimental entrypoint by default.

Follow [recording readiness](../../odd/tasks/d1-recording-readiness.md): reconcile the peer's stable remainder handoff/web ownership, validate ordered migrations and recovery, then publish one backend. Service enrollment, scheduler activation and existing-fund exposure need their own validated scope. Human rehearsal still requires agreed cases/accounts/amounts/operating budget. No secret value belongs in this guide, browser, APK or delivery manifest.
