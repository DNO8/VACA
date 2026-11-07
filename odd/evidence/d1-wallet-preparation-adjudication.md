# ADMIT — task34 / T1 concurrency Risk:item4

**S1–S3 are met within the assigned same-service-instance boundary. No concrete blocker found.** This is independent static adjudication of retained **parent** execution evidence, not a claim that I executed tests, obtained native approval, or verified whole-D1 acceptance.

## Scope and identity verified

Inspected only `/home/danilo/projects/vaca-d1-t5b-proof`. Read the entire feature document, including all verbatim `## Log` entries, the helper manifest, checkpoint, staged diff, service, test fixture, guide, and relevant storage/result/gateway interfaces.

Two bounded Python/git inspection commands ran, each with a 30-second timeout; additional file reads were read-only. No functional, lint, build, network, scratch-copy, or Git mutation commands ran.

Verified:

- HEAD: `89c66a8a877591026b344d348dde61d027ce6025`.
- Source baseline referenced and inspected through this repository: `1cca808707b9b4ed8a7a2d7a49689b4c809d3b56`.
- Index SHA-256: `b32ecad110b70a8578e24a2d2ef0cf7998f37e6c36f12b4dce4efe4d5be547d7`.
- **All 614 current files** in `parent-inputs.json` matched their retained hashes.
- Exactly three staged paths; **196 insertions + 5 deletions = 201 changed lines**.
- Current and staged bytes both match the checkpoint payload:

| Path under `vaca_app/` | SHA-256 |
|---|---|
| `lib/features/wallet/domain/stellar_wallet_service.dart` | `1c6800bd2cd43cbfdfc3a35bfef23ec765ec3104b2d0b3bfeef1e74a2e654f7b` |
| `test/stellar_wallet_service_test.dart` | `21beb7092df8d2071c0bc40b037389cb0a58bcbc19c0ecf522f1c31dc857ac8b` |
| `docs/d1-wallet-preparation.md` | `8a15c25221faa81bb618e9c5565a20a393445e32875728a31e26dd228cadb1dc` |

Initial and final observed Git status list the same three staged paths, with no unstaged changes. The baseline-to-current changed-path list additionally contains only the two tracking documents. Other tracked dependencies therefore remain unchanged against that baseline.

## Retained parent execution evidence

Read the four captures’ exact invocation argv/environment/cwd, stdout, stderr, and result files. **All 24 capture-file hashes matched the checkpoint.** Each capture’s 421-entry before/after manifests were equal, with matching file hashes. This establishes retained manifest equality, not an immutable filesystem.

Captured commands, **not rerun here**, all use:

```text
timeout --signal=TERM --kill-after=5s 80s
/home/danilo/projects/vaca-d1-t5b-proof/.tooling/flutter/bin/flutter
--suppress-analytics
```

followed by:

- RED: `test --no-pub --reporter expanded test/stellar_wallet_service_test.dart`
- GREEN: the same test command plus `test/stellar_wallet_snapshot_test.dart`
- Both analyses: `analyze --no-pub lib/features/wallet/domain/stellar_wallet_service.dart test/stellar_wallet_service_test.dart`

All recorded cwd values are the authorized root’s `vaca_app`; the retained environment explicitly supplies its local Flutter/home/cache/temp locations and analytics suppression.

| Capture suffix | Observed retained result |
|---|---|
| `red-u0cgt531` | Exit **1**, **7.925075s**, **8 passed / 6 failed**. Failures show duplicate credential creation, duplicate preparation/trustline calls, and duplicate failed snapshots—not runner/setup failure. |
| `green-jgquqa44` | Exit **0**, **7.170127s**, **26 passed / 0 failed**: eight new cases, six existing service cases, twelve snapshot cases. Stderr empty. |
| `analyze-ny8xcylg` | Exit **1**, **27.832198s**. Exactly the retained `require_trailing_commas` finding at test **213:55**; stderr says `1 issue found.` |
| `analyze-193kxerx` | Exit **0**, **25.787712s**. `No issues found!`; stderr empty. |

I reversed only the final expectation’s comma/layout change **in memory**. Its reconstructed SHA-256 is:

`e8d9f40d1b75027c63c010bbd6af3ee40ba694d41c5466033521394a350c80c4`

This exactly matches GREEN’s retained test-input hash. GREEN’s retained service hash also equals the current production payload hash. Thus the supplied functional evidence applies to unchanged production and a test differing only by that comma/layout correction. **The old lint failure remains part of the evidence; GREEN was not replayed.**

## Verdict per spec item

### S1 — MET

Evidence: `vaca_app/lib/features/wallet/domain/stellar_wallet_service.dart:14–15,35–61,79–86`; `vaca_app/test/stellar_wallet_service_test.dart:113–237`.

- `create()` publishes and returns one shared in-flight future through `_creating`. The async storage boundary lets the assignment complete before subsequent ordinary overlapping calls proceed.
- Its `whenComplete` clears `_creating` on success or failure, including early storage failures. A failed attempt is not permanently cached.
- Both creation and funding reach the same `_prepareOnce(secret)` map. `putIfAbsent` shares preparation for the exact stored secret within this instance.
- The map entry is removed when preparation completes, on success or failure. Removal happens before completion is exposed through the returned `whenComplete` future; a later explicit call can start another attempt.
- There is no retry loop, added logging, credential export, new network mechanism, or new credential persistence path. The secret-keyed map is transient in-memory coordination, not additional durable credential storage.
- Byte comparison against the source baseline returned **true for the entire service suffix beginning at `_prepareForUsdc`** (`:88` onward). This includes legacy `claimAll()` and all subsequent method bodies. Existing imports are unchanged; no D3 coordinator was imported.
- Retained RED/GREEN substantiate the targeted race and its correction; existing service/claim and applicable snapshot regressions passed.

### S2 — MET

Evidence: service `:64–76`; tests `:165–193`.

`fund()` independently reads storage **before** consulting preparation coordination. Storage failure propagates. A null or empty seed returns exactly:

```text
stellar_wallet_missing
Primero crea una wallet testnet.
```

It neither joins `_creating` nor creates credentials. The controlled unsaved-write cases cover both null and empty storage and assert no snapshot, funding, trustline, or claim effects before creation is released. Both passed in retained RED and GREEN.

### S3 — MET as an explicit limitation

Evidence: service `:14–15,35–39,80–86`; guide `vaca_app/docs/d1-wallet-preparation.md:3–18`.

Coordination fields belong to each service instance. No global/process/account lock or claim sequencing was added. The guide expressly disclaims cross-instance/process coordination and serialization of claims against preparation. No cross-instance/process/account/claim-sequencing guarantee is admitted.

## Limitations

This admission covers **only T1’s requested concurrency unit and affected contracts**. It does not authenticate historical execution beyond the retained artifacts, establish immutable-FS provenance, grant native approval, consume an RDD candidate, or imply deployment/financial/whole-feature acceptance.

No new probes or regression-test files were authored or executed. The eight already-staged deterministic cases are the inspected durable regression evidence. No scratch directories were created.
