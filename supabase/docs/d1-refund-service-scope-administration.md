# Enroll or revoke the independent B service scope

Migration060 adds two **trusted database operator-only** SQL functions. It does not
create an identity, grant application administration, deploy anything, or activate
cron. Source delivery, migration application, B enrollment, private host provisioning
and scheduled activation require separate outcomes and authorization.

## Operator quick path

1. Obtain separate deployment approval and confirm migration049 and its dependencies
   match the target schema before applying060 through the approved migration process.
2. Have the human choose a dedicated **public** B actor. Keep its private material and
   host settings outside tools, chat and source. An actor string is not authentication.
3. Review B's exact tuple below. Connect as the trusted migration owner using the
   operator's existing secure process; never give automation database-owner or
   `service_role` credentials. These functions grant nothing to application roles.
4. Substitute the public actor locally, enroll, inspect the exact row, and commit.
   Do not enroll A or change existing memberships. Do not activate cron here.

The following is a **nonexecutable template**, not a ready-to-run provisioning command.
`<HUMAN_SELECTED_PUBLIC_B_ACTOR>` must be replaced with the human-selected public key.
The namespace and pool are the reviewed public B identifiers, not migration defaults.

```text
BEGIN;
SELECT public.d1_enroll_refund_service_scope(
  '<HUMAN_SELECTED_PUBLIC_B_ACTOR>',
  '3c6f6494-1712-4a1c-ab8e-560a1b8b072e'::uuid,
  'GAPE4SD4RURXR2JFSK3JTVG6TJ53K7ECBILSVLKZY3RFOLXMWWHB5TKT');
SELECT actor, namespace, pool FROM public.d1_refund_service_scopes
 WHERE actor = '<HUMAN_SELECTED_PUBLIC_B_ACTOR>'
   AND namespace = '3c6f6494-1712-4a1c-ab8e-560a1b8b072e'::uuid
   AND pool = 'GAPE4SD4RURXR2JFSK3JTVG6TJ53K7ECBILSVLKZY3RFOLXMWWHB5TKT';
COMMIT;
```

Expected enrollment result: `enrolled`, with exactly one matching row. Exact replay
returns the same result without changing membership or lifecycle state. For revocation,
use `public.d1_revoke_refund_service_scope(text, uuid, text)` with the **same exact
three arguments** in a fresh operator transaction. Expected result: `revoked`, including
when already absent; inspect the same query for zero rows before committing.

## Boundaries and errors

| Topic | Contract |
|---|---|
| Authority | SECURITY INVOKER, empty search path; no EXECUTE grants to PUBLIC, anon, authenticated or service_role. Owner access is not an application admin grant. |
| B restriction | This reviewed invocation targets B. The database owner can choose another tuple; the database does **not** enforce a permanent B-only allowlist. |
| Validation | Reuses049 and `release_request_valid_key`: key format and checksum checks, not identity, possession or network verification. Namespace must exist and its locked pool must match. |
| Failure | Null/invalid keys or namespace, missing namespace or mismatched binding: SQLSTATE `22023`, `invalid_refund_service_scope`; statement changes roll back. Malformed UUID text fails PostgreSQL's UUID parser before the function. |
| Replay | No lifecycle reset, pool activation, administrator insertion, or unrelated membership changes. No counters are advanced. |
| Revocation | Deletes only the exact triple, including stale bindings; invalid arguments are rejected. An admitted transaction retains its049 membership FOR SHARE lock; revocation waits until it ends and denies subsequent admission. |
| Concurrency | Transaction advisory lock serializes same-triple admin calls, then membership precedes explicit pool locking. Revocation never needs a pool lock. Hash collisions only add serialization. Keep operator transactions short; never lock a pool before calling these functions. |

## Local evidence and remaining gates

`supabase/tests/integration/refund-service-scope-administration.test.cjs` exercises
actual060 interfaces in fresh disposable PostgreSQL through the unmodified fixture
launcher, including admission via a test-only private-assertion wrapper. It does not
prove production compatibility, host identity or ledger evidence. See
[task receipts](../../odd/tasks/d1-service-scope-administration.md).

After enrollment, independently verify the trusted host's identity binding and private
configuration. Deployment, actual enrollment, scheduler changes and activation remain
operator-owned; this source change performs none of them.
