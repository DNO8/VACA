# B3: protected preparation and one-shot APK build
Scope: T2d/T3, S1–S2/S6/S15–S17. Source remains pinned to e7f870540bf8bd91df49de7869ca8f343689d9bd; no production source changes, new signer, private-input copies, device installation or financial operations.

## State and verification priority
B3 is not accepted yet. Initial public Python suite:13 tests PASS, exit0/0.083s, empty stdout. The earlier RED was a missing module before test collection, not thirteen observed behavioral failures.
The production launcher was executed in a public namespace: wrong request exited1 without an attempt; the original fake command exited7 with ORIGINAL_FAILURE; another invocation exited1 with B3_REJECT_RETRY, without changing the attempt state.
The separate public Groovy probe evaluates the unchanged policy using public model/graph doubles. It checks offline/request/build/project/variant/signing-selection and dependency/finalizer restrictions; it is not real AGP signing or APK evidence. Job80 executed it with real offline Gradle8.14/Groovy:11 cases PASS, exit0/18s, exact B3_POLICY_PUBLIC_PASS cases=11 and unchanged fixture/control/selected input records. Raw evidence is under .tooling/d1-recording-apk/unit-b3-policy-public/.
Reuse valid evidence for unchanged executable bytes. Prioritize the missing boundary/independent proof and actual build/artifact audit, not duplicate historical suites. Every check below protects a stated requirement; no arbitrary20% coverage cutoff applies.

## Protected inputs and source
The exact config and existing debug signer are the two L7-authorized files, not discoverable inputs or CLI overrides. Regular/unshared bounded files are opened with no-follow checks; config hash, four-key schema and project URL must match. The existing signer's public certificate must equal the baseline fingerprint.
Open descriptors remain held through use. Namespace binds reference those descriptors, not a pathname that can be swapped afterward. Descriptor and pathname metadata/content are compared afterward; no private input is copied. Errors record types, not input values or parser excerpts.
The approved archive and exactly nine B1-generated outputs seed a fresh public source. All original files stay read-only and hash/mode/membership checked. Writable overlays are limited to three generated metadata/registrant files, .dart_tool generated output, Android project cache and build output; admitted package metadata stays read-only inside .dart_tool.
The five pinned Flutter migrators have static no-op evidence. Existing executable wrappers stay read-only; Flutter's attempted chmod may fail harmlessly. The new launcher delegates to the original wrapper with its original jar/properties mounted together under /b3; it creates the sole attempt marker before JVM startup, so Flutter's internal retry cannot launch another Gradle process.

## Task and signing boundary
Early offline initialization applies only to the exact app and Flutter included-build identities. The app request must be exactly assembleDevDebug; its scheduled graph must belong to the bounded dependency/finalizer closure, approved plugin project paths and permitted debug variant, excluding unrelated/dangerous task families.
The Flutter included build retains the eight explicit plugin-production task names already proved by B2. The finalized app model must be devDebug/cl.vaca.app.dev/debug with the exact read-only signer alias before tasks run. No default signer generation is permitted.
Original SDK/JDK/Android files stay read-only; previously owned mutable caches are reused. Fixed command-only low-memory, single-worker, no-parallel/configuration-cache and no-toolchain-download settings do not edit original Gradle properties.

## Commands and prerequisite gates
Run only after the parent has verified the candidate and resolved applicable review consent. These commands do not grant private access; L7 supplies the exact input authorization and all safety denials remain binding.

```sh
python3 -B odd/evidence/d1-recording-apk-unit-b3-test.py
python3 -B odd/evidence/d1-recording-apk-unit-b3.py prepare
python3 -B odd/evidence/d1-recording-apk-unit-b3.py build --prepared-sha <parent-observed-accepted-prepare-sha256>
```

Prepare has a90s overall deadline and30s/64KiB certificate capture. It exclusively creates unit-b3 and records source/control/public/private identities; no APK is compiled. The parent must inspect the protected receipt and retain its hash before build.
Build requires the exact accepted receipt hash, unchanged controls/inputs/source and fresh output/attempt state. It has a1900s overall deadline and1800s/1MiB subprocess bound; parent background execution adds a bounded outer deadline. Existing contexts/invocations, first failure, timeout or output cap stop; there is no retry, alternate-root or resume CLI.
Use an owned clean HOME/TMPDIR and restrictive permissions. Receipts/raw streams and generated outputs remain protected; configuration-derived values can enter compiler intermediates and APK bytes. Do not publish raw logs or private inputs.

## Acceptance and remaining proof
A successful build requires exit0/ok, the exact finalized-model marker, one Gradle attempt, preserved source/input/control boundaries, bounded regular generated outputs and one regular unshared bounded APK at build/app/outputs/flutter-apk/app-dev-debug.apk. Its mode is0600 and SHA/size are recorded.
That receipt is not final delivery acceptance. T4 independently verifies the new APK package/version/debug status, ARM64 content, signature/certificate and source/configuration binding, then the parent performs the bounded spot check. Phone installation/execution remains unauthorized.
Risk: item 2 (private-input identity, signing and namespace guards).
Risk: item 5 (toolchain environment, compilation and artifact delivery).
