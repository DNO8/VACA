# D1 public anon headers — independent source/static evidence

Verifier `mwcun4qg-1-oo7r` reported **S6, S9 and S10 MET in source/documentation scope**, with no concrete blocker for T11. This records the verifier's returned evidence, not application tests run by this documentation writer. Source comparison base: `b305a83280b1c59e1fbbe1ced745a807473ce704`.

## Observed scope and result

The verifier read the whole feature document, delivery guide and three full transport files. Each transport's base diff contained only one constructor header-map replacement plus its comment: the same public API key is used for `apikey` and `Authorization: Bearer`, retaining JSON content type. Remaining bytes, transport behavior, signed proofs, timers, journal and refund scope were unchanged. No session flow or privileged credentials were introduced by these substitutions; this is not a credential-absence or security verdict.

| Source under `vaca_app/lib/features/refund/data/` | Verifier SHA256 |
|---|---|
| `refund_http_client.dart` | `f2669ee1066fa7672989c3fb5ce47d6a08f6869848a47de1cf7da25914e8d704` |
| `refund_remainder_http_client.dart` | `b55cbfc0212e2717f388f55fac25bed95189db359549a0080c759ef292c29020` |
| `refund_remainder_status_client.dart` | `7967f84a400666c79a58cc3deab53bf2d98b596817419211579c4e64b101d113` |

## Returned command evidence

The verifier reported three Bash calls, each exit **0**, with no stderr. The calls were:

```bash
git status --short; git diff b305a83280b1c59e1fbbe1ced745a807473ce704 -- vaca_app/lib/features/refund/data/refund_http_client.dart vaca_app/lib/features/refund/data/refund_remainder_http_client.dart vaca_app/lib/features/refund/data/refund_remainder_status_client.dart; sha256sum vaca_app/lib/features/refund/data/refund_http_client.dart vaca_app/lib/features/refund/data/refund_remainder_http_client.dart vaca_app/lib/features/refund/data/refund_remainder_status_client.dart
```

```bash
git diff b305a83280b1c59e1fbbe1ced745a807473ce704 -- vaca_app/docs/d1-android-artifact-delivery.md; git diff --check b305a83280b1c59e1fbbe1ced745a807473ce704 -- vaca_app/lib/features/refund/data/refund_http_client.dart vaca_app/lib/features/refund/data/refund_remainder_http_client.dart vaca_app/lib/features/refund/data/refund_remainder_status_client.dart odd/tasks/d1-client-android-toolchain.md vaca_app/docs/d1-android-artifact-delivery.md
```

```bash
git diff --name-only b305a83280b1c59e1fbbe1ced745a807473ce704 -- vaca_app/lib; sha256sum vaca_app/lib/features/refund/data/refund_http_client.dart vaca_app/lib/features/refund/data/refund_remainder_http_client.dart vaca_app/lib/features/refund/data/refund_remainder_status_client.dart; git status --short
```

Initial/final status was identical and hashes were stable. The verifier wrote nothing, created no scratch copies and ran zero application commands, tests or probes. Generic execution-scratch verification was unavailable within the repository-only grant; static inspection completed. Separately, the parent reported its pre-verifier structural self-check exited 0 for the exact header-only substitutions.

## Limits and disposition

- T11 is complete **SOURCE/STATIC ONLY**, committed locally as `c72193d7ffa1c6103d22916590347cf4fba45ed1` (six scoped paths,71 additions/8 deletions; not pushed). The existing old APK **does not contain this source change**. No new build, analyzer, stopped suite, phone, backend or financial operation ran in this verification.
- The actual legacy anon/public JWT value remains missing; T12 remains blocked. Configured runtime/key integration is future work. No compiled/live, secret-absence, security or financial acceptance is established; historical proof gaps remain unchanged.
- Native pending-diff ASSESS was high solely from **item 2: authentication header** agent escalation, not historical replacement-review items 48/56. Native risk was unassessable with untracked state, candidate NULL and outcome unknown. There was no approval, reviewDue continuation or START.

Feature record: [T11 and L39](../tasks/d1-client-android-toolchain.md). Parent subsequently repeated the reported source SHA256 command once: all three hashes matched; scoped diff-check exited0. The six-path source/static unit was committed locally as recorded above. Committed-range ASSESS remained unassessable/untracked/candidate NULL/outcome unknown, not approval or a reviewDue/native continuation. No new verifier, START, functional run or push followed.
