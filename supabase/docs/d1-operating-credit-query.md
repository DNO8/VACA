# Enumerate the original operating-credit receipt set

Migration026 adds service-role-only, current-admin read RPCs over022 receipts.
They expose a stable membership identity for a later SDK-validating aggregate;
they **do not approve credit, sum opaque amounts or authorize spending**.

## Read interfaces

| RPC | Arguments | Result |
|-----|-----------|--------|
| `d1_load_operating_credit_state` | namespace UUID, authenticated admin public key | `d1_operating_credit_state`, revision1, namespace/network/pool, `receipt_count`, `set_hash`, `discovery_state` |
| `d1_list_operating_credits` | same binding, `p_after` default `0`, `p_limit` default100 | `d1_operating_credits`, revision1, namespace/network/pool, `from_cursor`, `next_cursor`, unchanged `receipts`, `has_more`, `credit_state` |

Cursor strings are canonical unsigned uint64 operation IDs, with `0` as the start
sentinel. Pagination is exclusive and numerically ordered. Limits are integers
1–100; invalid queries raise `invalid_operating_credit_query` (22023).
Authentication precedes query validation. Existing current-admin → pool →
checkpoint locks serialize each call with022 writers; no direct table grants or
new mutable counters are introduced. Original authorizers and observations remain
unchanged after admin rotation and discovery advancement.

## Membership identity

`set_hash` is lowercase SHA-256 of UTF-8 text consisting of namespace, colon,
pool, colon, then the concatenated lowercase SHA-256 hashes of each original
receipt's canonical PostgreSQL JSONB text, ordered by numeric operation ID.
Each inner hash is a fixed64-character field. The empty set has an explicit
namespace/pool-bound hash. Identity includes full receipts, not just count or the
income checkpoint; two same-sized sets with different authorizers differ.

The hash identifies stored membership. It is not a signature, chain commitment,
proof of valid SDK data or current funder approval. Readers should compare the
entire state on every page and a final reload. A single call is serialized, not a
multi-call snapshot or atomic financial reservation. `has_more: false` alone does
not establish complete discovery, approved funding or zero historical balances.

## Verification and next dependency

The extended owned PostgreSQL journal fixture preserves022 assertions and checks
exact original receipts, defaults/limits/cursors, numeric decimal-width ordering,
namespace/role isolation, auth-first revocation, full-receipt identity changes at
constant count and stable membership across replay/admin rotation. Owner-seeded
NON-SDK observations exercise opaque enumeration, not financial validation.

The next aggregate must SDK-revalidate historical receipts and require one stable
complete state. Historical balance evidence, original-donor disposition accounting,
future fee commitments and fresh owner-bound authorization remain separate gates.
No live migration, keys, signing, deployment or on-chain acceptance is implied.
