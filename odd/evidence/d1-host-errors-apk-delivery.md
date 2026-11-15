# D1 host-error APK: published test pre-release

**S19 / T19: source publication, fresh build, bounded independent artifact inspection and test pre-release/checksum publication are recorded.** Parent publication job-2 exited0 with release445695443 verified; this is not installation or financial acceptance. The [previous c8667d9 release](https://github.com/DNO8/VACA/releases/tag/d1-android-testnet-c8667d9) remains preserved as a separate published delivery.

## Published artifact

| Binding | Recorded value |
|---|---|
| Build source | `9840e9ffedbc49c8f4e6b894ee2b62f257b4e85b` on `feat/d1-t5b-proof`; parent source-publication job3 exited0 and freshly verified that remote ref |
| Local APK | `vaca_app/build/app/outputs/flutter-apk/app-dev-debug.apk` |
| Staged download name | `vaca-d1-testnet-9840e9ff.apk` |
| Size | `161968472` bytes |
| APK SHA-256 | `69b6832bb512d824a885f67af483f0e1701cec291444fdc06e79eca102cddf72` |
| Debug kernel SHA-256 | `cc39bc41afd7ad901d6f17607a949f61b6613dbd85707dcc4634344e12e63672` |
| Published tag / target | `d1-android-testnet-9840e9ff` / full build-source commit above |
| Publication outcome | Release445695443, `draft:false`, `prerelease:true`, `make_latest:false`; latest remained absent and previous release445514859/tagc8667d9 unchanged |
| Checksum asset | `SHA256SUMS.txt`,95 bytes; SHA-256 `0e4a9ae50f43a7a3eb83c19349e523d25cbbe18d02fbd550066c2ea46094ae87` |

Published links — **asset sizes and GitHub SHA-256 digests verified by the parent transaction**:
- [Test pre-release](https://github.com/DNO8/VACA/releases/tag/d1-android-testnet-9840e9ff)
- [APK download](https://github.com/DNO8/VACA/releases/download/d1-android-testnet-9840e9ff/vaca-d1-testnet-9840e9ff.apk)
- [Checksum download](https://github.com/DNO8/VACA/releases/download/d1-android-testnet-9840e9ff/SHA256SUMS.txt)

## Observed build and inspection

Parent build job1: exit0 / child0 in121.97244143486023s, no timeout, retry or download announcement, complete output capture. Runner reports340 inputs, ten foreign files, public configuration and working-tree status unchanged; generated report also unchanged. The four accepted public configuration values were embedded according to the build runner. No values are reproduced here.

Independent artifact-only review `mwh2qe4t-4-pqex` adjudicated PASS after the following retained attempts:

| Attempt | Actual result |
|---|---|
| Initial artifact probe | exit1 after6.635s;35 assertions passed, aapt2 exit0; apksigner exit127 (`exec: java: not found`); final rehash not reached |
| Targeted correction1 | Only pinnedJava/bin added to clean PATH; probe exit0 after1.676s,16 assertions, apksigner exit0 / empty stderr; no repeat of first35 assertions |
| Final payload binding | Snapshot SHA-256 `19f5495deb5eff2286e7fa39c020c6214383f815e82855d78298a9f99dca45ae`; all nine payload sizes/hashes unchanged |

Observed: both full current HTTP-client source files embedded only in the new kernel; current/prior ZIP CRC and duplicate checks passed; native library paths unchanged; arm64 Flutter engine. Package `cl.vaca.app.dev`, label `VACA Dev`, version0.1.0/code1, minSDK26/target36, debug flag. APK v2 signature valid, one Android Debug signer, certificate SHA-256 `3fee367d1c6a658958e18ef44e6c532cbaba163aadbca3bf7b6d9e06b545b2da`. Additional vendor-library ABIs do not establish full support for those ABIs.

## Receipts and provenance limits

Local retained build root: `supabase/.temp/d1-host-errors-apk-9840e9ff/` (`result.json`, `manifest.json`, `preservation-after.json`, `preparation.json`, `build.py`; raw private build logs remain local, not copied into publication evidence).

Publication preparation is under that root's `publication/`: exact staged APK, checksum, `notes.md`, hash manifest and new parent-only `publish.py`. `publication/evidence/` retains byte-exact independent `audit.py`, `audit-result.json`, command/exit/stdout/stderr logs, aapt2/apksigner outputs, targeted `signature-correction-1.*` and snapshot/build-result receipts from authorized `/tmp/d1-apk-9840e9ff-verify-1tzpyv6g`. These ignored receipts are local evidence, not promised public attachments. Only APK and checksum were uploaded as release assets.

The initial zero-execution verifier attempt was blocked by incompatible isolation scope; the human then authorized selective external artifact inspection. The first executed probe's missing-java failure is retained, not an APK defect or a silently passed attempt. Standalone status-client source was absent from the prior kernel; only the two reachable HTTP clients have independently established embedding coverage.

Original-tree Git blobs, HEAD, status,340 current inputs, ten foreign hashes and public configuration hash/mode remain **parent evidence**, not independent original-tree inspection. Configuration embedding is **build-runner evidence**. Artifact signature/ZIP/source embedding is independently observed. No full dependency/toolchain integrity, reproducible build, absolute secret absence, backend/runtime correctness or historical #48/#56 closure is claimed.

## Observed publication and receipt review

Parent hash-pinned publication job-2 exited0 in36.88590751599986s. `publication/result.json` records `status:completed`, `stage:verified`, release445695443, the exact source/tag above, `draft:false`, `prerelease:true`, `latestUnchanged:true` and `priorReleaseUnchanged:true`. Draft and published asset sizes/digests matched local staging. Retained API responses are under `publication/receipts/`, including `published.stdout`, `tag-after.stdout`, `old-before.stdout`, `old-after.stdout` and `latest-{before,after}.stdout`. No independent asset re-download is claimed.

Independent static helper/receipt reviewer `mwh37v36-6-m6rr` returned PASS, as reported in the parent handoff:44 commands,38 exit0 and six expected404 exit1, no timeout. Latest was absent before/after; prior release445514859 was preserved. This is review of retained API receipt evidence, **not independent live retrieval**. Helper/manifest byte hashes were parent-pinned, **not independently recomputed by that reviewer**. Build configuration and original-tree Git/input preservation retain their parent-owned attribution above.

The published release body still says “Publication is PENDING until the parent verifies the actual GitHub transaction.” That conditional preparation wording was inherited from `notes.md`; the successful observed transaction above supersedes it as publication status. Neither remote release notes nor local notes/helper/manifest/receipts were rewritten for this documentation closure. Do not replay the completed helper or infer permission to mutate the release.

No installation, launch, backend/web deployment, runtime or financial acceptance follows. Historical #48/#56 remain open. See the [delivery guide](../../vaca_app/docs/d1-android-artifact-delivery.md) and [prior artifact evidence](d1-refund-apk-delivery.md) for distinct historical delivery and acceptance boundaries.
