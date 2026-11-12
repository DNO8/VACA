# D1 Android artifact delivery (dev/debug artifact recorded)

**Job16 produced a fresh APK; job17 completed its identity and bounded signing-boundary inspection.** These establish a local dev/debug artifact, not secret-absence certification, a configured/live backend, phone execution or D1 functional/financial acceptance. Earlier failed attempts and the missing independent toolchain-integrity proof remain recorded below.

The latest instruction explicitly defers installing, opening and testing the app on the phone. Backend/Supabase work remains owned separately. See [the Android task](../../odd/tasks/d1-client-android-toolchain.md), S4–S6 and L11–L15.

## Recorded build recipe — not a new execution request

The parent launched job73 with this Flutter argument vector, from `vaca_app`:

```text
build apk --debug --flavor dev --no-pub --dart-define=FLAVOR=dev --target-platform=android-arm64
```

Use the pinned clone-local Dart executable and Flutter tool snapshot recorded by that job, not an arbitrary `flutter` on the host PATH. The local environment is part of the recipe:

| Input | Recorded selection / constraint |
|---|---|
| JDK | Temurin 17.0.21+9; Java/Javac 17.0.21 |
| Android SDK | Clone-local SDK; command-line tools 19.0, platform `android-36`, build-tools `36.0.0` |
| NDK | `28.2.13676358` |
| Gradle | Project Gradle 8.14; no wrapper/dependency upgrades |
| Environment | Minimal clone-local environment and caches under `.tooling/`; bind `JAVA_HOME`, Android SDK discovery and PATH to the parent's retained pinned paths, not host defaults |
| Flutter/Dart inputs | Existing pinned tool snapshot and package resolution; `--no-pub`, no Flutter upgrade or Dart dependency refresh |
| Build bounds | 1200-second timeout with process-group stop; no inherited backend defines or release credentials |

The version/environment selection is recorded in the Android task L5–L14 and `supabase/.temp/d1-android-toolchain-install/install.json`. Exact executable paths and environment bindings must come from the parent-owned recipe/receipts; this guide does not invent a runnable wrapper or claim their independent verification. The prior independent integrity proof remains unresolved. Package-file presence and local version receipts do not close that gap.

**Historical job73 is not the successful artifact:** its outer receipt was unavailable and retained logs show failure. The successful job16 receipt is `supabase/.temp/d1-gradle-apk-after-cache/result.json`; the exact APK identity is recorded below. Do not substitute another APK, replay a completed attempt or infer authority for another build.

## Authorized local Gradle correction (S7)

The original job73 logs record a wrapper download timeout, Flutter's internal retry and a disappeared Gradle daemon; no successful APK or outer completion receipt was recovered. Available host memory was approximately1456MiB of7597MiB, while project defaults allow8G heap/4G metaspace. This motivates a local cap, **not a proven OOM diagnosis**. Gradle8.14 now has a cached distribution marker; no distribution/version upgrade was made.

The clone-local `.tooling/gradle-home/gradle.properties` overrides memory to1024M heap/384M metaspace/128M codecache, one worker, no parallelism, no persistent daemon and in-process Kotlin. Project `android/gradle.properties` and the pinned environment JSON are not edited. These local caps are not new defaults for other developers.

The separate single-attempt runner is `supabase/.temp/d1-gradle-resource-correction/build_once.py`, using the same pinned snapshot/arguments above. It preserves the original attempt files; records invocation/result/stdout/stderr separately; stops the process group at a Flutter retry announcement; and keeps the1200-second timeout. Success requires a fresh APK plus unchanged named dependency/project inputs and local limits. This remains a build check, not historical toolchain integrity closure. No suites, phone, backend or financial operations are part of the correction.

One independent static review (`mwa0jr56-2-m94n`) found no concrete blocker in this correction and ran only Python in-memory syntax compilation (exit0). Parent repeated that exact syntax check once (exit0). Neither check executes the build or dynamically establishes Gradle behavior. The actual compilation result must be reported separately.

### Observed resource-bounded attempt and deadline correction

