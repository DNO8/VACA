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
- T3 [done: source only] S1,S3,S4 — inline; explicit status/refund/reconcile consumer, shared queue/hold, fresh first-submit observation, immutable original binding and status-only recovery after a hold authored. No checks run. Risk: item 4 (shared original-scope serialization). Commit: `e49eacbfe628902a921574fb18fb0bcbb5dfe19b` (111 additions / 6 deletions).
- T4 [done: source delivery only] S1–S4 — inline; passive v2 providers and explicit administrative commands with confirmation, original-reference/generation guards and unknown recovery authored; both guides updated. Source commit and publication observed, no behavioral verification. Risk: item 2 (administrative command entry; backend remains authority). Commit: `c10a13f762677edcec18cbda9660a1e7d96e6de4` (245 additions / 7 deletions); push job67 exit0.

## Allowed edit surfaces

- `vaca_app/lib/features/refund/data/refund_submission_gate.dart`
- `vaca_app/lib/features/refund/data/refund_submission_journal.dart`
- `vaca_app/lib/features/refund/data/refund_client.dart`
- `vaca_app/lib/features/refund/data/refund_remainder_{submission_journal,http_client,client}.dart`
- `vaca_app/lib/features/refund/refund_providers.dart`
- `vaca_app/lib/features/refund/presentation/refund_{admin_screen,remainder_panel}.dart`
- `vaca_app/docs/d1-remainder-client.md`
- `vaca_app/docs/d1-refund-client.md` (existing integration guidance and cross-link only)
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
- L7 — T3 consumer source authored: one shared queue for explicit commands; validate previous and durable original facts before/after observation; fresh status before reservation, ACK/readback permit before first refund POST; any existing lane hold routes another submit intent to status only. After a recorded uncertain submission, recovery actions remain explicit status/reconcile, never a new refund. No tests, static checks, SDK/SQL or review executed. Commit `e49eacbfe628902a921574fb18fb0bcbb5dfe19b`; push job66 exit0 published it. Slice `dcfb1fe` → `e49eacb` is 117 authored lines; T4 starts there.
- L8 — Plan reconciliation: task completion labels refer only to observed source authoring, commit and Git publication, not behavioral verification. No whole-D1 completion or verified concurrency/security/financial outcome is claimed. T4 was kept in progress until the actual source commit and push were observed (L9). Existing v1 guide is updated alongside the new command guide so it no longer calls the full v2 client absent; historical passive-consumer proof stays scoped to its unchanged files.
- L9 — T4 source commit `c10a13f762677edcec18cbda9660a1e7d96e6de4` observed exit0, 245 additions / 7 deletions across six authorized paths; push job67 exit0 published `e49eacb..c10a13f` to `origin/feat/d1-t5b-proof`. Slice `e49eacb` → `c10a13f` is 252 authored lines. T1–T4 source artifacts are now committed and published. This closing record is documentary, not another behavior unit. Nine unrelated dirty paths were not staged. No checks, app/device actions, backend import/activation, deployment, main/PR/merge or financial operation occurred. GitHub authentication is resolved; overall D1 acceptance (#31), deferred functional proof (#40), unavailable independent prerequisite proof (#56), Android integrity (#48) and artifact tasks (#46/#47) remain unresolved and separate. The user's explicit stop on checks remains in force; do not automatically retry any of them.
