# Configured D1 debug APK: compiled and artifact-audited, not functionally accepted

A fresh dev/debug APK compiled with public configuration supplied by file path. A newly authorized independent artifact audit and exact-body parent spot-check both passed. This does not establish runtime connectivity, phone behavior, independent toolchain integrity or financial acceptance.

## Observed build

| Field | Observed value |
|---|---|
| Source | `092db0a550916f7d5ee29d64c0220a377e3d2e93` |
| Attempt | `supabase/.temp/d1-configured-apk-20261112T043627Z` |
| Exit / duration | `0` / `79.67842078208923` seconds |
| Retry announcement | `false` |
| Artifact | `vaca_app/build/app/outputs/flutter-apk/app-dev-debug.apk` |
| Bytes | `191140891` |
| SHA256 | `68fe86cea342356a2375f4db2c06a132173331b3f04f8ef339d0b47eeeead957` |
| Configuration | One `--dart-define-from-file=<ignored local path>` argument; no values copied into this evidence |
| Profile | `--debug --flavor dev --no-pub --dart-define=FLAVOR=dev --target-platform=android-arm64` |
| Limits | Original 1200s deadline; 1024M heap/384M metaspace/128M codecache; one worker; no parallel/daemon; Kotlin in-process |
| Input preservation | Five recorded project/dependency hashes and local Gradle limits unchanged |
| Suites / device / backend financial requests | None executed |

The one-off runner differs from the historical runner only by the define-file argument and truthful supplied-configuration receipt metadata. Historical runner/receipts remain untouched. Structural template/AST checks preceded the build; no RED/GREEN suite is claimed for this one-off adaptation. `preparation.json` and `result.json` retain sanitized receipts; raw build logs remain private and ignored.

## Preservation

The old unconfigured APK (`161968472` bytes, SHA256 `29798bbc7863eb29c43d065cef9bd1ece814aa60ec73287d557bbea3dee7ad8c`) and the exact dirty generated report were copied into the attempt's `preserved/` directory. Each source/copy hash matched before launch. No public configuration, keystore or unrelated files were copied.

## Historical independent audit: incomplete, not an application defect

Verifier `mwd2c9f7-4-9b3a` prepared a bounded 353423469-byte isolated payload and ran one audit. Recipe equivalence, receipt fields, new/old APK hashes, preserved report and ZIP central-directory safety preconditions passed before an invalid debug-APK assumption stopped the probe: it required `lib/arm64-v8a/libapp.so`, not universally required by Flutter debug builds. Exit was `1`; no audit repair/retry occurred.

ZIP CRC, final payload/ABI checks and final source/copy recheck were not completed. The generated report matched its preserved bytes at the initial audit check. No concrete application defect was demonstrated. The retained scratch script was unavailable to the parent's required exact spot-check (`ENOENT` after worker cleanup); zero parent probes ran. Independent artifact approval remains missing; prior toolchain/configuration/runtime scopes are not replaced by this partial audit.

## Historical directly authorized checker continuation

After direct primary-host approval, verifier `mwdoj6xz-5-17ja` prepared a smaller 191564544-byte payload. Its audit failed before ZIP checks because comparing full `stat_result` included access time changed by reading. Post-stop checks confirmed all source/copy hashes, sizes, modification times and modes unchanged. One auxiliary correction excluded access time while retaining stable identity/content metadata.

Corrected verifier `mwdoxlg7-7-rvr8` then passed recipe, receipt, input/caps, backup, ZIP safety and final source/copy/HEAD checks, but exited `1` at `expected arm64 only`. The actual observed ABI set was not emitted; this is not proof of an application defect or incompatibility. Debug payload and full CRC remained unrun. No assertion was removed to force approval and no further correction occurred.

The full corrected failed body is retained as `odd/evidence/d1-configured-apk-audit-failed.py`, SHA256 `e9ce7e2d252e794c823b1582eb072bced901555e157732a63dd0744b98cc9c07`. The parent prepared its own 191565803-byte bounded snapshot (15 files copied, old APK streamed only) and ran the exact body once: exit `1`, same ABI assertion, same three positive stdout lines including final integrity. Its preparation/stdout/stderr/result remain under the original attempt's `parent-spotcheck-20261112T152433Z/` directory. This replaces the previous missing-script spot-check limitation with an actual reproduced failure, not a pass.

