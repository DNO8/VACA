# D1 local preparation foundation — incomplete lifecycle

This is a **new implementation based on recovered contracts**, not recovered original backend source. It implements verified-payment preparation, private request-intent/sequence ownership and a trusted local unsigned-planning coordinator only. **Do not deploy it or direct donations to this pool.** S2 remains incomplete; there is no S3 deployment or public-ledger evidence.

## What works locally

`GET /functions/v1/d1-custody/config` preserves the existing public response with exactly `network: "TESTNET"`, `pool_public_key` and `donation_ttl_seconds: 300`. It exposes no signing material.

`POST /functions/v1/d1-custody/prepare` verifies an admin wallet signature, loads a single successful Testnet payment and its successful transaction, then invokes `d1_prepare` once. That RPC checks current `admin_wallets` membership and atomically calls the **unchanged** recovered `reserve_release_request` and `allocate_donation_to_release_request` contracts. Allocation is not issuance, payment or refund.

## Wire contract, revision 1

The JSON object has exactly these fields:

| Field | Value |
|---|---|
| `version` | Integer `1` |
| `network` | `"TESTNET"` |
| `pool` | Configured new pool's G public key |
| `action` | `"prepare"` |
| `request_id` | Lowercase UUID, immutable reservation identity |
| `timestamp` | Integer Unix seconds, inclusive ±60 seconds |
| `wallet` | Signing admin's G public key |
| `payload` | Exact object below |
| `signature` | Base64, 64-byte Ed25519 signature |

Payload fields are exactly `amount`, `beneficiary`, `incident_id`, `operation_id`, `transaction_hash`. `amount` is the requested allocation with exactly seven decimal places, not a declaration of the payment amount. `beneficiary` must match the existing incident through the recovered reservation RPC. IDs retain the recovered validators' formats. Unknown envelope/payload fields are rejected, including destinations, signed XDR, URLs and claimed payment facts.

Signing uses UTF-8 canonical JSON of the envelope **without `signature`**: recursively sort object keys lexicographically, preserve string contents, no whitespace. Sign the SDK SHA-256 of `Stellar Signed Message:\n` followed by that JSON using SDK Ed25519. The bound message includes network, pool, action, request ID, timestamp, wallet and every payload field. No custom cryptography is used. Signature validity alone does not grant admin membership.

### New donation binding

For new D1 donations use `Memo.hash(SHA256(UTF8("vaca.d1.donation.v1\n" + fullIncidentId)))`. `\n` means one LF byte. Hash the exact full incident identifier, without trimming, truncation or normalization. The donor transaction must contain exactly one ordinary payment operation. Native and issued assets are supported; muxed and path payments, multi-operation transactions and unknown outcomes fail closed in this foundation.

Horizon HTTP targets are fixed to `https://horizon-testnet.stellar.org`. Redirects are forbidden. The backend derives payment identity, donor, destination, asset, amount, success, ledger and confirmation time from operation/transaction evidence. Neither body fields nor the legacy `vq:<first8>` memo are accepted as payment proof. The old helpers/endpoints are untouched.

The reservation deadline is **on-chain payment confirmation +300 seconds**, represented as whole-second UTC. A newly prepared request at that cutoff is rejected by the existing RPC. Exact stored replays remain readable after expiry; they never authorize signing. Money uses integer stroops/SQL numeric, not floating-point aggregation.

### Responses and errors

Success returns the stored immutable receipt:

```json
{
  "revision": 1,
  "state": "allocated",
  "request_id": "<uuid>",
  "allocation": "<unchanged allocation RPC JSON object>"
}
```

`allocation` is an object in actual responses, containing the existing reservation/payment/allocation receipt. No extra mutable aggregate counter or secret is returned. Same UUID + identical preparation input returns the same receipt; conflicting input returns `409` without changing the reservation, allocation or capacity. A retry after an unknown SQL response must reuse the same request identity and immutable payload; the transport timestamp/signature may be refreshed.

