# Validate and persist internal initial signed issuance

`ensureInitialSignedIssuance(client, trustedInitialSignerConfiguration)` composes the accepted backend signer with migration 030. It returns a validated signed-journal receipt, **not execution permission**. This adapter is not mounted in the runtime; never serialize its signed bytes into an HTTP response.

## Load first, sign only if absent

1. Load `d1_load_signed_transaction` under the current authenticated admin. Bound and validate the lookup before accessing a private signer.
2. For a saved receipt, load actual 018 unsigned bytes through the accepted SDK coordinator with throwing mutation, account, fee and clock stubs. Validate the canonical ordinary v1 TESTNET signed body/hash, exactly one cryptographically valid pool signature and hint, decoded-envelope SHA256, scope and exact reservation.
3. Verify membership using `d1_load_initial_financial_observation` (028), including the same request, transaction hash, snapshot hash and reservation. Historical replay does not run 029, read the clock or invoke a key provider, even after expiry. Original authorizers can legitimately differ from today's admin.
4. If absent, invoke `signInitialAuthorizedIssuance` internally: its accepted fresh financial gate runs before key loading. Await exactly one `d1_record_signed_transaction`, then validate the entire returned receipt against the known unsigned bytes, signed bytes and snapshot, plus 028 membership. Preserve a legitimate original actor from a concurrent exact replay.

No caller XDR, ready artifact or signer plugin is accepted by this API. The trusted backend configuration has the existing signer's key-provider dependency, not a new activation path. Existing unsigned bytes, fees, sequence, deadline and claimant predicates are unchanged.

## Failure and recovery contract

| Result | Meaning |
|---|---|
| `unauthorized_admin_wallet` / 403 | Only an explicit RPC response with null data and database error code `42501`, message `unauthorized_admin_wallet`. |
| `signed_transaction_unavailable` / 503 | Malformed or oversized DTO, SDK/signature/membership mismatch, unknown write result, transport failure, or provider/source exception. No dependency details are exposed; thrown lookalike 403 errors cannot impersonate database denial. |

RPC values must be bounded plain JSON: no getters, cycles, repeated object aliases, sparse arrays, symbols or non-finite numbers; maximum 20,000 nodes, depth 40 and 2 MiB serialized UTF-8. Signed XDR is separately limited to 65,536 characters and must round-trip canonically.

An unknown save outcome triggers **no retry, readback or release**. A separately initiated later call can load the immutable receipt. Ownership and fee commitments are never changed by this adapter. Even a valid historical receipt is not permission to broadcast, retry, refund or release the reservation.

## Local evidence boundary

The focused unit test uses the unchanged initial-financial fixture with ephemeral native and issued SDK transactions and a test-local 030/028 client wrapper. It checks RPC order, delayed and unknown saves, historical replay without private dependencies, forged envelopes/receipts, input bounds and sanitized denial. It does not replace SQL concurrency tests or demonstrate deployed signing, submission, reconciliation, terminal accounting, chain mappings or full D1 completion (S8).
