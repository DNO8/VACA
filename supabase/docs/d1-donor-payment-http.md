# Read a donor's stored payment status through a private host boundary

T4e4 adds source for a personal-proof HTTP read and mounts it in the existing
D1 entrypoint, independently of issuance/reconciliation dependencies. It uses
only the existing server-created Supabase client and the private migration054
capture RPC. **Source authored; TESTS NOT RUN under S15.** This is not deployment,
activation, operational readiness, full S4/S14 completion, or financial acceptance.

## Route and calling API

| Surface | Source behavior |
| --- | --- |
| Public path | `/functions/v1/d1-custody/donor-payment-status` |
| Documented host-relative path | `/donor-payment-status` |
| Successful method | `POST`, with the original signed JSON body |
| Other methods | Routed to the donor boundary; `405 method_not_allowed`, including OPTIONS, rather than falling through to old routes |
| Query | Reject every query delimiter, including a bare `?`, with `400 invalid_request` |
| Response | Compact UTF-8 JSON, `Content-Type: application/json`, `Cache-Control: no-store`, at most 65,536 bytes |

Only these exact pathnames are mounted; no suffix matching or new trailing-slash
alias is introduced. The original `Request` reaches the verifier unchanged.
The existing config route's CORS behavior is unchanged. No donor allow-origin,
allow-methods, credential permission or preflight bypass is added; consumers
still need their separately authorized gateway/proxy integration.

The new module exports:

```ts
donorPaymentHttp(request: Request, dependencies?: DonorPaymentHttpDependencies): Promise<Response>
```

`DonorPaymentHttpDependencies` contains the real private `client` and trusted
`configuration: { namespace, pool, now }`. The client type exposes only the
`d1_capture_donor_payment` call. It is not an administrator journal facade or a
request-controlled RPC name. `now()` is a trusted server clock in Unix seconds.

There are two additive composition seams:

- `createCustodyHandler({ ...existing, donorPayment })` accepts the optional hook.
- `createCustodyRuntime(base, lifecycle?, donorPayment?)` accepts donor dependencies
  independently of the optional issuance/reconciliation lifecycle. Existing one-
  and two-argument construction remains supported; omitting the third argument
  preserves a hook explicitly supplied in `base`.

The real `index.ts` now supplies the existing private Supabase client as the
third runtime argument and leaves `lifecycle` undefined. Preparation remains
mounted as before; this change does not activate issue, reconcile or execution.
Without donor dependencies, the reserved donor paths still reject wrong methods
and queries, then return donor-specific 503 for an otherwise eligible request.

## Trusted configuration and separate activation requirements

| Server setting | Requirement |
| --- | --- |
| `D1_NAMESPACE` | Explicit canonical lowercase UUID, matching the intended persisted scope; no default and no request-derived value |
| `D1_POOL_PUBLIC_KEY` | Existing public-only canonical Stellar G key, reused as donor scope; no secret signer is introduced |
| `SUPABASE_URL` | Existing trusted server database destination, not caller input |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only client credential; never return it or expose it to web/app callers |

Namespace resolution is lazy inside authentication. Missing `D1_NAMESPACE`, or
one rejected by the existing UUID verifier, yields `503 donor_payment_unavailable`
for POST without queries and does not disable startup/preparation/config routes.
Method/query rejection still precedes donor configuration validation. Existing
startup requirements for the public pool key and Supabase client are unchanged.

Before any separately approved activation:

1. Migration `054_d1_donor_payment_snapshot.sql` and its prerequisites must be
   applied separately to the intended database. This source change applies no SQL
   and performs no grants. Its capture function must remain service-role-only,
   not callable by `anon` or `authenticated`.
2. The configured namespace/pool and stored evidence must actually exist and meet
   capture/projection requirements. A mounted route alone does not establish this.
3. Keep the service-role client private to the host. Browser gateway headers are
   not wallet authentication and must not substitute for the personal proof.
4. Obtain separate deployment/proxy integration approval and complete the missing
   functional/security assessment before claiming operational readiness.

There is no automatic funding, refund, hold release, signing, submission, or
financial permission implied by these settings or by a successful read.