Errors are JSON `{ "error": "<code>" }`, with no raw exception diagnostics:

| HTTP | Codes |
|---|---|
| 400 | `invalid_request` |
| 401 | `stale_request`, `invalid_signature` |
| 403 | `unauthorized_admin_wallet` |
| 404 | `not_found` (including unimplemented issuance/sweep routes) |
| 409 | `idempotency_conflict`, `donation_binding_conflict`, `donation_payment_conflict`, `historical_request`, `historical_payment` |
| 410 | `deadline_expired` |
| 422 | `unsupported_payment`, `payment_mismatch`, `payment_binding_mismatch`, `payment_before_activation`, `pool_not_activated`, `donation_capacity_exceeded`, `donation_request_mismatch`, `beneficiary_mismatch`, `incident_not_promoted`, `invalid_preparation`, `invalid_release_request`, `invalid_donation_payment` |
| 503 | `not_ready`, `ledger_unavailable`, `serialization_failure`, `dependency_unavailable` |

SQL `40001` is propagated as `503 serialization_failure`, never retried internally. Horizon 404, timeout and unavailable outcomes are not evidence that money can be paid again. Errors and receipts do not prove ledger issuance.

## Pure unsigned issuance planner (not an endpoint)

`functions/d1-custody/issuance-plan.ts` exports `planIssuance(prepared, context)`.
The caller must supply the existing immutable `Preparation` loaded after successful
persistence, not untrusted HTTP input; the planner does not authenticate or load a receipt.
`context` contains the exact SDK Testnet `networkPassphrase`, configured public `pool`,
current decimal-string `sequence`, decimal-string stroop `fee` (100–4294967295), and
explicit whole Unix-second `now`. There are no secret keys, environment reads, clock
reads, network calls, signing, broadcasting, or new HTTP commands.

It returns only `{ unsignedXdr }`: one `createClaimableBalance` operation for the
prepared allocation, with the beneficiary eligible strictly before the immutable
payment-confirmation-plus-300-second deadline, and the pool eligible not-before that
same deadline. Native and already-supported issued assets retain their verified identity;
amounts are checked using integer stroops, never rounded. Transaction time bounds are
`[now, deadline - 1]` in seconds, so creation at the claim cutoff is forbidden. At or
after the deadline it throws `issuance_window_exhausted`; unsupported shapes/bindings
throw `invalid_issuance_plan`. Inputs are not mutated; no fee, reserve, trustline or
ledger-success claim is made by producing XDR.

This is **not a durable issuance intent or idempotent submission**. It neither reserves
a source sequence nor reconciles outcomes, and is deliberately not wired into the
handler. Pool recovery is **not a refund to the donor**: the original donor mapping
remains in preparation for a future controlled refund path. Historical funds remain
out of scope; do not fund this incomplete foundation.

## Private issuance-request intent (not signing authority)

`016_d1_issuance_intents.sql` adds
`d1_register_issuance_intent(p_request_id UUID, p_authorized_by TEXT)`.
Only `service_role` can execute this trusted backend RPC. It does **not** verify
wallet signatures: a supplied admin public key is not public-wallet authentication.
`CustodyDatabase.registerIssuanceIntent` calls this RPC; there is no HTTP route.

The request UUID must already identify a persisted D1 preparation. Unknown,
historical and non-D1 reservations all fail with `d1_preparation_not_found`;
none can be adopted. Null IDs or invalid admin keys fail with `invalid_issuance_intent`.
Current admin membership is checked under a share lock on every invocation,
including replay; removal produces `unauthorized_admin_wallet`. Locks follow
015's admin → pool → preparation/intent order, deriving the namespace/pool from
stored preparation, not caller assertions.

