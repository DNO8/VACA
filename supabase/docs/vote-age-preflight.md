# Check voting account age before signing

The web client can avoid a fee-bearing Stellar Testnet transaction when the account is already known to be too young. This is an advisory read, not vote registration or a reservation.

## Read-only contract

Use `GET /functions/v1/vaquita-vote?voter=<encoded-public-key>&check=wallet_age` with the existing authentication headers. Gateway JWT settings and CORS are unchanged.

| HTTP | Response | Client action |
| --- | --- | --- |
| 200 | `{ "wallet_age_eligible": true }` | Continue to the explicit signing flow; final registration is still required. |
| 403 | `wallet_too_new`, `min_age_s`, `retry_after`, `eligible_at`, `message` | Show remaining age; do not sign or submit. |
| 503 | `wallet_age_unavailable`, `message` | Age is unverified, not necessarily too young. Stop before signing. |
| 400 | `{ "error": "bad_public_key" }` for missing voter | Stop before signing. |

The age-check branch responds with `Cache-Control: no-store`. The existing global configuration guard can return `server_not_configured`; gateway rejection, other errors, malformed responses, or lack of the explicit success marker must also stop the client. A plain cooldown response is not age clearance.

The handler calls the same `walletEligibility` policy as final registration: current Testnet account creation plus 86,400 seconds, eligible at the exact boundary. It does not fetch a transaction proof, create a database client, insert votes, increment counters, or promote incidents. GET without `check=wallet_age` keeps its existing cooldown-only contract. Final POST still independently verifies proof, age, cooldown and duplicate rules before acceptance; a preflight cannot bypass it.

## Source scope and inherited limitations

The handler, shared helper, fixture harness and two vote suites are retained from `efe4ec420549cded652cb4e13e55ab0eb8a0b0ef`, whose parent is `b343c76610188a5441f97070e5bb6795e66c28eb`. This introduces the complete inherited vote handler into the source tree, not just the preflight delta. It does not include the feed, Android/sector flows, a database bootstrap or historical ACL migrations.

Runtime prerequisites remain separate: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, resolved pinned SDKs, Testnet Horizon access, `vaquita_votes(incident_id, voter_key, tx_hash, created_at)`, duplicate enforcement, the incident table, and `public.increment_incident_votes(p_incident text, p_delta integer) -> integer`. The server role needs the corresponding table and RPC permissions. Effective RPC grants require separate verification: gateway JWT enforcement and table RLS do not secure a separately callable counter RPC. Do not replay `20261106122712` or infer current target permissions from historical documentation.

**The inherited POST is not atomic.** It inserts a vote before incrementing the counter. A `count_failed` response can follow a persisted insert, and a retry can encounter `already_voted`. The subsequent incident-promotion update does not inspect its error. This unit preserves and discloses that behavior; it does not claim transactional consistency or automatic recovery. The fixture DB does not simulate counter failures or contention.

## Offline verification

From the repository root:

```sh
node --test supabase/tests/vote-preflight.test.mjs supabase/tests/vote.test.mjs
```

These are five preflight and nine inherited vote cases, with no feed dependency. They cover the one-millisecond age boundary, eligible accounts, unavailable age, no preflight writes and legacy behavior. The harness loads the actual handler/helper but strips npm imports and supplies SDK, DB, fetch and clock doubles. It does not verify real SDK behavior, live gateway, effective database permissions, row/count/hash consistency, browser interaction or real wallet operations.

The separate `check:vote` inputs can be checked through the existing isolated runner and frozen cache; see [the backend verification commands](../README.md#vote-source-only-integration). No provisioning or dependency download is part of this unit. `@ts-nocheck` on the inherited handler limits static type assurance even when module resolution succeeds. The existing D1 `check` task is unchanged.

## Separate rollout authorization

Any future rollout needs separate authorization and prerequisite verification. The web must require HTTP 200 with boolean `wallet_age_eligible: true`, disable caching and enforce a bounded timeout. If it reaches an older backend, it must block rather than sign on the legacy cooldown response. The check is not a guarantee against all later failures or transaction fees; retain confirmed-hash feedback after submission. Source integration and offline checks do not deploy anything, change SQL/ACL, sign or submit transactions, or establish production acceptance.
