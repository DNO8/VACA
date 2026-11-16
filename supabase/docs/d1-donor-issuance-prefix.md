# Historical donor issuance prefix

`validateDonorIssuancePrefix(capture, verifiedCommand)` is a private pure validator.
It first validates the complete owned payment history and all allocation/preparation links.
It then binds every retained 016 intent, 017 sequence reservation and 018 unsigned journal.

## What the result establishes

- Exact receipt keys and scope, request identity and nested ancestor equality.
- Canonical observed/next int64 sequence, including reservation-only captures.
- Exact unsigned SDK reconstruction, transaction hash, source, asset, allocation amount,
  beneficiary/refund predicates and original confirmation + 300-second deadline.
- Historical construction inputs come from XDR minTime/fee and the saved sequence,
  never capture time, latest history anchor or an ambient clock.
- No-intent, intent-only, reservation-only and unsigned-only prefixes are represented
  by nullable facts. An existing child without its required prefix ancestor rejects.
- A corrupt prefix anywhere rejects the whole result with status 503 and
  `donor_payment_unavailable`. Input is unchanged; returned context is detached/frozen.

## What it does not establish

Encoded-plan consistency is not independent evidence of the original construction
clock or fee-provider response. Those observations were not persisted.
Later fee commitments, financial observations, signatures, submissions and outcomes
remain **unvalidated** in `allocations[].raw`. Even a retained outcome is not certified.
There is no public issuance state, absence/inclusion assertion, current CB availability,
refund eligibility, settlement, signing permission, RPC, host mounting or activation.

## Offline check

From `supabase/`, with the pinned Deno/cache and external runtime directories:
`deno test --cached-only --frozen --allow-env --deny-net tests/unit/donor-issuance-prefix.test.ts tests/unit/donor-allocation-projection.test.ts`

Observed behavioral RED: 40 passed / 11 failed against the reject-all stub.
GREEN: 51 prefix + 58 unchanged allocation tests passed (109 total), including typechecking.
Independent security verification is recorded separately; this guide alone is not approval.
