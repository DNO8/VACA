# Private refund execution core — source-only extraction

`refund-execution.ts` now holds the existing full-gross status, execution and
reconciliation coordinator. `refund-http.ts` remains the genuine wallet-command
adapter. This T2r source change supports S1/S5/S6/S7/S11 under S15/S16; it does
not complete automatic refunds or establish operational readiness.

## Review path

1. Review `createRefundExecutor` capability capture and per-call scope binding.
2. Compare its branch order and `publicState` projection with the former HTTP
   coordinator. The same financial and persistence helpers remain responsible.
3. Review `createRefundHttpHandler`: genuine `verifyRefundCommand` still precedes
   execution, and HTTP status/error/no-store mapping remains in the adapter.

## Server-only boundary

The exported factory and types are **private server-only composition APIs**, not
public endpoints, authentication proofs or new service admission. Its private
client, clock, optional source, financial settings, signer loader, construction
settings and fetcher are captured synchronously before use. There are no new
provider, environment, key or transport defaults.

Each invocation takes an explicit `RefundCandidateScope` and `RefundAction`.
Scope data is detached/frozen; UUIDs, pool and actor public keys, and the three
allowed actions are validated before RPC access. The legacy `authenticatedAdmin`
field is the downstream actor binding, **not proof that this core authenticated
that actor**. A trusted caller must establish actor/scope/action authority first;
current database authorization and financial guards remain required. No
`VerifiedRefundCommand` or `VerifiedAdminCommand` is fabricated or cast.

RPC parameters are captured before validation and bound to actor, request ID,
namespace and pool wherever those parameters are present. Discovery-state pool
validation remains before provider use; the existing helpers validate their
request/namespace/pool evidence envelopes. This is not a database guard bypass.
The core accepts neither request bodies nor caller-approved observations.

## Preserved behavior by source inspection

| Boundary | Retained behavior |
|---|---|
| Status | Calls `observeRefundSettlement`; does not invoke source, signer or transport capabilities. |
| Reconciliation | Checks original unsigned scope first; ingests at most one discovery page and one transaction page through the existing database classes/functions; incomplete coverage fails closed. |
| Outcome | Calls `recordRefundOutcome` only for the existing attempt/signed/history inclusion branch. Complete history absence is unknown, not failure. |
| Execution | Existing settled/outcome/not-due, unstable, attempt and signing-claim guards precede candidate/signing/submission work. Missing required capabilities remain blocked. |
| Candidate/submission | Reuses `ensureRecoveryRefundCandidate` and `submitRefund` unchanged, including financial revalidation and durable one-shot journals. |
| Settlement | Existing SDK/history-bound settlement observer and original payment +300-second deadline remain unchanged. Transport ACK never becomes settled. |
| Ambiguity | No retry, reset, ownership cleanup or compensating write; ambiguous saves/POSTs exit without automatic readback. |
| Errors | Only the captured database `42501` / `unauthorized_admin_wallet` denial selects 403; other execution errors remain sanitized `refund_unavailable` / 503. |

The core returns a typed state-or-error result, not a `Response` or reusable
financial authorization. HTTP retains the exact state DTO and safe actions:
status queries return 200; execution/reconciliation pending or unknown return
202; refund not-due/blocked returns 409; other states return 200. Existing command
400/401/404/405 handling and `cache-control: no-store` remain in the adapter.

## Outstanding proof and integration

Tests, probes, typechecks, builds, SQL/runtime execution and scratch preparation
were not performed, as required by S15/S16. Source-reading self-review is not
functional/security verification; manual compatibility and capability-boundary
proof remain outstanding, including the unavailable T2n verification.

No host/index/handler mount, selector, service identity, admission implementation,
SQL, peer remainder path, activation, deployment or financial execution is part
of this extraction. Any future automatic caller needs separately authorized
trusted identity/scope binding, explicit database admission and authoritative
eligibility/lane selection; importing this factory grants none of those.
