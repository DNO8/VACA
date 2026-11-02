# Retain fee commitments under the existing issuance owner

Migration027 adds private immutable issuance/refund fee declarations referencing
017's existing request/source owner. It does not acquire another owner, change
unsigned v1 receipts or authorize spending. Declared amounts are **opaque backend
accounting evidence**, not SDK-verified fees or proof of team funding.

## Public RPCs — service role and current admin only

| RPC | Inputs | Result |
|-----|--------|--------|
| `d1_load_issuance_fee_commitments` | request UUID, authenticated admin | `d1_issuance_fee_commitment_lookup` revision1, derived namespace/TESTNET/pool/reservation, nullable selected `commitment`, complete namespace `commitments` array |
| `d1_record_issuance_fee_commitment` | same binding, issuance fee stroops, future refund fee stroops | Original immutable `d1_issuance_fee_commitment` revision1 with reservation, amounts, original authorizer and preparation deadline |

Amounts are canonical positive integer strings. Each and their sum must fit
signed int64 stroops. A missing/zero/fractional/noncanonical/overflowing declaration
raises `invalid_issuance_fee_commitment` (22023). A changed valid amount raises
`issuance_fee_commitment_conflict` (23505), never overwrites the original.

Both functions reuse018's current-admin → derived pool → preparation/intent →
source owner/journal lock ordering. Pool serialization protects absent rows and
namespace enumeration. The request must own a017 reservation to write; missing
ownership raises `d1_issuance_sequence_not_found`. A prepared non-owner may read
all namespace commitments, so another request's obligation cannot become zero.
No direct table grants, mutable counters or caller-supplied namespace/pool exist.

## Replay, deadlines and uncertainty

Exact replay returns original evidence after expiry and admin rotation, while
current admin membership is always required. First write checks the actual
preparation deadline **after** acquiring locks. No TTL, deletion, reassignment,
settlement or ownership-release RPC is added.

An unknown save outcome may have committed both evidence and continuing ownership.
Only an explicit later invocation can recover it; no automatic retry, readback,
refund, compensation or release is authorized. Existing unsigned evidence without
commitments stays historically replayable; missing commitment must block later
financial authorization, not erase replay evidence.

## Verification and downstream requirements

The owned PostgreSQL fixture exercises current-admin/role/table isolation,
namespace enumeration, missing owner, monetary boundaries, rollback preservation,
exact/conflicting concurrent writers, expired first-write rejection, expired exact
replay and unchanged old unsigned bytes/receipts. SQL fixtures intentionally use
NON-SDK bytes and owner-only expiry setup; they are not chain acceptance evidence.

The next typed adapter must validate reservation and historical unsigned SDK
bindings, require issuance commitment to match the actual proposed/saved fee and
await one exact durable receipt before success. A trusted fresh financial gate
must account for every commitment alongside verified credits, fees and protected
donor principal. Terminal settlement belongs to verified execution/reconciliation,
never timeout inference. No live migration, signing, deployment or D1 completion
is implied.
