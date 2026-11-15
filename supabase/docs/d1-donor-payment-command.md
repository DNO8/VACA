# Authenticate donor payment reads without granting authority

`verifyDonorPaymentCommand` is an additive, offline authentication boundary for
T4c (S4/S14). It verifies the agreed [r1 request](../../odd/docs/d1-donor-read-contract.md)
and returns a frozen donor identity and payment key. It does **not** establish
payment ownership, administrator membership, refund permission, or eligibility.

## Calling boundary

Import the function and its dedicated configuration/result types from
[`donor-payment-command.ts`](../functions/d1-custody/donor-payment-command.ts).
Pass a `Request` and trusted `{ namespace, pool, now }`; `now()` returns Unix seconds.
The namespace, pool and bound clock function are captured before the first await.
The clock is sampled once after request shape validation, not cached as permission.

The result contains only `kind`, `revision`, `network`, `namespace`, `pool`,
`paymentTransactionHash`, `paymentOperationId`, and `verifiedDonor`. All fields are
immutable scalars. There is no timestamp, payload, signature or administrator context.
The host must separately select the route and enforce authoritative ownership before
private evidence reads. No route is mounted, SQL called, response DTO projected, hold
released, or financial retry initiated here. Existing administrator helpers are unchanged.

## Validation and errors

| Boundary | Behavior |
| --- | --- |
| Transport | POST only; reject every query, including bare `?`; at most 8192 streamed bytes; fatal UTF-8; reject BOM |
| JSON | Private grammar walk before whole-object parsing; decoded duplicate keys rejected at every depth, including arrays/escaped equivalents; maximum recursive value depth 32 |
| Envelope | Exactly the 11 r1 fields; version 1, TESTNET, configured canonical UUID/G-address scope, donor action and empty payload |
| Payment/proof | Lowercase 64-hex hash; canonical positive decimal operation ID checked with BigInt through signed-int64 max; canonical G wallet; canonical Base64 of 64 bytes |
| Freshness | Nonnegative safe-integer timestamp and clock; inclusive ±60 seconds |
| Signature | Remove only signature; JS-sort top-level keys; compact JSON of parsed values; exactly one `Stellar Signed Message:\n` prefix (one LF), one SHA-256, SDK Ed25519 verification |

Rejections are `CustodyError` with identical code/message: 400 `invalid_request`,
401 `invalid_signature`, 401 `stale_request`, 405 `method_not_allowed`, or
503 `donor_payment_unavailable`. Invalid configuration/clock and cryptographic internal
exceptions are sanitized as 503. Unreadable/malformed bodies are 400; overflow cancels
the reader, and cancellation failure cannot change that rejection. This leaf returns
no HTTP response; host-level JSON error serialization and no-store headers remain separate.

## Observed coverage and remaining work

The new focused test executes all **58 raw request vectors against the actual codec**,
plus six groups covering transport, grammar/depth, streaming, configuration/clock,
captured configuration, immutable results and numeric/field boundaries. Fixture bytes
and expectations are preserved; literal cryptographic references are not regenerated.
The shared fixture's `UNEXECUTED` labels remain unchanged: DTO/provenance and other
consumer enforcement have not thereby been executed. The separate reference-vector
suite checks all 147 recipes and 51 literal cryptographic references, not an endpoint.

Test-first RED was missing-module/typecheck failure, **zero executed assertions**;
one test-only Buffer typing correction removed the unrelated type error. Focused GREEN
passed 64 tests. The combined seam includes the unchanged seven administrator-command
tests and six reference-vector groups. Parent-owned independent security verification
(Risk item 2), private ownership/capture/projection, host wiring, web/app integration,
activation and integrated financial acceptance remain separate; S4/S14 are not complete.
