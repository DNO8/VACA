# Refund-service scope and observation admission

Migration049 adds an **empty registry and private assertion**. Migration050 connects only the discovery-checkpoint reader and its existing discovery/history consumers. Neither creates a service principal, HTTP authentication or scheduler.
Existing administrator behavior and the manual financial path remain unchanged.

## Scope and revocation

- Membership is the exact `(actor, namespace, pool)` row; no wildcard or implicit administrator membership.
- Network is the existing schema's fixed **TESTNET** invariant, not a caller option.
- The assertion validates the supplied pair against the locked authoritative `d1_pools` row. A mismatched registry row grants nothing.
- Row deletion revokes subsequent admissions. An already admitted transaction holds membership `FOR SHARE` until it ends; revocation waits, rather than cancelling admitted work.
- Lock order is **membership → pool → evidence**. Provisioning/revocation must never take a pool lock before a membership lock.
- All public/application roles, including `service_role`, lack direct registry access and private-function execution. There is no provisioning RPC or seed principal.

## Scoped observation admission (050)

The checkpoint reader preserves its original administrator branch. For a non-admin, it reads the namespace's authoritative pool without locking, then invokes the private assertion before existing pool/evidence locks. The assertion rechecks the locked pool binding. No caller-selected pool, purpose string or administrator impersonation is introduced.

Existing discovery and transaction-history page writers inherit this scoped access. Their validation, immutable conflicts, original receipts and current-authorization replay checks remain unchanged. Stored observations are **opaque evidence, not SDK/ledger validation, donation truth or permission to issue/refund**. The trusted host still must validate external evidence; admitting storage does not satisfy that requirement.

All eight independent048 issuance/credit guards and the049 private assertion are pinned with the original reader before replacement. Unexpected bodies or metadata/ACLs, missing guards, and reapplication fail atomically with `P0001 / unexpected_d1_discovery_service_definition`. Only the reader body changes; signatures, OIDs, ACLs and unrelated functions remain. This is pinned to local retained014/20261011060218 +015–034/048/049, not proof of deployed035–047 compatibility. Quiesce callers before any separately authorized application.

## Original-request evidence admission (051)

Migration051 admits the unsigned-transaction reader and its existing evidence-read descendants only. It derives namespace/pool from the stored preparation, asserts exact membership before pool/evidence locks, then rechecks the same request and admitted namespace `FOR SHARE`. A preparation moved or deleted while waiting is denied; it cannot redirect service scope. This extra revalidation is service-only: the original administrator path and error precedence remain unchanged.

The eight048 guards, private049 assertion,033 active-owner reader and034 candidate reader/writer are pinned before replacement. Drift or reapplication fails atomically with `P0001 / unexpected_d1_request_service_definition`. Issuance writes, sequence ownership and refund-candidate creation remain administrative. Missing evidence stays null; reading opaque unsigned/signed history does not authorize signing, submitting, reassigning or retrying it.

The new `supabase/tests/integration/request-service-admission.test.cjs` uses synthetic inputs through real local preparation/reservation APIs. It checks scope, immutable stored evidence, manual differentials, excluded mutations, preparation movement/deletion races, membership revocation and pinned-gate drift. Synthetic payment and byte fixtures are not verified blockchain observations. See the feature task for actual results.

## Active-owner evidence admission (052)

Migration052 admits only `d1_load_active_issuance_sequence`. A non-admin must pass the private049 assertion for the namespace's authoritative pool before the original pool/ownership locks. Membership precedes pool locking, and the assertion rechecks the pool binding after waiting. The original administrator branch, validation/error precedence and receipt-or-SQL-NULL result remain unchanged. A missing owner is evidence of absence under the pool lock, not permission to reserve, release, sign or refund.

The eight048 issuance guards, private049 assertion,033 reservation writer/original reader and both034 candidate functions are pinned. Unexpected function bodies or metadata/ACLs, missing reservation guards and reapplication fail atomically with `P0001 / unexpected_d1_active_owner_service_definition`. Only the reader body changes: no grants, provisioning, ownership mutation or candidate admission. Existing comments remain unchanged as part of metadata preservation; this section documents the added scoped read path.

