# Retained D1 SQL recovery

This directory preserves seven statements from three migration-history entries in the authorized VACA Supabase project. It is evidence, **not a migration directory or a complete database bootstrap**. Do not apply it to a live project.

## What was recovered

| Retained version | Content | Statements |
| --- | --- | ---: |
| `013` | Incident beneficiary/hash fields and `accept_bundle` replacement/grants | 5 |
| `014` | Private release reservations and validation helpers | 1 |
| `20261011060218` | Private payment facts, allocation capacity and allocation RPC | 1 |

- `retained-migrations.json` preserves the returned statement strings, boundaries and original internal line endings.
- `manifest.json` records exact source identities and five current routine-body identities.
- These are retained database statements, **not recovered original local files, Git history or undeployed home-computer changes**. Older dependencies are not included here.
- Original comments remain verbatim, including the latest statement's obsolete “LOCAL SOURCE ONLY” assertion. A source comment is not deployment evidence.

## Verification observed on October 27

All three statement-array SHA-256 identities match the independently retrieved values. The five extracted reservation/allocation/helper bodies also match the freshly inspected current `pg_proc.prosrc` byte-for-byte. No trimming, formatting or newline normalization was used inside source strings.

Those five routines have owner `postgres`, an empty search path, and no EXECUTE privilege for `anon` or `authenticated`. The reservation/allocation entrypoints are SECURITY DEFINER and allow `service_role`; their validation helpers do not allow that role directly.

Other accounting table, policy and privilege observations came from retained October 25 inspection results, not a fresh October 27 revalidation. Routine bodies and history were read again on October 27.

These are source-integrity and metadata checks, **not execution tests**. No recovered SQL, application routine, migration, deployment or ledger transaction was executed. No business/user rows were read. Pattern screening found no known credential literals; that does not prove universal secret absence.

## D1 boundary

The recovered code already provides immutable request identities, declared donor/payment facts and atomic allocation capacity. Reuse those contracts rather than creating a second accounting model.

It does not establish confirmed chain payments, server-side pool signing, issuance/reconciliation records, Stellar expiry predicates or refund sweep behavior. A reservation deadline is not a Stellar claim predicate. The inspected schema does not record issuance/refund transaction IDs or issued/refunded states.

Before implementation, confirm the custody authority, deadline policy, unclaimed-fund destination, sweep authority and treatment of historical/unreleased/late donations. Deployment and Testnet transactions require separate explicit authorization.

## Recheck local integrity

Run from the repository root in PowerShell. This only reads the two JSON files; it does not connect to Supabase or execute SQL.

```powershell
@'
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const root = 'recovery/supabase/2026-10-27/';
const snapshot = JSON.parse(fs.readFileSync(root + 'retained-migrations.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync(root + 'manifest.json', 'utf8'));
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const check = (ok, message) => { if (!ok) throw new Error(message); };
check(snapshot.project_ref === manifest.project_ref, 'Project mismatch');
check(snapshot.migrations.length === manifest.retained_history.length, 'Inventory mismatch');
for (const expected of manifest.retained_history) {
  const rows = snapshot.migrations.filter(row => row.version === expected.version);
  check(rows.length === 1, 'Missing or duplicate version');
  const row = rows[0];
  const encoded = JSON.stringify(row.statements);
  check(row.name === expected.name && row.statements.length === expected.statement_count, 'Identity mismatch');
  check(Buffer.byteLength(encoded, 'utf8') === expected.json_bytes, 'JSON byte mismatch');
  check(row.statements.reduce((n, text) => n + Buffer.byteLength(text, 'utf8'), 0) === expected.statement_bytes, 'Source byte mismatch');
  check(hash(encoded) === expected.statements_sha256, 'Statement hash mismatch');
}
for (const expected of manifest.current_routines) {
  const pattern = new RegExp('create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.' + expected.name + '\\s*\\([\\s\\S]*?\\bas\\s+\\$\\$([\\s\\S]*?)\\$\\$', 'i');
  const bodies = snapshot.migrations.flatMap(row => row.statements.map(text => text.match(pattern)).filter(Boolean));
  check(bodies.length === 1, 'Missing or duplicate routine');
  check(Buffer.byteLength(bodies[0][1], 'utf8') === expected.body_bytes, 'Body byte mismatch');
  check(hash(bodies[0][1]) === expected.body_sha256, 'Body hash mismatch');
}
console.log('Verified three retained statement arrays and five current routine-body identities.');
'@ | node -
if ($LASTEXITCODE -ne 0) { throw 'Recovery integrity check failed' }
```

The local check detects later snapshot drift against the manifest. It cannot independently refresh the captured remote observations.
