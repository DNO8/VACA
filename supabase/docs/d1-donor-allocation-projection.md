# Validate historical donor allocations without claiming issuance

`validateDonorCapturedAllocations(capture, expected)` is a pure, private T4e2a boundary for S4/S14. It returns the validated original capture/history/payment plus every certified allocation/request/preparation, or throws exactly `CustodyError("donor_payment_unavailable", 503)`. It does not infer 404 or expose a public donor DTO.

## Validation path

1. Call the existing `validateDonorCapturedHistory` first: detached descriptor-safe snapshot, evidence budgets, owned original payment, complete stored history replay and canonical SDK provenance.
2. Parse only that validated snapshot's JSONB with the existing lossless parser, now additively exported as `parseCapturedJSONB`. The parser alone is **not** a descriptor or byte boundary. Duplicate keys and unsafe/fractional numeric values remain rejected before conversion.
3. Require each allocation's release request and preparation. Bind request IDs, namespace, authorizers, original hash/operation/donor/pool/asset/gross, exact request JSON, fixed-seven amount and row stroops. Canonical IDs/order/uniqueness remain enforced by the outer validator.
4. Bind preparation ledger/confirmation to original history, deadline to original +300 seconds, and incident memo to SHA-256 of `vaca.d1.donation.v1\n` plus incident ID. For an allocation, the original SDK transaction must carry that hash memo, as required by the existing prepare handler. Empty allocation sets impose no new memo restriction.
5. Reconstruct the **entire** 015 receipt, including the retained allocator's reservation, payment, allocated amount/state/time. PostgreSQL timestamp offsets are compared as instants against canonical UTC-millisecond receipt times; invalid calendar dates fail. Sum all allocation stroops using BigInt, require exact captured aggregate equality and no excess over original gross/int64.

## Result and limits

Each immutable allocation contains `requestId`, `beneficiary`, `amount`, parsed `preparation`, and `raw` captured row. The result and descendants are frozen; caller input is never changed. There is no callback, RPC, provider, clock lookup or lifecycle mutation. Empty allocations require a captured zero allocation counter.

`raw` deliberately retains issuance descendants **without certifying their provenance**. Neither their presence nor absence establishes `not_recorded`, issuance success/failure, current claimable-balance availability, lane selection, eligibility or settled principal. Historical authorizer binding is not a current administrator-membership check; incident membership is not recertified against a live incident table.

## Review anchors

- `migrations/054_d1_donor_payment_snapshot.sql`: actual raw row encodings and complete stored allocation capture.
- `migrations/015_d1_testnet_custody.sql`, retained migrations 014/20261011060218 and `functions/d1-custody/handler.ts`: request/preparation semantics and nested receipt shape.
- `tests/fixtures/donor-allocation.ts`: genuine SDK payment/hash memo/result/discovery/history pages and full allocation receipt, independent of the older placeholder fixture.
- `tests/unit/donor-allocation-projection.test.ts`: native/issued mixed 1:N, exact aggregate, hostile input, malformed parents, memo/time/economics/binding failures, raw retention and existing-history preservation.

Next unit: certify issuance intent → sequence → unsigned → financial → signed → submission → outcome, then the full public DTO. Host integration, independent risk-item-2 verification, deployment and activation remain separate.
