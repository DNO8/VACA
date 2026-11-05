# Preserve issuance history while looking up the active owner

Migration033 separates immutable request-keyed reservation history from the
namespace-keyed active owner. It preserves every existing owner, including expired
ones. This is local storage compatibility, not permission for another issuance.

## API and authorization

Service-role callers with a current admin wallet may call:

```sql
select public.d1_load_active_issuance_sequence(p_namespace, p_authorized_by);
```

The result is the **original reservation receipt**, without a wrapper, or SQL
`NULL` for an activated namespace with no owner. Null namespace or invalid wallet
shape raises `invalid_issuance_sequence`; revoked membership raises
`unauthorized_admin_wallet`; an unknown namespace raises `pool_not_activated`.
The lookup locks current admin membership, then the pool and active/history rows.
It neither refreshes financial evidence nor checks a deadline. Both tables retain
RLS and deny direct reads/mutations to anon, authenticated, and service_role.

## Compatibility and migration boundary

Quiesce callers before applying033; DDL locks can conflict with in-flight RPCs.
One transaction changes the history primary key, backfills **all** owners, and
replaces the reserve implementation. The original request-ID unique constraint
is retained because018/027/028 foreign keys depend on it; receipts are not copied
or rewritten. A composite foreign key binds each active owner to its namespace's
historical reservation. No owner-mutation RPC is introduced.

The017 signature, receipt JSON/original actor, validation/error priorities,
admin → pool → preparation/intent → sequence locks, and after-wait clock remain.
Same-owner replay survives expiry; a conflicting sequence still conflicts.
Another request checks its deadline before returning `issuance_source_busy`.
018 namespace/request lookup,027 all-history aggregation and the SDK singleton
financial gate remain unchanged, as do030/031/032 historical chains and bytes.

## Verification and non-goals

The standalone [public-interface regression](../tests/integration/issuance-sequence-ownership.test.cjs)
bootstraps through032, populates the complete opaque evidence chain, expires an
owner, then applies033 if present. Without033 it must fail at the new public RPC.
It checks populated/fresh ownership, immutable replay, fee history, rejected-call
snapshots/counters, contention, after-wait expiry, revocation and role privileges.
Run through the approved isolated launcher/toolchain; keep owned PG state under
project `supabase/.temp`, not the small system `/tmp`, and require fixture cleanup.

These opaque SQL fixtures are not SDK/signature/consensus or on-chain evidence.
No release, retirement, terminal state, second issuance, retry/reset, signing,
submission, refund, claim, runtime mounting or financial-gate relaxation is added.
Unknown outcomes and deadlines retain ownership. Independent security/concurrency
verification and the parent compatibility differential precede local acceptance;
this unit does not complete T4 or deployed D1 acceptance.