The immutable receipt has `kind: "d1_issuance_request_intent"`, `revision: 1`,
`request_id`, `namespace`, `network: "TESTNET"`, `pool`, `preparation_input`
(the persisted verified input) and `preparation` (the saved allocation receipt).
Testnet is the existing 015 invariant, not a network argument. Destination,
issuer/asset, amount, donor, payment confirmation, ledger, memo binding and deadline
come exclusively from persisted preparation. No arbitrary payload, second UUID,
fee, sequence or XDR argument exists. No new reservation, allocation, capacity
counter or fund movement occurs. The private RLS table has no direct API-role
access, including service-role reads or mutations; only this empty-search-path
SECURITY DEFINER registration RPC exposes its receipt.

First registration requires database time strictly before the immutable deadline;
otherwise it fails with `deadline_expired`. Concurrent calls create exactly one
row and return identical receipts. Exact existing replay remains readable after
expiry, but is evidence only, **never authority to sign**. Registration itself
provides no mutable state machine, source-sequence ownership, envelope storage
or ledger-idempotency claim. Request-intent registration is a prerequisite for future planning/signing
integration. The local coordinator connects it to the planner, but not the handler.

The team must cover Testnet fees and claimable-balance reserves from a separately
funded operational balance, without reducing donations/refunds or consuming
excluded historical funds. This slice configures no account, key, funding or
ledger checks; it does not prove that the operational balance exists.

## Private exclusive issuance sequence ownership

`017_d1_issuance_sequences.sql` adds the service-role-only trusted backend RPC
`d1_reserve_issuance_sequence(p_request_id UUID, p_authorized_by TEXT,
p_observed_account_sequence TEXT)`. There is no HTTP route. The observation must
come from a trusted backend, never public wallet input. SQL does **not** verify
Horizon consensus or actual account state. No source, network, economic payload,
fee, destination or signed bytes can be supplied. Current admin membership is
share-locked even on replay; namespace, pool and immutable intent/preparation
come from persisted records in admin → pool → preparation/intent → sequence order.

Sequence text must be canonical nonnegative decimal (`0` or nonzero-leading
digits), at most `9223372036854775806`, matching the planner's current-sequence
bounds. Exact integer arithmetic leaves room for the next transaction sequence,
up to `9223372036854775807`; whitespace, signs, leading zeros, fractions, exponents,
null and overflow fail with `invalid_issuance_sequence`. Missing/non-D1 preparation
fails with `d1_preparation_not_found`; missing intent with
`d1_issuance_intent_not_found`; revoked admins with `unauthorized_admin_wallet`.

The private RLS table denies all direct API-role reads/DML, including service_role.
Its immutable receipt has `kind: "d1_issuance_sequence_reservation"`, `revision: 1`,
`request_id`, `namespace`, `network: "TESTNET"`, stored `pool`, decimal-text
`observed_account_sequence` and `transaction_sequence`, and the original `intent`.
It permits one exclusive owner per stored pool and one reservation per request.
Exact request + observed sequence replay returns the original receipt even after
expiry, **as evidence only**; a different observation conflicts with
`issuance_sequence_conflict`. First acquisition checks database time after lock
waits and fails with `deadline_expired` at/after the immutable payment deadline.
Another live request for an owned source fails with `issuance_source_busy`, even
when the owner's deadline has passed. Different stored pools remain independent.

There is **no TTL, release, deletion, reassignment or automatic sequence advancement**.
Unknown outcomes never free ownership. This deliberately blocks later requests
for that pool until future verified reconciliation (not implemented here).
No allocation, fee/reserve counter or original intent changes. This is not ledger
idempotency or operational readiness: the local coordinator remains disconnected from the handler;
there are no Horizon reads, signed envelopes, signing, broadcasts or refunds in
this slice. Separate operational funding remains a policy, not an account or
funding proof.

## Private unsigned-byte journal (not Stellar validation)

