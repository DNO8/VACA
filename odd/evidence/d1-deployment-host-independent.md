# D1 deployment-host verification

**Scoped local PASS for source candidate `3ec680c204a4ca9d3a639a1632487b3bb152d3a3`.** No deployment, activation, live financial acceptance or native approval is implied. Existing `index.ts`, runtime contracts and financial engines were not changed.

## Observed evidence

| Stage | Result |
|---|---|
| Behavioral RED | Current preparation-only composition:0PASS/2FAIL, `/issue`404 instead of400 and donor503 instead of retained404. |
| Parent GREEN |41 focused/regression tests passed; proposed entrypoint graph compiled with exit0. |
| Independent first batch |2PASS;45 exact v4 comparisons of status/body/all headers, matching membership RPC counts and zero provider/signer effects. Configuration omissions and disabled/malformed tick isolation passed. Entrypoint graph compiled0. |
| Independent bounded completion | Five omitted probes passed using the same successful scratch preparation. No candidate changes, no rerun of passed probes. S1/S2 within T2 met; T1/T3–T7 out of scope. |
| Parent adoption |11PASS/0FAIL: exact seven independent probes plus four focused host cases, exit0. All105 recorded input hashes unchanged. |

The five completion probes cover genuine signed fresh preflight through discovery/history completion, creation operating-credit receipt, matching account, coordinator/fee commitment, financial authorization, lazy signing and one fixture POST; genuinely generated attempt replay; SDK-observed outcome replay; wrong-pool signer rejection before signed journal/claim/POST; successful manual forwarding with request-clock+60 expiry and fee200 for two operations; actual startup503 via intercepted `Deno.serve` without a listener. One test covers both fresh issuance and attempt replay.

**Limits:** positive preflight uses genuinely parsed, populated history, empty completion pages and an existing unsigned journal. It is not first-ever backfill or first-time sequence reservation proof. Manual ACK remains `unknown`, not transaction inclusion. All transport is isolated fixtures, not live Testnet.

## Provenance and failures retained

- Verifiers: `mwjmhlga-1h-ykf0`, bounded continuation `mwjmmhky-1i-s2er`; one successful preparation reused at `/tmp/d1v.327YWm`.107 source/input hashes and original HEAD/status preserved.
- Fresh captured v4 `index.js` SHA256 `5275452af36aa8e6990123d42bc7b2ec0ed4d996b07d1187bbaa0829dcf4b6df`. Parent matched the retained readable host suffix byte-for-byte to it.
- Parent failures: SDK seed fixture type, host RPC type, duplicate-spread fixture type; corrected without bypassing typechecking. Actual RED is reported separately above.
- Independent first batch: missing-await probe type error, zero tests, then2PASS. Completion: probe typing failure/zero tests;2PASS3FAIL→1PASS2FAIL→2PASS0FAIL. Corrections were fixture JSON serialization, creation-ledger reparsing and matching existing ACK `unknown`; no production change or weakened signing/fee/expiry assertions. No passed test rerun by the verifier.
- Native committed assessment:5paths337lines, native medium/not-due (`under_budget`), unknown/unconsumed; explicit Risk2 requires independent verification. This is not native approval. Earlier workspace assessment could not select untracked scope.

## Durable probes and replay

- `supabase/tests/unit/deployment-completion-regression.test.ts`: SHA256 `4c5008a041175003bd6caf3e10d0f764f5897a1aff8497697fe6646f41a71e1e`.
- `supabase/tests/probes/deployment-live-parity.ts`: SHA256 `07e10f55cba0350827b677434f7b4ac24390d95701da53a7021a92f332850226`. Exact source retained at a non-auto-discovered path because it needs the ignored live snapshot. Do not silently skip it or claim a new snapshot was checked.
- Parent command from `supabase/`: pinned Deno2.6.8 `test --cached-only --frozen --allow-env --deny-net tests/unit/deployment-completion-regression.test.ts tests/unit/custody-deployment-host.test.ts tests/probes/deployment-live-parity.ts`, clean environment and local cache.
- Receipts: `.tooling/d1-backend/tmp/recording-host-red-buffer-16xmc5qp`, `recording-host-green-fixture-sgyh27o5`, `recording-host-candidate-zgz7d04k`, `recording-host-adopted-vlxqpc1v`; raw stdout/stderr/exit and input hashes retained locally. Successful stderr contains Deno Check notices, not an empty-stderr claim.

Risk: item2 (authenticated composition/separate signing authority); item5 (explicit deployment entrypoint, not yet deployed). Continue through [recording readiness](../tasks/d1-recording-readiness.md) with one agreed backend publisher and preserved peer ownership.
