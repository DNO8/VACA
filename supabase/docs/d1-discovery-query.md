# D1 opaque discovery query (local implementation)

`020_d1_discovery_queries.sql` adds a read API over the immutable observations
stored by migration 019. It requires migrations 015 and 019. It does not fetch
Stellar history or establish scan coverage, provenance, funding, or readiness.
No deployed or on-chain acceptance is implied by the local fixture.

## Call and response

Only a trusted backend using `service_role` may call:

```sql
select public.d1_list_discovery_operations(
    p_namespace := '00000000-0000-4000-8000-000000000001'::uuid,
    p_authorized_by := '<current admin public wallet key>',
    p_after_cursor := '0',
    p_limit := 100
);
```

The last two arguments default to `'0'` and `100`. The cursor must be a canonical
unsigned decimal uint64 string (`0` through `18446744073709551615`). Signs,
whitespace, leading zeroes other than `0`, fractional/exponent notation, empty
strings and SQL NULL are rejected. The integer limit must be 1–200 inclusive;
SQL NULL is rejected. PostgreSQL's normal argument type errors apply before the
function runs (for example, a non-integer limit or malformed UUID).

The JSON object contains:

| Field | Meaning |
| --- | --- |
| `kind` | `d1_discovery_operations` |
| `revision` | `1` |
| `namespace`, `pool` | Registry-bound namespace and pool, not caller-supplied pool facts |
| `network` | `TESTNET` |
| `first_ledger` | Actual `d1_pools.first_ledger` activation boundary from 015 |
| `checkpoint` | Exact current 019 checkpoint object, or JSON null if absent |
| `records` | At most `p_limit` exact stored 019 record JSON objects |
| `next_cursor` | Last returned record's token; unchanged requested cursor if empty |
| `has_more` | Whether another stored record has a numerically greater token |

Results use strictly increasing **numeric**, not lexical, `paging_token` order
and exclude the requested cursor. For example, tokens `2`, `10` and
`18446744073709551615` paginate in that order. Start at `0`; for each subsequent
call pass the previous `next_cursor`. A final/empty result has `has_more: false`.
An activated pool without observations returns `records: []`, the requested
cursor, `has_more: false`, and `checkpoint: null`. Unknown namespaces are errors,
not empty results. There is no offset pagination, caller-selected pool or network,
or automatic checkpoint advancement.

## Authorization, errors and consistency

The function is `SECURITY DEFINER` with an empty search path. Execute privileges
are revoked from PUBLIC, `anon`, and `authenticated`, and granted only to
`service_role`. It does not grant table access. The backend must authenticate the
request and bind `p_authorized_by` to that identity; passing a public key is not
proof of wallet ownership and this RPC is not a browser authentication API.

It reuses `d1_load_discovery_checkpoint` unchanged. Every call checks current
`admin_wallets` membership and takes the existing admin share lock and serialized
pool/checkpoint locks. A committed admin revocation therefore denies subsequent
calls. The pool lock serializes reads with 019 writes, including initially absent
checkpoints. It remains held until the calling transaction ends: keep transactions
short. Separate pagination calls are not a frozen multi-request snapshot; new
pages may arrive between calls. `has_more` describes the locked query observation,
not future completeness. Numeric filtering/sorting may scan the namespace's stored
journal; output is bounded by record count, not a separate response-byte budget.

| SQLSTATE | Fixed message / cause |
| --- | --- |
| `22023` | `invalid_discovery_query`: invalid cursor or limit after authorization |
| `22023` | `invalid_discovery_page`: inherited null namespace or invalid admin-key syntax |
| `42501` | `unauthorized_admin_wallet`: inherited current-admin check |
| `22023` | `pool_not_activated`: inherited unknown namespace check |
| `42501` | PostgreSQL permission denial for roles without EXECUTE |

Authorization/namespace lookup happens before cursor/limit validation. Errors
return no receipt or records. Neither successful nor rejected queries change
records, page receipts, counters, checkpoints or registry metadata.

## Trust limits and local verification

Records, including donor/raw operation fields, are returned as opaque stored JSON,
without normalization, enrichment, donor inference or reinterpretation. JSONB
storage does not preserve original textual JSON whitespace/key order. A stored
checkpoint and activation `first_ledger` are metadata, not independently verified
history or evidence that all ledgers were scanned. This API does not establish
payment confirmation, donor liabilities, operating credit, excluded historical
funds, release/refund authority, signing readiness or chain execution. It performs
no signing, funding, transfers, live calls or deployment. D1 remains incomplete.

The standalone fixture uses existing isolated toolchain binaries and ephemeral
PostgreSQL only, applies minimal retained dependencies plus 015/019/020, and
removes its own database/process in `finally`. It does not run the legacy slow
preparation scenarios or copy Deno caches:

```sh
D1_TOOL_ROOT=/home/danilo/.local/share/vaca-d1-toolchain node --test supabase/tests/integration/discovery-query.test.cjs
```

Assertions exercise the public RPCs for numeric pagination, defaults, empty/max
boundaries, namespace isolation, role denial, current admin revocation, fixed
input errors, exact record return and immutable checkpoint/page-receipt replay.
Local passing tests are not deployed or transaction evidence.
