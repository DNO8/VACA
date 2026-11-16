# D1 allocation/preparation provenance verification

T4e2a passed bounded independent verification. It certifies allocation/request/preparation links and aggregate conservation, not issuance outcomes, an HTTP endpoint or financial readiness.

## Candidate and checks

Local source commit `85428c3c1e7d5da64daa5b36fe50a44e85a2bc14`, parent `821c90379e06f72c7050debf66ba7be0675698e0`: five files, 359 additions. Existing history source changed only by the additive `parseCapturedJSONB` export; removing that exact line produces byte-identical baseline source.

| Path under `supabase/` | SHA-256 |
| --- | --- |
| `functions/d1-custody/donor-allocation-projection.ts` | `08c5d5a16c01533024bd62e75896e7a61499ee5b7c26f3f8d07321bc52198fcd` |
| `functions/d1-custody/donor-captured-history.ts` | `b339e5cadc2ef80fa501d64bea7cbd05c7fb584b06b26eb6882ba842a3cbca71` |
| `tests/fixtures/donor-allocation.ts` | `2dc87a91d558d89ee9138309de040cd00ebaccfc1899afd285166798da562f16` |
| `tests/unit/donor-allocation-projection.test.ts` | `c9dafc5d6997d7d257a7a5c069c49b39e3deec58ba003f1e9761568301f3ad54` |
| `docs/d1-donor-allocation-projection.md` | `04d1fbefd7385b6b8cdeacfcc955bab5c368627e5da38f4fd4cf8fd8fe9eb642` |

- Writer `mwin4nli-6-binh`: genuine behavioral RED exit 1, 6 passed/49 failed. GREEN 55 passed; strengthened focused checks 58 passed/396 ms; final seam 102 passed/947 ms, including all 44 unchanged history tests. No correction retries. All foreground commands had explicit 30-second timeouts.
- First verifier `mwinddjd-7-kpgt` stopped with zero preparations, scratch directories or tests. It interpreted the packaged Git preparer as mandatory; that preparer would copy every tracked file and reachable history, conflicting with the authorized public-only payload. No guard denial or candidate defect occurred. Candidate hashes, baseline/export comparison and original status were checked read-only.
- Parent inspected the packaged verifier role: the Git helper is conditional on Git-dependent checks, while metadata-independent probes permit a smaller complete public payload. Parent pinned the exact candidate in the local source commit; no source correction occurred. Same-verifier continuation `mwini9t8-8-a0iw` confirmed the distinction against its actual injected role and used the existing permission. No role override, new executor, broader copy or correction-budget reset.
- Same verifier: one selective preparation, one independent execution, zero corrections; exit 0, 6 passed/0 failed, 837 ms, dependency-graph typechecking completed. Stderr contains the Check notice.
- Parent adopted the exact executed probe and ran it: exit 0, 6 passed/0 failed, 112 expected rejections, getter count 0, 771 ms. Stderr contains the Check notice.
- Source packaging job-5 exit 0: exact five-file staging, whitespace check, empty index, 13 protected paths and unrelated status unchanged. Source was committed pending verification, not presented as verified at that time. Ignored fixture/guide were explicitly staged without modifying ignore rules.
- Native exact source range: medium, 5 paths/359 lines, `reviewDue:false`, `under_budget`, unknown/unconsumed. Earlier ambient assessment was unassessable due untracked declaration; explicit security item 2 required the independent checks. Neither is native approval.

## Independently checked boundary

S4/S14 are met only within T4e2a. Actual retained 014 / 20261011060218, 015 and 054 schemas were inspected; no SQL was executed. Positive fixtures use genuine SDK memo hashes and complete nested reservation/allocation receipts, not placeholder evidence.

Six groups cover native/issued payments, empty allocations, one stroop, full-gross split and 100 allocations; sorted identities and exact amounts; detached recursive freezing; raw unproved outcome retention without an issuance claim; PostgreSQL offset/millisecond timestamp equivalence; every preparation/receipt leaf; coherent request substitutions and separate row/parent bindings; original SDK memo; exact aggregate and gross limits; omitted/duplicate/101 allocations; missing parents; hostile getters, duplicate decoded keys and unsafe/fractional numbers. Existing history still retains missing-parent captures that the stricter allocation layer rejects.

All 112 expected rejections assert exact `CustodyError`, status 503, code/message `donor_payment_unavailable`, unchanged recursive descriptors and digest, including stored counters. Getter invocation count is zero.

## Preservation, artifacts and limits

Independent preservation exit 0: 40 public files matched candidate-commit bytes before copying; 2,195 runtime/cache regular files matched originals; 2,235 original hashes and all 40 public copies remained unchanged. Original Git status/HEAD remained unchanged. Deno binary matched historical pin `8b254e08be2565f608a06bfde3f62f3aabbf8994712f0078c7a7f24bc8c46676`.

Exact adopted 105-line probe: [`../../supabase/tests/unit/donor-allocation-independent-probe.test.ts`](../../supabase/tests/unit/donor-allocation-independent-probe.test.ts), SHA-256 `8d3ecbbffd0f7a0afdfff41def0bc0b238254f56261e731c2d19680c608986db`.

Scratch `/var/tmp/vaca-d1-verify/ap-gxs7w4pf` retains probe stdout/stderr/exit, source/input pins, original status and preservation report. Parent receipts: `/var/tmp/vaca-d1-verify/dc-b_ab7d77/parent-adopt-allocation` and `parent-allocation-source-commit`. Scratch is not a portable repository artifact or permanence guarantee; nothing was deleted.

No parent writes by the verifier, Git mutation, network, installation, SQL execution, provider calls, signing or funds. No historical passing-suite replay. No separate full-project build: Deno checked the exercised dependency graph. Issuance-chain/outcome certification, host/public DTO, current CB, eligibility, settlement, endpoint latency, deployment compatibility and integrated D1 remain unverified and outside this unit.

Risk: item 2 — ownership, receipt and allocation-provenance boundary; independently verified within the stated scope. No publication or activation.
