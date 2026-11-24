# D1 backend: offline unsigned issuance planning and validation

## Plan new unsigned XDR

[`planIssuance(prepared, context)`](functions/d1-custody/issuance-plan.ts) builds unsigned
Stellar Testnet XDR. Its caller supplies a trusted, successfully persisted `Preparation`,
not untrusted HTTP input. The [`Preparation` and `VerifiedPayment` types](functions/d1-custody/preparation-types.ts)
are independent of the HTTP runtime. The context supplies the exact Testnet passphrase,
a public pool account, its current sequence as a decimal string, a total fee as a decimal
string (100–4294967295 stroops), and the current time as whole Unix seconds.

The result contains only `unsignedXdr`, with one `createClaimableBalance` operation.
The planner preserves the verified asset identity and checks amounts in integer stroops.
The beneficiary can claim strictly before the persisted deadline (payment confirmation
plus 300 seconds); the pool can claim at or after that same deadline. Transaction time
bounds are `[now, deadline - 1]`, inclusive. The planner does not mutate its inputs.
Invalid inputs throw `invalid_issuance_plan`; an otherwise valid request at or after
its deadline throws `issuance_window_exhausted`.

## Validate saved unsigned XDR

[`validateUnsignedTransaction(input)`](functions/d1-custody/unsigned-transaction.ts)
validates saved evidence against the trusted persisted preparation, Testnet passphrase,
pool account, observed sequence, reserved transaction sequence, and expected lowercase
transaction hash. It requires bounded, canonical Base64 and an ordinary unsigned
transaction. Using the envelope's historical minimum time and fee, it calls the planner
and requires an exact XDR byte match before checking the hash. This rejects modified
operations or preconditions even when the supplied hash matches the modified envelope.

It returns only `{ unsignedXdr, transactionHash }` and throws
`invalid_unsigned_transaction` for invalid evidence. Validation does not mutate its
inputs, read the current clock, or reset the deadline. Success on expired evidence
means the saved bytes match the historical plan, not that the transaction can be used now.

Neither module imports an endpoint, verifies a receipt, reserves a sequence, signs or
submits a transaction, or performs any database or network operation. Building or
validating XDR does not check ledger readiness or grant authority to sign or submit.
The pool's complementary claimant is not a donor refund.

## Verify offline

From the repository root, verify that no Deno task grants environment access directly:

```sh
node --test supabase/tests/config-boundary.test.cjs
```

For Deno checks and tests, use the pre-existing isolated runner on Linux and its
already populated cache. The runner changes its working directory, so pass absolute
paths. Do not fetch or provision dependencies for this verification. The SDK's
`debug` dependency enumerates environment variables at import time; grant `--allow-env`
only through the runner, which sanitizes the environment.

```sh
runner=/home/danilo/.local/share/vaca-d1-toolchain/run-isolated.cjs
backend="$PWD/supabase"
node "$runner" deno check --config="$backend/deno.json" --lock="$backend/deno.lock" --frozen \
  "$backend/functions/d1-custody/issuance-plan.ts" \
  "$backend/functions/d1-custody/preparation-types.ts" \
  "$backend/functions/d1-custody/unsigned-transaction.ts" \
  "$backend/tests/unit/issuance-plan.test.ts" \
  "$backend/tests/unit/unsigned-transaction.test.ts"
node "$runner" deno test --allow-env --config="$backend/deno.json" --lock="$backend/deno.lock" --frozen \
  "$backend/tests/unit"
```

The Deno `check` task covers both modules, their preparation types, and both test
files. To focus the test command, replace the directory with
`"$backend/tests/unit/issuance-plan.test.ts"` or
`"$backend/tests/unit/unsigned-transaction.test.ts"`. Both suites use synthetic
identities and do not need credentials or live services. The historical lockfile is
frozen and unchanged; its Supabase SDK pin is retained for lockfile consistency but
not imported by either module.
