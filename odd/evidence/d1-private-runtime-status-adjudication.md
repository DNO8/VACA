## ADMIT — bounded T1 only

Admit the exact staged three-path candidate at tracking HEAD `0ee387b13cf3cb8e8560cf7a3fe6828e0de1ca71`, relative to source base `b21dd441ab6098405b5543f6d7fc325fc300adfa`, for **partial user item 2: factory composition of existing authenticated historical status**.

This is independent static adjudication of retained parent executions—not independent functional execution, full S1 acceptance, native approval, provider activation, or immutable-filesystem proof.

### Verdict per spec item

| Item | Verdict | Evidence / boundary |
|---|---|---|
| **S1** | **Met for the explicitly partial T1 scope.** Full private-provider/runtime activation remains out of scope and not implemented by this candidate. | `supabase/functions/d1-custody/runtime.ts:18–25` retains the base-only return and derives status solely from `client` plus `namespace/pool/now`; `base.status` wins. Existing issuance/reconciliation composition remains unchanged. Public runtime coverage at `supabase/tests/unit/custody-runtime.test.ts:188–231`. |
| **S2** | **Met for T1 scope and non-overlap.** | Staged diff contains only the owned runtime, existing runtime test, and own guide: **73 insertions, 1 deletion, 74 changed lines**. Baseline comparison found only the two intended existing payloads changed among 586 baseline Supabase/mobile files; the other **584 are byte-identical**. No peer financial helpers, SQL, mobile/D3, or `index.ts` changes. |
| **S3** | **Preservation met within T1; client integration out of scope.** | Mobile/D3 baseline bytes unchanged. Status receives no execution or availability capability, adds no financial fallback, and does not replace donor/beneficiary authentication. `supabase/docs/d1-private-runtime-status.md:9–19` accurately limits historical evidence and disclaims clients/refunds/full journeys. |

### Security and public-behavior findings

**No corroborated blocker found.**

- `runtime.ts:22–25` supplies the existing status dependency shape rather than introducing another API, parser, adapter, or financial execution path.
- `handler.ts:107–109` dispatches to the existing `issuanceStatusHttp`.
- `issuance-command.ts:40–43,57–75` retains status-specific action verification, exact envelope/scope/payload checks, bounded parsing, freshness, and signature verification.
- `issuance-status-http.ts:52–74` verifies the command before RPC, performs durable authorization through `d1_load_issuance_outcome`, preserves the exact admin-denial response, and returns absent outcome as `200 outcome_not_recorded / unverified`.
- `issuance-status-http.ts:76–97` confines saved-outcome validation to the existing read-only RPC allowlist. Its journal dependency cannot obtain the lifecycle signer, transport, reconciliation source, or availability fetcher.
- Tests at `custody-runtime.test.ts:188–231` assert exact HTTP bodies/status/headers, unchanged serialized stored state/counters, absent and saved outcomes, invalid signature/stale/wrong-scope/nonempty-payload rejection, durable admin denial, and explicit status override. Base-only status equivalence was added to the existing regression at line 130.

These establish the requested separation at the supplied-dependency factory boundary; they do not establish live database authorization enforcement or deployed-provider security.

### Checks actually performed

Executed **exactly two read-only `python3 - <<'PY' … PY` commands**, each with a 30-second timeout. No functional commands were executed. Their operations were:

1. `git --no-optional-locks` queries for HEAD, status, stage entries, staged payload blobs, staged diff, source-base tree/blobs; SHA-256 comparison of helper-bound files, payloads, and captures; readback of retained invocation/stdout/stderr files.
2. Raw `.git/index` SHA-256 comparison; retained-base blob/hash validation; original/static probe-body comparison; retained manifest/result readback; final status and 680-input hash comparison.

Observed:

- HEAD matches the specified tracking commit.
- Raw index SHA-256 matches **`3176a4ff2116bcaca792a9c63c22b80e3f0cc4d9bfb7f298bf634bc6b631629c`**. The separately printed SHA of textual `ls-files --stage` output is a different artifact, not an index mismatch.
- **680/680** helper-bound files match; **48/48** capture-file hashes match.
- All three working payloads and staged blobs match the evidence hashes.
- All **38** retained differential base files match both their recorded hashes and source-base Git blobs.
- Both static probes preserve the original probe body exactly except for the corresponding dynamic-to-static import line.
- Git status and all 680 bound hashes remain unchanged after inspection. The main evidence JSON is the disclosed untracked passive artifact.
- No writes, tests, probes, scratch directories, network, installations, builds, keys, SQL, or deployment actions performed.

### Parent execution evidence admitted

Read the whole feature document, including every Log entry, both evidence documents, and retained captures.

| Parent check | Retained observation |
|---|---|
| RED 37 | Exit **1**, **0 passed / 3 failed / 8 filtered**, **1.870353s**; actual route assertions fail `404` versus `200/401`, not setup/compile failure. |
| GREEN 38 | Exit **0**, **11 passed / 0 failed**, **2.254426s**; seven existing plus four new tests. |
| Serial Deno check | Exit **0**, **0.051288s**; retained stdout/stderr empty. |
| Dynamic comparison 39 | Both exit **1** before route execution: denied `runtime.ts` read. **Not equivalence or product-regression proof.** |
| Authorized correction 40 | Both exit **1** before route execution: denied transitive `handler.ts` read. **Not equivalence or product-regression proof.** |
| Human-authorized static replacement 41 | Base/current exit **0**, **0.311697s / 0.245622s**; exact stdout/stderr equality. Issue/reconcile/prepare return `400 invalid_request`; config returns existing `200` output; all four show zero effects. |

GREEN/check retained before/after manifests are equal with 166 entries; RED and static comparison manifests are equal with 165 entries. No GREEN/check replay occurred here.

### Advisories and proof limits

- The committed checkpoint’s pending-status wording is historical; the main JSON projects the later assessment. Neither constitutes native approval. The selected fields report native medium, escalated high/security item 2, RDD on, under-budget review not due, candidate unconsumed, outcome unknown.
- Failed comparisons 39/40 remain material retained failures of the original verification method. Replacement 41 resolves only the named sibling-route comparison.
- Full provider activation, clients, refund execution/accounting, and both journeys remain unverified and outside this admission.
- No additional regression-test proposal or execution requested: the staged tests already retain the bounded behavior checks. Parent owns packaging, commits, and metadata closure.

**Scratch directories created: none.**
