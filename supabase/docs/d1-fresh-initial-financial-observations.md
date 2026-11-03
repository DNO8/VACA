# Revalidate observations even when the hash already exists

Migration 029 adds an atomic storage-freshness boundary for the future trusted
SDK-backed issuance gate. It does **not** prove SDK validity, sufficient funding,
backend key custody, HTTP authentication or permission to broadcast.

## One service-role RPC

`d1_record_fresh_initial_financial_observation(request UUID, authenticated admin,
complete initial snapshot)` calls 028 inside the same PostgreSQL transaction.
It retains the current-admin → pool → preparation/intent → owner/journal locks.
All invocations require READ COMMITTED, including historical hash reuse.

The returned `d1_fresh_initial_financial_observation`, revision 1, contains:

- `request_id`, `namespace`, `network: "TESTNET"`, `pool`;
- `authorized_by`: **this invocation's current admin**;
- `transaction_hash`, `snapshot_hash`;
- integer `validated_at`, snapshot `expires_at` (epoch seconds);
- `observation`: the full original immutable 028 receipt and snapshot.

The nested observation keeps its **original** authorizer. Rotation does not
rewrite historical evidence. The returned validation envelope is not a new
persisted ownership, fee reservation, deadline or reusable signing token.

## Why 028 success is insufficient

028 deliberately permits exact historical replay before freshness/state checks.
An old hash could therefore return successfully after history or credits changed.
029 always reloads and compares current 018 ownership/unsigned hash, 027 singleton
fees, 024 history and 026 credit state, even when 028 returned a pre-existing row.
It checks the original preparation deadline and its clock **after locks**;
expired evidence cannot become fresh merely because its receipt still exists.

Existing error families remain: `initial_financial_observation_conflict` (23505),
`initial_financial_observation_expired` (22023),
`initial_financial_observation_isolation_required` (25000),
`invalid_initial_financial_observation`, and existing admin/owner/deadline errors.
A failure rolls back a new observation inserted within this call, but never
removes an observation already committed by an earlier call. 028's historical
load/record contracts and role/table restrictions are unchanged.

## Required consuming boundary

The backend must build the snapshot internally through the accepted SDK assembler,
bind the actual validated unsigned bytes/hash, await this one RPC, validate its
entire response and recheck its own monotonic clock before a controlled action.
Never accept a caller-supplied snapshot/receipt as financial permission.

An unknown RPC outcome retains possible evidence and source ownership. No automatic
retry, readback, compensation, refund or release follows. This unit supplies no
signer, deployment, client-secret removal or complete D1 lifecycle.

The owned PostgreSQL fixture retains all 028 assertions and adds full-envelope
binding/admin rotation, denied roles and isolation, a **stored** hash becoming
expired while blocked, actual state drift on another already-stored hash, and
expired replay rejection while 028 still returns the unchanged historical receipt.
Its raw SQL snapshots are intentionally NON-SDK evidence, never funding proof.
