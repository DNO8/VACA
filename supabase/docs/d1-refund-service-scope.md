# Inert refund-service scope boundary

Migration049 adds an **empty registry and private assertion**, not an active service.
No production reader, writer, HTTP route or scheduler calls the assertion yet.
Existing administrator behavior and the manual financial path remain unchanged.

## Scope and revocation

- Membership is the exact `(actor, namespace, pool)` row; no wildcard or implicit administrator membership.
- Network is the existing schema's fixed **TESTNET** invariant, not a caller option.
- The assertion validates the supplied pair against the locked authoritative `d1_pools` row. A mismatched registry row grants nothing.
- Row deletion revokes subsequent admissions. An already admitted transaction holds membership `FOR SHARE` until it ends; revocation waits, rather than cancelling admitted work.
- Lock order is **membership → pool → evidence**. Provisioning/revocation must never take a pool lock before a membership lock.
- All public/application roles, including `service_role`, lack direct registry access and private-function execution. There is no provisioning RPC or seed principal.

## Later integration requirements

Preserve the existing administrator branch and validation/error precedence. Derive a request's namespace/pool from stored originals, invoke the service assertion before pool/evidence locks, and revalidate derived bindings under those locks. An actor argument alone is **not authentication**: the trusted host must bind it to verified service identity. Do not give automation database `service_role` credentials.

The authorized next capability may persist validated payment/claim/refund observations within scope through the existing validation, conflict and replay rules. This prerequisite grants no issuance, arbitrary evidence replacement, generic administration or financial execution. Missing or uncertain evidence must not become zero or permission to resend.

## Local verification

The focused `supabase/tests/integration/refund-service-scope.test.cjs` uses a disposable PostgreSQL17.7 database and retained014/20261011060218 plus015/019/049. Its trusted test-only wrapper exercises private admission; it is never installed in production and does not prove host authentication. Checks cover exact scope, denial without mutation, ACLs, revocation in both concurrent orderings, and the unchanged administrator reader with service access still denied.

Use the project-local fixture launcher with `D1_TOOL_ROOT` and `TMPDIR` beneath `.tooling/d1-backend`; never point this fixture at Supabase. No changes to the existing T2a fixture are required. Full-schema compatibility, production caller admission and deployment remain separate gates in [the feature task](../../odd/tasks/d1-automatic-refunds.md).
