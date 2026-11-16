# Refund financial evidence: persistence leaf, partial integration

**Source authored; TESTS NOT RUN (S15).**
`observeAndSaveRefundFinancialEvidence` assembles evidence through the existing
refund observers, then writes it through the intended financial-observation RPC.
It is **not read-only**, a refund executor, or permission to sign or submit.
The required SQL RPCs are absent from the current local migrations, so this is
partial integration, not operational readiness or financial acceptance.

## API and caller boundary

Source: [`refund-financial-observation.ts`](../functions/d1-custody/refund-financial-observation.ts).

| Export | Contract |
| --- | --- |
| `observeAndSaveRefundFinancialEvidence(client, scope, options)` | Returns `Promise<Readonly<RefundFinancialObservation>>`; performs observation, one record call, then one matching lookup. |
| `RefundFinancialSnapshot` | Revision-1 `d1_refund_financial_snapshot`, TESTNET scope, observation/expiry seconds and complete funding evidence. |
| `RefundFinancialObservation` | Revision-1 persisted receipt with request/scope, original authorizer, candidate transaction hash, SQL snapshot hash and snapshot. |

The client, scope and options types derive from `observeSavedRefundFunding`.
Scope has exactly `namespace`, `pool`, `requestId`, `authenticatedAdmin`;
namespace/request use canonical lowercase UUIDs and pool/actor use valid G keys.
Options have exactly `now`, `maximumAgeSeconds`, `futureToleranceSeconds`, plus
optional `source` with `readAccountAtCheckpoint` and `readClaimableBalance`.
The original API names remain for later coordinator reuse. A wallet string is
not authentication: the trusted caller and actual SQL gates must establish it.

The leaf captures the original RPC method/receiver once and retains it privately
for persistence. It passes `captureRefundReadClient` to the funding observer;
the existing read allowlist is not expanded to admit writes. Scope/scalars and
the clock method/receiver are captured before asynchronous work. Existing
creation/claimable/account leaves capture provider methods before their awaits.
No caller-approved snapshot, administrator facade, purpose flag or GUC is added.

## Evidence and conservation path

1. Reuse funding → creation → claimable/account observers, not a parallel validator.
   These bind the candidate to the request, namespace, pool, initial outcome and
   complete history, account anchor/sequence, current-incarnation creation, held
   owner/commitment and positive claimable-balance evidence where required.
2. Reuse `calculateRefundLiquidPrincipal` and `calculateRefundFeeEarmarkBudget`
   through funding. Gross donations remain liabilities; only proven current
   encumbrances reduce liquid principal. Missing balance proof does not discharge
   debt. Unmatched activity and unsupported commitment membership fail closed.
3. Preserve the selected full fee earmark, other unissued-refund fees and current
   minimum reserve. Available operating funds are the lesser of physical capacity
   after principal/liabilities and observed team credits minus confirmed fees.
   Bounded integer arithmetic and one/two-operation fee rules remain in the leaves.
4. Decode the same unsigned TESTNET transaction and bind source, sequence, hash
   and zero signatures. Assemble the complete funding snapshot, not a summary.

Maximum age is an integer **1–30 seconds**; future tolerance is **0–2 seconds**.
Expiry is `min(transaction.maxTime, account.anchor.closedAt + maximumAgeSeconds)`
and must be strictly later than funding observation. Existing observers recheck
monotonic time and shared anchors around asynchronous reads. This leaf checks
again before persistence, after the record reply, and after lookup. Snapshot JSON
is limited to 16 MiB before recording. These are validity/size bounds, **not** a
new timeout or cancellation guarantee for a hanging injected transport/provider.

## Real persistence contract

| RPC | Exact parameters |
| --- | --- |
| `d1_record_refund_financial_observation` | `p_request_id`, `p_authorized_by`, `p_snapshot` |
| `d1_load_refund_financial_observation` | `p_request_id`, `p_authorized_by`, `p_snapshot_hash` |

Both calls use the captured request and actor. Returned receipt and lookup must
match the configured namespace/pool/request, TESTNET, candidate hash, snapshot,
times and each other. Replies are detached and frozen before later clock calls;
accessors, exotic objects, cycles and malformed receipt shapes are rejected.
Identical SQL replay can retain another legitimate original authorizer: the
receipt authorizer must be a valid G key, not necessarily the current caller.
The request actor is never substituted with that historical receipt authorizer.

The intended SQL hashes UTF-8 PostgreSQL `snapshot::text` (JSONB). This leaf uses
structural canonical comparison, **not** a replacement JavaScript digest. It
checks hash shape and matching readback; it trusts the intended SQL digest and
does not independently prove it from JavaScript serialization.

Errors collapse to `refund_financial_observation_unavailable` (503), except the
existing funding reader's accepted `unauthorized_admin_wallet` denial (403).
Provider/transport failures do not become authorization evidence. There is no
retry: a rejected record reply, lost response, failed lookup or elapsed window
can follow a committed evidence write. A 503 does not prove that nothing saved.
Neither success nor failure releases ownership, signs, submits or moves funds.

## Dependencies and next integration unit

Recovered from the explicitly authorized public baseline file:
`/home/danilo/worktrees/vaca-d1-wsl-baseline/supabase/functions/d1-custody/refund-financial-observation.ts`.
Only this leaf was recovered. Local funding/account/creation/claimable helpers
and the existing `CustodyError`/SDK contracts are reused, not overlaid.
Local adaptations add pre-observation scope checks, exact key membership,
RPC prototype-cycle rejection and the explicit read-only descendant boundary.

The public baseline dependency `supabase/migrations/035_d1_refund_financial_observations.sql`
defines the real table/RPC contract, but is **not present or copied here**.
It checks current candidate/owner/commitment/history membership and financial
equations, then final administrator membership and expiry even on replay.
Its `service_role` execution grant is not admission for an automatic actor.
Blindly overlaying it after 053 would inherit changed candidate-reader admission;
its authorization must be reconciled deliberately, preserving the writer gate.

Next work must supply compatible financial persistence/read admission, trusted
service identity and coordinator/executor wiring. Preserve 049–053's separate
scope/read admissions and 048's issuance-mutation exclusions. This leaf neither
provisions a principal nor expands permissions or changes manual/host paths.
Do not claim a service can invoke the persistence path until actual gates permit.

## Delivery and proof limits

T2j source coverage: S5 additive recovery, S6 public-baseline isolation, S7/S11
bounded evidence architecture, S14 implementation, S15 source-only delivery.
S7/S11 service admission and end-to-end execution remain pending. **Risk 2:**
authorization and financial-evidence correctness need independent proof.
No tests, probes, typechecks, builds, SQL execution, network calls or runtime
writes were performed for this recovery. Behavioral/security preservation and
integration are **unverified**; no deployment, activation or funds are authorized.
