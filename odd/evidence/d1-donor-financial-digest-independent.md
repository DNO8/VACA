# Donor financial digest: scoped independent evidence

Verifier `mwj5xj6o-5-j9dn` reported a scoped **PASS** for T4e2c, S4/S14: private digest consistency only. This is **not an all-checks-green result**: the supplemental runtime-copy preservation assertion failed and remains retained. The probe is archived exactly, without a parent runtime replay or source changes; this does not complete the broader S4/S14 backend, web or app obligations.

## Candidate and exact adoption

Source commit: `d155dd916c34107fae3955443b3f8f3e59f76a78`. Canonical pins from `odd/tasks/d1-automatic-refunds.md`, L110:

| Repository path | Lines | SHA-256 |
| --- | ---: | --- |
| `supabase/functions/d1-custody/donor-financial-digest.ts` | 99 | `3d6658f08f7da49367d61ee8cf0fdf86afc260b681bc18c4fa395ef794adaf6a` |
| `supabase/tests/unit/donor-financial-digest.test.ts` | 174 | `3218b1a6ef08e03599abc84b4b5614094dd0f5c713fbf1ec9e0f6b426fc8c61b` |
| `supabase/tests/fixtures/donor-financial-jsonb-vectors.json` | 43 | `2bcce5ea9cb22232ca08019f1e9427203f069fced495f31de484c1e018322c01` |
| `supabase/docs/d1-donor-financial-digest.md` | 54 | `11e0ddb33f5294edf4e777ede0572199d70d4e92ccb46d990bc5350cb818eee8` |

Archived probe: `supabase/tests/unit/donor-financial-digest-independent-probe.test.ts`, 61 lines, SHA-256 `bb31aeaaeb328c3b5660c73178a2c238157132478b83e470cd4848d454706667`. Source: `/var/tmp/vaca-d1-verify/fv-ay3Tca/work/` plus that repository-relative path. Imports require no adaptation. Adoption is limited to byte/hash, import-resolution, whitespace, source-pin and working-tree preservation checks; no passing tests are replayed.

## Historical execution and proof

Executed once by the verifier from `/var/tmp/vaca-d1-verify/fv-ay3Tca/work` (not a new execution during adoption):

```sh
env -i PATH=/usr/bin:/bin HOME=/var/tmp/vaca-d1-verify/fv-ay3Tca/home TMPDIR=/var/tmp/vaca-d1-verify/fv-ay3Tca/tmp DENO_DIR=/var/tmp/vaca-d1-verify/fv-ay3Tca/deno-cache NODE_COMPILE_CACHE=/var/tmp/vaca-d1-verify/fv-ay3Tca/node-cache NO_UPDATE_NOTIFIER=1 DENO_NO_UPDATE_CHECK=1 timeout 25s /var/tmp/vaca-d1-verify/fv-ay3Tca/deno test --config supabase/deno.json --cached-only --frozen --allow-env --deny-net supabase/tests/unit/donor-financial-digest-independent-probe.test.ts
```

Exit 0; 5 passed, 0 failed, approximately 2 seconds. Stderr contains the Deno `Check` notice, not empty output. One preparation, zero verifier corrections. Public receipts `probe.stdout`, `probe.stderr`, `probe.exit` and `preservation.json` were read during adoption; `pins.json`, `copies.json` and `git-before.json` also remain under `/var/tmp/vaca-d1-verify/fv-ay3Tca/` as verifier receipts.

- 66 input-hash-preserving rejections, each exact status 503 with code and message `donor_payment_unavailable`; three separate getter rejections, zero invocations and preserved descriptors.
- Native/issued assets, multiple requests and snapshots, zero observations, four PostgreSQL vectors, escaped top-level snapshot key, nested decoys and numeric lexemes.
- Exact keys (including the `account,anchor` alias rejection), identity, ancestry, duplicates and malformed unused rows; 1,048,576 multibyte UTF-8 bytes accepted and the next byte refused; deeply frozen, detached results.
- Verifier preservation receipt: 2,246 original input hashes, 41 public copies and Git HEAD/status/index preserved.

## Retained failures and PostgreSQL provenance

The supplemental assertion that **all runtime copies were unchanged exited 1**: seven Deno scratch analysis/check-cache DB/WAL/SHM files changed. The subsequent diagnosis exited 0, isolating those seven and confirming 2,198 unchanged runtime copies; all originals remained unchanged. This failure was not fixed, waived or replayed. No cleanup was performed; scratch remains retained.

Read-only inspection of `/var/tmp/vaca-d1-verify/df-EVW14m/pg-receipts.json` records eight historical exits 0 with empty stderr. The verifier matched four committed vector byte strings/hashes against those actual PostgreSQL serialization receipts. PostgreSQL 17.7 and PID 11110 stopped/gone are historical writer evidence, not a fresh liveness claim. No SQL or database-state inspection was performed for adoption.

Canonical writer history remains RED 23 PASS / 10 FAIL, then GREEN 33 PASS. Later key-alias hardening was RED 0 PASS / 1 FAIL / 32 filtered, one correction, then targeted GREEN 1 PASS / 32 filtered. No full final writer-suite pass is claimed.

## Limits and authority

This private unit proves digest consistency, not economics, freshness, history coverage, credit, commitments, signatures, submission, outcomes, a public DTO, host integration, automatic executor readiness or human financial acceptance. Native high Risk 2 / native medium 370 lines / not due / unknown / unconsumed is not approval. No push, deployment, grants, activation or funds are authorized or performed by this adoption. Existing dirty paths, index, HEAD and tracker remain outside the edit scope.
