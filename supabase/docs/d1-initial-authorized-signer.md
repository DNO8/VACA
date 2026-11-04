# Internal initial-issuance signer

`signInitialAuthorizedIssuance(client, configuration)` is **trusted backend
composition**, not an HTTP signing endpoint or proof that a caller is an admin.
The later runtime must verify the established action-bound wallet proof before
supplying `authenticatedAdmin`; current membership is checked by the database.
It accepts no caller XDR, destination, account facts or ready-made authorization.

## Key and transaction boundary

- Calls the [financial gate](d1-initial-financial-authorization.md) internally on
  every invocation. Only its successful callback awaits the trusted backend
  `loadPoolSigner(pool)` provider. The result must be a private-capable SDK Keypair
  matching the configured and observed pool. No default environment/vault loader
  is supplied; the existing public-only entrypoint cannot sign.
- Signs only the gate's saved canonical ordinary-v1 unsigned bytes using Testnet.
  Original body, source, sequence, fee, memo, predicates and hash stay unchanged.
  Exactly one pool signature is independently verified, including its hint.
  Donor payment and beneficiary claim signing paths are untouched.
- Captures the trusted clock function and enforces nondecreasing integer readings
  through the gate, callback entry, asynchronous key retrieval, immediately before
  signing, after signing and after independent verification. Every action-stage
  reading must precede the snapshot expiry. This is bounded evidence freshness,
  not SQL locks held across signing or a guarantee of later submission freshness.

## Errors and ownership

Own provider/configuration/crypto/freshness failures yield exactly
`initial_signing_unavailable` (503), never provider details or keys. Upstream gate
errors remain `initial_financial_authorization_unavailable` (503) or the gate's
explicit validated `unauthorized_admin_wallet` (403). A provider's claimed 403 is
sanitized to 503; it does not establish caller authorization failure.

No retries, readbacks, release, replanning or fee/deadline extension occur. A failed
or unknown financial save never calls the key provider. Ownership remains held;
an error must not be interpreted as permission to spend, refund or release it.

## Internal artifact, not delivery

The returned `{kind: "d1_initial_signed_issuance", revision: 1, authorization,
signedXdr}` is internal only. It contains no provider or key material. T4 must
persist the exact signed envelope before any submission and reconcile its actual
outcome. Do **not** return signed bytes from an HTTP route or broadcast this
artifact directly. Runtime authentication, durable signed ownership, submission,
claim/recovery/refund, deployment and live acceptance are separate work.

Tests use only ephemeral fixture keys. No real signing key, secret provider,
backend activation or live transaction was used for this slice.
