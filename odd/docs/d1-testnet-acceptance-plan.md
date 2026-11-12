# D1 Testnet acceptance plan

**DRAFT — FUTURE EXECUTION NOT AUTHORIZED.** Only authoring this plan is approved.
This is a resumable checklist for donation → beneficiary claim, a separate expired
recovery/refund case, and unissued principal. It contains **no execution results**
and grants no automatic retries. Plan ready ≠ execution authorized ≠ D1 accepted.

## Quick path and scope

1. Resolve the public bindings and approval gates below without collecting secrets.
2. Obtain explicit human authorization for the selected cases and bounded actions.
3. In a future authorized session, collect app, ledger and accounting evidence together.
4. Stop on uncertainty; evaluate whole-donation conservation before accepting D1.

No installs, app opening, tests, builds, APK re-audits, transfers, SDK/SQL execution,
backend changes, network requests or authentication are authorized here. Publication
belongs to the peer sole publisher; this document neither commits nor publishes.
D3 physical-device/replayed-release evidence and D4 signed AAB/Play Store delivery
are not added to D1. A future device binding identifies the chosen app environment,
not a new contractual physical-device recording requirement.

## Sources and adopted requirements

- [Adopted D1 specs](../tasks/d1-local-completion.md), S2–S8 (lines 7–13), govern
  custody, new-pool eligibility, five-minute expiry, refunds and acceptance evidence.
  Its old T2–T6 progress rows are historical, not a reason to reopen completed work.
- [October SOW](../../instawards/Statement%20of%20Work%20(SOW)-Octubre.md), D1 at
  lines 61, 100 and 109; D3/D4 evidence at lines 111–112 is separately scoped.
- [Refund client guide](../../vaca_app/docs/d1-refund-client.md) and
  [remainder client guide](../../vaca_app/docs/d1-remainder-client.md) describe
  original-reference entry, personal signing, explicit commands and unknown holds.
- [Client source disposition](../tasks/d1-client-remainder-completion.md) and
  [refund prerequisites](../tasks/d1-refund-source-prerequisites.md) distinguish
  authored integration and test definitions from observed execution.
- [Android/configuration tracker](../tasks/d1-client-android-toolchain.md) and
  [artifact handoff](../../vaca_app/docs/d1-android-artifact-delivery.md) retain
  historical build/static evidence and backend-owner reports. Reconfirm current
  bindings with their owners; older artifact and publication entries are not live state.

| Non-negotiable invariant | Acceptance implication |
|---|---|
| Pool signing only in the authorized backend | Donor/beneficiary personal transactions and admin wallet proofs remain separate; no client pool key or service-role credential. |
| Only a verifiably NEW eligible pool | Prove creation/provenance and namespace; historical funds remain untouched and unmixed. |
| TTL = 300 seconds from chain payment confirmation | Record confirmedAt and immutable deadline = confirmedAt + 300s; never start from app opening, issuance, retry or local clock. |
| Beneficiary before expiry; admin-only recovery after expiry | Deadline is a predicate, not an automatic refund. Backend current-admin authorization must hold for recovery/refund. |
| Original donation identity never changes | Freeze network, pool, namespace, request, payment hash/operation, asset, donor, gross and deadline across all observations. |
| Team-funded operating balance pays fees/reserves | Verify separate operating credit and capacity; never deduct these costs from donor principal/refund or excluded historical funds. |
| All unclaimed principal returns to the original donor | Include unissued remainder; a claimed balance alone does not settle the whole donation. |
| Unknown/null is not zero | Require known complete conservation and known final zero; an HTTP reply or transaction hash is not settlement. |

## Status lanes — do not collapse into “done”

| Lane | Context only; no new verification in this plan |
|---|---|
| Source | Client integration authored; later full remainder/shared-hold paths lack behavioral proof. |
| Build | Existing APK reported; future case must bind its exact source/configuration and artifact hash, not assume current source is packaged. |
| Integrity | Bounded source/artifact inspections reported; not comprehensive secret-absence certification. Independent toolchain proof remains missing. |
| Deployment/activation | Backend owner reports implementation, publication and selected Testnet activation closed. Version1/JWT enabled is not functional proof. |
| Publication | Peer-owned source/evidence delivery; consult the current owner tracker, not a copied push/checkpoint claim here. |
| Financial acceptance | Donation/claim, expired refund and complete remainder conservation remain unproven here. |

