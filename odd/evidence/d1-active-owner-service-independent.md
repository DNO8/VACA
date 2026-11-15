# Active-owner service admission: independent evidence

T2e is verified within the local SQL boundary. It is not automatic-refund activation, deployed-schema compatibility, host authentication or financial acceptance.

## Candidate and scope

- Baseline: `38f7c3a569d303eec175c1e611689c32b376008e`.
- Source candidate: `44d1d084c518107b6467bf65b41982b81b179b3f` (three files, 246 added lines).
- Files: migration052, `active-owner-service-admission.test.cjs`, and the additive scope guide section.
- Independent verifier: `mwiakpf9-12-vuqr`.
- Risk: item 2 (authorization), item 3 (shared reader), item 4 (membership/pool concurrency).
- Native source assessment: medium, under budget, review not due, unknown/unconsumed. Explicit security escalation required the independent verifier; assessment is not approval.

## Parent test-first evidence

| Attempt | Observed outcome |
| --- | --- |
| job49 | Exit1 before PostgreSQL startup: omitted `TMPDIR` caused `/tmp` versus owned `.tooling/d1-backend/tmp` assertion. Zero SQL checks; inputs unchanged. |
| job50 | Invocation-only `TMPDIR` correction; meaningful RED, exit1 in 5.153s, 3PASS/6FAIL including the parent result. Scoped reader rejected with `unauthorized_admin_wallet`; administrative and excluded-mutation cases passed. PID348451 gone. |
| job51 | GREEN exit0 in 26.316s, 9PASS/0FAIL/0SKIP, empty stderr. Inputs unchanged; PID349501 gone and fixture removed. |

The focused suite checks seven exact administrator process differentials, original receipt and genuine absence, denied scope without state change, unchanged reservation/candidate gates, function metadata/ACLs, actual concurrent pool/membership waits, admitted-reader revocation blocking and atomic missing-reservation-guard/candidate-drift/ACL/reapply rejection. Earlier suites were not replayed.

Local raw receipts remain under `.tooling/d1-backend/metadata/active-owner-service-{red-1794774588140924594,red-env-fixed-1794774626235742064,green-1794774673774724100}`; they are not committed artifacts.

## Independent execution

One successful minimum-payload preparation, no setup retry. Source files matched candidate Git objects; pre052 SQL matched baseline objects. Mutable tracker changes were not treated as source drift.

```sh
env -i PATH=/usr/bin:/bin HOME=/tmp/av.UP6335/home \
 TMPDIR=/tmp/av.UP6335/tmp NODE_COMPILE_CACHE=/tmp/av.UP6335/cache \
 NO_UPDATE_NOTIFIER=1 python3 /tmp/av.UP6335/probe.py
```

Observed exit0: **20 checks, 838 launcher receipts — 805 exit0 and 33 expected exit1**. PostgreSQL version was `170007`. A separate `node --check` of the copied focused CJS fixture returned exit0 with empty stdout/stderr. Real migration application supplied SQL parser validation; no additional build applies.

Independent probes established:

- Five administrator pre/post052 comparisons preserve exact exit, stdout and stderr: valid absence, unknown namespace, null namespace, null actor and empty actor.
- Scoped SQL NULL preserves complete public logical data and function catalog. Parent populated-receipt evidence remains separately recorded.
- Rejections have exact `42501 / unauthorized_admin_wallet` or `22023 / invalid_issuance_sequence` receipts, with unchanged logical/catalog hashes.
- Reservation and both034 candidate entry points remain denied to the service actor.
- Actual `pg_blocking_pids` relationships show an admitted absence reader blocks pool rebinding; after rebinding, old membership fails.
- A reader waiting behind revocation observes committed deletion and fails.
- Restoring genuine033 reservation code minus its precise authorization block causes052 to reject atomically with `P0001 / unexpected_d1_active_owner_service_definition`; public logical/catalog state is unchanged and the original reader still denies the service.

All **1,619 original input hashes** were preserved. PostgreSQL **PID353906** was stopped and proven gone. Repository status before/after was byte-identical, excluding `.tooling`. No repository/Git writes, network calls, installations, credentials or funds were involved.

Harmless inspection miss retained: the verifier first tried nonexistent `033_d1_issuance_sequence_reservations.sql`, then read `033_d1_issuance_sequence_ownership.sql`. No preparation or test failed. No candidate blockers or new advisories were reproduced; no new conclusion is claimed about pre-existing034 replay semantics.

## Requirement verdicts

| Spec | Verdict for this unit |
| --- | --- |
| S5 | Met: existing administrative behavior preserved; no existing path removed. |
| S6 | Met: isolated minimum public payload and no remote effects. |
| S7 | Met: scoped evidence reader, excluded mutations, revocation/pool locks and atomic missing-guard rejection. |
| S11 | Met: evidence-only original-receipt/NULL access, no implicit ownership or mutation authority. |
| S1–S4 | Out of scope: automatic execution, mobile/wallet UI and web administration. |
| S8–S10 | Out of scope: historical tooling and correction cycles were not reopened. |
| S12 | Out of scope: consumed historical T2d continuation. |

## Durable probe and preservation

Exact executed probe: [d1-active-owner-service-independent-probe.py](d1-active-owner-service-independent-probe.py).

SHA256: `ee62c9f17f946207f651e183cb5048790154ed0a72ac39e37a42a4fdde22c6f9`.

This is an archived scratch probe, **not a command to execute from this directory**. It requires the pinned public migration/runtime payload, scratch-owned configuration and `pins.json` produced during verifier preparation. The 838 raw receipts and preparation manifest are not archived; scratch availability is not guaranteed. Parent archived the exact source and checked its hash/AST and all three candidate file bytes, exit0, without replaying SQL.

Full automation, trusted host identity, remaining refund admission, deployed compatibility, integration and financial acceptance remain open. No deployment, activation or funds were authorized by this result.
