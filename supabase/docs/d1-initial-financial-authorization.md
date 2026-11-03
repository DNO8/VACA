# Keep initial financial permission inside a backend action

`withInitialFinancialAuthorization(client, trustedConfiguration, action)` composes
accepted SDK observations with 029's atomic storage-freshness checks. It does not
accept an HTTP caller's snapshot, unsigned bytes or previously saved receipt.

The configuration supplies namespace, pool, request/current authenticated admin,
trusted clock, bounded age/future tolerance and an optional trusted account source.
Wallet authentication, backend key custody and the action's runtime remain separate
responsibilities. There is no signer, submission or live endpoint in this unit.

## Ordered boundary

1. Construct the initial snapshot internally with the existing SDK assembler.
   Missing funding, principal, credit, creation or history proof stops the action.
2. Load and validate the actual historical unsigned journal with the existing
   coordinator. A read-only allowlist and throwing mutation/account/quote/clock
   stubs prevent new ownership, replanning, new bytes or an unsigned save.
3. Match the exact reservation and derive the ordinary Testnet SDK transaction
   hash. Preserve the original unsigned bytes and legitimate existing receipts.
4. Check the local clock, then await **one** fresh-observation RPC. An independent
   outgoing snapshot copy cannot alter the expected internal SDK facts.
5. Validate the entire bounded response: scope, revision, current actor, actual
   transaction hash, opaque PostgreSQL snapshot hash, original observation and
   exact snapshot, original authorizer key, validation timestamp and expiry.
6. Check monotonic freshness again, then invoke the controlled action **once** with
   `{ snapshot, receipt, unsignedXdr, transactionHash }`. Its result is returned.

The generated snapshot intentionally aliases its selected original donation;
trusted internal DTOs are JSON-detached before persistence. Untrusted transport
replies instead reject aliases, cycles, accessors, non-plain objects and sparse
arrays, with 20,000-node/40-depth/2-MiB envelope bounds. Snapshot text is at most
1 MiB. PostgreSQL JSONB hashes are opaque; JavaScript serialization is not used
to guess them. The current validation actor may differ from the original observer.

## Failure and runtime responsibilities

Financial failures are sanitized as `initial_financial_authorization_unavailable`
(503). Only an explicit database `42501` / `unauthorized_admin_wallet` error with
null data yields that exact 403. A thrown transport/source error cannot forge it.

Unknown persistence retains possible evidence and existing source ownership.
There is **no automatic retry, readback, refund, compensation or release**. Even a
successful save cannot invoke the action after local expiry or clock rollback.

The action is trusted backend code, not a plugin supplied by a caller. Its failure
propagates to its owning runtime, which must sanitize it and reconcile any durable
outcome without retry or release. This gate checks freshness at action entry; it
does not hold PostgreSQL locks across signing/submission or guarantee freshness
through arbitrary asynchronous work. The runtime must guard those later boundaries.

The deterministic SDK fixture covers awaited persistence, actual bytes/hash,
substituted facts/receipts, argument mutation, unsafe transport, unknown outcomes,
clock rollback/expiry, admin denial and single callback execution. No real keys,
network, signing activation, deployed journeys or complete D1 acceptance is implied.
Initial accounting permits only positive ordinary-credit setup before protected
income; it proves neither setup authorization nor backend custody. Actual setup
commands, verified execution dispositions and the full issued-asset lifecycle
remain separate work.