Job4 **failed**: its receipt records effective exit1, child exit0, a retry announcement and no admitted APK. Logs show classpath downloads failing due to DNS/connection timeouts at official Google Maven and Maven Central. Five named project/dependency inputs and local caps stayed unchanged. Observed elapsed time was72236.6s, so the nominal1200-second wall-time bound was **not established**; no suspension or memory cause is inferred.

A subsequent bounded connectivity probe (job6, exit0) returned HEAD200 from the exact official AGP8.11.1 and protobuf3.25.5 POM endpoints in default/direct modes, without proxy variables. No DNS, hosts, proxy, mirror or version was changed.

The fresh runner `supabase/.temp/d1-gradle-network-restored/build_once.py` retains old receipts and checks a1200-second wall-clock deadline during waits of at most2s and again after child exit, rejecting late success. Timeout remains effective124; retry announcements remain failure. Termination grace, reader joins, accounting and runtime scheduling are additional; this is not an absolute runtime guarantee. One targeted static follow-up (`mwc74zb6-3-loua`) found no blocker; syntax check and parent repeat exited0, without builds. A new compilation under restored network conditions still needs its own observed result; no APK or historical integrity closure follows from this correction.

### Android preferences initialization correction

Job7 failed after39.48s (exit1, no retry, no admitted APK) applying the Android application plugin. One offline `help --stacktrace` reproduction (job10, exit1) established `AndroidLocationsException`: `ANDROID_PREFS_ROOT`, `ANDROID_SDK_HOME` and `ANDROID_USER_HOME` supplied conflicting preference locations; the exception recommends only `ANDROID_USER_HOME`. Initial diagnostic job9 used the wrong shell and failed parsing the Bash wrapper before Gradle started; it is not a valid plugin reproduction.

The clone-local environment JSON now removes **only** deprecated `ANDROID_PREFS_ROOT` and `ANDROID_SDK_HOME`. All17 remaining values, including `ANDROID_USER_HOME`, SDK/NDK discovery, home/cache paths and Java configuration, are unchanged. Before-bytes are retained at `supabase/.temp/d1-gradle-preferences-fixed/environment-before.json`. No SDK reinstall, global configuration or dependency/version change occurred.

The fresh `supabase/.temp/d1-gradle-preferences-fixed/build_once.py` is byte-identical to the deadline-corrected runner. One new-env independent static review (`mwc7dayf-4-r39d`) found no blocker; its read-only JSON/runner/syntax check and the parent readback/check exited0. These establish only the bounded configuration change; the actual corrected build remains a separate functional outcome. Historical toolchain integrity and artifact proof remain unresolved.

### Previous result: corrected-preferences build timed out

Job11 ended with **exit124**, `timeout=true`, `childExit=-9`, no retry announcement and no admitted artifact, after1787.51s (~29m48s). The receipt reports the five named project/dependency inputs and local Gradle limits unchanged. Retained stdout contains only the start of `assembleDevDebug`; stderr only the Java user-home setting. These logs do not establish the stalled stage or cause, nor a successful APK. The nominal1200-second deadline is not evidence of an absolute20-minute runtime bound.

At that point, build and artifact delivery were blocked/pending. Subsequent explicitly authorized investigation and a fresh build are recorded below; the timeout is not erased or reclassified as success. Phone/backend/stopped suites/financial actions and the historical missing toolchain-integrity proof remain unchanged.

### Observed configuration and fresh successful build

One offline configuration probe (job14, exit1/42.666s) found declared `com.android.tools.build:gradle:8.7.3` unavailable in the cache for `sqlite3_flutter_libs`. One authorized online configuration/cache-population invocation (job15, exit0/50.998s) downloaded declared dependencies and completed `help` with all projects evaluated. This did not establish the cause of the earlier timeout or build an APK.

The human then explicitly authorized one fresh dev/debug arm64-targeted APK build. Job16 exited0 after409.263s, without a retry announcement, using the unchanged reviewed runner and existing caps. Five named project/dependency inputs and local caps matched before/after; subsequent job17 readback also matched all seven recorded inputs, including the environment JSON. Build stderr contains Java user-home notices and a deprecated-API note, not an all-warning-free result. No suites or device/backend actions ran.

