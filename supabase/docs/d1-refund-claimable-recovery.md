# Inert claimable-observation recovery

T2h restores the canonical public leaf without callers, SQL changes or activation. It is read consistency, not refund execution authority.

## Recovery identity
- Source: `functions/d1-custody/refund-claimable-observation.ts`, 184 lines / 11685 bytes.
- SHA-256: `1040874cd59fbad68181c80dd5aac2929f33b334ac39adb3cde8964242b5dfe0`.
- Reference was read-only: `/home/danilo/worktrees/vaca-d1-wsl-baseline/supabase/functions/d1-custody/refund-claimable-observation.ts`.

## Offline evidence
- `tests/unit/refund-claimable-recovery.test.ts`: eight public-export tests, injected fake RPC/source, `--cached-only --frozen --allow-env --deny-net`.
- Exact `503 refund_claimable_observation_unavailable`; returned database denial retains `403 unauthorized_admin_wallet`, while thrown forged403 is sanitized.
- Descriptor preservation, hook avoidance, scope validation, clock monotonicity, inclusive options age1..30/future0..2, null-candidate early stop and exact zero provider/write/retry counters.
- Pending-read checks preserve captured scope and clock method/receiver; RPC receiver is checked at invocation. Providers are never invoked, so their post-await receiver behavior is not proved.
- RED initially found missing module plus an untyped catch; one test-only correction left only missing-module RED (zero assertions). Recovery then typechecked and passed all eight tests.

## Evidence boundary and next step
Full asynchronous success, provider invocation, checkpoint/drift/final freshness and the history companion remain independently unverified; no fabricated accounting or synthetic binding is financial proof.
S5/S6 are additive/read-only recovery; S7/S11 cover only inert capability boundaries. S13 parallel work adds no donor permission, endpoint, administrator grant, signing or funds authority. Manual flow, +300 and existing fences are unchanged.
Risk item 2 requires parent-owned independent capability verification before broader claims. See [the task](../../odd/tasks/d1-automatic-refunds.md); automatic refunds remain incomplete.
