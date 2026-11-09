# D1 refund client v1

## Status and integration boundary
Client source is implemented against agreed contract `70db5386`, with feature-local providers and a local administrative app entry. An accepted operational backend handoff has not been delivered here. Protocol/financial suites, SDK execution and live acceptance remain deferred; their written cases are not passing-test evidence. Separately scoped cold responsive-layout checks are executed, as described below. Source navigation is not operational or financial acceptance.

Only the existing personal wallet signs command proofs. The pool key, service-role key, XDR, financial authorization, durable server submission and terminal settlement stay on the backend. Existing wallet services, database schema and D3 coordinator are unchanged; Identity test tools adds only the separate administrative entry.

## Public integration seam
Construct `RefundClient` with `RefundHttpClient`, `RefundWalletSigner` and `RefundSubmissionJournal`, using the existing `SecureStorage`. The transport takes the existing project HTTPS origin and **public** API key. Never pass a service-role credential. Do not use raw HTTP dispatch instead of the consumer.

- `status(originalScope)`: one fresh-signed `refund_status` POST, no execution fallback.
- `requestRefund(originalScope)`: explicit user intent; first read fresh status. Only positive `not_started` may reserve the original correlation and dispatch once. An existing local record takes the status-only path instead.
- `reconcile(originalScope)`: separate explicit observation POST, never an automatic follow-up, sign/submit fallback or release.

The scope is `TESTNET/namespace/pool/original issuance request ID`. Never generate a refund UUID or use a claim operation ID as donation identity. Commands contain exactly version/network/pool/namespace/action/request_id/timestamp/payload/wallet/signature; payload is empty. Amount, destination, asset, fee, sequence and XDR never enter the client request.

Each proof signs SHA-256 of UTF-8(`Stellar Signed Message:\n` + compact sorted root JSON excluding signature), with a fresh Unix-second timestamp and the existing personal wallet. Wallet membership remains server authority; signing is not financial permission. Private exceptions and seeds are never returned or logged.

## Passive provider composition
`features/refund/refund_providers.dart` declares a feature-local Riverpod graph. Existing core providers are unchanged. The administrative host uses it through `RefundPanel`; navigation alone does not read the consumer or activate an endpoint. `refundClientConfigurationProvider` reads the existing public `SUPABASE_URL` / `SUPABASE_ANON_KEY` build defines; missing, malformed or non-HTTPS configuration fails closed when constructing the HTTP client. Never provide a service-role credential.

Reading `refundClientProvider` constructs the existing consumer, personal-wallet signer and refund journal with the same `secureStorageProvider`. Construction does not read keys, write records, sign or send commands. No existing wallet service or D3 coordinator is created by this graph. Commands still require explicit calls with the original scope.

`refundHttpClientProvider` owns its HTTP client and closes it on provider/container disposal; it is deliberately not auto-disposed during an awaited explicit command. `refundHttpClientFactoryProvider` is an injectable construction seam for isolated adapters. A factory must return a fresh owned transport, not a shared transport belonging to another container. This graph does not own or clear secure storage. Configuration/factory overrides are trusted application composition, not financial authority.

`refund_providers_test.dart` contains cold/default construction, instance reuse, owned-close and invalid-public-configuration cases using counting storage/adapters. These cases are UNEXECUTED. Provider composition is not backend availability, runtime verification or financial acceptance; local screen navigation is described below.

## Standalone administrative panel
`presentation/refund_panel.dart` provides `RefundPanel(scope: originalScope)`, now hosted by the separate local administrative screen. The host must supply the ORIGINAL issuance identity. The panel does not discover donations, generate request IDs, renew deadlines or infer admin membership. All membership/financial checks remain on the backend.

Validated status also displays the original donor, payment operation ID and payment transaction hash for comparison with the original record. A non-null refund object displays its attempt reference and reported amount, explicitly NOT proof of inclusion or settlement; a later null object removes those attempt fields. These are existing v1 facts, not an extension of its execution capabilities. Showing a DTO with gross10/claim1/refund9 does not establish that the current backend can execute a verified-remainder refund. The additional provenance widget case is written but UNEXECUTED.

Mounting or changing the scope sends nothing. The user explicitly consults status, reconciles only when the validated consumer permits it, or confirms an advertised first-refund intent. Refund goes through the existing consumer's fresh status/journal/one-use path, never raw transport. After an error only explicit status recovery is offered; a stored first-post hold suppresses refund even when a later DTO says not_started. Original gross/deadline and nullable accounting stay visible; only validated settled is labeled terminal. No deadline timer or release-by-absence exists.

