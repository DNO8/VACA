# Validate captured original donor history without RPCs

`validateDonorCapturedHistory(capture, expected)` implements the **T4e1 / S4,S14 private history boundary**. It returns a detached, deeply frozen `{capture, history, payment}` from actual migration054 rows and a previously verified donor command. It does not implement a public endpoint or finish the allocation projector.

## Call boundary

1. Authenticate with the dedicated [donor command verifier](../functions/d1-custody/donor-payment-command.ts) against trusted configuration.
2. Have the trusted backend obtain the [054 private capture](d1-donor-payment-snapshot.md). This module does not call SQL, providers, administrator adapters, journal loaders, or write-fallback helpers.
3. Pass that capture and verified command to [the pure validator](../functions/d1-custody/donor-captured-history.ts).
4. Pass the retained allocation rows to the **next, separately implemented provenance projector**. Do not send this private result to a browser or turn its payment-only result into a successful full DTO.

Every exception becomes `CustodyError("donor_payment_unavailable", 503)`, including a null capture, null owned payment, malformed input, missing history, or oversized evidence. A null054 payment is not authoritative absence proof and never establishes public404.

## What is validated

| Boundary | Evidence and checks |
| --- | --- |
| Envelope and ownership | Exact054 envelope, scope and evidence keys; command kind/revision/network; namespace, pool, donor, hash and operation-ID bindings; owned payment's exact fields, asset, gross amount and bounded stored counters |
| Descriptor safety | Detached data-descriptor clone before parsing or SDK traversal; no input getters, serialization hooks or coercion; plain objects/dense arrays only; symbols, cycles, non-JSON values and unsafe numbers reject |
| Lossless columns | JSONB columns must be text. A grammar parser rejects duplicate decoded keys and proves each numeric lexeme is an exact safe integer using decimal digits and BigInt before Number conversion. `9007199254740991.1` and `10.000000000000000001` reject; `100e-1` can represent ledger10. SQL bigint columns remain canonical decimal strings; cursors, IDs and stroops are never rounded |
| Complete journals | Replay019/024 receipts in contiguous page-count order from cursor zero, independent of054 text sorting. Check row/page/receipt bindings, monotone anchors, record ordering, cumulative counts, unique identities, exact stored-record bijection and final checkpoint. Both journals require an actual empty-tail page at their matching final anchor |
| Cross-source coverage | Each history-page anchor requires a completed discovery anchor. Discovery SDK records must match successful included-history transaction DTOs. No `coverage_complete` claim or constructed state/set hash is accepted as evidence |
| SDK provenance | Re-decode included envelope/result/ledger evidence with `parseIncludedTransaction`, and discovered operations with `parseDiscoveredOperation`. Invoke `calculateOriginalObligations` only after coverage, row and credit bindings; accounting alone cannot establish coverage |
| Operating credits | Actual stored receipts only: row ID, namespace, pool, network, discovery record and completed discovery anchor/cursor must agree. Existing pure accounting checks included history, source, amount, native asset and `D1OPS` SDK memo before exclusion. Credit substitution cannot remove a normal donation, and a real credit cannot be selected as the original donation |
| Payment DTO | Exactly `transactionHash`, `operationId`, `donor`, `asset`, `grossAmount`, `confirmedAt`, `deadline`. Confirmation comes from the included original successful ledger; deadline is canonical UTC original time +300 seconds, bounded to a four-digit year |

## Retained data and limits

The exported concrete types include `CanonicalOwnedCapture`, `CapturedAllocation`, `CapturedDonorHistory`, `DonorPaymentDTO`, and a recursively readonly result type. Runtime freezing also protects nested arrays and objects. Changing the caller's capture after validation does not change the returned data.

The canonical owned capture retains raw JSONB text and raw allocation descendants, including null descendants and all financial-observation rows. Allocation containers/column encodings and request ordering are checked, but **allocation economics, authorization, preparation, signed/submission/outcome provenance and their cross-bindings are not certified here**. Even an apparently empty allocation set requires the future full projector/host contract before public success. The raw retained capture contains private evidence and is not a public DTO.

The local clone has a conservative **4MiB UTF-8/overhead budget**, 160,000-node ceiling and depth32. Each journal has at most1,000 records and10,000 pages; at most100 allocations and1,000 credits are accepted. It can reject a capture smaller than SQL's serialized4MiB ceiling because defensive traversal overhead also counts. There is no truncation, latency guarantee, new backend timeout or wider public-response limit.

## Verification and review path

The focused [test](../tests/unit/donor-captured-history.test.ts) uses the existing real SDK `fixture()` for payment/result/operating-credit proof and builds actual054 text columns with019/024 page receipts and real empty-tail records. It checks an original `10.0000000` payment and exact +300 deadline, scope and owned-row mismatches, independent count/tail/cursor failures, credit substitution and exclusion, unsafe numeric lexemes, hostile descriptors, oversized input, atomic input preservation and deep immutability.

Observed development sequence: missing-module RED (TS2307, zero executed assertions); first implementation run40PASS/1FAIL because the fixture assertion compared allocation object key order; one test-only correction compares every key/value structurally; corrected41PASS. Additional tests isolate tail validation from count checks and explicitly reject selecting a real operating credit. Final focused/seam evidence belongs in the writer/parent handoff; no independent verification is claimed here.

For review, start with `replayJournal`, then the lossless parser and operating-credit bindings, then the returned payment/retained allocation distinction. Existing authentication, SDK helpers, fixture, SQL, host, admin, runtime and status sources are unchanged. No shared-command behavior or command-line help is changed.

## Remaining boundary

A single MVCC capture is internally consistent at its statement snapshot; it is **not a promise of perpetually immutable database state**, chain consensus, live freshness, current-CB availability, refund eligibility, lane selection, settlement or financial authority. SDK decoding proves stored DTO/XDR consistency, not independent consensus. This code creates no authorization grant and does not verify donor authentication by itself.

Next: validate every allocation/preparation/outcome chain, construct and bound the full donor DTO, integrate the authenticated host, and independently verify the risk-item2 boundary. Deployment, activation, web/app integration and financial acceptance remain separate. See the [donor read contract](../../odd/docs/d1-donor-read-contract.md).
