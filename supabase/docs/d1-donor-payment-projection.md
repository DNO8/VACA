# Donor payment r1: historical projection only

`projectDonorPaymentStatus` converts a private 054 capture into the exact public
[donor-r1 DTO](../../odd/docs/d1-donor-read-contract.md). It composes the captured
history/allocation/issuance validators and validates every 032 outcome before
returning any data. **Source authored only; TESTS NOT RUN under S15. This is not
an operational endpoint or financial acceptance.**

## Usage

```ts
import { projectDonorPaymentStatus } from "../functions/d1-custody/donor-payment-projection.ts";

// capture: unknown, obtained by the trusted private capture layer.
// verifiedCommand: VerifiedDonorPaymentCommand from independent wallet proof.
const dto = projectDonorPaymentStatus(capture, verifiedCommand);
const body = JSON.stringify(dto); // compact serialization, no extra fields
```

The synchronous API returns `Immutable<DonorPaymentStatusDTO>`, detached and
recursively frozen. It does not authenticate a wallet, call SQL/RPC, use a clock,
invoke a signer, record evidence or submit transactions. The command's structural
shape alone is not authentication; the host must use the existing proof verifier.

## What is checked and exposed

| Boundary | Behavior |
| --- | --- |
| Predecessors | Reuse `validateDonorIssuanceArtifacts`: owned SDK history, full allocations, preparation/economics, unsigned prefix, exact financial digests, signed envelopes and submission references. That new artifact layer is also source-only/unverified. |
| Every 032 row | Exact receipt/observed-outcome keys, kind/revision, scope/request, canonical historical G actor, outer attempt identity and matching validated signed/submission hashes. Their financial snapshot memberships remain independently checked; signing and submission snapshots need not be identical. |
| Outcome digest | Parse the entire bounded receipt first with `parseCapturedJSONB`; privately extract the exact nested `observed_outcome` token, preserving PostgreSQL JSONB spacing/numeric lexemes, and SHA-256 its UTF-8 bytes. No reconstructed JSON serialization is hashed. |
| SDK and membership | Require exact equality with a validated captured transaction-history record before using its persisted context. Call `parseInitialIssuanceOutcome(pool, signedXdr, {context, transaction: raw.transaction, ledger: raw.ledger})`; require equality with the complete stored outcome. Context/page anchors are not SDK transaction DTOs or invented trusted provider facts. |
| Late recording | Historical page anchors remain valid; no new clock, expiry/freshness gate, financial budget calculation or spending authorization. Existing allocation and unsigned economics checks are retained. |
| Public output | Only `version`, `network`, `namespace`, `pool`, `payment`, `allocations`, `snapshot`, with the exact r1 nested fields. No receipts, signed XDR, historical actors, financial snapshots or private context. |

Payment identity, donor, asset, fixed-seven positive int64 amount and ledger time
come from the existing validated history/allocation boundary. Deadline is exactly
that time plus 300 seconds in canonical UTC. Allocations retain every stored,
unique, lexicographically sorted request UUID, beneficiary and amount.

| Stored outcome | Public issuance |
| --- | --- |
| Absent | `not_recorded`, null transaction hash and null CB-ID, even if other history contains the transaction |
| Valid included failure | `failed_observed`, validated transaction hash, null CB-ID |
| Valid included success | `succeeded_observed`, validated transaction hash, SDK-derived deterministic CB-ID matching `^00000000[0-9a-f]{64}$` |

## Errors and limits

Any missing required ancestor, dangling reference, malformed/null present receipt,
contradiction, nonmember observation or overflow rejects the **whole lookup** with
`CustodyError("donor_payment_unavailable", 503)`. No row is silently omitted.
Only an actual predecessor `CustodyError("payment_not_found", 404)` is preserved;
current predecessors emit 503 for uncertain/null captures. This module neither
accepts error-shaped capture data as 404 nor certifies absence itself.

Limits are simultaneous: inherited 4 MiB defensive capture budget, 100 allocations,
1 MiB nested outcome text, and 65,536 UTF-8 bytes of compact public JSON. `readAt` is
a safe integer in 0…253402300799 and denotes database read time, not chain freshness.
No truncation or partial DTO is returned. Empty allocations require a validated
owned payment and the complete stored set to be empty.

## Remaining integration and proof

T4e3 implements this pure source boundary for S4/S14 under S15, not the complete
web/app/administrator flow. Trusted host capture/authentication wiring, HTTP error
mapping and `no-store`, consumer integration, automatic executor and independent
functional/security acceptance remain separate. History is SDK consistency over
captured provenance, not independent consensus proof. No current-CB unspent state,
refund eligibility, settlement or hold release may be inferred from any state.

**Unexecuted:** tests, probes, typecheck, build, PostgreSQL outcome-digest vectors,
privacy/failure-atomicity checks and integration/latency proof. No network, scratch
runtime, deployment, activation or financial execution was performed. S15 stops
execution of tests; it does not convert this source into verified readiness.
