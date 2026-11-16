# Positive refund-lane routing before candidate creation

`createRefundLaneSelector` proposes a lane only from positive evidence and
preserves permanent ownership first. It may acquire and save genuine beneficiary
claim evidence through an explicit trusted capability, but **never creates a
candidate, reserves a lane, signs, submits or grants execution authority**.

**Source-only, partial and unverified under S15.** No tests, probes, typechecks,
builds, SQL, runtime or network checks were executed for this change. Source
self-review is not functional, security or concurrency proof. Page/host wiring,
activation and financial acceptance are separate work.

## Private API and capabilities

The factory remains compatible with its existing configuration and optional
CB reader. Its fourth argument is an optional, explicit acquisition capability:

```ts
createRefundLaneSelector(client, configuration, source?, acquisition?)
// source: readClaimableBalance plus optional readAccountAtCheckpoint
// acquisition: { fetcher: typeof fetch } — trusted server transport only
// returned function: (requestId: string) => Promise<RefundLaneSelection>
```

Capture the real private client, fixed namespace/pool/service actor/TESTNET,
clock and freshness policy once. Methods and receivers are captured before the
first await. The returned function accepts only an original request ID, never
a lane, raw evidence, financial observation or affirmative callback. The actor
binding is not authentication proof: the trusted host and current SQL admission
must independently establish authority.

- Omitting `acquisition` disables beneficiary evidence writes; an already saved,
  authenticated claim can still support v2 with the real account reader.
- Omitting `readAccountAtCheckpoint` disables new v2 proposals, not existing-fence
  routing or positively evidenced v1 proposals. No default network transport is
  silently installed by the selector.
- Supplying `{ fetcher }` opts into the actual bounded, pinned Testnet beneficiary
  acquisition helper and its single selected-request 039 write under S11/057.
  It is not a permission callback or a substitute for database authorization.

## Selection contract

| Evidence | Result |
| --- | --- |
| Valid namespace fence owned by another request | `held / foreign_owner`; no lifecycle, provider or acquisition work. |
| Matching v2 fence | `existing / verified_remainder_v2` with its candidate hash; routing identity only. |
| Matching v1 fence and stable matching original/candidate ownership | `existing / full_gross_v1` with its candidate hash. |
| No fence and positively observed failed initial inclusion | `proposed / full_gross_v1` after stable original ownership and no refund journals. Never-issued is not failed-included. |
| No fence, successful issuance, positive current exact-original CB, no contradictory authenticated claim | `proposed / full_gross_v1`; indexed head must be fresh **and closed at or after the original deadline**. |
| No fence, authentic positive beneficiary claim and positive matching-original current remainder funding | `proposed / verified_remainder_v2`, only through the recovered helpers below; no contradictory positive CB. |
| Missing, stale, malformed, contradictory or ambiguous evidence | `held`; no candidate insertion to discover eligibility, retry or opposite-lane fallback. |

Every new proposal also requires a final fence-null reread and a still-valid
observation window. A newly observed fence causes a hold, not a lane switch.
Original deadline remains **original confirmation +300 seconds**, validated by
`observeRefundLifecycle`; it is not extended by acquisition or refund work.

### Successful issuance: positive evidence, not absence inference

1. Call `loadBeneficiaryClaim(bound, scope, { now })`. The helper authenticates
   stored 039 evidence against original SDK/history membership. A null receipt
   means unknown, not zero claimed or proof of an unclaimed balance; RPC or
   validation failure holds immediately.
2. Use `readClaimableBalance` with the reconstructed original CB ID, beneficiary,
   asset, allocation amount, deadline and inclusion ledger. A positive response
   plus a positive claim is contradictory and holds. Before v1, reread 039 to
   detect a claim saved during the provider await. A fresh pre-expiry indexed
   head cannot justify v1 while the beneficiary can still claim.
3. A thrown CB lookup (including 404) remains unknown. It does **not** select v2.
   Only in this unresolved-CB branch, if 039 is missing and both account reader
   and explicit transport are present, call
   `recordBeneficiaryClaim(evidenceClient, scope, { now, fetcher })`. That helper
   performs real bounded acquisition, validates inclusion and original/history
   bindings, writes once, validates acknowledgement and authenticated readback.
   A malformed returned CB DTO holds rather than taking this acquisition path.