`supabase/tests/integration/active-owner-service-admission.test.cjs` covers the original reservation and genuine absence, administrator process-output differentials, scope denials, unchanged reservation/candidate gates, metadata, actual concurrent revocation/pool-rebinding waits and atomic rejection. Fixtures are synthetic SQL evidence, not blockchain or host-identity proof. Results remain in the feature task. This migration is pinned to the owned local schema; application to any deployed schema requires separate compatibility validation and authorization.

## Historical candidate read admission (053)

Migration053 admits `d1_load_refund_candidate` only as historical evidence. Its pinned051 request-reader dependency establishes service membership and locks the original request scope before pool/evidence locks; the candidate reader then revalidates that same scope. Existing candidate bytes, original administrator authorizer, subordinate ownership and the absent-candidate lookup remain unchanged. Neither a candidate nor its absence establishes eligibility, fresh observation, signing or submission authority.

An independent current-administrator check is added to `d1_record_refund_candidate` immediately after its inherited lookup, before input validation and exact replay. The original late check remains. Without this early guard, widening the reader would unintentionally admit service calls to the writer's replay branch. Services may not create or replay through that writer, resolve conflicts, restore ownership, choose a lane or bypass validation; administrators retain their original behavior and error precedence.

One atomic preflight pins048 guards,049 assertion, relevant post051/post052 readers, the original reservation and both034 functions. Drift, unexpected metadata/ACLs and reapplication fail with `P0001 / unexpected_d1_candidate_read_service_definition`, without a partially widened reader. Only the two function bodies change. No grants or provisioned identity are added.

The focused `supabase/tests/integration/refund-candidate-read-service-admission.test.cjs` uses the existing public preparation, observation and administrator candidate APIs with synthetic evidence. It compares administrator lookup/creation/replay/conflict/validation/isolation before and after053, tests service reads and writer denials, actual revocation/pool waits and atomic rejection. It does not execute ledger transactions or prove deployed-schema compatibility. Consult the feature task for observed results.

## Later integration requirements

Preserve the existing administrator branch and validation/error precedence. Derive a request's namespace/pool from stored originals, invoke the service assertion before pool/evidence locks, and revalidate derived bindings under those locks. An actor argument alone is **not authentication**: the trusted host must bind it to verified service identity. Do not give automation database `service_role` credentials.

The authorized overall capability may persist validated payment/claim/refund observations within scope through the existing validation, conflict and replay rules. The current SQL observation-admission slice grants no issuance, arbitrary evidence replacement, generic administration or financial execution. Missing or uncertain evidence must not become zero or permission to resend.

## Local verification

The049-only `supabase/tests/integration/refund-service-scope.test.cjs` uses a disposable PostgreSQL17.7 database and retained014/20261011060218 plus015/019/049. Its trusted test-only wrapper exercises private admission; it is never installed in production and does not prove host authentication. Checks cover exact scope, denial without mutation, ACLs, revocation in both concurrent orderings, and the unchanged administrator reader with service access still denied.

The new `supabase/tests/integration/discovery-service-admission.test.cjs` loads the actual local015–034/048/049/050 schema. It compares identical administrator queries before/after050, exercises scoped nonempty discovery/history writes and replay, unchanged validation/denials, excluded issuance/credit mutations, concurrent revocation and atomic drift rejection. Its NON-SDK transaction bytes prove SQL storage behavior only; they are never financial approval. Test results and remaining verification are recorded in [the feature task](../../odd/tasks/d1-automatic-refunds.md).

Use the project-local fixture launcher with `D1_TOOL_ROOT` and `TMPDIR` beneath `.tooling/d1-backend`; never point these fixtures at Supabase. No existing T2a fixture rerun is needed. Host identity, external evidence validation, refund-mutation admission, deployment and activation remain separate gates.