The panel captures its scope/generation across dialogs and commands. Scope changes clear old facts; old responses/confirmations cannot populate or dispatch from a new view, including A→B→A. UI busy feedback is NOT another financial coordinator or backend idempotence. Existing already-dispatched operations are not canceled/replanned. `refund_panel_test.dart` contains public widget/mock transport cases for these rules; all are UNEXECUTED, not visual/runtime or financial acceptance. Local navigation source is composed below; actual backend activation and runtime acceptance still require their separate evidence.

## Local administrative navigation
Identity → Herramientas de prueba → Reembolsos Stellar testnet opens `RefundAdminScreen` via the standalone `RefundAdminEntry`. Wallet/About callbacks, core providers and D3 flows are unchanged. The entry is visible as a tool, NOT a client-side grant of admin membership: the backend must authorize every signed request.

The operator supplies an ALREADY EXISTING namespace UUID, original pool PUBLIC key and ORIGINAL issuance request UUID from the original record. Existing `RefundScope` validates exact canonical values; the form does not generate, trim, renew or substitute identifiers. No amount, donor destination, wallet seed, fee or XDR is accepted. This is a known-reference lookup, not original-record discovery or verification. Mobile currently has no authoritative original-request list or initial-issuance receipt source; incident IDs, claimable-balance IDs, the refund journal and historical initial `/status` cannot supply one. No new API or direct database RPC is invented.

Opening a route or loading a valid reference sends nothing; the existing panel still requires explicit status. Loaded fields lock until the operator changes the reference. That change removes presentation only and never clears storage, cancels/replans an already dispatched operation or bypasses durable first-post recovery. The feature-local consumer/transport retain their existing provider lifetime. Missing backend/public configuration/personal wallet remains an unavailable/unknown hold, not permission to refund. `refund_admin_screen_test.dart` has cold navigation/back, invalid-reference and explicit-status/change-reference cases; ALL are UNEXECUTED, not rendered-UI proof.

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

## Responsive presentation
The administrative screen follows the existing VACA light/dark theme, with a centered reading column (maximum760 logical pixels), safe-area scrolling, spaced reference fields and full-width actions. The public pool field can wrap; loaded technical references remain selectable and untruncated in the existing data typeface. Original, attempt and settlement information are separated visually; their meanings and visibility rules do not change. Text scaling is not clamped.

`refund_responsive_layout_test.dart` is a separately scoped, EXECUTED presentation-only suite: three cold-layout checks at320px with200% text and260px keyboard inset,600px dark and1024px dark with200% text. It checks reading width, scroll/touch reachability, locked references and preservation when changing the view, with ZERO financial-client constructions. The test harness settles focus-driven scrolling before pointer checks. This does not execute the deferred protocol/widget scenarios listed below or verify populated backend states, financial actions, a real keyboard, native device fonts or APK behavior.

Design sources/directions: `design/system.md` and `design/d1-refund-responsive/` at repository root. The guided-stack direction is implemented; the other two are alternatives. Native canvas lookup is unavailable in the home-root harness; a bounded loopback static preview is not a running Flutter application. See `odd/evidence/d1-refund-responsive.json` for exact failed RED, successful layout run and analysis outcomes.

## Deferred verification
`refund_status_test.dart` contains domain, exact proof and wire/one-use permit scenarios. `refund_client_test.dart` contains durable-write ordering, concurrent instances, lost response, reconstructed consumer, error/redirect/malformed-body holds, protected gross10/claim1, terminal claim1+refund9 and separately explicit reconciliation. Fixtures use synthetic deterministic identities and an in-memory transport/storage, never real keys or network.

Additional unexecuted client cases cover root/nested/escaped duplicate names, preservation of a corrupt journal with zero commands, a legitimate repeated name across separate objects, and one valid escaped name. The new shared decoder changes current bytes; earlier independent static reports do not cover this addition.

These cases are source, not observed test results. No complete beneficiary-before-expiry or donor-after-expiry journey, live ledger inclusion, financial safety acceptance, build, deployment or whole-D1 completion is claimed. Local known-reference navigation source is implemented. Automatic original-record discovery/web receipt handoff is not supplied by this component. Actual backend activation and complete runtime/financial journeys remain separate work after the concrete backend handoff and deferred verification.