4. With a genuine positive claim, call
   `observeCurrentRemainderFunding(bound, scope, { source, now,
   maximumAgeSeconds, futureToleranceSeconds })`. This is the actual pre-041
   observer, not a pure calculator supplied with invented inputs. It validates
   complete authentic 039 membership/history, original accounting, issuance fee
   commitment/ownership, operating credits, pool creation, current account,
   sequence, fees, obligations and stable rereads. Its canonical **one claim /
   one successful issuance** restriction is unchanged; foreign request reads
   are not admitted to broaden it.
5. Bind the positive claim and selected remainder back to the original payment,
   request, issuance and deadline. Require matching 039 acquisition hash,
   positive `verifiedBeneficiaryPrincipalStroops` and
   `selected.remainingProtectedPrincipalStroops > 0`. The funding observer's
   `executionAuthority` and `settlementAuthority` remain `false`.

CB allocation amount is not original gross. The existing full-gross executor
still validates and constructs the gross refund; the remainder executor still
validates and constructs its own refund. Neither is called by this selector.
Indexer consistency is not independent consensus proof.

## Evidence-write boundary and actual RPC arguments

The read client admits only exact helper argument shapes, always binding
`p_authorized_by` to the fixed actor and any `p_request_id`/`p_namespace` to the
selected request/configured namespace. Helpers bind returned pool and network.
There is no arbitrary pool or actor argument forwarded from a caller.

| Read RPCs | Exact arguments |
| --- | --- |
| `d1_load_refund_lane_fence`, `d1_load_refund_outcome`, `d1_load_refund_candidate`, `d1_load_refund_submission_attempt`, `d1_load_issuance_outcome`, `d1_load_submission_attempt`, `d1_load_signed_transaction`, `d1_load_unsigned_transaction`, `d1_load_beneficiary_claim`, `d1_load_issuance_fee_commitments` | `p_request_id`, `p_authorized_by` |
| `d1_load_refund_financial_observation`, `d1_load_initial_financial_observation` | Request arguments above plus `p_snapshot_hash` |
| `d1_load_active_issuance_sequence`, `d1_load_transaction_history_state`, `d1_list_beneficiary_claim_set`, `d1_load_discovery_state`, `d1_load_operating_credit_state` | `p_namespace`, `p_authorized_by` |
| `d1_list_transaction_records`, `d1_list_operating_credits` | Namespace arguments above plus `p_after`, `p_limit` |
| `d1_load_operating_credit` | Namespace arguments above plus `p_operation_id` |

Only the separate local `evidenceClient` additionally admits
`d1_record_beneficiary_claim(p_request_id, p_authorized_by, p_acquisition)`.
It is passed solely to `recordBeneficiaryClaim`, not to lifecycle/funding readers
or a caller. The selected-request actor binding and payload namespace/pool/
TESTNET identity are checked before forwarding. The acquisition comes from the
real helper, never from an affirmative DTO fabricated by the selector. A flag
is set **before awaiting** the single possible write; every other writer is
denied. Historical financial evidence reads are allowed; financial writes,
candidate creation, issuance, signing, submission and settlement RPCs are not.

An acquisition failure, lost write acknowledgement, failed readback or subsequent
funding failure returns `held / evidence_unavailable`. A genuine 039 receipt may
already have persisted; this invocation neither retries nor proposes v1. The
caller must not treat a hold as an instruction for immediate retry or fallback.

## Permanent ownership and remaining proof

The first actual 040 read validates the exact lookup/receipt identity, namespace,
pool, owner, lane and hash. Historical authorizers are preserved, not rewritten.
Existing fences bypass new-lane acquisition. If the matching executor is absent
or rejects its own validation, the caller must hold rather than try the other
lane. No fabricated verified HTTP command or new executor API is involved.

The final null reread only detects some ownership drift. It is **not a
reservation or an atomic snapshot**: another owner can win immediately afterward.
The actual SQL candidate write plus immutable 040 fence remains the atomic
exclusion point. Executors must revalidate evidence and authorization there.

Review priorities: **risk item 2**, genuine evidence versus authority and the
single 039 write capability; **risk item 4**, fence-first routing and the
non-atomic proposal boundary. T2ae covers source integration for S1/S5/S7/S11
within S18–S19 ownership and the S15 execution prohibition. Functional, permission,
malformed-evidence, ambiguity and race preservation checks remain unexecuted;
this guide makes no operational-readiness, deployment or funds authorization claim.
