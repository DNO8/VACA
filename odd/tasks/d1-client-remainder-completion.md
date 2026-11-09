# Complete the remaining D1 remainder client source

Owned clone: `feat/d1-t5b-proof`, baseline `289da5d54f7b7984e28d304da81c75d6a734c8c7`.
Source implementation and incremental publication only; financial activation and operational acceptance remain separate.

## Specs

- S1 — User: “basta de chequeos hay que termianr el D1”. Finish the pending client implementation without more test, analyzer, build, SDK/SQL, native-review or diagnostic runs. Preserve the known incomplete verification; do not represent source completion as acceptance.
- S2 — User: “hay que r subiendo los commits para mostrar avances”. Keep cohesive commits and publish them to the already authorized `origin/feat/d1-t5b-proof`, never main, without force or PR/merge.
- S3 — Existing D1 client contract: v2 commands use `refund_remainder`, `refund_remainder_status`, and `refund_remainder_reconcile`, original TESTNET identity, personal-wallet proofs, immutable original donation/deadline and bounded one-shot HTTP. Preserve the existing v1 wire and stored records. A shared durable original-scope hold must prevent two local first submissions across v1/v2; acknowledge persistence and read it back before issuing a one-use permit. No resets, automatic retries, lane switching, new identity or TTL renewal. No cross-process/device CAS claim.
- S4 — Existing project boundaries: preserve D3, custody handler/status/runtime/index, configuration/dependencies, existing dirty paths and prior evidence. Use the existing known-reference administrative entry, passive feature-local providers and explicit confirmed commands. No backend import, provider activation, SQL apply, pool signing, keys, funds, deployment or device actions.

## Tasks

- T1 [done: source only] S1,S3,S4 — inline; shared local queue, additive durable hold, v1 legacy read compatibility and v2 one-use reservation authored. No checks executed by human instruction. Risk: items 1/4 (durable submission coordination). Commit: `9566821b7020456b19885c1a242e770f305eb6fd` (261 additions / 24 deletions).
- T2 [done: source only] S1,S3,S4 — inline; v2 action-bound proof, final permit consumption and bounded one-shot HTTP with action-specific response admission authored. Passive status consumer unchanged. No checks run. Risk: item 2 (personal-wallet authentication proof). Commit: `dcfb1fe24e51367d520b56e5ec99a8bf6db4a0aa` (175 additions / 5 deletions).
- T3 [done: source only] S1,S3,S4 — inline; explicit status/refund/reconcile consumer, shared queue/hold, fresh first-submit observation, immutable original binding and status-only recovery after a hold authored. No checks run. Risk: item 4 (shared original-scope serialization). Commit: recorded by T4 log.
- T4 [in_progress] S1–S4 — inline; connect passive v2 providers and explicit administrative commands with confirmation, original-reference/generation guards and unknown recovery; document limitations and publish commits. Risk: item 2 (administrative command entry; backend remains authority). Commit: pending.

## Allowed edit surfaces

- `vaca_app/lib/features/refund/data/refund_submission_gate.dart`
- `vaca_app/lib/features/refund/data/refund_submission_journal.dart`
- `vaca_app/lib/features/refund/data/refund_client.dart`
- `vaca_app/lib/features/refund/data/refund_remainder_{submission_journal,http_client,client}.dart`
- `vaca_app/lib/features/refund/refund_providers.dart`
- `vaca_app/lib/features/refund/presentation/refund_{admin_screen,remainder_panel}.dart`
- `vaca_app/docs/d1-remainder-client.md`
- This task file.

## Verification disposition

The human explicitly stopped further checks. No tests, typecheck, analyzer, build, SDK/SQL, functional/browser/device verification or native/independent review will run for this unit. Existing tests are not evidence for these changes. Source/artifact tasks may close on their authored, committed outcome only; functional acceptance remains unverified. Git status/commit/push/remote-tip operations are delivery bookkeeping, not financial verification. Existing #40/#48/#56 gaps remain open; no verifier retry or external scratch copy is authorized.

## Log

- L1 — Original latest instruction, verbatim: “basta de chequeos hay que termianr el D1”.
- L2 — Existing publication instruction, verbatim: “hay que r subiendo los commits para mostrar avances”. Authentication was resolved using repository-local Git helper and existing Windows keyring. Baseline branch is already published; no token is stored in source.
- L3 — Source exploration confirms: v1 journal is version1-only, v1 queue is isolate-local, and existing v2 consumer exposes only status. The missing shared hold and v2 command/provider/UI chain can be implemented without touching the backend or phone. No test/check rerun was started.
- L4 — T1 source authored: common durable lane/baseline record, read-only legacy recognition, ACK/readback before permit, shared isolate queue, immutable cross-lane original facts, v1 fallback after partial journal write, v2 final one-use reservation. New guide states no verification or operational acceptance. No tests, analyzer, build, SDK/SQL or reviews executed. Commit `9566821b7020456b19885c1a242e770f305eb6fd`; push job64 exit0 published it.
- L5 — T2 transport source authored without running it: explicit v2 status/refund/reconcile paths, separately signed action in canonical personal-wallet envelope, one-use durable permit before refund proof, 8192-byte request / 16384-byte response, no-store JSON, 10-second transport cancellation, exact action/status admission and sanitized errors. Existing passive status consumer untouched. No functional/static/native verification executed.
- L6 — Delivery strategy: review slices start at this feature baseline `289da5d`, not the historical accumulated branch. T1 slice `289da5d` → `9566821` is 285 authored lines; T2 `9566821` → `dcfb1fe` is 180 authored lines; T3 begins at `dcfb1fe`. The Git summary of the historical branch is not this candidate. No PR/merge requested. Push job65 exit0 published T2.
- L7 — T3 consumer source authored: one shared queue for explicit commands; validate previous and durable original facts before/after observation; fresh status before reservation, ACK/readback permit before first refund POST; any existing lane hold routes another submit intent to status only. After a recorded uncertain submission, recovery actions remain explicit status/reconcile, never a new refund. No tests, static checks, SDK/SQL or review executed.
