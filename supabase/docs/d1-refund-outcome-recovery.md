# Refund outcome recovery — source only

Recovered from the authorized read-only WSL baseline for T2n (S5–S7, S11, S14–S15). Unverified: no SQL applied, tests, typechecks, runtime, network, signing or broadcast; no host mount.

## Read in dependency order
1. `../migrations/038_d1_refund_outcomes.sql` (200 lines): private outcome table and `d1_load_refund_outcome` / `d1_record_refund_outcome` RPCs.
2. `../functions/d1-custody/refund-outcome.ts` (114 lines): `parseRefundOutcome`, `RefundOriginalPayment`, `RefundOutcome`; real SDK signature/body/result consistency.
3. `../functions/d1-custody/refund-outcome-observation.ts` (259 lines): `observeSavedRefundOutcome`, `RefundOutcomeObservation`; saved candidate, signing/attempt, original payment and complete history bindings.
4. `../functions/d1-custody/refund-outcome-journal.ts` (191 lines): `loadRefundOutcome`, `recordRefundOutcome`, `RefundOutcomeReceipt`; load first, at most one save, validated readback only after a valid acknowledgement.

## Boundaries retained
- The only baseline adaptation is independent current-administrator `FOR SHARE` gates at SQL lines 24–25 and 46–47, after inherited dependency locking and before disclosure/replay/mutation; rejection is `unauthorized_admin_wallet` / SQLSTATE `42501`.
- RLS, service-role RPC ACLs, empty search paths, namespace/pool identity, exact replay and retained 033/034 ownership remain; scoped evidence reading grants no outcome-writing authority.
- SDK `txSuccess` accounts for the full atomic principal result; `txFailed` accounts for zero principal and no claimed balance. Neither HTTP acknowledgement, claim ownership, missing evidence, elapsed time nor 404 proves settlement or selects a lane.
- SQL stores positive historical membership, not consensus or terminal settlement. Outcome SHA-256 remains over PostgreSQL `jsonb::text`; TypeScript preserves that stored digest and compares full payloads, not a replacement JavaScript digest.
- Existing local imports: `handler.ts`, `refund-candidate-journal.ts`, `transaction-observation.ts`, `initial-issuance-outcome-journal.ts`, `original-obligations.ts`, `transaction-history-reader.ts`, `transaction-ingestion.ts`; SDK 13.3.0 is pinned in `../deno.json`, plus `node:buffer`.
- SQL depends on existing 018/024/032/034/036/037 and their dependency chain, including foundational `admin_wallets` and `release_request_valid_key`; their base definitions were not located in the scoped local source search. No dependency stubs or out-of-scope recovery were added.

## Packaging and remaining work
The complete source is 764 lines, plus this 22-line guide: retain checks rather than compress to ~400. Suggested dependent packages: SQL + parser (314 lines), observation (259), journal + guide (213).
Separate work remains for scoped service admission, trusted automatic coordinator/lane selection and permanent fences; manual/D3 and hosts are untouched.
Risk 2 (authorization) and Risk 4 (locks/revocation/concurrency) functional/security proof remains unexecuted under S15. This source is not operational readiness or financial acceptance.
