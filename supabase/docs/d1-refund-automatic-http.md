# Internal refund tick: source-only authentication boundary

`createRefundAutomaticHttp` in `supabase/functions/d1-custody/refund-automatic-http.ts`
is an **unmounted, server-only factory**. It calls the supplied real `runPage`
capability once per accepted request. It does not implement financial execution,
create a verified manual command, or establish operational readiness. Tests,
typechecks, runtime probes and security verification remain unexecuted under S15.

## Private configuration contract

Pass an object with **exactly these three own data properties**. Missing/unknown
properties, accessors, invalid values and inherited-only capabilities fail closed;
the returned handler responds with sanitized 503 for an otherwise eligible route.

| Property | Required value |
| --- | --- |
| `token` | Independently generated 256-bit secret: 32 cryptographically random bytes encoded as exactly 43 canonical unpadded base64url characters. |
| `maxBatchSize` | Integer from 1 through 50. The real executor must independently enforce this same bound. |
| `runPage` | Private function `(afterRequestId: string \| null) => Promise<unknown>` returning the result below. |

The factory captures token bytes, batch bound, original function and original
receiver once. Replacing configuration properties later cannot replace the
captured capability or rotate its token; construct a new handler to rotate.
The host must keep the receiver and any closed-over authority private and fixed;
capturing a receiver does not freeze its state. Configuration/result objects must
be trusted ordinary objects, not executable Proxy wrappers. Descriptor inspection
avoids property getters; it cannot neutralize Proxy reflection traps.

Provisioning is **not performed**. Canonical encoding validates representation,
not randomness: the operator must generate a fresh random secret, never a public
example, reused credential, Supabase JWT or privileged database key. No default,
environment lookup, token logging or token response exists in this module.
The fixed executor must bind the approved service identity, namespace/pool,
enumeration, refund/reconciliation operations and necessary evidence permissions
privately. The HTTP body cannot choose any actor, scope, lane, provider, action or
amount. This authentication token itself grants no SQL or signing authority.

## Request and response contract

- Exact method/path: `POST /functions/v1/d1-custody/internal-refund-tick`.
  No aliases, queries (including bare `?`) or fragments are accepted.
- Dedicated header: `x-d1-refund-token`. It is independent of `Authorization`;
  **keep Supabase gateway JWT verification enabled**. An eventual caller needs
  both gateway admission and this dedicated internal credential over TLS.
- Equal-length decoded tokens use runtime `node:crypto` `timingSafeEqual`.
  Comma-joined duplicate headers, visible whitespace, padding and noncanonical
  base64url are rejected before body reads or executor calls. No clock is used.
- Body: UTF-8 JSON, at most 1,024 streamed bytes, exactly
  `{"afterRequestId":null}` or `{"afterRequestId":"01234567-89ab-cdef-0123-456789abcdef"}`.
  UUID text is lowercase hexadecimal in 8-4-4-4-12 form. JSON whitespace around
  tokens is allowed; escaped keys/UUIDs, BOM, duplicate or extra keys, nested
  values and trailing garbage are rejected by the narrow grammar.

**Transport limitation:** Fetch `Headers` can trim outer whitespace and a gateway
can coalesce/drop duplicates; `Request` URL parsing can normalize dot segments
before the handler sees them. The host/ingress must reject raw duplicate credential
headers, raw whitespace-bearing credential values and noncanonical raw paths
before those details are lost. The factory cannot recover discarded wire bytes.
No raw-header/path enforcement or gateway configuration is supplied here.

A successful result has exactly three own data properties:

```json
{"processed":2,"held":1,"nextAfterRequestId":null}
```

`processed` is an integer from 0 through the captured `maxBatchSize`; `held` is an
integer from 0 through `processed` and counts a **subset**, not extra work.
`nextAfterRequestId` is null or a canonical UUID as above. Extra fields/accessors
are rejected, and only a validated copy is serialized. HTTP 200 means a tick was
processed, **not that a refund was paid or settled**; even non-held work may be
pending. The executor owns truthful counts, cursor progression and exhaustion.

Every response is JSON with `Cache-Control: no-store`. Route/method/query gates
precede authentication; authentication precedes all body processing and execution.

| Status | Exact error value / meaning |
| --- | --- |
| 400 | `invalid_request`: query/fragment, malformed body or unreadable body stream. |
| 401 | `unauthorized`: missing, malformed or mismatching dedicated credential. |
| 404 | `not_found`: wrong path. |
| 405 | `method_not_allowed`: wrong method; includes `Allow: POST`. |
| 413 | `request_too_large`: streamed body exceeds 1,024 bytes. |
| 503 | `refund_tick_unavailable`: configuration, authentication infrastructure, execution or result validation unavailable. |

Errors contain only `{"error":"<value above>"}`. Exceptions, database messages,
provider details and secrets are never serialized. A failed/ambiguous `runPage`
call yields 503 with **no retry, reinvocation or fallback**, even when effects may
already have occurred. A malformed result also cannot undo prior effects.

## Pagination and remaining host binding

Start a sweep with null; pass each returned non-null `nextAfterRequestId` unchanged
to the next request. Null in a successful result means exhaustion: a later scheduled
sweep starts again at null so held/unresolved originals can be reconsidered.
After 503, do not infer a cursor or settlement; use the durable executor's recovery
policy before scheduling further work. This module has no scheduler or global queue.

Parent integration still must bind the real fixed-scope page executor and service
identity, enforce its batch bound and durable recovery/concurrency semantics, mount
only the exact route without weakening gateway JWT or the manual proof path, and
set ingress size/time/rate/raw-header/path controls. Secret provisioning, service
principal admission, deployment, activation and financial acceptance are separate.
Risk item 2 (internal service identity) remains open; source reading is not
functional, timing, authorization or financial proof. This unit does not depend on
the parallel due-original enumeration implementation or modify existing handlers.
