# Private runtime: historical issuance status

`createCustodyRuntime(base, lifecycle)` now composes the existing authenticated
`POST /functions/v1/d1-custody/status` lookup alongside `/issue` and `/reconcile`.
It derives only `client`, `namespace`, `pool` and `now` from the supplied private
lifecycle. An explicit `base.status` takes precedence. Without a lifecycle, base
handler behavior remains unchanged; an absent status dependency stays disabled.

Use the existing [status command contract](d1-issuance-status.md): signed admin
proof and durable database authorization are still required. Missing persisted
outcomes return `outcome_not_recorded` / `unverified`, not permission to execute.
A saved SDK observation reports historical issuance facts, not current claimable
availability, refund authorization or settled accounting. The status route never
uses the signer, submission transport, reconciliation source or availability
fetcher. It must not be exposed as a donor/beneficiary authentication contract.

This factory wiring does **not** activate `index.ts`, configure a signing provider,
deploy a runtime, implement refunds, import the D3 coordinator or prove either
complete D1 journey. Those require their actual contracts and integration.

Offline checks: run `custody-runtime.test.ts` with the existing isolated Deno
runner, then check that test and `functions/d1-custody/runtime.ts`. No `--allow-net`
is needed. Existing issue/reconcile/config/prepare cases remain the regression
coverage for this shared composition boundary.
