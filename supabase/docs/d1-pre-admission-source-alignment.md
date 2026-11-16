# Align the deployed baseline before refund service admissions

`047a_d1_pre_admission_source_alignment.sql` is a **proposed, locally tested forward migration**, not a deployed change. Run it after047 and before048. It aligns nine precisely identified function bodies with the already-agreed canonical036–040 sources without relaxing any048–058 guard.

## Why this prerequisite exists

The read-only2026-11-16 catalog capture contained58 existing functions and two expected absent functions. Nine initial body hashes differed from the admission manifests. Exact offline comparison found eight missing independent administrator membership locks/rejections in036–039 and comment differences, including the040 private lane helper. Applying048–053 cannot repair those differences; do not start a partial admission rollout.

The existing readers still require administrators. This comparison does not establish an exploitable live financial vulnerability; it prevents broadening those readers while retaining older downstream authorization boundaries.

## Bounded behavior

- Accept only each exact captured body or its exact canonical body, with the pinned signature, owner, language, security flags, search path, argument contract and ACL.
- Construct and validate all replacement bodies before executing any DDL. Unknown body/catalog drift raises `P0001 / unexpected_d1_pre_admission_definition`; the transaction must leave every function unchanged.
- Preserve OIDs, owners, ACLs, catalog comments and application data. Already canonical functions are left untouched.
- Add no table, enrollment, scheduler, secret, financial operation or permission grant. Do not rerun this prerequisite after service admissions have changed these bodies.

## Evidence and limits

The focused disposable-PostgreSQL test observed RED against the captured baseline, then5PASS with no failures/skips. It reconstructs the captured bodies from portable sources and exact observed MD5s, compares the resulting complete catalog to canonical source, checks unchanged public RPC error results, tests body/ACL-drift atomic rejection, and applies the unchanged048–053,055–058 chain with an empty service registry. Independent verification passed6 tests using the actual raw-captured definitions, including rejection before any attempted DDL and all eight independent administrator gates. Parent adoption replay of the exact probe also passed6 tests with48 inputs unchanged. This is not live operational or financial acceptance. See [independent evidence](../../odd/evidence/d1-pre-admission-alignment-independent.md).

The snapshot-dependent independent probe is `tests/integration/pre-admission-source-alignment-independent.probe.cjs`, outside ordinary `*.test.cjs` discovery. Run it explicitly with the same environment below and that file path only when the two hash-bound public capture files are present under `$TMPDIR/recording-migration-preflight-l2dbpjf2/`. Missing capture is an error, not permission to substitute a fixture.

```sh
D1_TOOL_ROOT="$PWD/.tooling/d1-backend" TMPDIR="$PWD/.tooling/d1-backend/tmp" \
  node --test --test-concurrency=1 supabase/tests/integration/pre-admission-source-alignment.test.cjs
```

Run from the repository root using the retained pinned Node/PostgreSQL launcher. Do not copy private configuration into a verifier snapshot.

## Delivery boundary

Retain the full live function definitions, metadata, ACL grantors, comments and dependency edges before mutation; hashes alone are not recovery material. Bind the exact source and recheck the target immediately before an authorized application. Stop on unexpected drift or uncertain receipts; never edit a pin to fit the server. Recovery/rollback is separately authorized and must not drop data or use CASCADE.

After reviewed alignment, resume [recording readiness](../../odd/tasks/d1-recording-readiness.md) with048→049→050→051→052→053→055→056→057→058; exclude optional054. Use [deployment-index.ts](../functions/d1-custody/deployment-index.ts) for the backend, not the experimental entrypoint. Enrollment, activation and human financial rehearsal keep their separate operating gates.
