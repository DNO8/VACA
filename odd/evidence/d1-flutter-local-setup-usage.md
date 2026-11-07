# Project-local Flutter runner

This is a local D1 verification prerequisite, not a system installation, mobile release, or whole-D1 acceptance. Use the observed results in `d1-flutter-local-setup.json`; an invocation below is not itself a passing result.

## Pinned environment

- Target: `/home/danilo/projects/vaca-d1-t5b-proof/.tooling/flutter` (ignored).
- Replacement pin: Flutter **3.41.9**, Dart **3.11.5**, framework revision `00b0c91f06209d9e4a41f71b7a512d6eb3b9c694`.
- Official archive SHA-256: `cf2631dde02570733921a530f47a96abe896b5e334682d2743c29530ea88bb2e`.
- Preserve `vaca_app/pubspec.yaml` and `pubspec.lock`. SDK minimum constraints alone do not establish compatibility with Flutter's exact test dependency pins.
- The previous 3.41.0 SDK and all failed-attempt captures are retained under owned, ignored `supabase/.temp/flutter-setup-*` directories. Do not delete or overwrite them as part of a test.

## Process-local commands

Run in Bash; these variables do not alter global PATH, shell profiles, or the system environment. The runner's HOME/cache/temp directories are inside the authorized SDK target. Flutter also generates ignored build/package metadata inside the owned `vaca_app` directory; no tracked mobile source or lockfile changes are permitted.

```bash
cd /home/danilo/projects/vaca-d1-t5b-proof/vaca_app
sdk=/home/danilo/projects/vaca-d1-t5b-proof/.tooling/flutter
runner=(env -i PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 CI=true BOT=true
  HOME="$sdk/.local-home" PUB_CACHE="$sdk/.pub-cache"
  XDG_CACHE_HOME="$sdk/.local-cache" XDG_CONFIG_HOME="$sdk/.local-config"
  XDG_DATA_HOME="$sdk/.local-data" XDG_STATE_HOME="$sdk/.local-state"
  TMPDIR="$sdk/.local-tmp" FLUTTER_ROOT="$sdk" GIT_CONFIG_NOSYSTEM=1
  FLUTTER_SUPPRESS_ANALYTICS=true DART_SUPPRESS_ANALYTICS=true
  FLUTTER_SKIP_WELCOME_SCREEN=true)
# Each command is a separate bounded operation, not a retry loop.
timeout --signal=TERM --kill-after=5s 80s "${runner[@]}" \
  "$sdk/bin/flutter" --suppress-analytics --version --machine
timeout --signal=TERM --kill-after=5s 80s "${runner[@]}" \
  "$sdk/bin/flutter" --suppress-analytics pub get --enforce-lockfile
timeout --signal=TERM --kill-after=5s 80s "${runner[@]}" \
  "$sdk/bin/flutter" --suppress-analytics test --no-pub --reporter expanded \
  test/stellar_wallet_service_test.dart
```

The existing six-test wallet service suite uses in-memory storage and a fake gateway; real SDK keypair construction is local computation. Do **not** substitute the live Testnet smoke test, fund/sign/submit transactions, activate providers, install system packages, or publish/deploy anything.

Preserve each failure and exact stdout/stderr/exit. A timeout is a failed check, not permission to resume, retry, remove `--enforce-lockfile`, or raise the bound. Failed download operations remain failures even when a separately authorized resume later verifies the archive.
