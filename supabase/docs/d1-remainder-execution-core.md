# Shared private remainder coordinator

`createRemainderExecutor` in `functions/d1-custody/remainder-execution.ts` extracts the actual recovered manual coordinator. `remainder-http.ts` now calls that same core after genuine wallet-command verification; there is no fabricated `VerifiedRemainderCommand`, alternate financial engine, lane fallback, or host mount. This is source-only T2ab work under S15, not verified operational readiness.

## Private API

```ts
createRemainderExecutor(dependencies: RemainderExecutionDependencies): RemainderExecutor
// RemainderExecutor:
(scope: RemainderCandidateScope, action: RemainderAction) => Promise<RemainderExecutionResult>
// RemainderExecutionResult:
{ kind: "state", state: RemainderHttpResponse }
| { kind: "error", error: "unauthorized_admin_wallet" | "remainder_unavailable" }
```

Dependencies require `client` and `now`; optional capabilities remain `source`, `financial`, `construction`, and `fetcher`. Methods are captured with their original receivers at factory creation, and policy/construction values are detached. The scope must contain exactly `namespace`, `pool`, `requestId`, and `authenticatedAdmin`, with UUID and public-key validation. Actions are the existing `refund_remainder`, `refund_remainder_status`, and `refund_remainder_reconcile` union.

**Service authentication is still required.** The legacy `authenticatedAdmin` field binds the actor passed to database operations; the core does not authenticate that actor or grant a service role. Trusted composition must establish identity, configured scope, and action authority before calling it. Database authorization remains independent on each operation. This change neither provisions service admission nor mounts an automatic endpoint.

## Boundaries retained in source

| Boundary | Implementation |
|---|---|
| Manual HTTP | Unchanged `verifyRemainderCommand` and contract retain exact routes, POST/body rules, signatures, 60-second skew and errors. Adapter retains status mapping and `cache-control: no-store`. |
| Manual 018 preflight | Adapter retains actual RPC denial and missing-original mapping, including `request_not_found` 404. Core independently reads 018 again rather than accepting a preflight receipt as authority; direct core missing-original failures are `remainder_unavailable`. Successful manual calls therefore add one 018 read. |
| Genuine coordinator | Uses `observeRemainderLifecycle`, `loadBeneficiaryClaim`/`recordBeneficiaryClaim`, `ensureRemainderCandidate`, `submitRemainder` (including signing), and `observeAndSaveRemainderOutcome`. |
| Narrow capabilities | Status uses reads only. Execution and reconciliation retain separate helper-specific write lists. Request writes stay selected-request-bound; other-donor reads remain available for authentic namespace accounting. |
| Bounded observation | At most one discovery page and one transaction-history page per invocation; incomplete or uncertain acknowledgements exit without an automatic retry. Missing claim evidence is not proof of absence. |
| One-shot ownership | Existing 046 attempts and orphan 045 claims exit before execution sources, financial renewal or keys. Ambiguous writes/transport exit without readback; acknowledged submission is not inclusion and does not permit another POST. |
| Financial machinery | Existing funding, candidate, signer and submission helpers remain unchanged, including the single-claim/single-issuance restriction. History reads do not renew financial freshness, and no full-gross fallback is introduced. |
| Error provenance | Only a captured actual RPC reply with `42501` / `unauthorized_admin_wallet` becomes an authorization error; arbitrary source, clock or signer exceptions remain unavailable. |

## Review and remaining work

Review authorization (risk item 2), shared manual-coordinator parity (item 3), and one-shot ownership (item 4). Host composition, selector changes, migrations, service activation, deployment and funds are outside this change. The selector can be developed independently; this API does not import it.

S1/S5/S7/S11 are addressed only at the shared-source seam; automatic operation and its authorization are not established by this extraction. S18–S19 provide source ownership context. Under S15, no tests, probes, typecheck, build, SQL or runtime execution were performed. Functional, security, concurrency and differential evidence remain outstanding; source readback is not a behavior or security verdict.
