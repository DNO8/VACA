# D1 pre-admission alignment: local independent evidence

**Scope:** T3a prerequisite only. Source `8665560bace28c35578bb3388774e7e5daf630a2` adds047a, its focused integration test and guide (312 added lines). No remote migration, enrollment, scheduler, deployment, APK, web or financial acceptance follows from this evidence.

## Discovery and source binding

The read-only2026-11-16T19:40:37.693601Z capture included60 exact signatures:58 present and two expected absent. Raw MCP artifact SHA256 `ef5592a16a628f2fd204a13190aa7ffb94cdc023619c628e4d62bfa9378bf883` is retained under `.tooling/d1-backend/tmp/recording-migration-preflight-l2dbpjf2/`. The first mechanical preflight exited1 on nine baseline mismatches. A subsequent exact offline comparison exited0 and confirmed eight missing independent administrator gates plus comment differences; it did not overwrite the failed preflight.

Explorers `mwjo1q23-1k-4zp4` and `mwjo6ql2-1l-ssds` supplied read-only mapping/diagnosis, not verifier approval. The new migration leaves all original036–058 files unchanged and validates every candidate replacement before executing DDL.

## Observed checks

| Check | Observed result |
|---|---|
| Parent behavioral/catalog RED, job55 | Exit1;1PASS/2FAIL (including aggregate)/2SKIP. Exact live/canonical040 body-hash mismatch; PostgreSQL PID223117 stopped/gone, fixture removed. |
| Parent focused suite after047a | Exit0;5PASS/0FAIL/0SKIP,8.70s. Complete canonical catalog and public RPC-error equality; unknown body/ACL atomic rejection; unchanged048–053,055–058 chain; empty service registry and selector present. PID223926 stopped/gone. |
| Source packaging, job56 | Exit0; three files committed as8665560;17 foreign status records preserved, index empty. No push. |
| Independent `mwjoh5xv-1m-eruo` | Exit0;6PASS/0FAIL/0SKIP,66.77s; no blockers. One successful selective public preparation;108MiB/1,987 runtime files; candidate bytes and raw capture hash matched. |
| Parent adoption replay, job57 | Exit0;6PASS/0FAIL/0SKIP,67.998s;48 inputs unchanged. Exact returned probe SHA matched before execution. Receipt `.tooling/d1-backend/tmp/recording-alignment-adopted-0bf4k1s4/` retains stdout/stderr/invocation/result. |

Independent probes used the **actual raw-captured nine definitions**, not only the parent test's reconstructed baseline. They cover exact canonical alignment and application-row digest preservation; mixed/canonical no-op including `pg_proc.xmin`; body/cost/security/search-path/ACL rejection; private-helper denial to all three API roles; and all eight restored gates denying nonadministrators after permissive upstream reader stubs. A DDL event trigger and nontransactional sequence establish that rejected inputs caused no attempted DDL, not merely rollback. Rejections asserted exact exit codes and stderr; drift also asserted exact `BEGIN\n` stdout. Stored row digests and catalog metadata remained unchanged.

The verifier stopped PID226187 and reported original HEAD plus17 status records unchanged. Its scratch path was `/tmp/gphNdCyH/gadqfGq1/tmp.wkvOrTy78m`; it was already absent when parent tried to copy the probe (FileNotFoundError, exit1). The complete returned probe source was instead restored from the verifier response and is hash-checked before execution. No verifier rerun or broader copy was used.

## Durable probe and limitations

Probe: `supabase/tests/integration/pre-admission-source-alignment-independent.probe.cjs`, SHA256 `60e135182d49aa11085baef39a8700f20352059fe62e418969fb6a480ad42c1a`. Its `.probe.cjs` name excludes ordinary `*.test.cjs` discovery. It requires `raw-mcp-catalog.json` and `catalog-baseline.json` in `$TMPDIR/recording-migration-preflight-l2dbpjf2/`; missing capture must fail, never silently substitute a reconstructed body. The portable focused test remains independently runnable without this snapshot.

The captured remote server was PostgreSQL17.6; the independent probes ran on local PostgreSQL17.7. The full probe suite was not run against remote17.6. Gate stubs isolate authorization and are not financial acceptance; full financial-engine/service-enrollment/concurrency rehearsals remain unverified.

Native committed-range ASSESS for09da5cdc→8665560: three paths/312 lines, native risk medium, agent Risk2 escalation high, independent verifier required, `reviewDue:false/under_budget`, `consumed:false`, outcome unknown. This is **not native approval**; no START was due. Initial unstaged assessment's untracked-declaration failure remains historical.

## Subsequent authorized delivery, separate from local verification

Under the human's S4 continuation, the project-scoped deployment MCP applied047a successfully. Fresh ledger readback records `20261116195945 / d1_pre_admission_source_alignment_047a`. A separate full catalog readback and mechanical comparison exited0:9/9 exact canonical bodies; all nine OIDs, complete `pg_proc` metadata except `prosrc`, catalog comments and dependency edges preserved. Retained `post-047a-{raw,catalog,result}.json` beside the original capture; post-readback raw SHA256 `d856f584bd65a35459b44499f897a10776e9e6e0cdaab80f8d79faaa58cbf495`.

Only047a was applied. The existing custody function remains ACTIVEv4/JWTtrue. No048–058, enrollment, scheduler, secret, backend runtime, APK or financial execution was performed. The next048 source explicitly requires quiescing callers; await confirmation of that operational window before further live mutations.
