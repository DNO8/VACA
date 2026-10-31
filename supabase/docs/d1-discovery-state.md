# Load durable discovery ingestion state

`021_d1_discovery_state.sql` adds a read-only, service-role-only RPC for an
activated namespace and a current admin wallet. Apply after migrations 015 and
019 (020 provides the companion operation query). No new tables or writes.

## API

Call `public.d1_load_discovery_state(p_namespace uuid, p_authorized_by text)`
from the authorized backend. `p_authorized_by` must identify a current member of
`admin_wallets`; the service role alone is not sufficient authorization.

The exact JSON object has these fields:

| Field | Value |
| --- | --- |
| `kind`, `revision` | `"d1_discovery_state"`, `1` |
| `namespace`, `network`, `pool` | Authorized namespace UUID, `"TESTNET"`, activated pool |
| `first_ledger` | Immutable activation boundary from 015 |
| `checkpoint` | `null`, or 019's exact `{cursor, through_ledger, ledger_hash, closed_at}` |
| `coverage_complete` | Boolean; true only for a matching committed empty-page marker |

The RPC reuses 019's current-admin validation and admin → pool → checkpoint
locks. It derives coverage from a committed 019 page in the same namespace whose
**both** cursors equal the current checkpoint cursor, whose `through_ledger`,
`ledger_hash` and `closed_at` equal the current checkpoint, and whose `records`
is exactly `[]`. Absent checkpoints and nonempty-only progress return false.
An old empty marker cannot cover a newer checkpoint. Replaying an original page
returns its original receipt without rewinding state or increasing page counters.

## Trust limits

`coverage_complete` describes **opaque backend ingestion progress at this exact
anchor only**. It is not independently verified chain continuity, retained/full
history, donation provenance, pool funding, reserves, execution readiness, or
permission to release/refund. No coordinator, network fetch, signing, deployment
or live Testnet operation is introduced here.

## Errors

Errors are inherited unchanged from `d1_load_discovery_checkpoint`:

| Condition | Error / SQLSTATE |
| --- | --- |
| Null namespace or invalid/null admin key | `invalid_discovery_page` / `22023` |
| Admin not currently registered (including revocation) | `unauthorized_admin_wallet` / `42501` |
| Namespace not activated | `pool_not_activated` / `22023` |
| `anon`, `authenticated`, or other ungranted role | PostgreSQL function permission denied / `42501` |

## Local verification

```sh
D1_TOOL_ROOT=/home/danilo/.local/share/vaca-d1-toolchain node --test supabase/tests/integration/discovery-query.test.cjs
```

The standalone local PostgreSQL fixture tests public RPC state transitions,
namespace/authorization boundaries, exact historical receipts, nonmutation and
existing 020 pagination. It stops its own PostgreSQL and removes its own scratch
in `finally`; passing is local implementation evidence, not deployed acceptance.
