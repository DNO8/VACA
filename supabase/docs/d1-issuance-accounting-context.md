# Observe held issuance accounting without releasing funds

`observeIssuanceAccountingContext(client, { namespace, pool, requestId,
authenticatedAdmin })` joins persisted SDK evidence for one included issuance.
It is backend-only accounting context, **not consensus, settlement or refund permission**.

`observeIssuanceAccountingWithHistory(client, scope)` additionally returns
`{ context, history }`, recursively frozen, using the exact history from the same
validated accounting observation. It does not perform a second observation to
recover provenance. The existing context-only API and its read-only guards remain.
This additive API is locally incorporated source only; its new test definitions
have not been executed, and it is not mounted in the host.

## Evidence required

- Existing 032 outcome, revalidated through the accepted historical SDK gate
  against 031 attempt, signed 030, unsigned 018 and financial membership.
- Selected immutable 027 commitment, using the unchanged singleton adapter.
- Active 033 reservation matching the selected request, namespace and journal.
- Complete saved transaction history and validated operating-credit receipts at
  matching discovery state, projected with `calculateIssuanceEncumbrances`.

Every dependency call passes a read-only RPC allowlist. Missing 032 is rejected
before the accepted outcome coordinator can save. No source, signer, clock,
current-CB query, callback or caller-supplied economics is accepted.

## Returned facts stay held

| Field | Meaning |
| --- | --- |
| `accounting` | Gross original native/issued donor debt; issued/unissued donation partitions; selected success/failure evidence; unmatched activity quarantine. |
| `included` | Exact selected included fee, consumed sequence and successful CB ID, or null CB ID for failure. |
| `confirmedPoolFeesSpentStroops` | All saved pool-paid included fees, successful or failed; selected fee counted once, not added again. |
| `held` | Original declared issuance/future-refund commitment and active reservation; neither expires nor releases here. |

Output is detached and recursively frozen. Historical actors and signed bytes
remain unchanged; the current DB admin allowance is a separate requirement.
Bounded getter-free DTO snapshots and accepted reader limits fail closed.
Readers recheck page/state consistency; final reloads also compare joined receipts,
commitments, owner and states. These checks are not a database-wide atomic snapshot.
Missing, contradictory, drifting or malformed evidence yields sanitized 503
`issuance_accounting_unavailable`; only exact null-data DB `42501` /
`unauthorized_admin_wallet` denial yields 403. No automatic retry occurs.

Actual fees below declared fees do not create spendable surplus. Inclusion does
not discharge donor debt. Expiry and unknown activity do not authorize recovery,
refund, owner release or a new issuance. The later disposition gate and deployed
D1 acceptance remain separate, unfinished work.
