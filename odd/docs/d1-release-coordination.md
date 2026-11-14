# D1 app and web release coordination

**Coordination ready does not mean D1 ready.** Android has a published test APK;
the complete web candidate and integrated financial acceptance remain pending.
Use this handoff to collect evidence in order, not as permission to deploy,
install/open the app, sign requests or move funds. No new API or receipt format
is defined here. Status below is a recorded snapshot, not a live service check.

## Owners and current handoff

| Work | Responsible owner | Recorded outcome / next evidence |
|---|---|---|
| Android source, artifact and app integration map | App coordinator, `feat/d1-t5b-proof` | Published artifact and bounded offline checks complete; original-reference map delivered to web owner. |
| Web payment, persistence, recovery, receipt and donor/admin UI | Exclusive web owner, `feat/d1-web-payments` | Last reported HEAD `375cd0aa` is partial/unpublished; journal writer tests passed, independent checks and full suite pending. Await complete candidate, not just the journal. |
| Backend deployment, current-admin authority and original economic facts | Backend owner; named executor to be recorded in execution handoff | Reconfirm exact deployment and public bindings; historical activation is not current end-to-end proof. |
| Web deployment | Web owner and app coordinator; deployment executor to be named before delivery | Bind complete candidate to the intended Vercel target and record actual publication evidence. |
| Financial scenarios and acceptance | Human authorizes scope; named operators execute and evidence owner records | Separate decision after readiness gates; no financial execution authorized by this document. |

The web owner retains `/home/danilo/projects/vaca-web-d1-posix`; the app coordinator
retains `/home/danilo/projects/vaca-d1-t5b-proof`. Do not duplicate writes or checks.
The human authorized the web owner's isolated public-copy verification proposal;
its execution/results are still pending in this snapshot. Runtime guards and
native consent remain separate. A new denial means stop, not another executor.

## Delivery sequence

| Gate | Required evidence | Current disposition |
|---|---|---|
| 1. Complete web candidate | Exact SHA and bounded work units; durable single-send, same-transaction recovery, original receipt and donor/admin UI; focused/full checks and required independent verdicts with failures retained | Await web owner. Passing a persistence test alone does not close this gate. |
| 2. Bind app/web/backend | Complete original-reference record below, supported routes, exact public configuration provenance and backend deployment identity | App entry mapped; web producer/handoff and current runtime pairing pending. Do not expose configuration values. |
| 3. Bind deployment | Repository/ref, target project/team, root, framework/build/runtime, required configuration presence, proposed URL and named executor | Await candidate-specific owner handoff. An old production mapping is not a new deployment. |
| 4. Deliver and observe | Actual deployment ID/URL, source SHA, state and alias; separately scoped nonfinancial checks with exact outcomes | Not executed here. Do not publish partial D1 or infer success from a Git push. |
| 5. Decide financial test scope | Approved identities, cases, principal and operating limits, app/device actions, executor and evidence owner | Follow the linked acceptance plan; no automatic installation, launch, transfer or reconciliation. |
| 6. Accept or retain gaps | Per-case app/ledger/accounting evidence, whole-principal conservation and explicit acceptance disposition | Unproven. A transaction hash, HTTP success or beneficiary claim alone is insufficient. |

Do not expand a nonfinancial check into a signed status request or app launch.
The app can prepare a Testnet wallet and process queued uploads on launch.
Specify exact routes/actions and effects before any runtime check.

## Original-reference handoff checklist

The producer owns provenance; the app must not reconstruct missing identity from
an incident, a claimable-balance ID or the time a screen was opened. This list
records existing economic facts, not a proposed import schema.

| Record to retain unchanged | Owner responsibility / distinction |
|---|---|
| Network, namespace, pool public key, original issuance request UUID | Web/backend owners retain original binding. `TESTNET` only; do not generate a replacement UUID. |
| Original payment transaction hash and operation ID | Web owner obtains verified payment evidence; distinguish payment hash from issuance/refund hashes. |
| Original donor and asset | Preserve original public account and exact native or issued code/issuer; no substituted recipient or asset. |
| Original gross and assigned allocation | Preserve both separately. Allocation is not original gross; positive claims do not settle all principal. |
| Original confirmation time and deadline | Preserve authoritative `confirmedAt`; deadline is original confirmation +300 seconds, not a new timer. Retain the wire deadline literal used by the app. |
| Incident and beneficiary | Preserve the original association; neither replaces the original request UUID. |
| Issuance/refund observations and evidence references | Keep them separate from payment provenance and economic authorization. Unknown/null is not zero. |

