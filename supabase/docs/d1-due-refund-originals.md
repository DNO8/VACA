# Enumerate due originals without granting refund authority

**Source only, unverified (T2t; S1/S5/S7/S11/S15/S16).** Migration `056`
adds one service-role RPC and `refund-due-originals.ts` adds its private reader.
No HTTP route, scheduler, identity provisioning, SQL application or funds movement
is included. Existing manual behavior and `055` are unchanged.

## Private composition API

Create `createDueRefundOriginalsReader(client, configuration)` using the real
private Supabase client and exactly `{ namespace, pool, actor, network: "TESTNET" }`.
Scope is captured once; `actor` must already have separately authorized `049`
membership. Initial host authentication is **not** registry membership. The
factory captures the real RPC data method, including a prototype-defined method;
configuration and response accessors are rejected without invoking their getters.

Call `reader.read(afterRequestId = null, limit = 50)`. UUIDs are canonical lowercase;
`limit` must be an integer in `1..50`. The single RPC is:

`d1_list_due_refund_originals(p_namespace uuid, p_pool text, p_actor text, p_after_request_id uuid, p_limit integer) -> jsonb`

All SQL arguments are required; pass SQL NULL for the initial cursor. No caller
clock, network override, donor input, amount, XDR or lane is accepted. Exact result:

```ts
{
  kind: "d1_due_refund_originals", revision: 1,
  namespace: string, pool: string, network: "TESTNET",
  dbObservedAt: string, // UTC YYYY-MM-DDTHH:mm:ss.sssZ, database clock
  requestIds: readonly string[], nextAfterRequestId: string | null
}
```

## Sweep protocol and limits

1. Start with `null`; process only as potential originals requiring later evidence.
2. Continue with `nextAfterRequestId`. IDs are strictly ascending and unique;
   non-null continuation is the last scanned original, not the lookahead ID or
   necessarily a returned due ID. An empty due page can still have a continuation.
3. On null continuation, end this sweep. Begin the **next sweep from null**, not the
   last ID. UUID ordering is neither insertion order nor deadline order. Newly
   inserted lower UUIDs and previously future deadlines otherwise remain invisible.

The RPC reads only `015` preparations in the admitted namespace, rechecks their
payment pool, and validates stored deadline equality to the exact `015` UTC
construction from numeric `confirmed_at + 300`. Missing, malformed or mismatched
fields encountered in the scanned range fail the entire call, even on a future
row; there is no fallback to eligibility. The SQL query limits the original
window to `limit + 1` before due filtering. At most `limit` originals are validated;
the extra original establishes continuation and is processed on the next page.
At most 50 due IDs escape. This bounds rows handled by the function, not the
underlying query-plan cost or lock wait time; database performance is unmeasured.

Database time is captured after `049` locks; the observed timestamp is rendered
with millisecond precision. No `018`/`032` join excludes never-issued or unresolved
preparations. Absence is **not failed issuance**: downstream handling must hold
without the positive evidence required by the existing executor. Settled originals
can recur; enumeration is not reservation, admission, spending or fence selection.
It reads no `040` fence tables and makes no beneficiary/full-gross/remainder choice.

## Security and outstanding proof

`049` membership FOR SHARE precedes pool FOR UPDATE and all evidence access. Its
post-wait binding recheck is reused, not duplicated as an admin shortcut. Locks
last through the transaction; revocation blocks future admission, not already
admitted work. `056` pins the existing helper definition/metadata/private ACL,
uses empty search path, postgres ownership and only service-role EXECUTE. It
writes no table, creates no membership and grants nothing to anon/authenticated.

The reader checks exact envelope keys/version/scope, UUID order/uniqueness, size,
calendar timestamp and cursor progression; its new object/array are detached and
frozen. Transport metadata is ignored, with own data descriptors required for
`data`/`error`. Every invalid configuration/input/reply or RPC failure becomes
`CustodyError("due_refund_originals_unavailable", 503)` without database detail,
retry or fallback. It cannot prove an RPC's truthful exhaustion from one page;
that invariant belongs to SQL's lookahead.

S15 prohibits tests, probes, fixtures, typechecks, builds and SQL/runtime execution.
All remain unexecuted, including ACL/visibility (risk item 2), membership/pool lock
concurrency (item 4), real-client compatibility and manual preservation. Source
reading is not functional/security acceptance or deployment authorization.
