# Configured debug APK: bounded independent artifact audit passed

The existing configured APK passed the newly authorized ABI/debug-payload/CRC audit and the parent's exact-body replay. No rebuild occurred. This closes the previously missing bounded artifact checks, not publication, runtime, financial or native approval.

## Verified candidate and scope

| Item | Observed result |
|---|---|
| Source HEAD at audit | `092db0a550916f7d5ee29d64c0220a377e3d2e93` |
| Existing artifact | `vaca_app/build/app/outputs/flutter-apk/app-dev-debug.apk` |
| Size / SHA256 | `191140891` bytes / `68fe86cea342356a2375f4db2c06a132173331b3f04f8ef339d0b47eeeead957` |
| Historical native-packaging baseline | Preserved unconfigured APK, `161968472` bytes / `29798bbc7863eb29c43d065cef9bd1ece814aa60ec73287d557bbea3dee7ad8c` |
| Independent verifier | `mwdq3k6i-6-7ezq`, S1-S2 met, no bounded artifact blocker |
| Independent CLI | Exit `0`; stderr empty; timeout limit `30` seconds |
| Parent exact-body replay | Exit `0`; `3.104361810001137` seconds; stderr empty; `1717` stdout bytes; no timeout |
| Checker's unchanged SHA256 | `97cdf8f14c3dc4e88bb652e9ed549fad102324b88e057e8169504308a6d706d5` |

Human scope and temporary-copy authorization are recorded in [the audit feature](../tasks/d1-debug-apk-bounded-audit.md), S1-S2/L1/L6. Only audit ownership transferred to this parent; peer `01a18db6-341c-7177-94f2-663572329f39` remains sole publisher. Source/evidence publication is still a separate blocked delivery step.

## ABI criterion: engine arm64, not entire ZIP arm64-only

Both hash-pinned APKs have exactly the same **23 native library paths**:

| Native ABI | Libraries | Flutter engine present |
|---|---:|---|
| `arm64-v8a` | 9 | Yes, only `lib/arm64-v8a/libflutter.so` |
| `armeabi-v7a` | 7 | No |
| `x86_64` | 7 | No |

The corrected criterion requires exact native-path equality with the historical hash-pinned APK and an exclusively arm64 Flutter engine. It does **not** certify compatibility on the other ABI devices. The verifier independently proved byte equality outside the ABI block and truthful success label against the retained failed checker; all other predicates remain. No assertion was merely removed to obtain approval.

## Checks actually completed

- Nonempty `AndroidManifest.xml`, `lib/arm64-v8a/libflutter.so`, and `assets/flutter_assets/kernel_blob.bin`; no invalid AOT `libapp.so` requirement for this debug artifact.
- ZIP path safety, duplicate entries, encryption/compression/special-file and size bounds.
- **All 1268 ZIP entries**, **268494694 inflated bytes**, streamed with per-entry size and CRC comparison and aggregate size check.
- Recipe AST and exact two historical-to-configured substitutions; configured dev/debug arm64 argv and receipts; five recorded project/dependency hashes and Gradle caps.
- Current/historical artifact and preserved generated-report identities; final fingerprints of all 16 named originals and 15 copies, plus HEAD unchanged. Independent Git status before/after was identical.

The verifier prepared exactly 15 files / 191570066 bytes plus a 4732-byte manifest in private scratch after its own dependency/capacity/completeness checks. The historical APK was streamed and its ZIP native inventory inspected read-only, never copied. No local config JSON, keyring, Android environment file, SDK, clone or raw build log entered the payload. No raw asset/config values were printed.

## Retained checker and replay evidence

[The stdlib checker](d1-debug-apk-bounded-audit.py) is retained unchanged. The independent command used its byte-identical private scratch copy; the following parent command differed only by those copy paths and has **already executed successfully**, with a 30-second subprocess timeout:

```sh
python3 -B /home/danilo/projects/vaca-d1-t5b-proof/odd/evidence/d1-debug-apk-bounded-audit.py /home/danilo/projects/vaca-d1-t5b-proof /home/danilo/projects/vaca-d1-t5b-proof/supabase/.temp/d1-debug-apk-bounded-audit-01a1adc2/payload
```

Ignored/private preparation and complete audit stdout/stderr/result/invocation are retained in `supabase/.temp/d1-debug-apk-bounded-audit-01a1adc2/`, with the parent replay under `parent-spotcheck/`. The script's last stdout phrase says the parent check remains required because it labels the independent stage; the separately observed parent exit0 above fulfills that requirement. It is not an instruction to run again. The checker pins this historical source HEAD and artifact; it is evidence for this candidate, not a generic test to rerun after unrelated HEAD changes.

## Historical failures and limits remain

The original AOT/debug assumption failure, removed-scratch parent ENOENT (zero probes), atime checker failure, consumed auxiliary correction and incorrect whole-ZIP ABI failure remain in [the earlier build evidence](d1-configured-apk-build.md) and retained failed checker SHA256 `e9ce7e2d252e794c823b1582eb072bced901555e157732a63dd0744b98cc9c07`. The new explicit continuation does not relabel those attempts as passes or reset native budgets. A metadata read of an assumed prior manifest path also returned ENOENT before this new complete preparation; no verifier probe used that missing path.

No build, phone action, deferred suite, backend/gateway request, signing operation, funds action, commit or push was performed for this audit. Independent toolchain proof #48, prerequisite source proof #56 and deferred functional work #40 remain separate. No secret-absence, other-ABI compatibility, runtime, signature, financial, SOW or whole-D1 acceptance is claimed. Native assessment is still unassessable/candidateNULL/unknown; no native START or approval was obtained.

Risk: item 5 (configured build/artifact environment). Independent bounded artifact verification and parent replay passed; publication and wider acceptance remain outside this result.