`018_d1_unsigned_transactions.sql` adds two trusted backend, service-role-only RPCs:
`d1_load_unsigned_transaction(p_request_id UUID, p_authorized_by TEXT)` and
`d1_save_unsigned_transaction(p_request_id UUID, p_authorized_by TEXT,
p_unsigned_xdr TEXT, p_transaction_hash TEXT)`. The local coordinator uses both
through `CustodyDatabase`; there is no HTTP route. A supplied admin key is not wallet authentication.
Both check current admin membership even on expired replay. Locks follow
admin → stored pool → preparation/intent → sequence → journal. The private RLS
table denies direct reads/DML to every API role, including service_role.

Lookup returns `{kind: "d1_unsigned_transaction_lookup", revision: 1, request_id,
namespace, network: "TESTNET", pool, reservation, transaction}`. Missing owned
reservation or journal is explicit JSON null; lookup never registers an intent or
allocates a sequence. Unknown/historical/non-D1 IDs cannot be adopted. Saved
reservation is the exact 017 receipt, so a future deliberate retry can recover
without a fresh account observation. Nothing retries or advances automatically.

Save requires that request's stored exclusive reservation. Its immutable receipt
has `kind: "d1_unsigned_transaction_journal"`, `revision: 1`, `request_id`,
`namespace`, `network: "TESTNET"`, `pool`, persisted preparation `deadline`, stored
`transaction_sequence`, exact `reservation`, `unsigned_xdr`, `transaction_hash`.
First save checks database time strictly before the deadline **after all lock
waits**. Exact bytes + hash replay returns the original receipt even after expiry,
as evidence only. Different bytes or hash conflicts; concurrent identical saves
return one receipt/row, competing bytes have one winner. No overwrite, deletion,
TTL, release, additional allocation or fee/donation counter exists.

SQL stores **opaque strings**, not verified Stellar transactions. Base64 must be
canonical, nonempty, whitespace-free and at most 65,536 ASCII characters (49,152
decoded bytes); encoder-inserted PostgreSQL line breaks are removed only during
canonicality checking, never from input. Hash must be exactly 64 lowercase hex
characters. SQL does not decode XDR semantics, verify signatures, or prove that
hash matches bytes. Tests intentionally use fictional non-Stellar bytes. A separate
SDK validator below checks these semantics locally; the coordinator requires it on
both saved replay and first-save responses.
SQL errors: `invalid_unsigned_transaction`, `d1_preparation_not_found`,
`d1_issuance_sequence_not_found`, `deadline_expired` use 22023;
`unauthorized_admin_wallet` uses 42501; `unsigned_transaction_conflict` uses 23505
(adapter mapping to 409, not an implemented HTTP response). This is not
account consensus, operational funding proof, signing readiness or full D1.
The separate team-funded Testnet fee/reserve policy remains unchanged.

## Saved unsigned transaction validator (historical evidence only)

`functions/d1-custody/unsigned-transaction.ts` exports
`validateUnsignedTransaction(input)`. Its readonly `UnsignedTransactionInput` contains
`prepared` (trusted persisted `Preparation`), configured `networkPassphrase` (SDK
Testnet only) and `pool`, reserved `observedSequence` and `transactionSequence`,
original saved `unsignedXdr`, and mandatory `expectedTransactionHash`.
It returns readonly `{ unsignedXdr, transactionHash }`, preserving the **original
exact string**, not replacing or normalizing saved bytes. All invalid runtime
inputs throw `Error("invalid_unsigned_transaction")`, without SDK diagnostics.

The helper bounds canonical Base64 to 65,536 characters before decoding, requires
64 lowercase hex hash characters, and accepts only an ordinary v1 unsigned Stellar
transaction with zero signatures and exact source/reserved-next sequence. Sequence
comparison uses exact integers, including values above JavaScript's safe range.
It reconstructs the known planner form using the **decoded historical minTime and
fee**, never a fresh clock: minTime must be a safe whole second from confirmation
through deadline−1, maxTime exactly deadline−1, with the original confirmation+300
deadline. Reusing `planIssuance` preserves its monetary/asset and complementary
beneficiary/pool predicates. Exact XDR equality rejects extra operations, operation
sources, memos, advanced preconditions/signer requirements, legacy/fee-bump envelopes
and canonical differences. The SDK Testnet transaction hash must match the supplied
hash; there is no optional-hash bypass. Future first-save code may compute the SDK
hash and then invoke this helper; saved artifacts must supply their stored hash.

