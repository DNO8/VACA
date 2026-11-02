# D1 transaction-history observation journal (local T2i)

Migration `024` requires `015`, `019` and `021`. It leaves their bodies, income
cursors, historical funds, unsigned plans and existing receipts unchanged.

Only `service_role` may call `d1_load_transaction_history_state(p_namespace,
p_authorized_by)` or `d1_record_transaction_page(p_namespace, p_authorized_by,
p_page)`. Every call checks the **current** admin through 019/021 and holds the
same pool lock. All three new tables have RLS and no API-role table privileges.

Save accepts exactly the T2h `TransactionObservationPage`: revision, from/to TX
cursors, through-ledger/hash/close time and normalized included records. Limits
are 100 records, 1 MiB serialized JSONB text per page, 128 KiB per record (not
compressed storage size). It checks canonical numeric TX TOIDs, metadata,
active-pool context and raw/normalized identity/fee/anchor consistency. Both
successful and failed included outcomes retain their actual charged-fee field.
It does **not** decode SDK bytes, verify signatures, approve fees or sum funding.

New pages require the exact current covered income anchor and monotonic TX
cursor/anchor. Page identity is namespace + from-cursor + anchor ledger/hash;
empty pages can therefore advance an anchor without advancing the TX cursor.
Exact replay returns the entire original receipt/authorizer after current-admin
validation, even after income advancement or admin rotation; it never rewinds.
Changed saved bodies, stale cursors, anchor conflicts and hash/token overlap
raise `transaction_history_conflict` (`23505`, HTTP 409); malformed input raises
`invalid_transaction_page` (`22023`). Rejected writes leave the journal unchanged.

Load returns `income_state`, independent TX `checkpoint`, cumulative page/record
counts and `coverage_complete`. Only a saved empty TX marker matching the current
TX cursor AND exact current covered income anchor makes coverage true. Zero
counts and default cursors are never coverage or financial readiness.

The full-page receipt also binds namespace/pool/first-ledger, checkpoint, original
authorizer and counters for a later single-awaited-save coordinator. Unknown save
outcomes must not trigger automatic retry, readback, release or financial action.
The future backend coordinator must revalidate persisted raw bytes with the SDK.
Tests use explicitly non-SDK opaque bytes and isolated PostgreSQL only; they are
not chain execution, deployed acceptance or financial closure evidence.
