# B video automatic Testnet refund trigger

The trigger targets only the B lifecycle endpoint: `https://tgqxxnldwiqisopiclmk.supabase.co/functions/v1/d1-custody/video-auto/internal-refund-tick`. A Cloudflare scheduled handler calls one fixed Durable Object, which sends at most one page request per admitted scheduled minute. This is an external caller for the existing D1 backend, not a new financial engine or manual/automatic lock.

**Source defaults are disabled.** This source adaptation neither deploys nor activates the trigger. The manual A scenario remains untouched: its original `/functions/v1/d1-custody/internal-refund-tick` destination is rejected before storage writes, durability acknowledgements or transport, with no fallback. Deployment, hosted scope verification and safe credential provisioning remain prerequisites.

## Local check

No installation or dependencies are required. From the repository root, with Node22:

```sh
node --test cloudflare/refund-trigger/test/*.test.mjs
node --check cloudflare/refund-trigger/src/runner.mjs
node --check cloudflare/refund-trigger/src/worker.mjs
```

Tests inject synthetic storage, credentials and transport; they never contact Supabase or Stellar. The focused target checks prove the exact B destination, A rejection without state/counter changes and inert shipped configuration. These are new local adaptation checks, not closure or a retry of historical denied independent trigger/runtime probes. They do not prove Cloudflare durability/output gates, scheduled delivery or live financial results.

## Expiry is not the schedule

B retains the backend five-minute expiry, `confirmed_at + 300 seconds`. That eligibility boundary is not a five-minute cron frequency or a guarantee of execution at the expiry instant. The unchanged handler accepts periodic `* * * * *` events (every minute); an admitted event requests one page, and the backend decides what is due. The shipped cron list stays empty. Production three-month semantics are not implemented or changed.

## Operation

- Scheduled events use the fixed name `refund-trigger-v1` in a single Durable Object namespace. Keep this identity and storage across releases.
- A transaction persists `in_flight` with configuration identity, cursor and monotonic scheduled-minute watermark. Only its creator may send, after `storage.sync()`.
- One fixed HTTPS destination receives `POST`, `Authorization: Bearer <gateway JWT>`, `x-d1-refund-token` and only `{afterRequestId}`. Redirects are forbidden; total transport/body deadline30seconds, response limit1024bytes.
- Exact validated200 with zero held allows a future scheduled slot. Advance the cursor or start a later sweep at null; zero processed with an advancing cursor is valid.
- Any held result, non200, malformed response, timeout or transport ambiguity pauses. Existing in-flight records block later events and object restarts. No alarms, automatic retries, lease takeover or reset/unpause endpoint.
- If outcome persistence does not commit, in-flight remains blocking. If a valid zero-held checkpoint commits but its acknowledgement is lost, the committed checkpoint may permit a later slot; the admitted slot remains deduplicated. This is not an exactly-once financial guarantee.
- A crash after intent commit but before send can permanently stop a never-sent attempt. Prefer that loss of availability to an unsafe resend.
- Public HTTP always returns404. Internal DO fetch is reachable only through its binding, not a public route. Scheduled logs contain only event name and a fixed status enum; no credentials, responses, cursors or exception details.
- The backend retains authorization, the five-minute expiry, inclusive lower confirmation bound2026-11-15T03:00Z, financial accounting, reconciliation and same-original protection. No backend source/migration changes.

## Configuration and activation prerequisites

| Setting | Meaning |
| --- | --- |
| `ENABLED` | Exact string `true` is required; committed default `false`. |
| `TARGET_URL` | Exactly the B lifecycle URL above; A and all other destinations are rejected. No caller-selected origin, query, redirects or A fallback. |
| `SCOPE_ID` | Public deployment binding label,1–64letters/digits/underscore/hyphen; must be validated against the actual backend scope before activation. It does not select a scope in the request. |
| `MAX_BATCH` | Canonical integer1–50, matching backend configuration; default1. |
| `GATEWAY_JWT` | Provider-managed runtime binding for gateway authentication; syntax validation is not signature/role verification. Never a service-role grant to this caller. |
| `REFUND_TOKEN` | Provider-managed canonical43-character base64url token; never a pool signing key. |
| `REFUND_TRIGGER` | SQLite-backed Durable Object binding. Changing its namespace/name can erase effective deduplication; do not do so as recovery. |

`wrangler.jsonc` explicitly has no cron schedules, no workers.dev or preview URL, and no routes. The future intended schedule is `* * * * *`. No package/installer or deployment command is run by tests.

Before any separately authorized activation: verify the hosted B binding/backend/runtime (existing guard3073/XDR proof is not cleared here), confirm gateway/token pairing through a safe provider workflow, review current Cloudflare entitlement and observe a controlled scheduled execution. Hosted execution and financial acceptance remain unproven by this adaptation. Do not repeat B registration or payment as part of this change, or pass private credential values through chat, files, logs or this agent.

Manual A and automatic B demonstrations must remain separate and sequential. The fixed B route selects the lifecycle; `SCOPE_ID` is only a storage binding label, not a backend selector. Permanent namespace ownership means merely waiting does not permit another original in the same backend scope. This Worker alone does not provision a second scope or change the deployed backend.

## Paused or uncertain outcome

Stop the schedule and have the operator inspect the recorded attempt plus backend and ledger evidence. Do not delete storage, rename the object, clear ownership, rotate scope labels as a reset, or resend blindly. Recovery is deliberately not implemented.200/ACK is not confirmed settlement;503 may follow persisted effects.

## References

- [Durable Object storage and output gates](https://developers.cloudflare.com/durable-objects/api/storage-api/)
- [Durable Object lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)
- [Scheduled handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- Historical trigger task: `odd/tasks/d1-cloudflare-refund-trigger.md` (not included in this source snapshot).
- [B target adaptation task and boundaries](../../odd/tasks/d1-video-auto-trigger-target.md)
