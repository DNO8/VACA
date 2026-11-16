# Refund financial-observation schema: source recovered, not applied

T2k restores only `supabase/migrations/035_d1_refund_financial_observations.sql`, retaining the unmodified public baseline source from `/home/danilo/worktrees/vaca-d1-wsl-baseline/supabase/migrations/035_d1_refund_financial_observations.sql`.
No SQL was applied. No tests, typecheck, build, probes, network calls or runtime writes were run. This is not operational acceptance.

## Restored interface

| Object | Contract |
| --- | --- |
| `public.d1_refund_financial_observations` | Immutable receipts keyed by `(request_id, snapshot_hash)`; `(namespace, request_id)` references `d1_refund_candidates`. |
| `public.d1_load_refund_financial_observation(p_request_id uuid, p_authorized_by text, p_snapshot_hash text)` | Returns JSONB historical lookup; missing observation is JSON null, not renewed authority. |
| `public.d1_record_refund_financial_observation(p_request_id uuid, p_authorized_by text, p_snapshot jsonb)` | Returns JSONB receipt after ownership, identity, funding, history, integer-budget and freshness checks. |

These are the exact RPC names/parameters used by `observeAndSaveRefundFinancialEvidence` in `supabase/functions/d1-custody/refund-financial-observation.ts`; its exported types are `RefundFinancialSnapshot` and `RefundFinancialObservation`. That caller is unchanged and integration remains unexecuted.

## Permission and replay boundary

- Both RPCs retain `SECURITY DEFINER`, empty `search_path` and `service_role` execution only (besides owner privileges). Table RLS is enabled; direct privileges are revoked from public, anon, authenticated and service_role.
- The loader inherits candidate scope/locks. With `048–053`, limited service evidence reads are admitted through existing scope checks; old baseline comments mentioning current-admin inheritance do not override those later definitions.
- The writer independently locks and checks `admin_wallets` membership **after dependent locks and before insert or exact replay**. A service scope alone cannot authorize this write. No principal is provisioned and no old guard is replaced.
- Replay still requires Read Committed, both active owners, current evidence, administrator membership and a valid clock window. It returns the original receipt/authorizer without extending expiry.
- Snapshot identity remains SHA-256 over UTF-8 PostgreSQL `jsonb::text`, not JavaScript serialization. Existing hash shapes, composite identity, snapshot bounds and accounting checks are retained.

## Dependency order and next source units

All direct D1 dependencies exist locally before `035`: candidate table/reader (`034`), active-owner reader (`033`), fee-commitment reader (`027`), transaction-history state (`024`) and operating-credit state (`026`). Their earlier D1 dependencies are present as `015–034`.
The older base schema, roles and `admin_wallets` remain prerequisites; this recovery does not recreate them or certify an empty-database installation. Retained `014`/`20261011060218` source is under `recovery/supabase/2026-10-27/retained-migrations.json`.
`048` issuance mutation guards, `049` scope registry, `050–053` read/write separation and `054` donor capture remain untouched. `035` adds new objects only; it does not alter definitions pinned by those migrations. No concrete incompatibility was identified by source reading; execution compatibility is unverified.

- Missing `036_d1_refund_signing_journal.sql` needs `034` candidates and `035` receipts/RPCs; it defines signing claims and signed-refund journals.
- Missing `037_d1_refund_submission_attempts.sql` additionally needs `036` signed transactions/journal and reuses `035` financial revalidation.
- Those sources were read, not restored. Their historical replay branches can precede `035` revalidation and inherit `053` reader admission; independently assess writer/replay authorization before any recovery. Do not blanket-overlay `036–047`.

## Remaining limits

S5/S6/S14/S15 are covered only for this additive source-recovery unit. S7/S11 service evidence **writing** remains deliberately incomplete: it needs a separate future scoped-admission migration, not removal of this administrator gate.
Risk item 2: authorization/security; risk item 1: stored schema and financial evidence. Neither effect was executed. Functional, concurrency and independent security proof remain unexecuted under S15.
No signer, submission, lane choice, ownership release, settlement, deployment or activation is added. A separately authorized migration-order/application plan and remaining executor integration are still required.