This is **historical reconstruction, not a new plan or signing authority**. Valid
saved evidence can be checked after expiry without resetting TTL or reading current
time. The helper has no database, network, environment, key loading, signing or
submission effects and does not label anything ready or funded. SQL remains opaque
storage; the coordinator connects journal load/save and this validator without
signing or submission. Separate operational fee/reserve funding and donor-refund obligations
remain unchanged and unproven.

## Trusted local coordinator (not an endpoint)

`createIssuanceCoordinator(configuration)` in `issuance-coordinator.ts` returns
`(requestId, authenticatedAdmin) => Promise<{ unsignedXdr, reservation }>`. This is an
**already-authenticated backend identity boundary**, not wallet authentication: never
expose it by accepting an arbitrary admin public key from a client. SQL rechecks
current membership on every journal/intent/sequence RPC, including expired lookup.
The two arguments contain no economic payload,
preparation, network, sequence, fee, destination or XDR.

Configuration supplies only the public pool, existing `CustodyDatabase`, trusted
`observeAccount(pool)` returning `{ network: "TESTNET", pool, sequence }`, and
`now()`/`fee()` providers. No account adapter, Horizon call, environment read,
entrypoint wiring or second accounting/client implementation is added.
Dependency injection is **not Horizon consensus, freshness or funding proof**.

**Every invocation loads the 018 journal first**, validating lookup identity,
namespace, Testnet/configured pool, runtime shapes and nested reservation/intent
bindings before any external observation. A prepared request with both reservation
and transaction null is valid; a journal without its reservation is invalid.

| Persisted state | Local flow |
|---|---|
| Saved journal | Validate the complete immutable journal, exact reservation/intent/deadline/next-sequence bindings, actual SDK XDR and mandatory stored Testnet hash. Return original saved bytes and reservation only. No registration, observation, reservation, fresh planning, clock, fee or save call. Expired evidence remains readable without TTL reset. |
| Reservation only | Reuse its original observed/next sequence and nested persisted intent. Read clock, reject expiry before reading fee or saving; otherwise plan and save once. Never observe or reserve again. |
| Neither | Register and validate stored intent; observe configured Testnet pool; reserve and validate exact observed/next sequence and structurally equal nested intent; read clock/fee, then plan and save once. |

Only the reservation's persisted preparation reaches the planner. The SDK receives
its **observed** sequence and increments once. Before first save, the coordinator
computes the SDK Testnet hash and invokes the existing unsigned validator. Success
requires an awaited durable save and full validation of its returned journal,
including exact equality with proposed bytes/hash. No provisional plan escapes.
Returned artifacts are historical unsigned evidence, **not authority to sign** or
proof of account freshness, operational funding, issuance or ledger success.

Local failures throw existing `CustodyError` with exact code/status:
`invalid_issuance_intent`/422 for invalid arguments; `unauthorized_admin_wallet`/403;
`issuance_sequence_conflict`, `issuance_source_busy` or `unsigned_transaction_conflict`/409;
`deadline_expired`/410; journal-only `invalid_unsigned_transaction`,
`d1_preparation_not_found` or `d1_issuance_sequence_not_found`/400;
`invalid_issuance_sequence`, `d1_preparation_not_found` or
`d1_issuance_intent_not_found`/422. SQL `40001` becomes
`serialization_failure`/503. Malformed receipts/bindings, unknown SQL/transport and
provider failures become `dependency_unavailable`/503 without diagnostics.
Planner failures are `invalid_issuance_plan`/422 or
`issuance_window_exhausted`/410. These are local errors, not a new HTTP contract.

