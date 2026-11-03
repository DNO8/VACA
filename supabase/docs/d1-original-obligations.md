# Protect original donor principal without inferring a refund

`calculateOriginalObligations(input)` is a pure backend calculator over captured
scope, included transaction records and recorded operating-credit receipts. It
returns original donation rows, native and issued principal totals, matched
operating-credit IDs/total, and explicit `unexplainedActivity` flags.

**It does not establish complete/current authorized history or remaining balances
after execution.** Its inputs must come from accepted stable backend readers;
this is not an HTTP contract, caller-provided financial authority or a spending
reservation.

## Principal rules

- Revalidate every raw ordinary-v1 SDK transaction/result/ledger and exact saved
  normalized observation. Bind pool, activation boundary, anchor, ascending unique
  transaction identities. Failed transactions introduce no incoming principal.
- Preserve each successful incoming native/issued payment and pool account-creation
  amount with original donor, exact asset code/issuer, operation TOID, transaction
  hash and confirmation time. Missing/wrong donation memo does not erase a debt.
- Exclude an incoming native amount only when an original recorded credit receipt
  exactly matches that successful operation's ID, funder, amount, hash and envelope,
  with raw SDK `D1OPS` evidence and matching scope/anchor. Memo alone is insufficient.
- Never subtract fees, allocation, unsigned plans, outgoing payments or presumed
  claims/refunds. Original principal is not proof of the current remaining debt.
- Successful pool-source activity is flagged `unexplained_pool_operation` rather
  than interpreted as discharge, with one narrow initial-setup exception below. Unsupported non-pool-source operations are
  flagged `unsupported_operation`; other-account `manageData` cannot move pool
  principal. Any nonempty flag list must block downstream financial authorization
  until disposition accounting explains it. Flags do not release ownership.

Native and issued totals are separate; issued amounts group by **code and issuer**.
All arithmetic is exact positive stroops, with signed-int64 caps per asset and
for the operating-credit total. No rounded decimals or fee discounts occur.

## Initial non-principal setup, not custody proof

A successful ordinary issued-credit `changeTrust` with an explicit positive int64
limit may be explained only when its effective source is the pool and its operation
TOID precedes **every protected incoming operation**. Exact recorded native D1OPS
exclusions are applied first; unapproved genesis remains protected. Ordering uses
transaction TOID plus operation index, even within a single transaction, not time.
Zero-limit deletion, liquidity-pool lines, later setup and other pool operations
remain unexplained. Neither liabilities nor operating-credit/actual-fee totals
change. This does not establish who signed/authorized setup, historical permissions,
issuer/sponsor continuity, consensus or exclusive backend key custody. The caller
must still establish creation, complete history, current account and funding.

## Bounds and failure

Inputs and output have an 8 MiB JSON traversal budget; inputs are limited to
1,000 transactions and 1,000 receipts. Accessors, symbols, sparse arrays, cycles,
non-JSON data, duplicate identities, inconsistent SDK evidence, unmatched/duplicate
credit claims and overflow fail closed as `donor_obligations_unavailable` 503.
Input objects are snapshotted, not mutated. No RPC, network, signing or writes.

## Integration still required

The financial assembler must combine stable current-admin reads, new-pool creation
evidence, current controlled-account facts, original obligations, reconciled issued
or refunded dispositions, actual pool-paid fees and durable future commitments.
Only a fresh owner-bound durable gate can authorize execution. An empty calculation
is not discovery completeness, zero historical funds or operating readiness.

This local unit supplies no actual chain transactions or full-D1 acceptance.
See [history](d1-transaction-history-reader.md),
[credit reader](d1-operating-credit-reader.md) and
[new-pool evidence](d1-pool-creation-eligibility.md).
