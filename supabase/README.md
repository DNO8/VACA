# D1 backend: local journals and offline transaction evidence

## Verify local database preparation and the legacy allocation fence

Migrations `015_d1_testnet_custody.sql` and `023_d1_legacy_allocation_guard.sql`
form the local preparation/fence unit. This is **not a deployable migration history**:
`019`–`022` and `024`–`032` are still absent. Do not apply these migrations to a live database, use a
migration glob, or configure automatic deployment. A preparation receipt records
local allocation, not proof of payment, pool readiness or authority to issue.

From the repository root, run the service-free tests first, then the database suite
on Linux with the already installed isolated toolchain:

```sh
node --test supabase/tests/integration/fixture-runtime.test.cjs supabase/tests/config-boundary.test.cjs
D1_TOOL_ROOT=/home/danilo/.local/share/vaca-d1-toolchain node supabase/tests/integration/preparation-database.test.cjs
```

The database suite bootstraps its own `/tmp` cluster as `postgres` on an ephemeral
`127.0.0.1` port through `run-isolated.cjs`, without inherited PostgreSQL settings or
Unix sockets. It creates synthetic roles, a wallet/incident fixture and their
public-only account IDs; the fixture `service_role` models Supabase's RLS bypass
but still needs the SQL grants. It applies these exact paths, in order:

1. `tests/fixtures/retained-014.sql` and `tests/fixtures/retained-20261011060218.sql` —
   decoded reservation and allocation statements from historical source
   `ff89be528f0ce61474b132cfec59f65ba164297e`, with no other retained metadata or migrations.
2. `migrations/015_d1_testnet_custody.sql`, then synthetic pool activation.
3. `migrations/023_d1_legacy_allocation_guard.sql`, with the original function-body
   hashes and metadata checks intact.

The suite seeds historical allocation before `015`, compares stored accounting
rows and counters around rejects, and waits for real lock contention before
releasing transactions. It stops PostgreSQL, checks status/PID and removes scratch
in teardown. No signing keys, ledger or remote services are involved.

To reproduce the test-first negative controls in the same disposable setup, prefix
only the database command with `D1_FIXTURE_PHASE=before-015` (missing activation RPC)
or `D1_FIXTURE_PHASE=before-023` (unfenced legacy allocation succeeds). These modes
intentionally exit nonzero; leave the variable unset for the full suite.

## Verify local issuance journals and sequence ownership

Migrations `016`, `017` and `018` add issuance intents, reserved sequences and an
unsigned-transaction journal. `033` backfills permanent sequence ownership from
existing reservations and adds active-owner lookup. A reservation remains owned
after expiry; expiry does not authorize reusing it for a competing request.
Current-admin checks also apply to replay, including loading already saved bytes.

The journal treats XDR bytes and hashes as opaque stored evidence. Saving them is
not XDR validation, a ledger observation, or authority to sign, submit or release
funds. RPC access is restricted to `service_role`, with RLS and no direct table
grants to non-owner roles. These migrations are not wired into an HTTP runtime.

Run both suites with the same installed isolated toolchain:

```sh
D1_TOOL_ROOT=/home/danilo/.local/share/vaca-d1-toolchain node supabase/tests/integration/issuance-journal-database.test.cjs
D1_TOOL_ROOT=/home/danilo/.local/share/vaca-d1-toolchain node supabase/tests/integration/issuance-sequence-ownership.test.cjs
```

Each suite creates and cleans up its own synthetic local cluster as described above.
The explicit load order is retained `014`/`20261011060218` → `015` → `016` → `017`
→ `018` → `023`. The ownership suite seeds real reservations and unsigned receipts,
including an expired owner, **before applying `033`**. No migration glob, `019`,
`027`–`032`, or substitute financial tables are used.

The tests check replay, exact rejection codes/messages and unchanged rows/counters,
both first-owner orderings, expiry during an observed lock wait, and committed
admin revocation blocking reservation and saved-byte replay. They also compare
all stored pre-upgrade rows, exact table/RPC permissions, and the existing validated
`018` foreign key and backing index before and after `033`; new journal inserts
must still work. This does not prove compatibility with later financial FKs.

For test-first negative controls, prefix the journal command with
`D1_JOURNAL_PHASE=before-016`, `before-017`, or `before-018`, or prefix the ownership
command with `D1_OWNERSHIP_PHASE=before-033`. Each intentionally fails on a missing
public RPC; the last control runs against populated `017`/`018` state. Leave these
variables unset for passing verification.

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

## Parse discovery evidence offline

[`parseDiscoveredOperation(input)`](functions/d1-custody/discovery.ts) checks supplied
Testnet operation and transaction observations against the envelope XDR and a trusted
closed-ledger anchor. It binds the operation paging token to the transaction position
and classifies consistent evidence as an incoming payment, outgoing payment, pool
account creation, or quarantined operation. Invalid evidence throws
`invalid_discovered_operation`.

The parser makes no live calls and writes no records. A successful parse checks
consistency; it does not prove ledger execution, coverage, or readiness, and does not
grant permission to fund or issue. Any caller must establish ledger coverage separately.

## Parse included-transaction evidence offline

[`parseIncludedTransaction(input)`](functions/d1-custody/transaction-observation.ts)
checks supplied Testnet transaction observations and XDR against a closed-ledger
anchor. Only `txSuccess` and `txFailed` represent included transactions; other result
codes are rejected. It binds the actual charged fee separately from the fee bid,
sequence, paging token and operation outcomes without mutating the supplied input.

Invalid or contradictory evidence throws the shared
[`CustodyError`](functions/d1-custody/custody-error.ts) with code and message
`transaction_observation_unavailable` and status `503`. No HTTP handler is imported.
The parser checks consistency only: it does not verify signatures or consensus,
query a ledger, submit a transaction, or authorize financial execution.

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
  "$backend/functions/d1-custody/discovery.ts" \
  "$backend/functions/d1-custody/custody-error.ts" \
  "$backend/functions/d1-custody/transaction-observation.ts" \
  "$backend/tests/unit/issuance-plan.test.ts" \
  "$backend/tests/unit/unsigned-transaction.test.ts" \
  "$backend/tests/unit/discovery.test.ts" \
  "$backend/tests/unit/transaction-observation.test.ts"
node "$runner" deno test --allow-env --config="$backend/deno.json" --lock="$backend/deno.lock" --frozen \
  "$backend/tests/unit"
```

The Deno `check` task covers the planner, validator, both evidence parsers, shared
preparation types and error class, and all four unit test files. To focus the test command, replace the directory
with one test file, for example `"$backend/tests/unit/discovery.test.ts"`. All suites use
synthetic identities and do not need credentials or live services. The historical
lockfile is frozen and unchanged; its Supabase SDK pin is retained for lockfile
consistency but not imported by these modules.
