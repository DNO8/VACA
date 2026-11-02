# D1 legacy allocation boundary (023)

Local T2f implementation for S1–S6; not authorization to apply a live migration.
Apply only with old RPC executions quiesced: an already-running old function body
is not retroactively rewritten. No signing, funding, deployment or chain evidence
is provided by this migration or its synthetic PostgreSQL fixture.

## Public contract

`allocate_donation_to_release_request(p_request_id uuid, p_authorized_by text,
p_payment jsonb, p_expected_pool text)` keeps its OID, argument names, lack of
defaults, grants and original validation/current-admin/replay/conflict ordering.
Existing allocations, including D1-created allocations, replay their exact receipt.
New direct allocations into activated pools raise SQLSTATE `22023`, machine error
`d1_legacy_allocation_forbidden`, without changing payment capacity or receipts.
Unactivated historical pools retain ordinary allocation and replay, including
Repeatable Read and Serializable when there is no genuine concurrent conflict.

`d1_activate_pool(p_namespace uuid, p_pool text, p_first_ledger bigint)` keeps its
OID/header/grants and delegates its original validation, conflict, historical-pool
exclusion and receipt logic to an owner-only copy. `d1_prepare(p_input jsonb)` keeps
its OID/header/grants and changes only its allocator call to the owner-only original.
Its temporal, admin, historical-payment, request, receipt and unsigned v1 contracts
are unchanged. Activation still has its original service-role authorization, not a
new wallet argument. Prepare/direct allocation still require current admin membership.

Both private function aliases (`d1_allocate_donation_private` and
`d1_activate_pool_private`) and `d1_legacy_pool_fences` deny PUBLIC, anon,
authenticated and service_role access. The postgres owner reaches the copies
inside SECURITY DEFINER functions. No caller config/GUC token enables bypass.
The atomic migration pins the retained source bodies and metadata, validates
replacement anchors, and aborts on unexpected definitions; it is not a rerunnable
migration or a generic function-rewriting framework.

## Concurrency and historical funds

A private per-pool fence is seeded from historical payments and activated pools;
it is exclusion metadata, not a balance or new money counter. Historical allocators
share-lock stable rows without updating them. Activation retains 015's advisory
key/hash/order, then takes an exclusive fence lock and marks activation in the same
transaction as the original activation. Idempotent activation does not rewrite the
flag. Different historical pools have no common allocation lock.

The first successful allocation on a virgin fence also records a one-time
`has_legacy_payment` transition. This is necessary in the reverse stale-snapshot
race: an activation whose RR snapshot predates the first payment must encounter a
changed tuple, not silently miss that payment. Failed calls roll this metadata back.
First-ever fence insertion/transition can have real uniqueness/serialization
contention; established historical allocations do not perform unconditional writes.
A genuinely stale RR/Serializable snapshot may receive PostgreSQL's native `40001`;
no blanket isolation restriction, custom snapshot error or automatic retry is added.
Historical payment rows, counters and receipts are never migrated, consumed or freed.

## Isolated verification

```sh
D1_TOOL_ROOT=/home/danilo/.local/share/vaca-d1-toolchain node --test supabase/tests/integration/legacy-allocation-guard.test.cjs
```

The owned fixture checks public identity/ACL preservation, historical first/replay,
RR/Serializable success, activated rejection with unchanged public stored data,
prepare/replay, revoked admin and API-role/private-alias denial, both overlapping
activation/allocation orders, and stale-snapshot conflicts in both directions.
The trusted launcher ignores stdin and buffers stdout/stderr until process exit.
Held sessions therefore use an owned mode-600 FIFO passed explicitly to `psql -f`,
not interactive stdin. Psql's `\o` files prove that SQL reached its marker before
another RPC starts. The session helper tracks input line numbers; stale-RR error
assertions include the exact `psql:<fifo>:<line>:` prefix, without stderr masking.
Readiness failures report captured session/writer diagnostics when available.
Cleanup closes FIFO writers (EOF), stops the owned PostgreSQL to release remaining
queries, awaits every launcher/psql descendant, checks PID disappearance, and
removes only the owned fixture, including FIFOs. Runtime results must be reported
separately; authored assertions are not GREEN evidence. The baseline differential
is scratch-only, uses explicit `-c`/regular `-f` files, and must not introduce
Git/history reads into committed tests.
