# Read one bounded transaction-history page

Migration `025` exposes stored `024` observations through a current-admin,
service-role-only RPC. It adds no direct table access, SDK approval or financial
authority. Existing journal writers and receipts are unchanged.

## RPC contract

`d1_list_transaction_records(p_namespace uuid, p_authorized_by text,
p_after text default '0', p_limit integer default 100)` authenticates through
`d1_load_transaction_history_state` before validating pagination. Its pool lock
keeps the returned records and `history_state` consistent during this call.

| Input | Rule |
| --- | --- |
| `p_after` | Exclusive canonical unsigned-64 transaction TOID; positive ledger/transaction position and zero operation offset, or initial `'0'`. |
| `p_limit` | Integer 1–100; omitted means 100, explicit null is invalid. |
| Invalid pagination | SQLSTATE `22023`, message `invalid_transaction_query`; no journal mutation. |
| Authorization | Current admin on every call, including empty results; PUBLIC, anon and authenticated cannot execute. |

Returns `kind: d1_transaction_records`, revision1, namespace/network/pool,
`from_cursor`, `next_cursor`, `records`, `has_more` and `history_state`.
Records are the exact stored opaque observations, ordered **numerically**, not
lexically. `next_cursor` is the last returned token or the unchanged input for an
empty result. A valid cursor beyond stored history returns an empty list.

## Safe consumption

Use `next_cursor` only for this transaction journal, never income operations.
Keep/check the returned state identity across multiple calls: one call's lock
is not a multi-call snapshot. An empty list or `has_more: false` does not establish
coverage; inspect the independently computed journal coverage state instead.

A later backend reader must revalidate every stored raw SDK record and establish
complete current evidence before financial assembly. These reads do not approve
fees, release ownership, retry execution, or authorize signing. Isolated SQL
fixtures deliberately use non-SDK bytes; they prove pagination, authorization and
storage preservation, not chain truth or deployed D1 acceptance.
