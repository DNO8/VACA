# Donor r1: portable offline vectors, not endpoint evidence

**147 vectors pin bytes; 51 pin Node-generated cryptographic references. All proposed contract outcomes remain `UNEXECUTED`.** These fixtures support T4b / S4,S13 peer interoperability, not a production donor codec, authenticator, SQL reader, endpoint, or web UI. Keys are **PUBLIC, DETERMINISTIC, FICTIONAL — NOT FOR FUNDS**.

## Quick path

1. Consume [`donor-read-r1-vectors.json`](../tests/fixtures/donor-read-r1-vectors.json) without normalizing its raw `input` strings. Pin schema `d1-donor-read-offline-vectors/r1` and the artifact hash below.
2. Expand recipes exactly as specified below; verify each `expectedInputBytes` and `expectedInputSHA256` before consuming a case.
3. Cross-check the canonical message / digest / signature with an independent SDK. Wallet adapters receive **`canonicalJSON`**, not raw HTTP JSON, a prefixed message, or a digest. No wallet adapter is invoked by this corpus.
4. Later authorized real codecs may execute `proposedContractExpected`; do not turn the current integrity tests into acceptance claims.

## Artifact and authority

| Item | Value |
| --- | --- |
| Contract | [Proposed r1](../../odd/docs/d1-donor-read-contract.md), SHA256 `5356b48a21981136a110ff5dbb986682ee08a927a0b74c8519066f2acfa6de89` |
| Fixture | 160727 bytes; SHA256 `7b6e3cedba53cbb4a9536d24aa4f564e0f853cd9748d6e8804cbf0db10cb6d0f` |
| Counts | 58 requests, 67 DTOs, 6 size/count witnesses, 16 error-layer examples = 147 |
| Clock / scope | Unix seconds `1700000000`; exact network/namespace/pool in fixture `scope` |
| Reference producer | Node **v22.23.3**, built-in `node:crypto`, no Stellar helper used to derive expected crypto |
| Independent implementation | Cached Stellar SDK **13.3.0**; focused test imports JSON, not a donor runtime module |

## Schema: evidence separated from expectations

Each case has `id`, `domain`, `input`, exact expanded byte length/SHA256, and `proposedContractExpected` with `status: "UNEXECUTED"`. Request crypto fields are `canonicalJSON`, `expectedSHA256digest` (lowercase hex), `expectedEd25519signature` (canonical Base64). The raw HTTP signature remains in `input`, so changed-binding cases intentionally retain the old signature while the reference signature describes the changed canonical message.

`cryptographicExpected` is a **mathematical reference**, not authentication: `wireSignatureHex` supplies decoded test bytes; `wireSignatureValid` describes Ed25519 verification against the request wallet. Missing/invalid wallet or undefined canonicalization uses null, not a successful authentication. Invalid Base64 spelling can decode to a valid signature; that never implies canonical Base64 acceptance. The tests deliberately do not implement a Base64 validator.

Unique-key, parseable but invalid-schema requests may carry **diagnostic** canonical/crypto values: these are not permission to bypass step 1 of r1 validation. Canonicalization removes only `signature`, sorts only top-level keys using default JavaScript sort, and JSON-stringifies parsed values. Malformed UTF-8/JSON, duplicate decoded keys, and oversized request-before-decode witnesses instead have null canonical/digest/signature plus a rationale. Unsigned DTO/error/limit witnesses also carry null crypto with a rationale. Duplicate witnesses are never parsed by the tests.

`accept_authentication_only`, `accept_format_only`, and `within_byte_cap_only` are proposed, conditional outcomes, not a 200/provenance/eligibility claim. `reject_dto` describes malformed response data; `backendIfStoredEvidence` describes the proposed whole-lookup 503 when encountered as stored evidence, not a browser error. Error-layer examples carry exact status/body and preserve no-hold-release/no-financial-retry expectations without executing those effects.

## Byte recipes (versioned, deterministic; no implicit newline)

Literal inputs use either `utf8` (encode the decoded fixture string as UTF-8, preserving its body whitespace/order/escapes) or `hex` (decode pairs verbatim). Recipe inputs expand as follows, preserving base insertion order:

| `recipe` | Exact expansion |
| --- | --- |
| `response-edits` | Deep-clone `bases.response`; apply `edits` in order. `path` is an array of literal property/index strings, not JSON Pointer. Traverse to its parent; `remove:true` deletes the final property, otherwise assign `value`. Serialize via compact JavaScript `JSON.stringify` and UTF-8. Existing property assignment retains order; new properties append. |
| `pad-utf8` | UTF-8 encode compact `JSON.stringify(bases[input.base])`, then append `byte` exactly `totalBytes - baseByteLength` times. Here byte 32 is legal trailing JSON whitespace. |
| `allocation-count` | Clone `bases.response`; replace allocations with `count` independent clones of its first allocation. For zero-based index i, set requestId to `33333333-3333-4333-8333-` + decimal `(i+1)` left-padded to 12 digits. Compact JSON-stringify/UTF-8. |
| `repeat-byte` | Exactly `count` copies of `byte`. The zero-filled internal-evidence witness measures bytes only; it is not valid provenance data. |

The 65536/65537 response witnesses use legal trailing whitespace to isolate wire size, not an assertion that the compact endpoint serializer emits that padding. 100/101 allocations and 4 MiB/+1 are independent ceilings; none implies valid provenance or completion within the unchanged 10-second proxy timeout.

## Crypto reproduction and check boundary

Fixture seeds are public bytes `00..1f`, `20..3f`, `40..5f`. Node wraps each seed with DER PKCS8 hex `302e020100300506032b657004220420`, derives its Ed25519 public key, hashes UTF-8 `"Stellar Signed Message:\n" + canonicalJSON` with SHA256, then calls `crypto.sign(null, digest, privateKey)`. The prefix has **one LF**. Node's StrKey fixture encoding uses version byte 48, CRC16-XModem (initial zero, polynomial 0x1021), little-endian checksum, and unpadded uppercase Base32; SDK address/raw-key checks independently cover that encoding.

[`donor-read-r1-vectors.test.ts`](../tests/unit/donor-read-r1-vectors.test.ts) checks all expanded-byte hashes/counts, three public keys, all 51 literal digest/signature references, original wire proofs, wrong-key/changed-message rejection, equivalent parsed lexemes, raw duplicate preservation, size recipes, and identical absent/foreign error bytes. It contains no production-like validation and calls no endpoint or adapter. Data-only reference creation has no meaningful behavior RED; do not report a fabricated RED/GREEN cycle.

Coverage definitions include every signed binding and missing request key; ±60/±61 and timestamp shape; canonical/noncanonical Base64 including padding bits; literal/escaped duplicates at two depths; fatal UTF-8 and malformed JSON; int64 string boundaries; exact nested native/issued DTO shapes, issuance null states, 1:N order/duplicates/empty; positive fixed-seven amounts; CB prefix/case/length; confirmedAt/deadline/readAt boundaries; both error layers and all caps.

## Remaining proof

- Parent independent Risk item 2 verification of cryptographic reference evidence is required.
- Contract rejection, authentication/privacy, backend/proxy behavior, complete provenance/MVCC capture, mutation counters, hold/funds behavior, current-CB freshness and latency are **unexecuted**. No production files or old administrator helpers are changed/reused through casts.
- S4 web administration and the rest of automatic refunds remain incomplete. S13 authorizes this offline parallel unit, not deployment, permission grants, installation, network access, live keys, or funds.
