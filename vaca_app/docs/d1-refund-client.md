# D1 refund client v1

## Status and integration boundary
Client source is implemented against agreed contract `70db5386`. The backend is not mounted or operational. Functional tests, SDK execution and live acceptance are deferred; written test cases are not passing-test evidence. This component is not mounted in application providers or screens.

Only the existing personal wallet signs command proofs. The pool key, service-role key, XDR, financial authorization, durable server submission and terminal settlement stay on the backend. No existing wallet service, UI, database schema or D3 coordinator is changed.

## Public integration seam
Construct `RefundClient` with `RefundHttpClient`, `RefundWalletSigner` and `RefundSubmissionJournal`, using the existing `SecureStorage`. The transport takes the existing project HTTPS origin and **public** API key. Never pass a service-role credential. Do not use raw HTTP dispatch instead of the consumer.

- `status(originalScope)`: one fresh-signed `refund_status` POST, no execution fallback.
- `requestRefund(originalScope)`: explicit user intent; first read fresh status. Only positive `not_started` may reserve the original correlation and dispatch once. An existing local record takes the status-only path instead.
- `reconcile(originalScope)`: separate explicit observation POST, never an automatic follow-up, sign/submit fallback or release.

The scope is `TESTNET/namespace/pool/original issuance request ID`. Never generate a refund UUID or use a claim operation ID as donation identity. Commands contain exactly version/network/pool/namespace/action/request_id/timestamp/payload/wallet/signature; payload is empty. Amount, destination, asset, fee, sequence and XDR never enter the client request.

Each proof signs SHA-256 of UTF-8(`Stellar Signed Message:\n` + compact sorted root JSON excluding signature), with a fresh Unix-second timestamp and the existing personal wallet. Wallet membership remains server authority; signing is not financial permission. Private exceptions and seeds are never returned or logged.

## Passive provider composition
`features/refund/refund_providers.dart` declares a feature-local Riverpod graph. It is NOT imported by existing core providers or screens and does not activate an endpoint or UI. `refundClientConfigurationProvider` reads the existing public `SUPABASE_URL` / `SUPABASE_ANON_KEY` build defines; missing, malformed or non-HTTPS configuration fails closed when constructing the HTTP client. Never provide a service-role credential.

Reading `refundClientProvider` constructs the existing consumer, personal-wallet signer and refund journal with the same `secureStorageProvider`. Construction does not read keys, write records, sign or send commands. No existing wallet service or D3 coordinator is created by this graph. Commands still require explicit calls with the original scope.

`refundHttpClientProvider` owns its HTTP client and closes it on provider/container disposal; it is deliberately not auto-disposed during an awaited explicit command. `refundHttpClientFactoryProvider` is an injectable construction seam for isolated adapters. A factory must return a fresh owned transport, not a shared transport belonging to another container. This graph does not own or clear secure storage. Configuration/factory overrides are trusted application composition, not financial authority.

`refund_providers_test.dart` contains cold/default construction, instance reuse, owned-close and invalid-public-configuration cases using counting storage/adapters. These cases are UNEXECUTED. Source composition is not backend availability, screen integration, runtime verification or financial acceptance.

## Durable hold and recovery
Before the first refund dispatch the refund-only journal acknowledges the write and reloads a validated original donation/deadline snapshot. Only then can it mint a final private-constructor local reservation. HTTP consumes that reservation before signing or network activity; it cannot be reused. This is a local dispatch guard, **not** backend financial authorization.

A lost reply, storage ambiguity, error or reconstruction must retain the hold and use freshly signed status or explicitly selected reconcile. No journal delete/reset API, automatic retry, polling, redirects, repeated first POST or liability reduction exists. Errors produce an unknown hold with no fabricated DTO or advertised financial action; a host may still offer explicit status using the original scope. Unknown amounts are null, not zero.

Consumer serialization is shared across instances in one Dart isolate. The journal also rejects simultaneous same-isolate reservations. Neither is a cross-isolate/device compare-and-swap or distributed lock. Server durable nonce/idempotence before Horizon submission remains mandatory.

## State integrity
Responses have exactly 13 keys and prescribed nested shapes, state/reason/verification/ordered-action tuples and HTTP codes. All replies require `Cache-Control: no-store`. The private transport has no interceptors, redirect following, refresh or retry hooks; response bytes are limited to 16 KiB and a command has a 10-second network cancellation deadline.

HTTP replies and stored journal JSON reject duplicate member names in each object before admitting decoded values, including escaped aliases such as `state` and `\u0073tate`. Names repeated in different nested objects remain valid. An ambiguous reply yields an unknown hold, with no reservation or refund POST; an ambiguous journal retains its stored record and prevents any command. No raw JSON diagnostic is exposed.

Amounts are canonical seven-decimal strings bounded by int64 stroops; payment operation IDs are positive uint64 strings. Original payment hash, donor, asset, gross and deadline cannot change after local reservation. An unverified refund object or transaction hash is not inclusion or settlement.

Only `settled` is whole-donation terminal, with all accounting known, `gross = beneficiaryClaimed + donorRefunded` and remaining `0.0000000`. Claiming 1 of gross 10 leaves 9 protected; neither a reduced gross nor a partial accounting tuple can replace the original donation. Safe actions permit commands, not spending eligibility. Pending, unknown, blocked and failed inclusion never expose refund/retry/replan/release.

D3 beneficiary claims remain a separate per-balance Horizon/personal-signing flow. Initial issuance `/status` is historical and is not any of these refund endpoints.

## Deferred verification
`refund_status_test.dart` contains domain, exact proof and wire/one-use permit scenarios. `refund_client_test.dart` contains durable-write ordering, concurrent instances, lost response, reconstructed consumer, error/redirect/malformed-body holds, protected gross10/claim1, terminal claim1+refund9 and separately explicit reconciliation. Fixtures use synthetic deterministic identities and an in-memory transport/storage, never real keys or network.

Additional unexecuted client cases cover root/nested/escaped duplicate names, preservation of a corrupt journal with zero commands, a legitimate repeated name across separate objects, and one valid escaped name. The new shared decoder changes current bytes; earlier independent static reports do not cover this addition.

These cases are source, not observed test results. No complete beneficiary-before-expiry or donor-after-expiry journey, live ledger inclusion, financial safety acceptance, build, deployment or whole-D1 completion is claimed. Integrating into the app and actual backend activation remain separate authorized work after a pinned operational handoff and deferred verification.
