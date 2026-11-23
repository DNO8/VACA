# APK-only integration: offline verification admission plan

**Preparation only; no app transfer or test execution has occurred.** Use the [source-bound manifest](apk-b-main-slices.json) for the three child PRs, in order, against the integration tracker—not directly against main. S1–S3 remain parent-owned; T1 is not complete until the parent creates the draft/no-merge tracker PR.

## Review and transfer order

Base: `1c60386e4c51a8933303a19424911580cd65d5dd`. Authoritative source: `907a4e3d770bd5b6c363a468f2ca496aa3b4ecfb` (not original local HEAD `4e59401`). Preserve original worktree/branch, APK and release455959305; do not import the mixed commit history.

| Child unit | Paths | Additions/deletions | Dependency/admission boundary |
|---|---:|---:|---|
| wallet-claims (T2) | 9 | +764/−17; 781 changed lines | 3 production, 3 tests, 3 guides; baseline for refund wallet signing and Vaquita fail-closed behavior |
| refund-stack (T3) | 35 | +6210/−0 | Requires wallet child; 17 production, 15 test/fixture, 3 guides; keep the complete shared v1/v2 gate, journals, consumers, providers and UI together |
| identity-navigation (T4) | 3 | +667/−0 | Requires full refund stack; Identity entry, real-app navigation regression and artifact-history guide |

The refund unit exceeds the advisory400-line review budget because its durable shared holds, one-use permits, both protocols and dependent tests are one safety boundary. Its 15 test/fixture paths comprise 14 runnable tests plus `test/refund_test_fixtures.dart`; do not delete tests, compress code or repeat-split to disguise the +6210 size. Review domain/gate → transports/consumers → provider/UI → tests/docs in that single child.

Total: 47 app paths, +7641/−17 (7658 changed lines): 21 production, 19 tests/fixture, 7 guides. Copy production/test source bytes and modes exactly from source907. Narrow guide-provenance repair is the only planned departure; account for it separately rather than changing this source manifest. No backend/Supabase/migrations, historical ODD/design/recovery trees, ignore rules, dependencies, build configuration or workflows enter the app transfer. New tracker/evidence is separate from the 47-path projection.

## Public inputs: bounded metadata admission

- Existing configuration, read only: `<SOURCE_WORKTREE>/vaca_app/.dart_tool/package_config.json`.
- Public SDK root: `<SDK>`; hosted cache: its `.pub-cache/hosted/pub.dev` only. The parent supplies exact local paths in the execution handoff, not this public document. No sibling tooling/private configuration is admitted.
- Current observation: **215 package roots**, all existing directories confined to that public SDK or the original `vaca_app`: 209 hosted, 3 SDK packages, 1 SDK cache, 1 CameraX, 1 app. Zero missing/unsupported/escaping roots. Relative `../` resolves to the original app; `../packages/camera_android_camerax` resolves to its Git-vendored CameraX. These are current root metadata counts, not historical213/9513-file evidence or a content-integrity proof.
- Five nonempty executable files admitted by mode/access metadata: `bin/flutter`, `bin/dart`, `bin/cache/dart-sdk/bin/{dart,dartaotruntime}`, `bin/cache/artifacts/engine/linux-x64/flutter_tester`. Five other nonempty files checked: `bin/cache/flutter_tools.snapshot`, `bin/cache/flutter.version.json`, `bin/cache/dart-sdk/version`, `bin/internal/engine.version`, `bin/cache/engine.stamp`. No executable was launched.
- Version metadata agrees: Flutter3.41.9 stable, framework `00b0c91f06209d9e4a41f71b7a512d6eb3b9c694`, Dart3.11.5, engine `42d3d75a56efe1a2e9902f52dc8006099c45d937`. JSON, Dart version file, engine version/stamp and package-config versions agree. This is not toolchain integrity, runtime executability or complete cache readiness proof.
- Exact base↔source blob equality: `vaca_app/pubspec.yaml` = `90c6997eb74369a29953e8ad4d1f42d0b6ab11a3`; `vaca_app/pubspec.lock` = `b0ce991cf2d23986079d47a5a09333b8454fe008` (both mode100644). No resolution/dependency change is planned.

