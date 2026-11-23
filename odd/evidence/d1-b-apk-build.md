# Build the fixed B Testnet APK

This successor builds one new artifact from verified app source
`d7e24f3e866833721ad6003ca1c86e825cfab0f2`. It does not invoke or import the
retired B3 runner, change historical globals, reopen old attempts, or install.
The intended identity is `cl.vaca.app.dev`, ARM64 devDebug, `0.1.0` / code **2**.

## Before running a real phase

- Complete source verification and independent verification of these controls.
- Confirm current parent-owned authority for the existing development signer
  and four-field public client configuration. Historical receipts are evidence,
  not a new grant. No financial signing key is an input.
- Keep the fixed new context absent; do not delete it to retry a failed phase.
- Retain the accepted public source bundle under
  `.tooling/d1-b-apk-inputs-d7e24f3/`. Its 260 Git-selected files use the previous
  public allowlist, not a worktree overlay. Manifest SHA-256:
  `5fb1a2f10f8069877e58d8536b52c865f2a9febcd313f3b5d865ccb19f1c64b4`.
  Archive SHA-256:
  `e562b15d3586bf4d62a737443c11dc43639d8d9e6088d33fe925d5837dbedc8c`.

## Three one-shot phases

Run from the feature repository using the parent background runner:

```sh
python3 -B odd/evidence/d1-b-apk-build.py seed
python3 -B odd/evidence/d1-b-apk-build.py prepare --seed-sha <accepted-seed-sha256>
python3 -B odd/evidence/d1-b-apk-build.py build --prepared-sha <accepted-prepare-sha256>
```

Observe each result and bind its receipt before the next command. Do not batch
all phases. The fixed context is `.tooling/d1-b-apk-d7e24f3-code2/`.

- **seed:** verifies/copies the 47,284 admitted public cache records plus six
  pinned `gen_snapshot` binaries into fresh owned caches; admits the new source;
  performs offline, lock-enforced package preparation; freezes source and
  controls. No private inputs. Requires 9 GiB free; total deadline 600 seconds,
  package subprocess 180 seconds. No historical cache is mounted writable.
- **prepare:** claims `prepare-invocation.json` before input access. Validates
  exact regular, unshared config/signer descriptors, configuration hash/schema,
  and the public certificate; protects identity through descriptor lifetime and
  post-use checks. Deadline 90 seconds; certificate subprocess 30 seconds.
- **build:** requires the accepted preparation hash, claims a build invocation,
  and runs once with the unchanged policy/launcher. Child deadline 1,800 seconds,
  overall 1,900; combined captured output at most 1 MiB. `/b3` is the retained
  **sandbox namespace**, not a historical host context. Keep
  `kotlin.project.persistent.dir=/b3/state/kotlin`.

The expected certificate SHA-256 remains
`3fee367d1c6a658958e18ef44e6c532cbaba163aadbca3bf7b6d9e06b545b2da`.
Failure, timeout, uncertain execution, changed inputs, or an existing attempt
stops that phase. Preserve its exact output and receipt; never reset markers.

## Verification and delivery

```sh
python3 -B odd/evidence/d1-b-apk-build-test.py
python3 -B odd/evidence/d1-b-apk-control-independent-test.py
```

These tests use synthetic files and do not build or sign. Independent control
verification is separate. After an actual build, independently audit the exact
APK hash, package/code, ARM64 engine, certificate and source/config provenance.
Publish only after that audit. Source publication, artifact publication, phone
installation and financial acceptance remain distinct.
