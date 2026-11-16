# Read historical donor issuance artifacts without granting authority

`validateDonorIssuanceArtifacts(capture, expected)` adds private, typed commitment,
signed-envelope and submission-acknowledgement facts to the unchanged financial
digest validator's context. It is a pure historical consistency boundary, not a
public response, financial authorization or final issuance status.

## Usage

```ts
import { validateDonorIssuanceArtifacts } from "../functions/d1-custody/donor-issuance-artifacts.ts";

// expected is the already-verified donor command; capture is private054 output.
const historical = validateDonorIssuanceArtifacts(capture, expected);
// historical.artifacts: one { requestId, commitment, signed, submission } per allocation.
// Do not expose historical (including signed_xdr and raw journals) over HTTP.
```

The returned context and facts are detached from caller input and deeply frozen.
`artifactAssurance` is `"historical-consistency-only"`; inherited
`financialAssurance` remains `"digest-consistency-only"`. Invalid input or SDK
failures produce only `CustodyError("donor_payment_unavailable", 503)`.

## What the boundary checks

- **027 commitment:** exact receipt fields, canonical historical actor, reservation
  and preparation deadline, positive canonical fees with int64-bounded sum, and
  SDK unsigned fee equality when unsigned exists. Reservation-only commitments
  are legal. Every financial observation requires unsigned plus commitment and
  embeds exactly that commitment, including its original actor.
- **030 signed envelope:** ancestors, outer request/snapshot binding, same-request
  financial membership, canonical bounded Base64, exact ordinary TESTNET SDK
  roundtrip and unsigned body/hash, one valid pool signature with its hint, and
  SHA-256 of decoded envelope bytes.
- **031 acknowledgement:** ancestors, exact request/attempt identity, canonical
  UUID with cross-allocation uniqueness, transaction/envelope/reservation equality,
  and independent financial membership. Signing snapshot A and submission snapshot
  B may differ. Historical `claimed_at` uses safe nonnegative integer epoch seconds,
  as in the existing historical reader; no current-clock or `dbReadAt` gate runs.

Null optional children are legal; present children require their ancestors.
Historical actors may differ across receipts. Parsing uses only bounded detached
strings from the predecessor capture boundary, never raw caller getters.

## Explicit limits and evidence

Allocation and unsigned economics remain inherited. Financial snapshot budgets,
balances and freshness are not validated. An acknowledgement is not broadcast,
confirmation, failure, settlement or claimable-balance evidence. Raw issuance
outcomes remain **unvalidated**, even though retained in the prior context.
No RPC, database, administrator flow, provider, signing or host integration is added;
existing helpers, migrations and manual behavior are unchanged.

**TESTS NOT RUN — human S15 instruction.** No probes, typechecks, builds, runtime
preparation or functional/security verification were executed for this source-only
change. Risk item 2 (authorization) remains unverified; this implementation is not
operational acceptance, deployment permission or financial readiness. Outcome
validation, final projection and trusted host integration remain later work.