Creation-credit persistence is intentionally deferred to the **first real app
operation**, through existing genuine preparation/current-admin issuance prerequisites.
Do not manufacture a preparation, new synthetic endpoint or funding to close it.
Public configuration isolated-static proof (#67) and same-anon-JWT dual headers are
reported complete in their scope; neither grants wallet/admin identity or live access.

## Preflight: bind before any future execution

Every TBD requires an explicit owner and human approval; identifiers are public only.
Do not collect or paste secret keys, seeds, tokens, raw signing payloads or private logs.

| Binding / decision | Typed value to approve | Owner / evidence required |
|---|---|---|
| Network and asset | `TESTNET`; native or exact issued code + issuer: TBD | Backend owner; no Mainnet or asset substitution |
| Donor / beneficiary | Public account IDs: TBD / TBD | Account operators; personal-signature capability, no keys |
| Recovery/release authority | Current admin public account ID: TBD | Backend owner confirms membership and action-specific authority |
| Eligible pool / namespace | Public account ID / UUID: TBD | Backend owner reconfirms creation, activation and original scope |
| Historical exclusion | Creation ledger/hash; excluded funds/provenance: TBD | Accounting owner; no historical balance assumed zero |
| Principal per case | Exact asset amount A/B/C: TBD | Human approves amounts; illustrative numbers below authorize nothing |
| Operating budget | Team funder ID, credit evidence, max fees/reserve exposure: TBD | Accounting owner verifies capacity separately from principal |
| Deployment | Backend revision, deployment version, public endpoint: TBD | Backend owner; public gateway contract and actual route availability |
| App artifact | Source commit, APK SHA-256, public configuration provenance: TBD | Client owner; bind existing artifact, no rebuild/re-audit implied |
| App environment | Device/emulator identifier, OS, artifact identity: TBD | Human approves any installation/opening separately |
| Original-reference handoff | Existing request UUID and payment mapping per case: TBD | Backend/client owners; app has no authoritative original-request discovery list |
| Case controls | Existing A/B issuance path; C unissued/mixed fixture path: TBD | Owners confirm feasibility before any payment |
| Authority envelope | Named executor, selected cases, action limits, cost ceiling, evidence owner: TBD | Explicit human approval, including any later observation/reconciliation |

The old selected pool/namespace/ledger are historical context, not defaults to copy.
Gateway headers use the same public anon JWT as agreed, but this document stores no
value. Gateway access never substitutes for personal-wallet signatures/current-admin checks.

## Scenario A — donation → beneficiary claim before five minutes

**Prerequisites:** approved bindings, verified new pool and operating capacity, genuine
app donation/issuance path confirmed, authoritative original-reference handoff available.
Choose an amount/issuance arrangement whose entire principal can be accounted for;
if issuance is partial, A alone cannot demonstrate whole-donation settlement.

**Future manual actions:** donor authorizes one genuine app payment; record chain
confirmation and original reference. Authorized release uses backend pool signing.
Beneficiary explicitly claims with their personal wallet before the immutable deadline.
No synthetic preparation, forced issuance allocation or deadline renewal is permitted.

**Expected app:** displays the matching aid/claim facts without pool signing; captures
observed outcome honestly. A per-balance claimed state must not imply full donation settled.
**Expected ledger/accounting:** payment and CB creation map to the same donation;
claimant predicates bind the beneficiary before the deadline and pool recovery after it.
The successful beneficiary claim is included before expiry, not merely submitted then.
Record actual credited principal, fees/reserves separately, and any remaining liability.

**Evidence/completion:** fill the template with payment, issuance, predicates and claim
Explorer links. Complete A only with verified claim inclusion and conservation; claim-only
whole settlement requires claimed = gross, refunded = known zero, remaining = known zero.
**Stop:** expiry reached without confirmed claim, mismatched mapping, or any global stop
condition. Do not silently convert this donation into case B or retry the claim.

## Scenario B — separate issued donation expires → authorized recovery/refund

**Prerequisites:** a separately approved donation/request with a verified issued CB,
original donor/deadline, current admin and sufficient protected operating balance.
Arrange no beneficiary claim for this case; do not reuse A's claimed balance.

**Future manual actions:** record payment and issuance; allow chain time to reach the
original deadline without claiming. Admin explicitly requests the existing advertised
recovery/refund flow using the original reference and personal-wallet proof.

**Expected app:** expiry is not shown as money already returned; pending, unknown and
observed states remain nonterminal until verified complete settlement. Admin entry is
navigation, not authority. **Expected ledger:** beneficiary is no longer eligible under
the predicate; authorized pool recovery and full original-donor payment are proven.
Recovery and payment may be operations in **one atomic transaction**; separate hashes
are not required. A returned hash, removed CB or off-chain receipt alone proves neither.

**Evidence/completion:** template records recovery/refund hash(es), operation IDs and
Explorer links; gross = donor refunded with known claimed zero and known remaining zero.
Include any unissued portion of this donation rather than refunding only the CB amount.
**Stop:** premature recovery, beneficiary claim already observed, insufficient operating
capacity, non-admin/mismatched scope, uncertain inclusion or any global stop condition.

## Scenario C — unissued remainder, including mixed claimed/unissued principal

**Prerequisites:** owners must confirm an existing supported fixture/control path that
leaves proven unissued principal under a genuine immutable donation. Feasibility is
**unproven**; source fixtures do not establish an app control or deployed capability.
Do not alter a database, force failure, generate balances or add a synthetic endpoint.
If no supported path is confirmed, mark C blocked before funds move; do not improvise.

**Future manual actions:** only after that gate and approval, use the confirmed path;
record positive evidence of non-issuance and the outstanding amount. After the original
deadline, admin explicitly selects the existing remainder flow with the same reference.
No v1/v2 lane switching, new request identity or hold clearing is allowed.

**Expected app:** original gross and deadline persist; unknown stays unknown. The v2
payment lane has no recovery CB ID, not an invented CB. **Expected ledger/accounting:**
original donor receives all verified unclaimed remainder; absence of a CB is not enough
to prove non-issuance or justify spending. Uncertain issuance blocks refund.
For a confirmed feasible mixed case, **10 donated / 1 claimed / 9 refunded is illustrative
only, not authorized amounts**. Claiming 1 does not settle 10; 9 stays protected until
actual refund. A partial claimed case needs its own verified claim and unissued evidence.

**Evidence/completion:** record `not issued — proven` with evidence references for the
unissued portion; retain any CB/claim evidence for issued portions. Require complete
conservation, original-donor credit and known zero remaining/unresolved principal.
**Stop:** missing feasible path, unknown issuance/outcome/accounting, an existing first-
submission hold or any global stop condition. No automatic fallback to the issued lane.

## Evidence template — copy per case only in a future approved evidence surface

All values below are **PENDING**, not results. Use explicit “not applicable — reason +
evidence” where justified; blank/null/absent never means zero. Keep chain operations
separate from backend observations/bookkeeping. Record timestamps and evidence provenance.

| Field | Pending evidence |
|---|---|
| Case, executor, approval reference, observation time | PENDING |
| Network, asset code/issuer, original pool/namespace/request | PENDING |
| Original donor / beneficiary / authorizing admin public IDs | PENDING |
| Payment hash + operation ID, confirmedAt + confirmation ledger | PENDING |
| Immutable deadline = confirmedAt + 300s | PENDING |
| Issuance hash + operation ID; CB ID(s) or not-issued proof | PENDING |
| Exact claimant predicates and ledger-time observations | PENDING |
| Claim transaction hash / operation ID / inclusion time | PENDING |
| Recovery transaction hash / operation ID | PENDING; same hash as refund allowed if atomic |
| Refund transaction hash / payment operation ID / actual donor credit | PENDING |
| Stellar Expert Testnet URLs for payment, creation, predicates, claim, recovery/refund | PENDING |
| Gross / beneficiary claimed / donor refunded | PENDING; exact asset units, no rounding |
| Unissued remaining / issued-unclaimed remaining / unresolved principal | PENDING; disjoint categories, do not double-count |
| Total remaining; conservation calculation | PENDING; gross = claimed + refunded + total remaining |
| Fees paid, fee payer, operating credit, reserve held/released | PENDING; separate from donor-principal equation |
| Before/after donor, beneficiary, pool and operating-balance observations | PENDING; ledger anchors and fees/reserve adjustments |
| Backend version/revision/deployment; APK source commit + SHA-256 | PENDING |
| App state/sanitized capture; backend bookkeeping and verification state | PENDING; off-chain records are not ledger operations |
| Final decision / blockers / evidence owner | PENDING |

## Stop and preserve — no automatic resubmission

Stop on ambiguous submission/outcome, auth/network/asset/scope mismatch, insufficient
verified operating funds, unknown accounting, or an already-held nonce/journal for a
first submission. Preserve original identity, durable hold and sanitized evidence.
Never automatically resubmit, replan, release ownership, refund, poll or reset storage.
Observation and reconciliation require **separate action-specific authorization** through
an existing flow; a “read-only” description is not blanket GET permission. Refund status is a freshly
wallet-signed POST; reconciliation is a distinct explicit observation command.
An included failed transaction can consume fees/sequence without settling principal.

## Bounded source-definition map — not executed by this plan

Every row is **SOURCE DEFINITION**, not PASS, live capability or complete coverage.
Titles are exact; historical recorded results remain in their original trackers and
apply only to their recorded revision/scope. No new tests are required by this table.

| Exact existing test title | Public source | Scenario / invariant |
|---|---|---|
| `signed preparation derives donor, asset and exact expiry from confirmed payment` | [prepare.test.ts](../../supabase/tests/unit/prepare.test.ts):44 | A/B/C immutable payment-derived TTL |
| `saved validator rejects altered economics, claimants, predicates, source, fee and timebounds` | [unsigned-transaction.test.ts](../../supabase/tests/unit/unsigned-transaction.test.ts):190 | A/B frozen issuance envelope |
| `positive claims preserve native and issued gross, unissued remainder and immutable inputs` | [beneficiary-claim-projection.test.ts](../../supabase/tests/unit/beneficiary-claim-projection.test.ts):81 | A/C claimed portion is not gross settlement |
| `recovery plan SDK envelopes refund native/issued full gross atomically; included failure has only Payment` | [recovery-refund-plan.test.ts](../../supabase/tests/unit/recovery-refund-plan.test.ts):23 | B/C unsigned plan, not actual submission |
| `issued principal protects asset-specific amounts and historical exclusions` | [refund-source-arithmetic.test.ts](../../supabase/tests/unit/refund-source-arithmetic.test.ts):56 | All: principal/historical protection |
| `accounting context native and issued partial issuance preserves gross donor debt and unissued remainder` | [issuance-accounting-context.test.ts](../../supabase/tests/unit/issuance-accounting-context.test.ts):91 | C partial issuance accounting |
| `refund candidates retain initial owners and immutable evidence across expiry, races and rejection` | [refund-candidates.test.cjs](../../supabase/tests/integration/refund-candidates.test.cjs):16 | B/C storage ownership; not ledger proof |
| `local D1 preparation reuses allocation contracts and isolates historical funds` | [preparation.test.cjs](../../supabase/tests/integration/preparation.test.cjs):38 | All: original allocation/exclusions |
| `a reduced gross cannot replace the original gross10 after claim1` | [refund_client_test.dart](../../vaca_app/test/refund_client_test.dart):134 | A/C immutable gross in client |
| `positive 1 + 9 settles original 10; beneficiary-only settlement is valid` | [refund_remainder_status_test.dart](../../vaca_app/test/refund_remainder_status_test.dart):45 | C DTO conservation, not feasible live mixed case |
| `included failure retains 9 and never permits a new refund command` | [refund_remainder_status_test.dart](../../vaca_app/test/refund_remainder_status_test.dart):61 | C failure hold/no retry |

## Outstanding proof and readiness decision

- **#40 functional:** DEFERRED; end-to-end financial/phone journeys are not established.
- **#48 toolchain:** independent proof missing after ENOSPC; a later APK does not erase it.
- **#56 source isolation:** zero independent probes; 12 integrated test definitions remain
  unrun. Source integration is not financial or independent verification acceptance.
- Cold responsive-layout results are historical presentation-only evidence. The 15 known
  D3 baseline failures are not newly discovered D1 regressions. Native unassessable/NULL means unknown,
  not approval. None of these dispositions waives contractual evidence.
- Remaining practical gaps: confirmed original-reference delivery, current artifact/backend
  binding, supported unissued/mixed control path, actual app/ledger outcomes and full accounting.

Before a future executor proceeds, the human must approve selected cases, identities,
amounts/cost caps, executor, app/device actions and any network/financial observations.
Tests, builds, re-audits, backend changes and publication require their own scope;
this plan authorizes none. An unavailable fixture path is a decision gate, not permission
for implementation. Keep volatile delivery status in the owner trackers.

- [ ] Public bindings and authority envelope approved; no secrets collected.
- [ ] New-pool provenance and separate operating capacity verified; historical funds excluded.
- [ ] A confirms beneficiary claim before the payment-derived deadline.
- [ ] B independently confirms expired recovery and original-donor refund.
- [ ] C confirms unissued-remainder return; mixed path only if supported and approved.
- [ ] Each donation conserves original gross with known final zero and no unresolved principal.
- [ ] Explorer evidence, original mapping, backend revision and targeted client source/build records linked.
- [ ] Missing proofs and artifact limitations explicitly assessed, not silently waived.
- [ ] Human acceptance recorded separately from plan readiness, execution permission and publication.