## New S3 review: bounded artifact audit passed

Direct primary-host authorization opened a new review of the existing APK without recompilation. Verifier `mwdpub5v-8-ykai` and the parent's exact-body spot-check both exited `0`, with empty stderr. Both current and preserved old APKs contain native-library paths for `arm64-v8a`, `armeabi-v7a` and `x86_64`, but exactly one Flutter engine path, `lib/arm64-v8a/libflutter.so`. Their non-engine path lists match. The recorded target-platform argument supports the engine expectation, not a whole-ZIP ABI exclusivity claim. Names do not prove vendor provenance, other-ABI runtime support or baseline runtime equivalence.

Required debug manifest/engine/kernel payload and streamed CRC/length checks passed for all **1268 entries / 268494694 decompressed bytes**, with all prior ZIP safety bounds retained. Recipe/AST, live inputs/caps, receipt fields, new/old APK/report identities and final source/copy/HEAD integrity also passed. No signature/config-value/SDK-integrity/gateway/device/financial acceptance is implied.

Exact executed positive body: `odd/evidence/d1-configured-apk-abi-debug-crc-audit.py`, SHA256 `d67ca39a19a08ba95357cb2c232faefa72b4555200e321bd8664fdf2818ea8f2`. The parent's private, ignored `parent-abi-debug-crc-20261112T154713Z/` under the original attempt retains the 191581360-byte minimal snapshot, preparation and actual stdout/stderr/result. The old APK was hashed/inspected read-only, not recopied. Earlier failed scripts and results remain preserved, not rewritten as passes.

## Publication and outstanding decisions

The exact four-commit source/docs push through `092db0a` did not return after over 15 minutes. Read-only process metadata showed its Git HTTP child waiting on `gh.exe`; no command-line secrets or credentials were inspected. The task-owned job was stopped, without automatic retry. At that point the remote publication outcome was **unconfirmed**, not a demonstrated rejection or success. A separate version-only 20-second `gh.exe --version` diagnostic exited `124`, with no output. Windows CLI execution itself remains unavailable; neither an authentication defect nor publication is proven. No automatic retry or alternate publishing tool was used.

A subsequently authorized, bounded PUBLIC read-only GitHub ref query exited `0` and positively returned `refs/heads/feat/d1-t5b-proof` at `b305a83280b1c59e1fbbe1ced745a807473ce704`. Thus the four local commits through `092db0a` were not published on the observed branch at query time. No authentication, credential read, fetch, alternate publisher or mutating request was involved. The current ancestor interop socket exists, so metadata does not prove a stale socket or justify an environment/system change. Publisher repair is still unresolved; no further executable retry or push occurred.

Native assessment remained unassessable/candidate-null/unknown because untracked scope was undeclared. Item-5 escalation required the independent artifact verifier; it did not create native approval. No review START or recovery bypass was performed. The S3 artifact-verification continuation is now complete within the stated static/integrity scope. Released additional peer evidence was archived in local commit `6cb2537`, with no checker rerun. Publisher execution and missing remote publication still need resolution before delivery can close; existing publication authorization is not the missing prerequisite.

A separate documented Windows-runtime observation, not a GitHub CLI retry, also failed: canonical `C:\Windows\System32\cmd.exe /d /c ver` exited `124` at its 20-second deadline (20.04504934600118 seconds), stdout/stderr both empty. Executable metadata was verified before invocation; inherited environment was unchanged. This reproduces a stall beyond `gh.exe`, not a demonstrated socket/relay root cause or repair. No push, credential/system/config change, environment/socket reassignment or automatic retry followed. The exact private receipts remain in `supabase/.temp/d1-publisher-runtime-20261112T162546Z/`.

The missing external observation is Windows-host execution outside WSL. The operator can use **Win+R** with `C:\Windows\System32\cmd.exe /d /k ver` and report only the version line or error/stall. `/d` avoids AutoRun and `/k` leaves the window open to inspect the result. This requests neither WSL shutdown nor a generic new publishing grant. Official command semantics: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd and https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ver. No new build, phone execution, deferred suite or funds operation is implied.

Risk: item 5 (configured build/artifact environment; independent artifact audit and parent spot-check passed, publisher remains blocked).
