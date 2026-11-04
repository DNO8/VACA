# Issuance command wallet proof

`verifyIssuanceCommand(request, {pool, namespace, now})` is an internal verifier
for the future `POST /functions/v1/d1-custody/issue` route. It does **not** mount
that route, access keys, call a database, sign a pool transaction or submit one.
The existing prepare endpoint and its v1 contract remain unchanged.

## New command envelope

The JSON object has exactly these fields; `payload` must be empty:

```json
{
  "version": 1,
  "network": "TESTNET",
  "pool": "<configured pool public key>",
  "namespace": "<configured canonical lowercase UUID>",
  "action": "issue",
  "request_id": "<stored request canonical lowercase UUID>",
  "timestamp": 1793102400,
  "payload": {},
  "wallet": "<authorizing wallet public key>",
  "signature": "<canonical base64 64-byte wallet signature>"
}
```

Sign the SDK SHA256 hash of `Stellar Signed Message:\n` followed by the canonical
JSON of **all fields except signature**: sorted object keys, compact JSON, no
extra whitespace. This reuses the existing prepare wallet-proof convention;
actual client wallet integration remains separate work. Namespace is explicitly
signed to prevent cross-scope replay. No caller XDR, destination, fee, amount,
account observation or receipt is accepted.

The trusted current time and message timestamp must be nonnegative safe-integer
seconds. The proof window is inclusive ±60 seconds. Actual body bytes are bounded
to 8192 before JSON parsing; invalid UTF8 is rejected and oversize input cancelled.
Signature base64 must round-trip canonically, not merely decode to valid bytes.

## Identity is not spending authority

The frozen internal result is `{kind: "d1_verified_issuance_command", revision: 1,
namespace, pool, requestId, authenticatedAdmin}`. The actor name identifies a
cryptographically verified wallet, **not checked admin membership**. A proof can
be replayed within its time window; it is not a one-shot or durable capability.

The owning runtime must invoke this verifier itself on every request, then enforce
current database admin membership and the fresh financial gate. It must bind the
stored immutable request, preserve ownership/idempotency, and use T4's exact signed
journal before broadcasting. Never accept a caller-provided verified-result DTO
as authorization or return internal signed artifacts as an HTTP response.

## Errors

Errors expose only their code: `invalid_request` (400), `stale_request` (401),
`invalid_signature` (401), `not_found` (404), `method_not_allowed` (405), or
`issuance_command_unavailable` (503) for invalid trusted configuration/clock.
No error grants retry, release or refund permission. Tests use ephemeral wallet
keys only; no real credentials, pool secret, runtime activation or live operation.
