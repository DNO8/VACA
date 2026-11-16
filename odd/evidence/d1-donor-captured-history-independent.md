# D1 captured donor history verification

T4e1 passed bounded independent verification. This establishes a pure historical payment projection, not a complete donor endpoint or operational D1 acceptance.

## Candidate

Local source commit `b7ad8a68ee5c33ea61e8ab4c0b2cf17731922af5`, parent `1ccf7a5a9bda0bb4f977de688c502d0055937f96`: three files, 597 additions. Coverage replay, lossless parsing and SDK payment validation are one coherent unit with its tests and guide. No publication.

| Path under `supabase/` | SHA-256 |
| --- | --- |
| `functions/d1-custody/donor-captured-history.ts` | `48cf6e9f423c8fb9fc27d67e15e9344817ddd5770ae3d4b48ac71f841ac39456` |
| `tests/unit/donor-captured-history.test.ts` | `c428882c5604eac716943b939a9d3f91aff4eeb892550394b5e8d91d3951a328` |
| `docs/d1-donor-captured-history.md` | `bb19334827c31213ef62eb29c15142313f327831fa23f60bb9eaafd141ecd642` |

## Checks and retained failures

1. Writer `mwimfxpt-3-4zur`: RED exit 1/TS2307 missing module, zero assertions. First implementation check exit 1, 40 passed/1 failed: allocation-retention test compared JSON key order. One test-only structural comparison correction, no assertion removal or production guard change, yielded 41 passed. Strengthened independent-tail and credit-selection tests yielded 44 passed. Authorized seam with the unchanged donor-command tests: exit 0, 108 passed.
2. Independent `mwimprjg-4-ldo5`: one successful selective preparation, 41 public source inputs and copied pinned runtime/cache. Initial execution exit 1: 6 groups passed/1 failed, 342 ms, typecheck succeeded. Reversed page ordering made its invalid-ordinal mutation a no-op. One probe-only correction changed that mutation to duplicate ordinal 2. Only `--filter 'page/row'` reran: exit 0, 1 passed/6 filtered, 107 ms. No passing-suite replay or candidate edits. Combined independent evidence covers all seven groups and 61 distinct expected rejections.
3. Parent adopted exact corrected 131-line probe and executed it from the owned repository: exit 0, 7 passed/0 failed, 61 expected rejections, 364 ms. Stderr contains the typecheck notice.
4. Independent preservation: 2,232 original hashes, all 41 public scratch copies, original Git status and HEAD unchanged. Candidate hashes matched the supplied pins. No Git history/private configuration copied; no SQL execution.
5. Source packaging job-3 exit 0: exact three-file staging, whitespace check, empty final index, 14 protected files and unrelated status unchanged. Existing ignored guide was staged explicitly, without ignore changes.
6. Exact committed-range native assessment: medium, 3 paths/597 lines, `reviewDue:false`, `under_budget`, unknown/unconsumed. Earlier ambient assessment was unassessable due untracked declaration; explicit security item 2 independently required the verification above. Neither assessment is approval.

All tests ran offline/cached/frozen with explicit foreground timeouts. No timeout, runtime installation, remote operation or financial execution occurred.

## Proven scope

S4/S14 are met only within T4e1. Independent positive cases cover native/issued assets and grouped/separate journal pages, including multi-record pages and reversed stored-row ordering. SDK-derived original hash, operation ID, donor, economics, confirmation time and exact +300-second deadline were checked.

Rejection coverage includes scope/ownership substitutions; unsafe/fractional JSON numbers before conversion; extreme exponents, duplicate decoded keys and malformed strings; missing/duplicate/substituted records; page ordinals/counts/cursors/checkpoints/anchors/empty tails; malformed SDK results; operating-credit substitution and exclusion; getters/hooks/symbols/hidden fields/foreign prototypes/sparse arrays/cycles; duplicate allocations and oversize capture. Exact failures are 503 `donor_payment_unavailable`, including null captures. Input hashes/descriptors and zero getter/coercion counters were asserted. Results are deeply frozen and detached; raw allocations are retained.

**Not established:** allocation/preparation/outcome provenance, authenticated host wiring, full public DTO, live consensus/freshness, current CB availability, refund eligibility or settlement, automatic executor, web/app integration or financial acceptance. Coverage booleans alone were not treated as proof. No fake administrator/RPC facade or journal write fallback was introduced.

## Regression and receipts

Exact adopted probe: [`../../supabase/tests/unit/donor-captured-history-independent-probe.test.ts`](../../supabase/tests/unit/donor-captured-history-independent-probe.test.ts), SHA-256 `ea79bdf5ff1bbab5216cbfce50dfc60c11fc0cafc8972f488316c950b5513580`.

Independent scratch `/var/tmp/vaca-d1-verify/ch-5el_k259` retains initial/corrected source and stdout/stderr/exit records, input pins, preservation and Git-status records. Parent adoption receipts: `/var/tmp/vaca-d1-verify/dc-b_ab7d77/parent-adopt-captured-history`; source packaging receipts: `parent-history-source-commit` under the same runner. Local scratch is not a portable repository artifact or a permanence guarantee; no cleanup occurred.

Risk: item 2 — privacy/ownership, numeric validation and historical evidence provenance. Independent checks passed within the stated boundary; deployment remains separate.
