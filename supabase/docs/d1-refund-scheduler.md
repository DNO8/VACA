# Disabled D1 refund scheduler

Migration059 adds one private Supabase caller for the existing Testnet refund endpoint. **It creates an inactive cron job and disabled state; it does not activate refunds, provision credentials, enroll an actor, install extensions or change financial engines.**

## Behavior

The job `d1-refund-tick` runs `select d1_scheduler.tick();` on `* * * * *` when explicitly enabled. Each invocation performs one action: enqueue a page, wait for its response, or consume the response. Consequently pages normally dispatch every two minutes; the one-minute cadence is the observation/dispatch cadence, not a guarantee of one completed page per minute.

| State/result | Action |
|---|---|
| Disabled | No request, response consumption or cursor change |
| Pending without response, less than90seconds | Wait; never enqueue another request |
| Valid200 with held=0 | Persist `nextAfterRequestId`, clear pending ownership; send only on a later invocation |
| Empty page with non-null cursor | Advance normally; processed=0 does not end the scan |
| Terminal cursor=null | Start a new scan from null on a later invocation |
| Any held, HTTP/transport error, invalid/duplicate response or missing response after90seconds | Pause; retain pending request and old cursor; no automatic resend |

A logged singleton row and `FOR UPDATE` serialize this scheduler's callers across transactions and instances. Pending ownership survives PostgreSQL restart even if pg_net loses its unlogged request/response tables. It is **not** global exclusion against independently invoked backend/manual routes. Do not operate a second scheduler for this scope.

`held` cannot distinguish benign waiting from uncertainty in the existing backend response, so **every hold pauses the caller**. The original Stellar confirmation +300-second deadline and inclusive fixed cutoff remain unchanged. Scheduling can delay processing after eligibility; it never extends the financial deadline. No browser/APK signer or financial recovery behavior is added.

## Deployment prerequisites — not satisfied by local tests

1. Complete the separately blocked custody runtime/artifact verification and deployment readback. Keep gateway `verify_jwt=true`.
2. Verify installed pg_cron, pg_net and Vault signatures/permissions against059. The migration deliberately fails rather than installing or replacing extensions. Apply059 only after that check; do not replay047a–058 or include054.
3. Review pg_net queue table **and column ACLs**. pg_net stores decrypted request headers while queued. Tick refuses grants to anyone other than the queue owner, current operator or superusers; it does not revoke existing shared grants automatically. Any required ACL maintenance needs a separately scoped review. Also verify exposed schemas, inherited roles, logs and administrative access; this guard is not a complete credential-isolation proof.
4. A trusted operator provisions Vault entries `d1_refund_gateway_jwt` (valid gateway JWT, not an `sb_secret_` API key) and `d1_refund_tick_token` (same canonical43-character/32-byte token as the backend). No values belong in source, cron command or logs. The destination is fixed to the existing project's `/functions/v1/d1-custody/internal-refund-tick`.
5. Establish the backend service actor/membership, matching server-side signer, explicit fees/lifetime and operating budget. None are inferred or created here.

The current official scheduling example uses a different auth mode with JWT verification disabled. **Do not copy that mode into D1.** This caller uses the existing JWT gateway plus the separate dedicated token.

## Operator interface

Only the migration owner/trusted database administrator can use the private schema; anon, authenticated and service_role have no grants. Nothing is added to the public application RPC surface.

- Inspect: `select d1_scheduler.status();` returns enabled, cursor, pending request ID and pause reason, never credential values.
- Enable after explicit activation approval: `select d1_scheduler.set_enabled(true);` enables both state and the cron job transactionally. Pending or paused state rejects enablement with `scheduler_reconciliation_required`.
- Stop future dispatch: `select d1_scheduler.set_enabled(false);` disables both. **It cannot cancel an already queued/in-flight request** and intentionally preserves pending evidence.
- A pause is not a retry instruction. Reconcile the pending request against backend journals/chain before any owner-controlled state repair. Do not clear pending/cursor merely because HTTP timed out or returned503; durable financial effects may already exist. No automatic reset/resume API is provided.

## Local verification

```sh
D1_TOOL_ROOT="$PWD/.tooling/d1-backend" TMPDIR="$PWD/.tooling/d1-backend/tmp" \
  node --test supabase/tests/integration/refund-scheduler.test.cjs
```

Run from the repository root. Tests create disposable real PostgreSQL databases with synthetic net/cron/Vault interfaces. They exercise the scheduler functions, exact outputs/errors, access denial, concurrent dispatch, cursor continuity and a real91-second missing-response timeout without reading/modifying production private state. They execute no HTTP or financial operations. These checks **do not prove real extension integration, hosted permissions, credentials, activation or financial acceptance**. No existing financial migration/test fixture is modified.

Sources: [Supabase Cron](https://supabase.com/docs/guides/cron), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [scheduling functions](https://supabase.com/docs/guides/functions/schedule-functions).
