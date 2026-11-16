# Historical financial-snapshot digest binding

`validateDonorFinancialDigests(capture, expected)` is a **private, digest-consistency-only**
continuation of the [issuance prefix validator](d1-donor-issuance-prefix.md).
It returns that detached context plus frozen `financialDigests` entries per request;
each observation retains its exact `snapshotText`, `snapshotHash` and parsed receipt.
It is not a public DTO, financial authorization, or final issuance verdict.

## Validation boundary

1. Call the unchanged prefix validator first. Its descriptor-safe copy, capture budgets,
   complete history/allocation validation and SDK unsigned-body checks remain authoritative.
2. Validate every observation, including unused rows: exact row/request/hash binding,
   unique hash **within each request**, an unsigned prefix ancestor, the exact ten-key
   028 envelope, scope/revision/kind/transaction hash and checksum-valid G authorizer.
3. Parse the whole receipt with `parseCapturedJSONB` before scanning. Duplicate decoded
   keys, malformed/trailing JSON, unsafe or nonintegral numbers fail before extraction.
4. Require the actual nineteen-key 028 snapshot object and its six identity fields.
   Locate the decoded **top-level** `snapshot` member with a string-aware structural scan.
   Hash its exact object-token UTF-8 bytes, at most 1,048,576 bytes, against both stored hashes.
   No `JSON.stringify` reconstruction or guessed PostgreSQL serializer participates.

Any invalid row rejects the whole result with `CustodyError("donor_payment_unavailable", 503)`.
Empty observation lists are valid; they do not establish network absence. No clock,
provider, RPC, coordinator facade, database write, or caller callback is used.

## Byte evidence and focused checks

[Four offline vectors](../tests/fixtures/donor-financial-jsonb-vectors.json) were emitted
by isolated local **PostgreSQL 17.7 (Ubuntu 17.7-3.pgdg24.04+1)**, without migrations.
For each constructed JSONB receipt, its literal nested snapshot substring equaled
standalone `snapshot::text`; PostgreSQL SHA256 UTF8 also matched Node's SHA256.
Vectors retain source input, exact receipt/snapshot text, digest and server provenance.
They cover Unicode, escaped quotes/backslashes/braces, nested arrays/objects, empty
objects, decimal scale (`1200.0000`) and scientific input (`12.00e+3` → `12000`).
**These are serialization vectors, not complete financial-authorization fixtures.**

[Focused tests](../tests/unit/donor-financial-digest.test.ts) exercise the exported
validator over genuine native/issued SDK prefix fixtures, byte and schema rejection,
whole-result failure, historical reads, immutability and descriptor safety.
Run with the approved external HOME/TMPDIR/DENO_DIR/NODE_COMPILE_CACHE and pinned Deno:
`deno test --config supabase/deno.json --cached-only --frozen --allow-env --deny-net supabase/tests/unit/donor-financial-digest.test.ts`.
JSON fixtures are imported as JSON; no arbitrary filesystem read permission is needed.

## Deliberately unproved

The digest does **not** certify economics, snapshot history coverage, credit state,
account freshness, fee commitments, signing authority, signatures, submission or outcomes.
Those snapshot fields remain opaque beyond whole-JSON safety; no 027 commitment comparison
is claimed. A valid G authorizer is not proof of current administrator membership.
Historical snapshots may have older anchors than the captured history, and signing and
submission may reference different hashes. Later rows remain unvalidated context, not
spending authority. Full financial projection, host integration and executor work remain
separate under S4/S14; independent Risk item 2 verification is parent-owned.