## Proof, capture and historical projection

The host reuses [`verifyDonorPaymentCommand`](../functions/d1-custody/donor-payment-command.ts)
rather than changing the existing donor or administrator codecs. It enforces the
exact 11-field r1 envelope, TESTNET/configured scope, donor action and empty payload,
8192-byte streamed limit, fatal UTF-8, decoded duplicate-key rejection, canonical
payment identity/signature, and inclusive ±60-second personal-proof window.
See the [codec guide](d1-donor-payment-command.md) for signing details.

Only a successfully verified command supplies RPC arguments:

| Private RPC parameter | Verified command field |
| --- | --- |
| `p_namespace` | `namespace` |
| `p_pool` | `pool` |
| `p_transaction_hash` | `paymentTransactionHash` |
| `p_operation_id` | `paymentOperationId` |
| `p_verified_donor` | `verifiedDonor` |

The boundary invokes that single capture RPC, checks its data/error envelope,
and passes raw data plus the same verified command directly to the existing
[`projectDonorPaymentStatus`](../functions/d1-custody/donor-payment-projection.ts).
It never impersonates an administrator or calls a journal writer. The projection
owns full stored-evidence validation and the public field allowlist; the HTTP layer
serializes only its result and independently enforces the compact UTF-8 size cap.

A 200 has exactly the historical r1 top-level fields `version`, `network`,
`namespace`, `pool`, `payment`, `allocations`, `snapshot`. It preserves all validated
stored allocations, including `not_recorded` outcomes. `snapshot.readAt` remains
the captured database-read time; the proof clock never replaces it. Neither that
time nor historical issuance success certifies current claimable-balance state,
chain freshness, refund lane, eligibility or settlement.

## Bounded errors; no financial fallback

Every donor error body is exactly `{"error":code}` with the following allowlist:

| HTTP | Exact code | Source |
| --- | --- | --- |
| 400 | `invalid_request` | Existing verifier's method-independent request/query/body/scope validation |
| 401 | `stale_request` | Existing verifier's timestamp window |
| 401 | `invalid_signature` | Existing verifier's personal proof rejection |
| 405 | `method_not_allowed` | Existing verifier's POST-only rule |
| 503 | `donor_payment_unavailable` | Missing/invalid configuration, clock/internal error, RPC failure, missing data, null ownership, invalid evidence, projection or serialization/size failure |

Only the exact 400/401/405 code/status pairs thrown during verification pass
through. Exceptions after authentication always become 503, even if they carry a
different `CustodyError`. No RPC error details, receipts, signatures, private
capture or secrets are returned or logged by this boundary.

**No `404 payment_not_found` is emitted.** The earlier r1 proposal describes a
future certified absence response; migration054's missing/foreign/null ownership
capture does not establish that certification. These uncertain cases remain 503.
There is no truncation, partial payment DTO, provider lookup, Horizon call, retry,
write or issuance/reconciliation fallback when capture/projection fails.

## Source coverage and remaining proof

| File | Authored responsibility |
| --- | --- |
| `donor-payment-http.ts` | Proof → private capture → existing projection → bounded JSON; stage-separated errors |
| `handler.ts` | Additive optional hook and exact all-method donor routing before legacy branches |
| `runtime.ts` | Independent optional donor composition; existing lifecycle construction retained |
| `index.ts` | Real private client reuse, lazy explicit namespace, existing public pool and server clock |

Preparation, manual behavior, status, issuance and reconciliation branches are
not otherwise edited. Their preservation is source intent, **not executed proof**.
The shared handler/runtime changes require parent-owned Risk 2 authorization/privacy
and Risk 3 shared-behavior assessment, including module-load/constructor preservation.

**TESTS NOT RUN:** no RED/GREEN, preservation/differential test, typecheck, build,
runtime probe, SQL, network, latency or independent security execution was performed
for T4e4. No fixtures or test files were added. Missing proof also covers actual
Supabase client typing/transport, all-method/query dispatch, headers/size failures,
private error masking, and no-fallback behavior. S4/S14 web/app/admin integration
and the remaining automatic executor remain separate work; S15's source-only
constraint is honored without claiming integrated D1 completion.