| Artifact binding | Observed value |
|---|---|
| Build source revision | `818fb37b02be800feda58735725ce2fa4c1fd630` |
| APK, relative to repository | `vaca_app/build/app/outputs/flutter-apk/app-dev-debug.apk` |
| Bytes | `161968472` |
| SHA-256, rechecked before/after inspection | `29798bbc7863eb29c43d065cef9bd1ece814aa60ec73287d557bbea3dee7ad8c` |
| Local receipts | `supabase/.temp/d1-gradle-apk-after-cache/{scope,invocation,result,artifact-review}.json` |
| Build variant / configuration | `dev` / `debug`; `FLAVOR=dev`; no supplied backend defines or release credentials |

Application source/configuration under `vaca_app/lib`, `android/app` and the pubspec files had no diff from the build revision at review time. The working tree was not globally clean: prior unrelated tooling/phone files, task bookkeeping and the Gradle-generated tracked problems report were excluded from evidence publication. No clean-build/reproducibility or comprehensive input-integrity claim follows.

## Compiled identity from the exact APK

Job17 ran pinned build-tools36.0.0 `aapt2 dump badging` and `apksigner verify --verbose --print-certs`, both exit0, against the hashed APK:

| Field | Compiled observation |
|---|---|
| Android application ID | `cl.vaca.app.dev` |
| Display name | `VACA Dev` |
| Android API | Minimum26; compile/target36 |
| Version | `0.1.0`, versionCode1 |
| Debug flag | `application-debuggable` present |
| Signing | APK v2 signature verifies; one `C=US, O=Android, CN=Android Debug` RSA2048 certificate |
| Certificate SHA-256 | `3fee367d1c6a658958e18ef44e6c532cbaba163aadbca3bf7b6d9e06b545b2da` |
| Flutter engine | `lib/arm64-v8a/libflutter.so` only |
| Other native payloads | `arm64-v8a`: 9 libraries total; `armeabi-v7a`: 7; `x86_64`: 7 |

The recipe targets arm64, but the ZIP is **not arm64-only**: other native dependencies include additional ABIs. Their presence does not establish app support for those ABIs. Signature validity is artifact-integrity evidence, not release identity or a security approval. This is not a production/public-release distribution handoff.

## Bounded pool-secret / signing review procedure

Completed within the following bounds: job17 streamed all1268 uncompressed ZIP members (268493998bytes), including the Dart debug kernel and native payloads, checking ASCII Stellar secret-seed candidates with version/CRC validation, JWT `service_role` claims, PEM private-key markers and Supabase secret-key patterns. **No matching candidates were found.** No matched values or real secure-storage contents were exposed.

Targeted source readback covered `refund_wallet_signer.dart`, `refund_remainder_http_client.dart`, `refund_providers.dart` and `app_config.dart`. The inspected v1/v2 proof methods read the existing personal-wallet storage entry and sign a canonical Stellar Signed Message digest; the pool is a public scope field, not the selected signing key. Providers accept client-public configuration and compose the personal signer passively. Source hashes and observations are retained in `artifact-review.json`.

This is a bounded plaintext/source inspection, **not** proof that secrets are absent or that every compiled pool-signing call path is safe. Native/Dart decompilation, encoded/encrypted/split material and runtime-fetched data were not covered. The procedure below states the review boundary; it does not authorize additional execution:

