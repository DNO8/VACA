# Internally validated initial outcome journal

`recordInitialIssuanceOutcome(client, scope)` connects the existing SDK gates,
validated transaction-history reader and032 immutable outcome storage. It returns
an `InitialIssuanceOutcomeReceipt`: detached, deeply frozen **internal consistency
evidence**, not a public HTTP response, consensus proof or settlement permission.

## Trusted inputs and ordering

The backend supplies only `namespace`, `pool`, `requestId` and
`authenticatedAdmin`. This identity binding is not wallet authentication by itself;
the RPCs independently require current database administrator membership. There is
no caller envelope, observation, nonce, clock, signer, URL or financial grant.

1. Load032 first and validate its scope and bounded DTO without executing getters.
2. Reuse the031 historical SDK gate under a read-only RPC allowlist and literal
   throwing clock/account/signer/action dependencies. It validates the actual031
   attempt,030 signature/bytes,018 unsigned journal and their028 memberships.
   Missing artifacts cannot silently create or claim a fresh transaction.
3. On historical032 evidence, decode its stored raw observation again with T4e
   and the actual validated030 bytes. No current-history read or freshness gate.
4. For a first outcome, use the unchanged024/025 complete stable SDK-history
   reader; locate the exact saved transaction hash and run T4e on its raw record.
   The history reader retains its existing record, byte and continuity limits.
5. Await exactly one032 save, then validate every receipt binding and the exact
   SDK-decoded outcome before returning. Preserve the original actor when a
   concurrent identical writer already created the receipt.

The successful ID must derive from the saved transaction; included failure has
JSON-null ID while retaining actual charged fee and consumed sequence. The032
JSONB hash remains an opaque canonical database receipt identifier, checked for
its64-lowercase-hex shape; this adapter does not claim to reproduce PostgreSQL's
JSONB serialization or provide an independent cryptographic database attestation.

## Failure and non-effects

Only an explicit database reply with null data, code `42501` and message
`unauthorized_admin_wallet` becomes403. Every other malformed, missing, conflicting,
transport or unknown result becomes sanitized `initial_issuance_journal_unavailable`
503. After a potentially committed save, no automatic retry or readback occurs.
A separate later invocation may validate immutable history; it cannot resubmit.

No key load, signing, network submission, fresh financial observation, attempt
claim, ownership release, refund, terminal fee/principal accounting or request
status mutation is introduced. Runtime mounting, consensus/Explorer evidence and
full beneficiary/refund lifecycles remain separate work, not implied by a receipt.
