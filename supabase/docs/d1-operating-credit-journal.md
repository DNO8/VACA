# Private operating-credit observation journal

Migration 022 adds **authorized observations, not approved spending**. Apply only
in separately authorized environments; this work uses an owned local fixture.
Requires retained 014/20261011060218 and migrations 015, 019, 021. No runtime wiring.

## Service-role API

Both security-definer RPCs require an existing current admin wallet and reuse
019's admin → pool → checkpoint locks (including missing checkpoint serialization).
No direct table access is granted, including to `service_role`; RLS is enabled.

- `d1_load_operating_credit(p_namespace uuid, p_authorized_by text, p_operation_id text)`
  returns exactly `{kind:"d1_operating_credit_lookup", revision:1, namespace,
  network:"TESTNET", pool, operation_id, receipt}`; missing receipt is JSON null.
- `d1_record_operating_credit(p_namespace uuid, p_authorized_by text, p_observation jsonb)`
  returns exactly `{kind:"d1_operating_credit_observation", revision:1,
  authorized_by, observation}`. `observation` retains all ten T2c keys unchanged:
  `namespace, network, pool, funder, operationId, transactionHash, ledger,
  amountStroops, anchor:{sequence,hash,closedAt}, record`.

The receipt retains the original authorizer and complete original record, including
raw DTOs. A future load-first adapter can validate/replay it without network access.
JSONB structural equality defines identical replay (not JSON serialization ordering).
An authorized current admin can replay after anchor advance or admin rotation;
revoked admins cannot load or replay. Changed observations conflict, never overwrite.
There are no spend/credit counters. Operation IDs are canonical positive uint64 text.

New rows require complete current 021 coverage, the exact current anchor, active
in-cursor ledger/TOID identity, and whole-record equality with immutable 019 data.
Only native incoming payments or account creation from the named non-pool funder
with exact text `D1OPS` are accepted. Exact seven-decimal positive amounts convert
using integer decimal arithmetic to canonical int64 stroop text. Known tracked
`donation_payments` identities are excluded. Invalid new evidence raises
`invalid_operating_credit`; changed replay raises `operating_credit_conflict`.
Authorization/activation failures retain the existing 019 errors.

## Trust boundary and remaining prerequisites

SQL validates shape, bindings and persisted equality, **not chain execution or a
funder allowlist**. Raw Horizon DTO contents are opaque objects: SQL does not decode
XDR or reproduce the accepted SDK parser. Before every NEW save, the future backend
MUST invoke accepted `observeOperatingCredit` using backend-configured team funders
and its trusted source. Never accept public caller observations, a funded flag, or a
caller whitelist assertion as authority. Stored authorization alone proves no funding.

This is not a global financial snapshot. Full donor/historical liabilities, fees
including failed transactions, durable commitments, current account freshness and
legacy-write concurrency integration guards remain T2 prerequisites. Pool locking
serializes this journal and 019, not unmodified legacy allocation paths; donation
exclusion is not a claim to serialize those paths. Custody (risk item 2) and concurrency
(risk item 4) still require independent review before runtime/signing work.
No private keys, signing, HTTP, refunds, transfers, live migration or deployment.

## Local evidence

`D1_TOOL_ROOT=/home/danilo/.local/share/vaca-d1-toolchain node --test supabase/tests/integration/operating-credit-journal.test.cjs`

The standalone fixture applies only retained prerequisites and 015/019/021/022.
Assertions use public RPCs; isolated setup may seed legacy/historical facts. Rejected
calls assert exact exit/stdout/stderr plus unchanged lookup/state/original page receipt
(including its page counter). Teardown stops the owned PG, verifies PID disappearance
and removes only its owned fixture, even on assertion failure. Synthetic evidence is
not deployed, chain-execution, whitelist, funding or full D1 acceptance evidence.