1. Gate review on a fresh successful build result and the exact hashed APK. Record the inspected source revision, artifact identity, method and coverage separately; do not attach conclusions to a different artifact.
2. Trace client configuration and signing ownership. Public endpoint/API configuration and personal-wallet authentication signing are allowed. A user's personal-wallet signer is **not** pool custody; the presence of a signing API alone is not a defect. A public pool account ID is not a pool secret.
3. In the bounded generated-artifact review, inspect packaged configuration/assets and inspectable code/native payloads for embedded service-role credentials, pool seeds/private keys, or client pool-transaction signing paths. Do not read real secret stores or expose candidate key material in reports; record sanitized classifications and locations only. Stop/escalate a suspected pool-secret/custody path rather than exercising it.
4. Report source observations and compiled observations separately. State exactly what was inspected, what was inaccessible and what remains unknown. Missing plaintext matches, stripped/compiled code or an uneventful build cannot prove secret absence, full call-path safety, backend custody correctness or runtime behavior.

The allowed client design uses the existing personal-wallet proof path; backend pool signing must stay backend-owned. The APK result above supplies bounded observations only; it does not certify secret absence or backend custody correctness. No financial operation, live request or phone execution belongs to this review.

## Public backend handoff and known-reference entry

The refund provider reads **only client-public** build defines:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
```

The backend owner subsequently reported **publication and selected TESTNET activation complete** (correlations `98e25a7af7cf69dd0c2e9200212d19ed` and `f369a4d0db9d9ee7b489d4499eb3902e`). This supersedes the earlier future-target handoff `0c0ca2eaef6fc0110315a1a4679d439a`: do not use its former `GDFTI…` Friendbot pool or former namespace for new configuration. These are owner-reported deployment/activation facts, not this client's HTTP, APK integration or financial verification.

| Public input | Owner-confirmed value / limitation |
|---|---|
| `SUPABASE_URL` project origin | `https://tgqxxnldwiqisopiclmk.supabase.co` |
| Published custody base, owner-reported | `https://tgqxxnldwiqisopiclmk.supabase.co/functions/v1/d1-custody` |
| Network | `TESTNET`, not Stellar Mainnet; project environment label does not change this |
| Selected pool public key | `GBJU5J6F2L6XXPTYADYS6NIPAP6RAJBN7SAXJDAOWIFSPEWFSCASEIXN` |
| Selected public signed-refund namespace | `5a08ccd6-b4ba-4b31-adc9-fe3e57a6bda7`; not a `/config` field |
| Selected first ledger | `5676563`; owner-reported activation metadata, not a `/config` field |
| `SUPABASE_ANON_KEY` | Actual value not supplied; accepted type is this project's legacy public anon JWT (`role: anon`), not a user-session or privileged key |
| JWT gateway | Owner reports `verify_jwt: true`; must remain enabled. Accepted current contract: same legacy public anon JWT in both `apikey` and `Authorization: Bearer …` |
| Publication | Owner reports `d1-custody` ACTIVE, version1, function ID `ac86ceed-898f-4ccc-9edd-6aad439262f0`, import map enabled |

Owner-reported `GET /config` source response is exactly the following JSON with `no-store`; it is **not a live response**:

```json
{"network":"TESTNET","pool_public_key":"GBJU5J6F2L6XXPTYADYS6NIPAP6RAJBN7SAXJDAOWIFSPEWFSCASEIXN","donation_ttl_seconds":300}
```

Owner-reported source routes are POST `/prepare`, `/issue`, `/reconcile`; v1 POST `/refund`, `/refund-status`, `/refund-reconcile`; and v2 POST `/refund-remainder`, `/refund-remainder-status`, `/refund-remainder-reconcile`, retaining the frozen signed-body/Ed25519 contracts. The owner's handler has **no POST `/status`**, and its `/config` does not advertise status. Preserve this client's existing `config.status` gating and separately owned status integration; do not invent remote status availability or fallback. The namespace does not manufacture an existing request UUID/reference.

The owner reports deployed bundle bytes matching its prepared files, including index SHA-256 `5275452af36aa8e6990123d42bc7b2ec0ed4d996b07d1187bbaa0829dcf4b6df`, and native selected-activation success with a read-only row confirmation. This supersedes the earlier no-deployment/no-activation status; it does not establish a new migration inventory or authorize importing/editing the owner's root.

