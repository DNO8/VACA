# Revalidate saved transaction history before counting fees

`readTransactionHistory(client, namespace, authenticatedAdmin, pool)` reads the
complete, covered transaction journal through current-admin RPCs and revalidates
every saved record with the pinned Stellar SDK. It returns the captured `state`,
decoded `records`, and decimal `confirmedPoolFeesSpentStroops`. This is historical
observation evidence, **not permission to spend or sign**.

## Read path

1. Load the accepted `TransactionHistoryDatabase` state. Require complete income
   and transaction coverage at the same saved anchor.
2. Page `d1_list_transaction_records` from independent transaction cursor `0`,
   with limit 100. Require the full history state to remain identical on every
   page, including counters, coverage and the income checkpoint.
3. Decode each raw transaction/result/ledger again. Require exact normalized
   structural equality, original pool/activation scope, an original anchor no
   later than the captured checkpoint, ascending unique transaction identities,
   and final cursor/count agreement.
4. Reload state under current authorization and require the same full state
   before returning anything. Drift rejects the entire invocation without retry.

## Accounting and bounds

| Rule | Behavior |
|------|----------|
| Pool fee payer | Count actual charged fees for included success **and failed** transactions |
| Other fee payer | Retain the record but do not charge its fee to the pool, even with pool operation sources |
| Fee maximum | Never substitute the bid for the actual charged fee |
| Empty history | Return zero only with explicit complete coverage, zero records/cursor and stable final state |
| Resource bounds | At most 1,000 records, 1 MiB per untrusted response and 8 MiB total decoded record JSON; exceeding a bound rejects, never truncates |
| Monetary bound | Sum must fit nonnegative signed int64 stroops |
| Failure | Sanitized `transaction_history_unavailable` 503; current-admin denial remains `unauthorized_admin_wallet` 403 |

Only load/list RPCs are called. There are no writes, Horizon requests, retries,
background recovery, signatures or ownership transitions. Input accessors and
non-JSON data are rejected before decoding.

## Limits and next dependency

Historical records retain their original anchors; a later current anchor does
not rewrite their provenance. SDK/DTO consistency does not verify consensus,
signatures or chain ancestry. The final read establishes a stable observation,
not an atomic financial reservation: another transaction may commit afterward.

This module does not infer initial source sequence, approve team credits, explain
outgoing operations, compute donor/historical liabilities or reserve future fees.
Those facts and a fresh owner-bound durable financial gate remain required before
runtime signing. This local implementation supplies no deployed/chain acceptance
evidence. See [journal](d1-transaction-history.md),
[query](d1-transaction-queries.md) and [budget](d1-operating-budget.md).
