# D1 updated refund APK: build and bounded inspection

**A new dev/debug APK was built from the offline-verified refund source and passed bounded artifact inspection. It has not been installed or launched.** This is an Android artifact handoff, not complete D1 web/app or financial acceptance.

## Artifact identity

| Field | Recorded value |
|---|---|
| Build source commit | `c8667d9c3c18eed0f8b9c90acb40adc80b660baa` |
| Local artifact | `vaca_app/build/app/outputs/flutter-apk/app-dev-debug.apk` |
| Size | 161,968,472 bytes |
| SHA-256 | `d1a62a3165699062dec9227e450c15d9e4abd1f60c90ef859ec49e7ab1cb698f` |
| Package | `cl.vaca.app.dev` / VACA Dev |
| Version | `0.1.0`, version code `1` |
| Android configuration | Debuggable, minimum SDK 26, target SDK 36 |
| Signing | APK Signature Scheme v2; one signer; Android Debug certificate |
| Certificate SHA-256 | `3fee367d1c6a658958e18ef44e6c532cbaba163aadbca3bf7b6d9e06b545b2da` |
| Kernel SHA-256 | `e403740e57f65f4d44035212910c6c09d3773b76cdab7eae0ebd217d5f1447c7` |

The previous installed trust-root APK was 191,140,969 bytes, SHA-256 `be229024842593f2c89bbb3b75e1b7d4847d5e3e7ad539e8e06552a097759a17`. It was backed up before this build. New and previous APK signatures verify with the same certificate. Certificate continuity alone does not prove a future installation or preservation of phone data.

## Build result

Parent job9 completed with process and runner **exit 0**, in **59.507908229 seconds**, without timeout or retry. It reused the existing pinned toolchain and public configuration:

```text
<existing-dart> <existing-flutter-tools.snapshot> --suppress-analytics \
  build apk --debug --flavor dev --no-pub --dart-define=FLAVOR=dev \
  --dart-define-from-file=<existing-local-public-config> \
  --target-platform=android-arm64
```

This is a record of the executed command, not a request to replay it. No clean, pub-get, toolchain upgrade, app test suite or device command was run. The private build logs and configuration are not published.

The build checked a bounded manifest of tracked app/Android/assets inputs, configuration and selected tools. Those inputs and unrelated files remained unchanged; the pre-existing generated Android report was also unchanged. The existing configuration SHA-256 remained `cd97e32ef1744e702c33e8249da01e70b85768d6c306ec62cad7e12e11d8ce89`. A separate parent check found all four configured public values in the new debug kernel without displaying their values. These checks are not complete dependency/toolchain provenance or reproducible-build proof.

## Inspection and attribution

Independent reviewer `mwgqvaba-h-8h8u` inspected five committed public source files and a metadata-free artifact payload. It checked 13 file lengths/SHA-256 hashes and five Git-blob hashes, and reviewed the build receipts and app-side personal-wallet signing boundary.

Its first audit exited **1** because the probe expected `sdkVersion:'26'`; the actual aapt2 output was `minSdkVersion:'26'`. The aapt2 command itself exited 0 with empty stderr. Signature/content checks had not yet run. This was a probe error, not an APK defect.

The reviewer's temporary directory was removed by the runtime, so three parent attempts to read its handoff paths returned ENOENT. The reviewer recovered its original probe and actual captured outputs from its existing context without executing commands. The parent retained that failure record and corrected only the expected minimum-SDK label.

The parent then executed the corrected probe once against a fresh isolated payload: **exit 0, 2.524588863 seconds, empty stderr**. Independent reviewer `mwgr2a6z-j-na91` read the actual outputs and corrected probe and returned **PASS for the assigned artifact inspection**, without rerunning commands.

| Check | Observed outcome |
|---|---|
| aapt2 identity | Exit 0, empty stderr; package/version/debug/minimum/target SDK matched |
| apksigner, new and previous APK | Both exit 0, empty stderr; v2 verified, one signer, expected certificate continuity |
| ZIP integrity | Every member streamed to EOF for CRC validation; no duplicate member names |
| New ZIP | 1,268 members, 268,475,318 expanded bytes |
| Previous ZIP | 1,268 members, 268,494,806 expanded bytes |
| Native paths | Same 23 paths: nine arm64-v8a, seven armeabi-v7a, seven x86_64 |
| Flutter packaging | arm64 Flutter engine, debug kernel, no `libapp.so`; not an arm64-only ZIP |
| Kernel | New hash matches build receipt and differs from previous APK |
| Trust roots | Both expected public-root byte values present in both kernels |
| Source assertions | Both temporary uppercase parse-input corrections retained |
| Final payload integrity | All 13 bound payload files unchanged |

ZIP traversal was bounded to fewer than 10,000 members, an 8 MiB central directory, 256 MiB per member and 512 MiB expanded per APK, with streamed reads. V1, v3, v3.1, v4 and SourceStamp verification were reported false; no stronger signing claim is made.

## Retained local evidence

These are local, ignored evidence paths, not published download links:

- `supabase/.temp/d1-refund-apk-c8667d9/`: build runner, preparation/invocation/result receipts, previous APK/report backups and private build logs.
- `audit-inputs/manifest.json`: SHA-256 `7b9b5eee6cc15a2d7a1034d2f84bd9075c9fa52cd2f76f1a8e6847ac2be2ac5d`; only public source/artifact evidence, no Git history or standalone client configuration.
- `audit-original.py`: recovered original probe, SHA-256 `1e8839a117735b453af17cf1b717ffc5bc9993a17431a799930db06ced9cf91f`.
- `audit-original-failure.json`: recovered failure attribution; not a claim that the deleted original scratch files survived.
- `audit-corrected.py`: SHA-256 `dc6a1339bdda8322c250a1743df546a9b372d865cce25b94e6d53f5d690894a1`.
- `parent-audit/{result.json,stdout.txt,stderr.txt,work/}`: actual corrected execution and isolated inputs.

## Delivery boundaries

- The source's [bounded offline verification](d1-refund-offline-independent.md) remains separate from this build and inspection; those suites were not repeated.
- Source-commit provenance and original-tree preservation are parent-attested. Independent snapshot hashes and receipt consistency do not establish independent Git-history provenance.
- Public-root bytes in a kernel do not prove runtime selection, backend pairing or receipt validation. No absolute secret-absence claim is made.
- Historical toolchain-integrity #48 and backend-source review #56 remain open. This inspection does not close them.
- The APK is a local dev/debug artifact, not a hosted download or store release. No installation, app launch, wallet operation, backend change or financial transaction occurred.
- Complete D1 readiness still needs the web owner's durable original-reference/payment/UI handoff and separately authorized live acceptance. See [Android delivery](../../vaca_app/docs/d1-android-artifact-delivery.md) for the distinction between this artifact and the installed version.