**T2 must prepare its test-only environment before execution.** This preparation unit did not copy `.dart_tool`, create resolution state, hash/copy the whole SDK/cache, run pub-get, repair helpers, or install anything. The parent's execution handoff will specify an isolated system-temp environment and a minimal public-only resolution map: remap the app and Git-vendored CameraX roots to the transferred candidate, retain only admitted SDK/cache roots, and revalidate confinement/existence. Do not run tests from the original APK worktree. Missing/escaping roots or artifacts mean UNVERIFIED; report them without following or reading outside admitted roots. Metadata admission alone does not authorize execution or prove dependency contents match the lock.

## Focused commands after explicit execution authorization

Work from the candidate `vaca_app` in the isolated environment. Bind `SDK` to the public root above, `DART` to `$SDK/bin/cache/dart-sdk/bin/dart`, and `SNAPSHOT` to `$SDK/bin/cache/flutter_tools.snapshot`. The following are future command templates, not executed evidence. A parent-provided launcher must enforce no network, read-only public inputs, fresh temp HOME/TMPDIR/output caches, a finite foreground deadline/kill grace, complete argv/stdout/stderr/exit receipts, and no automatic retries. Use an environment allowlist (`env -i`), not inherited configuration: only required PATH/system tooling, temp HOME/TMPDIR, public SDK/cache bindings and analytics suppression; explicitly set `VACA_STELLAR_TESTNET=0`. Never inherit live opt-ins, private config, endpoint defines, signers or financial keys. Do not replay old setup/build/seed/prepare/retired-B3 helpers.

### T2 · wallet-claims (3 runnable paths)

```sh
"$DART" "$SNAPSHOT" --suppress-analytics test --no-pub --reporter expanded \
  test/stellar_wallet_service_test.dart \
  test/stellar_wallet_snapshot_test.dart \
  test/vaquita_claim_lookup_test.dart
```

Retain the existing creation/load/funding/claim regressions in the service fixture; snapshot tests use injected fake HTTP, not Horizon. Run existing `test/vaca_button_test.dart` separately as the source guide's presentation-preservation check.

### T3 · complete refund-stack (14 runnable paths)

```sh
"$DART" "$SNAPSHOT" --suppress-analytics test --no-pub --reporter expanded \
  test/d1_custody_profile_test.dart \
  test/independent_b_probe_test.dart \
  test/refund_admin_screen_test.dart \
  test/refund_client_test.dart \
  test/refund_command_coordination_test.dart \
  test/refund_deadline_independent_test.dart \
  test/refund_host_boundary_independent_test.dart \
  test/refund_host_errors_test.dart \
  test/refund_panel_test.dart \
  test/refund_providers_test.dart \
  test/refund_remainder_client_test.dart \
  test/refund_remainder_status_test.dart \
  test/refund_responsive_layout_test.dart \
  test/refund_status_test.dart
```

`test/refund_test_fixtures.dart` is supporting source, not a runnable test. Admit only synthetic storage/wallets and injected in-memory adapters. Verify default A behavior, B pin/rejection boundaries, shared permanent holds, one-use dispatch, explicit-only status/reconciliation and passive construction. No real transport or personal-wallet store is an input.

### T4 · identity-navigation (1 runnable path)

```sh
"$DART" "$SNAPSHOT" --suppress-analytics test --no-pub --reporter expanded \
  test/identity_refund_navigation_test.dart
```

The source fixture installs synthetic database, storage, identity, wallet, feed, alert/sync and rejecting refund client/transport/factory overrides **before** `VacaApp(skipOnboarding: true)`. It covers the real shell/Identity B route and existing Wallet/About behavior, not a new isolated substitute route. Never invoke application `main()` or its scheduler; app-shell provisioning must remain the fixture's offline override. Linux widget fixtures use in-memory Drift and existing `libsqlite3.so.0`; native library availability is unverified here—do not install or symlink to fix it. The 800×1000 navigation viewport does not prove narrow-screen correctness. Preserve `test/about_vaca_screen_test.dart` as a later focused regression.