The owner reports the human selected **“Con la primera operación real de la app”** for creation-credit persistence. Operating-credit records and preparations remain zero intentionally. Existing real signed/current-admin `/issue` prerequisites will observe/register creation credit once a genuine prepared request exists. Backend implementation/publication/selected activation are reported closed under that deferral: **do not wait for a new ingestion endpoint, create a synthetic preparation or send funds to manufacture closure**. Financial/E2E/SOW acceptance remains unproven.

### Accepted gateway contract; actual public key still missing

Owner report `9f4470eb1c1dfeccdb0d11b69984be61` selects the project's **legacy public anon JWT** for the current wallet-signed D1 endpoints. All three D1 refund transport constructors now set `apikey: <public anon JWT>`, `Authorization: Bearer <same public anon JWT>` and `Content-Type: application/json`. No new login, Supabase Auth/session flow, token refresh or gateway change is introduced. This source change is not included in the already-built job16 APK.

These public headers provide shared project gateway access, **not user/admin identity**. Personal-wallet signed bodies and the backend's actual current `admin_wallets` checks retain their separate authorization role. JWT verification does not establish the wallet signer's identity. This is the explicitly chosen current contract, not a live request result or a universal claim that `apikey`-only/publishable-key compatibility fails; see [Supabase auth headers](https://supabase.com/docs/guides/functions/auth-headers).

The actual public anon JWT value has **not** been supplied or retrieved. The owner-approved public retrieval route is [the project's API keys dashboard](https://supabase.com/dashboard/project/tgqxxnldwiqisopiclmk/settings/api-keys) → **Legacy anon/service_role API keys** → **only anon/public**. The human can provide that public value for client configuration. Never copy the adjacent service-role key or any pool seed/secret; do not substitute a user-session JWT. If legacy anon is unavailable/disabled, report missing public configuration rather than inventing a JWT, adding Auth or disabling the gateway. A configured artifact and live gateway behavior remain unverified; stopped functional suites, phone and financial actions remain deferred.

The selected target is for new configured context only. **Never rewrite an existing refund's original pool, namespace, request UUID, payment, gross or deadline to match a new activation.** No phone or financial execution is authorized by this handoff.

Never substitute a service-role key, pool seed/private key or release credential. Dart defines are packaged client configuration, not secret storage. The successful job16 supplied neither backend define; an APK exists, but a configured/live D1 refund backend is not established. A later configured artifact must stay within the confirmed public handoff and carry its own build identity and evidence. Public-release monetization/legal URL rules do not justify switching this dev build to `public`.

The source's existing known-reference `RefundAdminScreen` mounts the v1 and remainder panels with the **same original scope**. Do not invent an alternate entry route or generate a new refund identity. `RefundScope` binds `TESTNET`, the original namespace UUID, public pool account ID and request UUID. The source guide describes passive construction/opening/reference changes, with status/refund/reconciliation requiring explicit commands and first-refund confirmation. These are source descriptions, not executed UI evidence. No one should open that entry on the phone in this phase.

## Evidence limits and next ownership

- Source anchors: `android/app/build.gradle.kts:35–80` (identity/flavors/API); `lib/core/config/app_config.dart:24–88` (Dart flavor and public-release configuration); `lib/features/refund/refund_providers.dart:14–38,48–58,67–80` (public defines, personal-wallet signer and passive composition); `lib/features/refund/domain/refund_scope.dart:16–37` (original TESTNET scope). Paths in this list are relative to `vaca_app`.
- [Remainder client guide](d1-remainder-client.md), especially Administrative integration and Existing boundaries, records the known-reference entry and source-only signing/command boundaries. It does not verify that integration in an APK.
- A build exit code cannot validate dialogs, durable holds, concurrency, signing semantics, backend/provider settlement, funds or operational readiness. Previous source completion and historical checks do not fill these gaps.
- Original documentation work ran no build or inspection. Later parent job16 compiled the APK and job17 performed the bounded inspection reported here. Earlier job73/4/7/11 failures remain historical failures; see the Android task. Historical independent toolchain proof remains missing; stopped functional suites remain unexecuted. No phone/backend execution, functional/financial acceptance or comprehensive security verdict is implied.
