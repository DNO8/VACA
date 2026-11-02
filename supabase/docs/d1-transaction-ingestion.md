# One anchored transaction-history page

`TransactionHistoryDatabase(client, namespace, authenticatedAdmin, pool, "TESTNET")`
binds immutable trusted backend context. `ingestTransactionPage(database, source?)`
loads current-admin state through **024** before touching a provider. The only RPCs
are `d1_load_transaction_history_state(p_namespace, p_authorized_by)` and
`d1_record_transaction_page(p_namespace, p_authorized_by, p_page)`.

The income journal must already cover the current consistent anchor. Transaction
history has its own canonical cursor, checkpoint and counters, independent of the
income operation cursor. The default accepted `HorizonDiscoverySource` reads one
transaction page at that anchor. Injection is for trusted backend DI/tests only,
not an HTTP request field. Every record is re-decoded with
`parseIncludedTransaction`; full normalized structural equality ignores JSONB
object-key ordering but preserves arrays and rejects extra record fields.

Only the bounded persisted JSON page and completion flag are captured. The
accepted source's current account may contain BigInts: it is not persisted or
returned here. Accessors, holes, cycles, non-JSON and oversized page data fail
closed with sanitized 503. All context is cloned before the provider await.

Exactly one save is awaited, then the complete receipt (scope, original canonical
G authorizer, body, checkpoint and expected counters) is checked before success.
Exact empty-page replay preserves counters; identical concurrent winners may
legitimately preserve another original authorizer. No current-authorizer claim
replaces the original audit. Only an empty page reports `completeAtAnchor`.

An unknown save outcome returns 503 without retry, readback, another provider
call, replanning or ownership release. A separate later invocation loads the
advanced committed cursor and can continue. Known own-string current-admin denial
is 403; transaction-history conflict is 409; malformed dependency errors are 503.

This is local ingestion evidence, not financial readiness or independent chain
proof. No credit approval, money ownership, signing, legacy RPC, unsigned bytes,
SQL query or SDK all-pages history behavior changes. A paged historical read and
financial assembler (liabilities, actual execution fees and commitments) remain
required. No live Supabase/Horizon/deployment acceptance is implied.
