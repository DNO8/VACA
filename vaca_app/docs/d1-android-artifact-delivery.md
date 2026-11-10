# D1 Android artifact delivery (pending evidence)

**No successful APK or artifact-audit verdict is supplied with this guide. Do not assume a fresh artifact exists.** This is documentation for the parent-owned dev/debug build and subsequent bounded handoff, not permission to run commands, deliver an APK, activate a backend or accept D1 functionally/financially.

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

**Conditional output only:** after the parent receives job73's completion, `supabase/.temp/d1-apk-preparation/build-result.json` may supply the build result. Its existence, success, schema and artifact contents have not been inspected here. Do not poll active logs, assume a standard output filename is fresh, or substitute an older APK for a failed/missing result. No automatic retry or replacement build is authorized by this guide.

## Identity to establish on an actually generated APK

Source predicts the following, but does not prove the compiled artifact:

| Field | Source expectation |
|---|---|
| Variant | `dev` / `debug`, arm64 (`android-arm64`) |
| Android application ID | `cl.vaca.app.dev` (`cl.vaca.app` plus `.dev`) |
| Display name | `VACA Dev` |
| Android API | Minimum 26; compile/target 36 |
| App configuration | Explicit Dart `FLAVOR=dev`; Google test AdMob app ID for the dev Android flavor |
| Signing / version | Debug variant requested; actual certificate fingerprint, version name/code and package metadata remain to be recorded |

For a fresh successful result only, the parent should bind the exact APK path, byte size and SHA-256 to the build result, source revision/dirty-input state and toolchain/arguments. Confirm the package ID, variant-relevant metadata, ABI, version and signing certificate from that exact APK. A matching source declaration or a file at an expected path is not compiled identity evidence. This is not a production/public-release signing or distribution handoff.

## Bounded pool-secret / signing review procedure

This procedure is pending, not an audit conclusion or authorization to perform it now.

1. Gate review on a fresh successful build result and the exact hashed APK. Record the inspected source revision, artifact identity, method and coverage separately; do not attach conclusions to a different artifact.
2. Trace client configuration and signing ownership. Public endpoint/API configuration and personal-wallet authentication signing are allowed. A user's personal-wallet signer is **not** pool custody; the presence of a signing API alone is not a defect. A public pool account ID is not a pool secret.
3. In the bounded generated-artifact review, inspect packaged configuration/assets and inspectable code/native payloads for embedded service-role credentials, pool seeds/private keys, or client pool-transaction signing paths. Do not read real secret stores or expose candidate key material in reports; record sanitized classifications and locations only. Stop/escalate a suspected pool-secret/custody path rather than exercising it.
4. Report source observations and compiled observations separately. State exactly what was inspected, what was inaccessible and what remains unknown. Missing plaintext matches, stripped/compiled code or an uneventful build cannot prove secret absence, full call-path safety, backend custody correctness or runtime behavior.

The allowed client design uses the existing personal-wallet proof path; backend pool signing must stay backend-owned. Neither this guide nor the current source observations provide an APK pool-signing verdict. No financial operation, live request or phone execution belongs to this review.

## Public backend handoff and known-reference entry

The refund provider reads **only client-public** build defines:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
```

The backend owner confirmed the following **future public target**, not a deployed or activated endpoint (handoff correlation `0c0ca2eaef6fc0110315a1a4679d439a`):

| Public input | Owner-confirmed value / limitation |
|---|---|
| `SUPABASE_URL` project origin | `https://tgqxxnldwiqisopiclmk.supabase.co` |
| Custody base, once published | `https://tgqxxnldwiqisopiclmk.supabase.co/functions/v1/d1-custody` |
| Network | `TESTNET`, not Stellar Mainnet; project environment label does not change this |
| Pool public key | `GDFTI45GSLADACBLI7LURAFT6UN5BTERIOMTXBKZYU6DNM2JFQMDRSFL` |
| Public signed-refund namespace | `091e9722-c862-455b-a215-06ca90700acc`; not a `/config` field |
| `SUPABASE_ANON_KEY` | Not supplied; accepted public client key still pending |
| JWT gateway | Not deployed/confirmed; await final publication handoff |

Owner-reported `GET /config` source response is exactly the following JSON with `no-store`; it is **not a live response**:

```json
{"network":"TESTNET","pool_public_key":"GDFTI45GSLADACBLI7LURAFT6UN5BTERIOMTXBKZYU6DNM2JFQMDRSFL","donation_ttl_seconds":300}
```

Owner-reported source routes are POST `/prepare`, `/issue`, `/reconcile`; v1 POST `/refund`, `/refund-status`, `/refund-reconcile`; and v2 POST `/refund-remainder`, `/refund-remainder-status`, `/refund-remainder-reconcile`, retaining the frozen signed-body/Ed25519 contracts. The owner's handler has **no POST `/status`**, and its `/config` does not advertise status. Preserve this client's existing `config.status` gating and separately owned status integration; do not invent remote status availability or fallback. The namespace does not manufacture an existing request UUID/reference.

The owner retains backend consolidation and Supabase publication. It reports migrations015–021 applied,022–047 outstanding and **no `d1-custody` deployment/activation yet**. These are peer reports, not client verification, and transfer no backend import/edit/deploy authority.

Never substitute a service-role key, pool seed/private key or release credential. Dart defines are packaged client configuration, not secret storage. The recorded job73 supplied neither backend define and failed compilation; no usable configured APK is established. A later configured artifact must stay within the confirmed public handoff and carry its own build identity and evidence. Public-release monetization/legal URL rules do not justify switching this dev build to `public`.

The source's existing known-reference `RefundAdminScreen` mounts the v1 and remainder panels with the **same original scope**. Do not invent an alternate entry route or generate a new refund identity. `RefundScope` binds `TESTNET`, the original namespace UUID, public pool account ID and request UUID. The source guide describes passive construction/opening/reference changes, with status/refund/reconciliation requiring explicit commands and first-refund confirmation. These are source descriptions, not executed UI evidence. No one should open that entry on the phone in this phase.

## Evidence limits and next ownership

- Source anchors: `android/app/build.gradle.kts:35–80` (identity/flavors/API); `lib/core/config/app_config.dart:24–88` (Dart flavor and public-release configuration); `lib/features/refund/refund_providers.dart:14–38,48–58,67–80` (public defines, personal-wallet signer and passive composition); `lib/features/refund/domain/refund_scope.dart:16–37` (original TESTNET scope). Paths in this list are relative to `vaca_app`.
- [Remainder client guide](d1-remainder-client.md), especially Administrative integration and Existing boundaries, records the known-reference entry and source-only signing/command boundaries. It does not verify that integration in an APK.
- A build exit code cannot validate dialogs, durable holds, concurrency, signing semantics, backend/provider settlement, funds or operational readiness. Previous source completion and historical checks do not fill these gaps.
- Parent recovered failed job73 compilation logs, without an outer completion receipt; see Android task L17. T6 still requires a later fresh successful APK before identity/boundary review. This documentation unit ran no build, tests, analyzer, artifact inspection, backend commands or device actions. No functional/financial acceptance, delivery grant or security audit verdict is implied.
