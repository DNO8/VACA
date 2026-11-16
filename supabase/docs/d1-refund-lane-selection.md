# Positive refund-lane routing before candidate creation

`createRefundLaneSelector` is a private, fixed-scope routing component. It does
not create candidates, sign, submit, ingest evidence or grant execution authority.
Source only: tests, typechecks, SQL and runtime/security checks are unexecuted
under S15. Automatic page execution and host composition remain incomplete.

## Selection contract

Capture the real private client, configured namespace/pool/service actor/network,
clock and freshness policy once. The returned function accepts only an original
request ID. The service actor is a binding, not authentication proof; the actual
host and current SQL admission must establish authority separately.

| Evidence | Result |
| --- | --- |
| Valid namespace fence owned by another request | `held / foreign_owner`; never relabel the receipt. |
| Matching v2 fence | `existing / verified_remainder_v2`, including its candidate hash. This is not an executor or candidate-validity assertion. |
| Matching v1 fence and stable matching original/candidate ownership | `existing / full_gross_v1`, including its candidate hash. |
| No fence and positively observed failed initial inclusion | `proposed / full_gross_v1`, only after stable original ownership and no refund journal state. |
| No fence and successful initial inclusion | Propose v1 only after positive current presence of the exact original CB using the existing Horizon reader. |
| Missing, stale, malformed or contradictory evidence | `held`; never try another lane or write a candidate to discover eligibility. |

The lifecycle helper reconstructs the original SDK transaction before the
selector uses its CB amount, asset and beneficiary. CB amount is the original
allocation, **not a replacement for original gross**. The existing executor
still owns full financial validation and gross-refund construction. Original
confirmation +300-second deadline comes from the validated lifecycle.

For positive current CB presence, the existing reader checks mapping, claimants,
predicates, indexed head and freshness; the selector also binds its response.
This is indexer consistency evidence, not independent consensus proof. Any
404, transport error, missing RPC or invalid response is held. A failed lookup
never proves beneficiary acquisition or authorizes a remainder.

## Permanent ownership and race boundary

The first read uses the actual040 RPC and validates its exact lookup/receipt
shapes, original namespace/pool, owner, lane and candidate hash. Before proposing
a new v1 lane, a second read must still show no fence. This detects some drift,
but does not reserve anything or eliminate a later race. The actual candidate
write and immutable040 fence remain the atomic exclusion point; financial and
authorization checks must run again in the executor.

Only the explicit historical-reader RPC allowlist reaches the supplied client.
No HTTP command or caller-approved observation is constructed. Historical fence
authorizers may differ from the current service actor and are not rewritten.

## Remaining remainder integration

An unfenced positive-beneficiary-acquisition path is **not implemented here**.
It requires the actual beneficiary validator and remainder coordinator, not an
injected affirmative callback or inference from a missing CB. Never-issued or
unobserved initial transactions are not fabricated failed inclusions.

Existing-v2 results merely preserve an already-selected lane for later genuine
coordinator dispatch. If that coordinator is unavailable, the caller must hold;
it must not fall back to v1. This module is unmounted and unexecuted. Source
integration of039/040 and the routing component does not complete automation,
prove055 compatibility, or authorize migration application or financial actions.
