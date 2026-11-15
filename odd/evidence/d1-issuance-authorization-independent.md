# D1 independent issuance-mutation authorization evidence

T2a is a verified local prerequisite, not complete refund automation or deployment approval.
The retained schema boundary is migrations 014/20261011060218 and 015–034, followed by 048.
Canonical 035–047 and deployed-schema equivalence remain unproved.

## Candidate

Baseline HEAD: `d16a97feea34889086d0c03ea9d6d1b1031690bf`.
Independent verifier: `mwi2sguh-p-l563`; evidence-only follow-up: `mwi2xv1f-q-3xlz`.

| File | SHA256 |
| --- | --- |
| `supabase/migrations/048_d1_issuance_mutation_authorization.sql` | `ea415f91323042e6145ee45af0b23378180a03ca85f9f2447580e1fadab79e95` |
| `supabase/tests/integration/issuance-mutation-authorization.test.cjs` | `a6fa38659c99613ea2dd5f763227919090c7409884a4c84530a0fe7280e65d0a` |
| `supabase/docs/d1-refund-service-authorization.md` | `ea443cc8cbcd50b4f5c5751ebd74bd2c5757cc14bf045d7d2a9bae8e75465823` |

## Parent RED/GREEN

- Job23: fixture SQL separator failure; not meaningful authorization RED.
- Job24: eight intended guard-order failures, two preservation passes, atomicity skipped without048; valid RED.
- Job25: ten passes; atomicity setup failed before assertions because JavaScript replacement-string `$'` expanded a SQL regex into the matched suffix.
- Human S10 authorized one additional test-only correction. A replacement callback inserts SQL literally. Reversing that single line restores SHA256 `5fa92dd4e4876fa271947b4913b79a0b27c6aee65aeeba953f4030280878d484`; assertions/cases unchanged.
- Job26: exit0/35.713s, **12 PASS / 0 FAIL / 0 SKIP**, including atomic rejection. Empty stderr, no timeout; original migrations, candidate and ten foreign file hashes preserved. PostgreSQL PID256316 gone and fixture removed.
- Receipts remain local under `.tooling/d1-backend/metadata/issuance-guard-{red,red-correction1,green,green-s10}`. Prior2/2 and S10's1/1 corrections are exhausted, not reset.

## Independent result

No reproduced candidate blocker. S5/S7 met for this prerequisite only; S10 met. Future automation, scoped service admission, mobile read model and web administration were explicitly out of scope. The verifier inspected the whole feature document, all eight original bodies/reader chains/ACLs and048;22 baseline dependencies matched committed bytes and26 selected source/launcher inputs remained unchanged.

Actual PostgreSQL17.7 execution: **51 independent cases**, exit0, empty stderr:

```text
PASS 51 independent cases; PG170007; state SHA256 ed598e501f5d9ed92bbf00d0e344c63e05b0add2e308289886845fd5c58425ec
OWNED_PID_264973_GONE
```

Cases:16 baseline admin/non-admin RPC checks;8 baseline non-admin calls with only shared-reader membership checks removed; last-entry ACL-drift atomic rejection; catalog comparison;16 candidate checks with broadened readers;8 sequential revocation checks; atomic reapplication rejection.

All48 rejected RPCs asserted exact exit1, `SET\n`, and expected terse stderr. Both migration rejections asserted exit3, `BEGIN\n`, and `psql:<isolated-file>:94: ERROR:  unexpected_d1_issuance_guard_definition\n`. All public-table contents were serialized deterministically and hashed before/after rejected RPCs; failed migrations also preserved the catalog. This is logical stored-data preservation, not physical database-directory equality.199 launcher invocations:149 exit0,48 expected exit1,2 expected exit3.

Successful manual writes/replays and malformed-input coverage use the inspected parent GREEN, not a repeated suite. Concurrent lock races were not executed: administrator `FOR SHARE` before existing reader/pool locks was inspected; sequential revocation was exercised. No applicable app build/typecheck for this SQL-only unit.

## Durable probe and provenance

[Exact executed Python probe](d1-issuance-authorization-independent-probe.py), SHA256 `933ec75506e5c33d820db69383d1f1b6d705c5cd8d2893a161311fa7e1f0a482`.

The original scratch path was `/tmp/gpZ73JRj/ga9co6z1/tmp.MMCyuvIaDY`. It was absent when the parent attempted readback; its disappearance cause is unknown. The verifier returned the exact original tool-call payload without new commands. Parent retained it unchanged and matched its bytes to the verifier's originally computed SHA256. The199 raw receipts were not printed in the transcript and could not be recovered; the reported execution, output and receipt-count summary remain verifier evidence, not parent re-execution.

This file is an evidence probe, not an automatically collected suite test. Do not run it in the repository or against a remote database. It expects its own isolated root containing the pinned schema/recovery sources and a complete copied PostgreSQL17.7 toolchain/launcher under `.tooling/d1-backend`, with writable `tmp`, `home` and `cache` there. The recorded command form was:

```sh
env -i PATH=/usr/bin:/bin HOME="$s/.tooling/d1-backend/home" \
  TMPDIR="$s/.tooling/d1-backend/tmp" NODE_COMPILE_CACHE="$s/.tooling/d1-backend/cache" \
  NO_UPDATE_NOTIFIER=1 NODE="<resolved-node-executable>" /usr/bin/python3 "$s/probe.py"
```

A preliminary overbroad inventory encountered an irrelevant dangling documentation link at `pgroot/usr/share/doc/libxml2/NEWS.gz`; required runtime closure then passed before the single minimal preparation. No install/network/remote DB/financial operation occurred. Unexecuted JS adoption suggestions were not added to the frozen fixture.

## Remaining gates

Source commit `4b39c170a4c45df8d36731139f09c59a1d57d700` contains exactly the three pinned candidate files/379 additions. Committed assessment over the exact baseline range reports native medium, under-budget, reviewDue false; explicit security-item2 escalation requires the independent verifier completed above. Native outcome remains unknown/unconsumed, not approval. The coordinator returned request-context-requires-fresh-review without starting a lineage; no reviewer runs or forecasts occurred, and no START is due. Earlier pending assessment was unassessable because of undeclared untracked scope. Evidence packaging/publication are tracked in [the feature document](../tasks/d1-automatic-refunds.md). This evidence does not authorize remote migration, generic administrator automation, service credentials, scheduler activation, funds, or integrated D1 acceptance.
