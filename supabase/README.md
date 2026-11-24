# D1 backend: offline unsigned issuance planning

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

This slice does not import an endpoint, verify a receipt, reserve a sequence, sign or
submit a transaction, or perform any database or network operation. Producing XDR does
not check ledger readiness or imply authorization. The pool's complementary claimant
is not a donor refund.

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
  "$backend/tests/unit/issuance-plan.test.ts"
node "$runner" deno test --allow-env --config="$backend/deno.json" --lock="$backend/deno.lock" --frozen \
  "$backend/tests/unit"
```

To run only the planner tests, pass `"$backend/tests/unit/issuance-plan.test.ts"`
in place of the directory. The tests decode XDR with synthetic identities and do not
need credentials or live services. The historical lockfile is frozen and unchanged;
its Supabase SDK pin is retained for lockfile consistency but not imported by the planner.