**Existing app route:** Identity → Herramientas de prueba → Reembolsos Stellar
testnet. Enter only the original namespace, pool public key and issuance UUID.
The complete authoritative record must remain available separately for comparison.
There is no full web-receipt importer in the inspected refund components.

The refund response displays payment hash, operation ID, donor, asset, gross and
backend-supplied deadline. Its strict DTO does not accept `confirmedAt`, incident,
beneficiary or allocation. Do not insert the web `expectedContext` into that DTO.
The durable submission hold is a limited baseline, not a complete receipt archive.
Opening the local reference is not permission to press status/refund/reconcile.
See the [refund client guide](../../vaca_app/docs/d1-refund-client.md).

## Android artifact to pair, not rebuild

| Identity | Recorded value |
|---|---|
| Published app/source documentation checkpoint | `88fc23e5643ed7517f13632ed16ac1ec5d2e5f96` (before this coordination-only document) |
| APK build source | `c8667d9c3c18eed0f8b9c90acb40adc80b660baa` |
| Test pre-release | [d1-android-testnet-c8667d9](https://github.com/DNO8/VACA/releases/tag/d1-android-testnet-c8667d9) |
| APK | `vaca-d1-testnet-c8667d9.apk`, 161,968,472 bytes |
| SHA-256 | `d1a62a3165699062dec9227e450c15d9e4abd1f60c90ef859ec49e7ab1cb698f` |
| Package / build | `cl.vaca.app.dev`, version 0.1.0/code 1, dev/debug; not a stable/store release |
| Installation | This published APK has not been installed or launched by the agent. The previously observed installed artifact is different. |

[APK delivery evidence](../evidence/d1-refund-apk-delivery.md) records build,
bounded inspection, publication and their limitations. The [offline report](../evidence/d1-refund-offline-independent.md)
records parent 60-test and independently adjudicated 8-probe results. Neither
proves deployed pairing or financial acceptance. No rebuild/retest is implied.

## Web owner return template

Fill this once the complete candidate exists; use `pending` or `blocked` rather
than inventing values. Share public identities and evidence links only, never
keys, credentials, configuration contents or raw signing payloads.

- Source: repository, branch, exact SHA, work-unit boundaries, published ref/status.
- Checks: commands/case identifiers, executor, exit codes, counts, evidence links;
  independent verdict and limitations; failed/skipped/pending checks retained.
- Journey: durable intent, single-send, same-transaction recovery, receipt and
  donor/admin UI status; identify any remaining legacy signing/sending route.
- Reference: producer and durable location for every original field above;
  manual app entry values and provenance, without new IDs or reset deadlines.
- Backend pairing: public endpoint/revision, network/pool/namespace, gateway and
  current-admin contract; configuration presence/provenance without values.
- Deployment: target project/team, Git mapping, root/build/runtime, URL and
  executor; after execution append actual deployment ID/SHA/alias/check results.
- Outstanding items: blocker, owner, required decision/evidence; next action
  and whether it changes data, sends a request, launches an app or moves funds.

## Acceptance and remaining proof

Reuse the [Testnet acceptance plan](d1-testnet-acceptance-plan.md), especially its
preflight, scenario prerequisites, evidence template and stop rules. Its earlier
status lanes are historical; the scoped artifact/test reports above supply later
evidence without changing the financial requirements.

- Scenario A: donation and beneficiary claim before expiry.
- Scenario B: a separate issued donation expires, then authorized recovery/refund.
- Scenario C: genuine unissued remainder, including mixed claimed/unissued
  principal. Supported case feasibility must be established before any funds move.

No fabricated unissued case, forced failure, synthetic endpoint or database edit.
Preserve the historical 5-XLM payment and browser pool record; no resend or
relabeling it as a D1 issuance. Pending, timeout, absence, missing CB,
`first_report` and `retained_match` authorize neither refunds nor new submissions.
Keep pool signing backend-owned and principal separate from operating costs.

Historical #48 independent toolchain proof and #56 backend-source review remain
open; record their explicit disposition, not an invented pass or automatic retry.
D2 web publication and D3 behavior stay outside this coordination unit.

**Next action:** receive the already-requested web owner's results and complete
candidate, then fill gates 1–3. This document prepares coordination only; it does
not close those gates, authorize financial execution or declare D1 accepted.