There are no automatic retries, releases, deletes or compensating calls on failure.
An unknown reservation or save response may already have committed. Unknown save
returns 503 after exactly one attempt, without success, readback or automatic retry.
A later explicit invocation loads committed exact bytes without fresh providers,
or recovers the original owned reservation. Competing different plans have one
winner; conflicting bytes/hash return 409 and never overwrite. Expiry never frees
ownership. Legacy preparation and registration/reservation error mappings remain
unchanged; journal errors are method-scoped.

Signing, durable signed envelopes, submission/reconciliation, operational fee/reserve
funding checks, discovery and original-donor refunds remain future work. Earlier
PostgreSQL evidence is not new proof of this coordinator; its tests use a fake RPC
transport with the real adapter and offline SDK-decoded XDR. No SQL changed in this
integration unit; local model concurrency is not a new SQL concurrency proof.

## Database boundary

`015_d1_testnet_custody.sql` adds private activation/preparation overlay tables and service-role-only SECURITY DEFINER RPCs with empty search paths. It does not change the recovered functions/tables, backfill historical rows, release capacity on expiry, or invent new accounting counters.

`d1_activate_pool(namespace UUID, pool text, first_ledger bigint)` is an explicit immutable **operator-side** boundary, not an HTTP action. It rejects pools already present in historical accounting and conflicting activation replays. A future activation requires independent evidence that the pool is newly created and has no historical funds; an empty accounting table alone cannot establish that ledger fact. Payments before the boundary cannot enter preparation. No activation is performed on startup, and none has been performed remotely.

`d1_prepare(input JSONB)` accepts only backend-verified facts. It checks the versioned memo/deadline binding itself, rejects historical request/payment adoption, serializes preparations per pool, and preserves the recovered request/payment lock and allocation-capacity invariants. Only the service role can invoke it; wallet roles cannot execute or read its private state. This database lock is **not a Stellar source-sequence lock**.

