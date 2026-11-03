# Persist initial financial evidence under the existing owner

Migration028 journals a trusted backend's initial financial snapshot and its
unissued-refund provisions. A receipt is **opaque evidence, not SDK proof,
financial approval or permission to sign**. Only the future trusted fresh gate
may construct these facts internally and consume the persisted result.

## Service-role RPCs; current admin required

| RPC | Inputs | Output |
|-----|--------|--------|
| `d1_load_initial_financial_observation` | request UUID, authenticated admin, returned snapshot hash | Bound lookup with current unsigned transaction hash and nullable original observation |
| `d1_record_initial_financial_observation` | request UUID, authenticated admin, complete initial snapshot | Immutable observation binding original authorizer, namespace/Testnet/pool/request, unsigned hash and full snapshot |

The snapshot identifier is PostgreSQL SHA256 of canonical JSONB text in UTF8.
It is **not** a hash of JavaScript `JSON.stringify` output. Consumers must validate
the full returned snapshot/owner/unsigned binding, not trust an echoed hash alone.

028 references017's existing exclusive request owner and inherits018's
current-admin → pool → preparation/intent → owner/journal lock protocol. It
compares027's complete singleton commitment,024 history and026 credit state
under the same pool lock. Missing ownership/unsigned evidence cannot create a
new owner, a plan or a transaction.

New writes require **READ COMMITTED**. RR/Serializable first writes raise
`initial_financial_observation_isolation_required` (25000), rather than claiming
that an old MVCC membership snapshot is current. No session setting is changed.
Exact stored historical replay remains evidence under all supported read contexts.

## Checked persistence boundary

Snapshots have the exact19 top-level fields of revision1 and at most1MiB canonical
JSONB text. Namespace/request/network/pool, current states, account anchor/owned
sequence, selected donor/operation/hash/asset/confirmation/amount and fee bindings
must match. Up to1,000 donations use unique canonical uint64 operation IDs and
positive int64 stroops. SQL recomputes positive unissued remainder IDs and their
base-fee provision, preserving gross donation principal and selected issued fees.

After locks, SQL checks its current clock, the original preparation deadline,
anchor age≤30 seconds and future tolerance≤2 seconds. No receipt renews the
request's deadline. Failure codes are `invalid_initial_financial_observation`
(22023), `initial_financial_observation_conflict` (23505),
`initial_financial_observation_expired` (22023), or existing ownership/deadline/admin
errors. API roles and direct table access remain denied.

SQL deliberately does **not** re-run the SDK, establish pool creation/consensus,
validate current Horizon balances or recompute the entire operating budget. Those
facts must come from the accepted assembler, never an HTTP caller's snapshot.

## Replay, refresh and unknown outcomes

Exact snapshot replay returns original evidence before freshness checks, including
expired observations and admin rotation. A new hash may append fresh facts under
the **same** owner/unsigned transaction within the original window. Observations
are not additive money reservations: never sum their repeated fee provisions.
No mutable status, counter, deletion, timeout release or signing key is introduced.

Unknown persistence retains possible evidence and source ownership. No automatic
retry, readback, compensation, refund or release follows. A later signing gate
must enforce current facts/freshness again; loading an old receipt cannot do so.

## Local proof and remaining work

The owned PostgreSQL fixture uses explicitly NON-SDK snapshots/bytes to test SQL
storage only. It checks exact concurrent replay, state/namespace/hash isolation,
public readback preservation after rejection, monetary/provision bounds, denied
roles/admins, supported isolation, real state advancement, expiry after an
event-driven held lock and actual expired historical replay. Files belong to
its fixture; the owned server must stop and its PID disappear before cleanup.

Fresh SDK-backed consumption and signer integration are not delivered here.
No live migration, funding, signing, deployment or full-D1 acceptance is implied.
