# Private donor evidence capture (054)

`public.d1_capture_donor_payment(p_namespace uuid, p_pool text, p_transaction_hash text, p_operation_id text, p_verified_donor text) → jsonb` captures actual stored evidence. **It is not donor authentication, a public response, verified chain history, or financial permission.** This implements the private capture portion of T4d / S4,S14; the trusted host and SDK projector remain separate.

## Call boundary

Only `service_role` receives EXECUTE (apart from the owning PostgreSQL administrator). PUBLIC, `anon` and `authenticated` receive none; no table privileges or existing functions change. The SECURITY DEFINER function has an empty search path and fully qualified tables. Source grants have not been applied remotely.

The future host must verify the new personal wallet proof and match namespace/pool to trusted configuration **before** calling. A wallet argument alone authenticates nobody. SQL validates StrKey checksums, hash/operation-ID bounds and the exact stored namespace/pool binding; it cannot determine the host's configuration or verify a signature. No administrator substitution, GUC bypass, service-principal provisioning or 048–053 widening is involved.

## Revision 1 return contract

Exact top-level keys: `kind`, `revision`, `scope`, `dbReadAt`, `payment`, `allocations`, `evidence`.

- `kind`: `d1_donor_payment_capture`; `revision`: `1`.
- `scope`: exactly `namespace`, `network` (`TESTNET`), `pool`, `verifiedDonor`, `transactionHash`, `operationId`, bound to the input.
- `dbReadAt`: integer Unix seconds from the caller's database statement start. It is neither original payment confirmation nor chain freshness.
- `payment`: the owned `donation_payments` row or null. Raw columns: `transaction_hash`, `operation_id`, `payment`, `donation_stroops`, `allocated_stroops`.
- `allocations`: every matching allocation, ordered by UUID; no active-owner or expiry filtering. Each element has the table-named keys below.
- `evidence`: the namespace evidence below for an owned payment; otherwise null.

**Lossless raw encoding:** row column names are unchanged. Every SQL `bigint` column is a canonical decimal **string**, even for small values. Every SQL `jsonb` column (`payment`, `request`, `input`, `receipt`, `checkpoint`, `page`, `record`) is a **string containing PostgreSQL JSONB text**, not an already parsed JSON object. This preserves arbitrary nested numeric precision and distinguishes SQL-null missing rows from JSONB `null` text. The projector must parse these strings losslessly, then validate bounded SDK fields; blindly calling JavaScript `JSON.parse` on unvalidated raw numeric values can still lose precision. UUID/text columns remain strings; timestamp columns use PostgreSQL's JSON timestamp representation (not the public DTO deadline format). No new canonical payment timestamp is invented.

| Allocation key / source table | Raw columns; cardinality |
| --- | --- |
| `donation_allocations` | `request_id`, `authorized_by`, `transaction_hash`, `operation_id`, `allocated_stroops`, `allocated_at`; one |
| `release_requests` | `request_id`, `authorized_by`, `request`, `state`, `reserved_at`; nullable row |
| `d1_preparations` | `request_id`, `namespace`, `input`, `receipt`; nullable row |
| `d1_issuance_intents`, `d1_unsigned_transactions`, `d1_issuance_fee_commitments` | `request_id`, `receipt`; nullable rows |
| `d1_issuance_sequences` | `namespace`, `request_id`, `receipt`; nullable historical row, not active ownership |
| `d1_initial_financial_observations` | `request_id`, `snapshot_hash`, `receipt`; **all rows**, array ordered by snapshot hash |
| `d1_signed_transactions` | `request_id`, `snapshot_hash`, `receipt`; nullable row |
| `d1_submission_attempts`, `d1_issuance_outcomes` | `request_id`, `attempt_id`, `receipt`; nullable rows |

| Evidence key / source table | Raw columns; cardinality |
| --- | --- |
| `d1_pools` | `namespace`, `pool`, `first_ledger`; configured row |
| `d1_discovery_checkpoints` | `namespace`, `checkpoint`, `page_count`; nullable row |
| `d1_transaction_checkpoints` | `namespace`, `checkpoint`, `page_count`, `record_count`; nullable row |
| `d1_discovery_pages`, `d1_transaction_pages` | `namespace`, `from_cursor`, `through_ledger`, `ledger_hash`, `page`, `receipt`; all namespace rows |
| `d1_discovery_operations` | `namespace`, `paging_token`, `transaction_hash`, `operation_id`, `record`; all namespace rows |
| `d1_transaction_records` | `namespace`, `paging_token`, `transaction_hash`, `record`; all namespace rows |
| `d1_operating_credit_observations` | `namespace`, `operation_id`, `receipt`; all namespace rows for operating-credit exclusion |

Pages sort by `(from_cursor COLLATE "C", through_ledger, ledger_hash COLLATE "C")`; operations/records by text paging token COLLATE "C"; credits by text operation ID COLLATE "C". This is deterministic raw ordering, **not numeric chronology**. Empty arrays mean no stored rows, never complete chain absence. Nullable checkpoints stay null; 021/024 coverage and 026 credit-state proofs are not fabricated.

## Atomicity, privacy and limits

One relational SELECT captures all tables under one MVCC snapshot. STABLE also preserves the outer caller-statement snapshot. Ownership is materialized before descendant capture; foreign and absent results have null payment/evidence and empty allocations with the same requested scope/read timestamp semantics. Invalid ownership metadata fails unavailable rather than asserting absence. Foreign malformed descendants do not affect the result. This is response-semantic privacy, not timing-side-channel proof.

Missing descendants survive LEFT joins; financial observations retain their 1:N cardinality. Mismatched preparation/sequence namespaces or preparation payment bindings fail closed. Broader receipt/economic/SDK validation is deliberately deferred. More than 100 allocations or more than 4,194,304 bytes of UTF-8 PostgreSQL `capture::text` raises `22023 donor_payment_unavailable` for the **whole** call. No pagination, truncation, partial return or writes occur. The byte cap is checked after aggregation, not a memory/latency guarantee; large namespace histories can make a lookup unavailable.

The future projector must validate original payment history, operating-credit exclusion, all request bindings and signed/submission/outcome artifacts; establish cross-source stability; derive original `confirmedAt` and exact `+300` deadline from validated history/preparation; then enforce the separate r1 public 65,536-byte cap. A null payment capture alone is **not sufficient proof for public 404**, especially with incomplete history; it must not manufacture coverage or turn uncertainty into absence. No capture result selects refund lanes, CB availability, settlement, hold release or retries.

## Local verification

`supabase/tests/integration/donor-payment-snapshot.test.cjs` uses retained 014/allocation DDL, actual 015–034 and 048–053 migrations, existing public fixture writers, and one disposable PG lifecycle. Synthetic XDR/history fixtures test storage capture, not SDK validity. The focused test covers ACL/privacy, 1:N and missing evidence, precision, scope, whole-result caps, unchanged rows/catalogs and concurrent snapshot behavior. Existing historical suites are not replayed. Independent authorization/privacy (risk item 2) and snapshot (item 4) review remains parent-owned; no deployment or integrated D1 readiness is claimed.
