# One-page durable discovery ingestion (local implementation)

`DiscoveryDatabase(client, namespace, authenticatedAdmin)` binds a canonical lowercase
UUID namespace and an already-authenticated current administrator identity. A valid
Stellar public key is only syntax, never authentication proof. The future backend
handler must supply the actual authenticated identity; no runtime route is activated.
SQL rechecks current administrator membership on both load and save.

- `loadState(): Promise<DiscoveryState>` calls only `d1_load_discovery_state` (021)
  with `p_namespace`, `p_authorized_by`. Pool, first ledger and checkpoint come from
  this validated server response, not caller account facts.
- `recordPage(pool, page): Promise<DiscoveryReceipt>` calls only
  `d1_record_discovery_page` (019), adding only `p_page`. The pool argument validates
  the receipt binding and is not an RPC parameter. The coordinator supplies it from
  loaded state. Exact receipt fields must match namespace, network, pool, revision,
  cursors, ledger, hash and record count; page count must be a positive safe integer.
- `ingestDiscoveryPage(database, source = new HorizonDiscoverySource())` loads first,
  reads one trusted page, validates cursor/anchor continuity and empty-page completion,
  then awaits exactly one save. Source injection is for offline tests, not public input.
  There is no direct caller page/account-facts ingestion endpoint.

The result is `{ receipt, anchor, completeAtAnchor }`. `anchor` contains cursor,
through-ledger, hash and close time of this saved page. `completeAtAnchor` means the
saved page was empty at that anchor, not latest global coverage or financial readiness.
Previously complete coverage does not skip the source or authorize a release.

Known own string SQL messages preserve `unauthorized_admin_wallet` (403),
`pool_not_activated` (422), and `discovery_conflict` (409). Malformed payloads,
exceptions and all unknown errors become `dependency_unavailable` (503), without raw
error details. Unsnapshotable source data is rejected before the save RPC.
An unknown save can have committed: rejection triggers no automatic
readback, retry, compensation or ownership release. An explicit later invocation
loads the durable checkpoint and resumes there, without replaying observations.

This unit covers bounded T1f ingestion only (S1–S6 constraints). It does not complete
T1/full D1 or demonstrate deployed/live acceptance. No loop, funding inference,
signer activation, transfer, refund or release is introduced.