### T5 · final offline gate

After focused passes, the parent separately authorizes scoped analysis of all transferred production/test paths and an audited ordinary regression-suite list. **Always exclude `test/stellar_wallet_testnet_smoke_test.dart` explicitly from enumeration**, even with `VACA_STELLAR_TESTNET=0`: value1 funds a new account and creates a real Testnet USDC trustline. Do not use an unfiltered directory-wide `test` command. Audit any additional tests for opt-ins/side effects first; never construct real financial transports, invoke app startup/scheduler or use private configuration. Report new failures; do not alter authoritative source bytes or tooling under this preparation mandate.

Compare final production/test blobs and modes to the manifest; check all47 paths exactly once, no extra app delta and unchanged pubspec/lock/vendor/Android/build inputs. Review guide-only provenance deviations separately. Historical134 related passes, analyzer269 INFO/Drift warning and artifact20PASS/1fixtureFAIL are historical—not fresh checks or blanket expected-failure waivers.

## Narrow guide-provenance repairs for later children

Excluded historical evidence must not become broken relative links on main. Replace only references to omitted provenance with immutable source907 URLs, preserving anchors and historical wording. Pinned repository root: `https://github.com/DNO8/VACA/blob/907a4e3d770bd5b6c363a468f2ca496aa3b4ecfb/` (use `tree/907a4e3d770bd5b6c363a468f2ca496aa3b4ecfb/` for directories).

| App guide | Omitted repository-relative provenance targets to pin |
|---|---|
| `d1-vaquita-claim-lookup.md`, `d1-wallet-snapshot-fail-closed.md` | `odd/evidence/d1-flutter-local-setup-usage.md` (currently code-formatted relative reference) |
| `d1-refund-client.md` | `odd/evidence/d1-refund-offline-independent.md`, `odd/evidence/d1-refund-host-errors-independent.md`; code-formatted `design/system.md`, `design/d1-refund-responsive/`, `odd/evidence/d1-refund-responsive.json` |
| `d1-remainder-client.md` | `odd/evidence/d1-refund-offline-independent.md`, `odd/evidence/d1-refund-host-errors-independent.md` |
| `d1-android-artifact-delivery.md` | `odd/evidence/d1-host-errors-apk-delivery.md`, `odd/evidence/d1-refund-apk-delivery.md`, `odd/evidence/d1-refund-offline-independent.md`, `odd/tasks/d1-configured-apk-delivery.md`, `odd/docs/d1-testnet-acceptance-plan.md`, `odd/tasks/d1-client-android-toolchain.md` |

Keep sibling app-guide links local. `d1-wallet-preparation.md` and `d1-b-custody-profile.md` need no excluded-target repair. Do not fabricate public URLs for local phone/build receipts, `.tooling` configuration or unpublished task records: retain their explicit local/historical attribution. The artifact guide's older9840e9ff/c8667d9 chronology is not a fresh release455959305 assertion; preserve history rather than rewrite publication or installation claims. No remote URL checks were performed here; verify target existence from local source objects before later repair.

## Policy and handoff limits

Parent-supplied observations (not remotely rechecked here): target-main protection returned404 `Branch not protected`; main rules were `[]`; no workflows on main or in the selected delta. Do not invent required CI/check names, bypass review, or infer merge permission from absent protection. Parent refreshes exact main/head identities and actual checks at delivery. Native facade in this workspace reports RDDoff; plain `gentle-ai` is absent from PATH (exit127). Do not install, repair or enable it, and do not substitute a CLI result for native review disposition.

Self-review: S1–S3 preparation supports the selected feature-branch-chain only; no draft PR, commit, push, review disposition, merge, branch deletion, APK rebuild/re-sign, phone operation, backend activation or financial acceptance is claimed. Parent owns the draft tracker, all T1 completion decisions and subsequent execution/review gates.
