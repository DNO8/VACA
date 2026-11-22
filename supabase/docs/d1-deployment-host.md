# Preserve the deployed D1 host when adding automatic refunds

`functions/d1-custody/deployment-index.ts` is the proposed delivery entrypoint. It combines the retained v4 issuance/manual host with the verified automatic-refund engine. **The donor mount has accepted bounded evidence. Independent video routing has bounded source evidence:13 parent tests,78 unchanged manual-route observations,3 independent probes and their exact3-test parent replay. Earlier verifier setup failures remain recorded; this does not prove deployed runtime or activation readiness. This candidate is not deployed.** The existing `index.ts` and shared runtime remain unchanged; they are not interchangeable deployment entrypoints.

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
Wallet-wide discovery is not provided. Donor verification was accepted separately,
with its recorded limitations; do not rerun it as part of routing work.
Earlier v4 parity evidence below predates this intentional donor-route difference.

## Independent video routes

Keep manual clients on their existing paths. The second host uses the fixed prefix
`/functions/v1/d1-custody/video-auto`, followed by exactly one of:
`config`, `prepare`, `issue`, `reconcile`, `status`, `donor-payment-status`,
`refund`, `refund-status`, `refund-reconcile`, `refund-remainder`,
`refund-remainder-status`, `refund-remainder-reconcile`, `internal-refund-tick`.
The router translates only the pathname; original body bytes, method, headers and
query remain intact. Existing handlers own authentication and method validation.
`status` stays disabled. Unknown, nested, trailing and encoded video routes return
404 `not_found` without entering the manual host. A missing host returns503
`custody_unavailable` independently; malformed tick-only settings disable only that tick.

| Trusted setting | Required value or role |
|---|---|
| `D1_VIDEO_AUTO_ENABLED` | Exactly `true`; absent/other values leave B unavailable. |
| `D1_VIDEO_AUTO_POOL_PUBLIC_KEY` | `GAYWVFBP2YPYMU245D6AOE7WWTVZOWGPVIFVGOH5EFFSSQ3VZAVR5JCW` |
| `D1_VIDEO_AUTO_NAMESPACE` | `8126a1f4-ed8a-41ec-905b-9ad3442e5e6e` |
| `D1_VIDEO_AUTO_FIRST_LEDGER` | `5859490`; fixed creation operation is `25166317921255425`. |
| `D1_VIDEO_AUTO_OPERATING_FUNDER` | Explicitly approved public team funder, not the pool. No inherited default. |
| `D1_VIDEO_AUTO_OPERATING_OPERATION_ID` | Genuine separate native D1OPS credit reference; canonical uint64 at/after the first ledger, never the creation operation. |
| `D1_VIDEO_AUTO_POOL_SECRET_SEED` | Human-provisioned B initial/manual signing capability; read lazily and checked against B. Never put its value in this document. |
| Automatic settings | Each existing `D1_*` automatic setting becomes `D1_VIDEO_AUTO_*`, e.g. `D1_VIDEO_AUTO_AUTOMATIC_REFUNDS_ENABLED`, `D1_VIDEO_AUTO_REFUND_SERVICE_ACTOR`, `D1_VIDEO_AUTO_REFUND_TICK_TOKEN`, `D1_VIDEO_AUTO_REFUND_POOL_SECRET_KEY`. See [complete automatic settings](d1-refund-automatic-configuration.md). |

Only SUPABASE_URL and the backend service capability are shared. No B D1 setting
falls back to A. Automatic signing remains separate from initial/manual signing.
Pool selection is never accepted from an HTTP override.
The optional host `operatingCreditOperationId` defaults to the creation reference
for unchanged A. B supplies a separate reference, but the existing journal still
requires anchored, genuine D1OPS evidence from a trusted funder. A reference is not
credit admission; B's creation balance has memo:none and is not operating credit.

The selected B is the replacement pool above. The previous B namespace
`3c6f6494-1712-4a1c-ab8e-560a1b8b072e`, its registration, enrollment and payment
remain historical records; this source change neither reassigns nor deletes them.
Replacement registration, service enrollment and the separate 100 XLM D1OPS
payment were confirmed. Its operating operation is `25174263610757121`, distinct
from account creation; admission to the operating-credit journal is still pending.
Preparatory Supabase settings are human-reported saved, not independently read back.

**Not ready for activation:** keep both B enable flags `false`. This binding
correction is not backend deployment, journal credit admission or trigger activation.
Exact packaged-runtime and historical-trigger proofs remain deferred, not passed;
private Cloudflare provisioning and integrated financial acceptance remain unverified.
Client absolute routes need deliberate owner-side adaptation; a project URL change
alone does not redirect them.
This feature does not reset lane fences, change economics or resume concurrency.

## Edge startup compatibility

Keep `deployment-global-compat.ts` as the **first side-effect import** in the
entrypoint. Bundled Stellar SDK 13.3.0 reads Node's `global` while its modules
initialize; the Edge worker may expose only `globalThis`. The small compatibility
module adds that alias only when the property is absent and leaves an existing
binding unchanged. It has no dependencies or configuration/network access.
An assignment in the entrypoint body would run too late for static imports.

From the repository root, with Node 22.23.3, run the isolated ordering regression:

```sh
node --experimental-vm-modules --test supabase/tests/integration/deployment-global-compat.test.cjs
```

The regression evaluates the real entrypoint with inert dependency modules and a
serve-registration recorder. It checks ordering, repeated initialization and an
existing immutable global without dispatching requests or accessing credentials.
It is not a complete Edge worker or financial-runtime test. Verify the emitted
bundle's initialization order separately; do not patch generated or vendor files.
The v11 startup failure was rolled back to prior code as v12; this compatibility
candidate has not been deployed. See [recovery evidence](../../odd/tasks/d1-replacement-binding-recovery.md).

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
