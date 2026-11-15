# D1 project-local backend test environment

## Outcome

T5/S8–S9 local environment verification passed. PostgreSQL 17.7 and Deno 2.6.8 are available under `.tooling/d1-backend`; no global package installation, Supabase connection, deployment, scheduler activation or financial execution occurred.

This is environment readiness, not automatic-refund implementation or integrated financial acceptance. Historical T5b, Android toolchain #48 and source-review #56 remain unchanged. The old refund-candidates integration fixture was not rerun.

## Components and integrity

| Component | Version / source | Verification |
| --- | --- | --- |
| PostgreSQL server, client and libpq | `17.7-3.pgdg24.04+1`, PGDG signed archive | Signed release → index hash/size → package hashes → installed bytes/links |
| ICU | `74.2-1ubuntu3`, Ubuntu Noble | Same signed-index/package/install chain |
| libxml2 | `2.9.14+dfsg-1.3ubuntu3`, Ubuntu Noble | Same signed-index/package/install chain |
| Deno | `2.6.8`, official `dl.deno.land` CDN | Published checksum → sole safe ZIP member → executable hash → actual version |

Trusted key fingerprints:
- PGDG: `B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8`.
- Ubuntu: `F6ECB3762474EDA9D21B7022871920D1991BC93C`.

Independent verifier `mwi12p6e-i-j0re` observed both good signatures and compared installed regular files: server 1,571; client 371; libpq 22; ICU 9; libxml2 6, plus symlink targets. Extraction used package data only, not maintainer scripts.

| Artifact | SHA-256 |
| --- | --- |
| Deno ZIP, 47,253,774 bytes | `e24aa1134b220d7185fa78136886b9a2d4014f0fa16ac6bec08b0f8f623344a1` |
| Deno executable | `8b254e08be2565f608a06bfde3f62f3aabbf8994712f0078c7a7f24bc8c46676` |
| `run-isolated.cjs` | `31bece74488bd8108da2fded80594147f5768a84cd96370edf083f49322850ae` |
| `launcher.test.cjs` | `034651eccfc29cc9ba9c84a658d9096ed59898c6ee14037086a200acdff150e2` |
| Preserved independent Python probe | `ca707f635f2b65619a88037ced7145d57b1676819b9eeee9122730b5ecb776a7` |
| `supabase/deno.json` | `fd471ccde66bdd3ed89a7005e8c815392717451ed94b180d4417ff64352d29ad` |
| `supabase/deno.lock` | `b051af7a9ef83288c9376188c055146712a8d8284c73715ff8c53ed8acd4452c` |

## Observed checks

- Job 18: CDN download/checksum/archive validation and `deno --version`, exit 0; version stderr empty. Earlier GitHub TLS timeout remains recorded, not retried.
- Job 19: frozen cache population, exit 0; config and lock unchanged. Cache preparation itself did not execute tests.
- Worker `mwi0p0ch-h-vo50`: launcher syntax exit 0; four public-process tests passed without corrections. New setup has no meaningful behavioral RED; missing-file inspection is not RED.
- Parent job 20: four-test spot check and actual PostgreSQL launcher smoke, exit 0. Fresh database, loopback-only server, SQL file/`pgcrypto`, server version `170007`, expected digest, explicit-host rejection, unchanged extension count, successful stop and PID disappearance. Launcher/config/test hashes preserved.
- Independent offline command, in isolated source/cache: `deno test --cached-only --frozen --allow-env --deny-net tests/unit/refund-candidate-journal.test.ts`, exit 0, typecheck and **12 passed, 0 failed**. Combined output retained the `Check …` diagnostic; separate Deno stderr was not captured, so empty stderr is not claimed.
- Independent invocation probes: **29 rejected + 6 accepted**, exit 0. Exact rejection is exit 2, empty stdout, `run-isolated: rejected invocation\n`. Every rejection preserved file hashes, modes and link targets. Accepted cases pinned forwarded arguments, minimal environment and socket-directory mode 0700.
- Parent durable-probe replay: same 29+6 cases, exit 0, exact stdout and empty stderr; pinned launcher unchanged. This replay uses stubs, not PostgreSQL, and does not replace the separate real-tool smoke.

## Usage and boundary

Existing Linux fixture runtime resolves absolute `D1_TOOL_ROOT/run-isolated.cjs` and invokes `process.execPath launcher TOOL ...ARGV` with an empty child environment. Set `D1_TOOL_ROOT` to the project-local backend directory and `TMPDIR` to its `tmp` directory for future authorized fixtures.

The launcher admits only the existing `initdb`, `pg_ctl` and `psql` argument forms; fixes executable, library, user/database and loopback settings; confines fixture data/log/SQL/FIFO paths; forwards native output, exit status and termination. Its source header documents the CLI. Unsupported arguments fail before tool execution. PostgreSQL's owned socket directory is project-local.

**This is a trusted-fixture launcher, not a SQL sandbox.** SQL and psql commands supplied by trusted fixtures can have effects; never pass untrusted SQL. No production or remote database credentials belong in this environment. Future application fixtures require their own authorization, outcomes and cleanup evidence.

## Evidence and limitations

Local receipts are under `.tooling/d1-backend/metadata/{postgres-resolution,ubuntu-runtime,deno-cdn,deno-cache,launcher-real-smoke,independent-replay}`. Earlier native-library failure is retained in `metadata/native-probe`; GitHub timeout in `metadata/failure.json`. Stopped parent disposable clusters are retained locally.

Independent scratch was reported at `/tmp/gpZ73JRj/gaMZTrVs/tmp.CRpTvkVsR4`; follow-up `mwi16mdi-j-3jdx` found the probe file absent. No original probe-file hash or cleanup claim is invented. The verifier returned its exact successful write/execute tool-call content; parent preserved that content as `.tooling/d1-backend/launcher-independent-probes.py`, hashed and replayed it successfully in fresh project-local scratch. The unexecuted JavaScript adaptation was not adopted.

Native assessment: escalated high, environment item 5; native unassessable/candidate null/outcome unknown. This is not native approval. Independent verdict is S8/S9 met for this unit, S1–S7 out of scope, no candidate-caused blocker. Application authorization, automatic lane selection, database migrations, concurrency and financial conservation remain separate work.

Downloaded binaries, caches, disposable databases, local launchers and raw receipts remain ignored local artifacts; this evidence document does not publish them.

Risk: item 2 (invocation confinement) and item 5 (local execution environment).