The entrypoint reads `D1_POOL_PUBLIC_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in its runtime. No real values or secret pool seed are included. It deliberately constructs a **public-only** pool key, so this incomplete foundation cannot sign. Tests never execute the entrypoint, retrieve credentials, contact Horizon or connect to a remote database.

## Local verification

Prerequisites are the already prepared isolated Deno 2.6.8/PostgreSQL 17.11 toolchain and offline pinned dependency cache. No installation, global PATH edits, Docker, remote writes or deployment is needed. The integration harness uses Node built-ins; no npm test dependencies are added.

Run these foreground commands from PowerShell:

```powershell
node C:\Users\Danilo\.config\opencode\integrations\vaca-d1-toolchain\run-isolated.cjs deno task --config C:\Users\Danilo\Desktop\workspace\VACA\supabase\deno.json check
node C:\Users\Danilo\.config\opencode\integrations\vaca-d1-toolchain\run-isolated.cjs deno task --config C:\Users\Danilo\Desktop\workspace\VACA\supabase\deno.json test:unit
node --test C:\Users\Danilo\Desktop\workspace\VACA\supabase\tests\integration\*.test.cjs
```

For the separately prepared WSL/Linux toolchain (Deno 2.6.8/PostgreSQL 17.7), run from the repository root as a non-root user; PostgreSQL cannot initialize a cluster as root. These commands use only the frozen offline cache and fresh local fixtures, not a live database or testnet:

```bash
node --test supabase/tests/integration/fixture-runtime.test.cjs
node /home/danilo/.local/share/vaca-d1-toolchain/run-isolated.cjs deno check --config "$PWD/supabase/deno.json" "$PWD"/supabase/functions/d1-custody/*.ts "$PWD"/supabase/tests/unit/*.ts
node /home/danilo/.local/share/vaca-d1-toolchain/run-isolated.cjs deno test --config "$PWD/supabase/deno.json" --allow-env "$PWD/supabase/tests/unit"
D1_TOOL_ROOT=/home/danilo/.local/share/vaca-d1-toolchain node --test supabase/tests/integration/preparation.test.cjs
```

Linux requires an explicit absolute `D1_TOOL_ROOT`; missing/relative values fail before any fixture is created with `Linux fixtures require an absolute D1_TOOL_ROOT.` Temporary fixtures use `TMPDIR` when set, otherwise `os.tmpdir()`; keep that directory outside the worktree. No ambient environment is forwarded to the Linux launcher. It supplies isolated credential/config paths, PostgreSQL shared libraries, and fixed `PGHOST=127.0.0.1`/`PGDATABASE=postgres`, so Linux psql calls omit the host/database overrides rejected by that launcher. Ports remain unique and explicit. The harness stops and verifies its cluster before removing its Linux fixture; the Linux launcher removes its own per-command scratch. This is environment isolation and loopback-only testing, not an OS network sandbox. No automatic retries, provisioning or live testnet checks are part of these commands. Windows defaults are covered structurally by resolver tests; that is not evidence of an actual Windows integration run.

The optional nonsecret `D1_TOOL_ROOT` environment value on Windows selects the already installed tool directory for the Node harness only. It is not a network URL or application setting. The harness forwards only Windows system-directory variables to the sanitized launcher, fixes PostgreSQL to `127.0.0.1`, reserves a fresh port, and never reads ambient DB credentials. It creates minimal fixture `admin_wallets`/`incidents`/roles, applies only the retained 014/latest statement strings and authored 015/016/017/018 locally, and probes the public RPCs. A test-only SECURITY DEFINER snapshot RPC hashes all affected rows and counters around each rejected intent/sequence/journal call (including the new journal state); it grants no production table access. Intent/sequence tests assert exact terse psql stderr, stdout and exit status, deadline/replay and post-lock deadline behavior, concurrent single creation, exclusive per-pool ownership, independent stored pools, integer bounds and API privileges. The existing preparation scenario still runs in the same fixture. The Linux launcher adds network denial itself; do not duplicate `--deny-net`. The recovery snapshot remains read-only; it is not a complete bootstrap. Parallel psql processes exercise capacity and replay races.

On Windows, fixtures and launcher scratch remain under `C:\Users\Danilo\AppData\Local\Temp\opencode`, never the worktree. Every harness run prints exact `FIXTURE`/`LAUNCHER_SCRATCH` paths for parent cleanup, stops its owned PostgreSQL in `finally`, and verifies stopped status `3`. The Windows harness does not delete scratch. PostgreSQL's Windows EDB archive still lacks an independently verified publisher checksum; the local hash is not publisher attestation. Engram mirroring remains pending.

## Required before any funding or client migration

The following are **not implemented or proven** here:

- Bounded paginated discovery and durable cursors for every new-pool donation, including donations with missing/wrong incident memos and donations never browser-notified.
- Connecting the trusted local coordinator to independently authenticated authorized issuance, with ledger fee/reserve/trustline checks and verified ledger outcomes. Local unsigned planning alone does not issue a claimable balance.
- Durable exact signed-envelope/hash intents before broadcast, integration of the exclusive source ownership with definitive outcome reconciliation after timeout or persistence failure.
- Authenticated admin sweep, atomic claim+original-donor payment for eligible issued balances, unissued remainder refunds and durable issued/unissued accounting. There is no refund fallback or generic signing endpoint.
- Integration guards preventing legacy service-role accounting callers from registering/allocating new D1 pool payments outside this overlay. Existing contracts are deliberately unchanged, so their direct use cannot be treated as D1 proof.

Risk item 2 (auth/fund guards), item 4 (ordering/idempotency), and item 5 (dependencies/environment) still need parent integration and independent verification. The local preparation tests do not close those full-lifecycle risks or authorize downstream web edits.
