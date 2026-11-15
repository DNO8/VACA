# Preserve issuance authorization before adding refund services

Migration048 makes eight existing issuance/operating-credit mutations independently
require current administrator membership before calling shared readers. This is a
**prerequisite for S5/S7, not service admission or an automation-ready backend**.
Manual access remains subject to the existing role grants and wallet checks.

## Verify locally

From the repository root, with the verified project-local PostgreSQL launcher:

```bash
env -i \
  D1_TOOL_ROOT="$PWD/.tooling/d1-backend" \
  TMPDIR="$PWD/.tooling/d1-backend/tmp" \
  "$(command -v node)" --test \
  supabase/tests/integration/issuance-mutation-authorization.test.cjs
```

The fixture requires Linux and the repository-local tool root. It creates an owned
cluster beneath that root's `tmp`, binds a fresh port on `127.0.0.1`, and stops the
server and removes its fixture on completion. It never connects to Supabase.
Without048, all eight guard-independence assertions should fail because non-admin
calls reach the instrumented reader. With048, the complete fixture must pass;
source delivery alone does not establish that result.

## Authorization boundary

| Mutations (original migration) | Independent gate precedes |
|---|---|
| Unsigned transaction (018) | Unsigned reader, **after** existing byte/hash validation |
| Operating credit (022) | Operating-credit reader leading to discovery checkpoint |
| Fee commitment (027) | Fee-commitment reader |
| Initial/fresh financial observation (028/029) | Unsigned reader |
| Signed transaction (030) | Signed-transaction reader |
| Submission attempt (031) | Submission-attempt reader |
| Issuance outcome (032) | Issuance-outcome reader |

Each inserted gate preserves the original reader's null-ID/invalid-key error before
checking `admin_wallets` with `FOR SHARE`. The original reader and remaining body
retain scope derivation, locks, replay behavior, validation and receipts. Existing
prepare/intent/reserve guards remain unchanged. There are no new grants, service
identities, registries, callable wrappers or alternate execution paths.

## Fail closed and preserve the baseline

The allowlist pins exact signatures, parameter names, body MD5s, owner, ACLs and
execution metadata. Hashes come from the unmodified UTF-8 text between the original
`AS $$` delimiters in local018,022,027–032, including boundary newlines—not from
caller-provided definitions. All bodies and unique insertion anchors are checked
before any replacement; one transaction covers the entire migration.
Unexpected definitions fail with `P0001 / unexpected_d1_issuance_guard_definition`.
Reapplying048 to already transformed bodies also fails closed.

The fixture compares public errors, SQLSTATE, stdout, stderr, exit status, function
OIDs/metadata/ACLs, receipts and capacity counters. Its rolled-back reader sentinels
prove ordering only: **not service authority, SDK validation or financial proof**.
Real preparation-to-unsigned writes/replays do not assert ledger acceptance.

## Next integration gate

This source targets retained014 plus20261011060218 and actual local015–034.
Compatibility with the later035–047 dependency closure is **not established**;
validate that closure rather than relaxing pins to accept unknown definitions.
Full fixture GREEN and independent authorization/preservation verification remain
required. Scoped refund/reconciliation service admission and its integration tests
are subsequent work. No deployment, scheduler activation or movement of funds is
authorized by this migration or its local fixture.
