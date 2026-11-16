# Refund creation and funding observers: inert recovery

Two canonical observers are recovered byte-for-byte, without host wiring or new
permissions. Focused offline tests exercise both public exports through a real SDK
creation record and stop at absent/invalid refund evidence. This is not successful
end-to-end funding, provenance, or automatic-refund execution proof.

## Review path

1. Compare the two source files with the authorized read-only baseline below.
2. Inspect [the focused tests](../tests/unit/refund-creation-funding-recovery.test.ts),
   especially the trusted-denial/provider distinction and pending-read mutation.
3. Obtain parent-owned independent verification for Risk item 2 before treating
   this capability boundary as independently verified.

| Recovered file under `functions/d1-custody/` | Lines | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `refund-creation-observation.ts` | 138 | 8283 | `e83fc5ca97ca50ca6f9db00974dec3092084bc7fe6fb8f429f1410663194dc1d` |
| `refund-funding-observation.ts` | 111 | 8246 | `361fac1c4bcadeefaf1a3f2d82a28b168c6ee6a9b28bc016f35493a9d7be1fc7` |

Baseline: `/home/danilo/worktrees/vaca-d1-wsl-baseline/supabase/functions/d1-custody`.
Both comparisons passed; canonical source was not corrected to fit tests.

## Dependencies and scope

Before recovery, creation's direct local imports were already present: `handler`,
`discovery-source`, `pool-creation-eligibility`, `refund-account-observation`, and
`refund-claimable-observation`. Funding uses the recovered creation module plus
existing `handler`, `refund-account-observation`, `refund-liquid-principal`, and
`refund-fee-earmark-budget`. Its SDK import is pinned by the existing Deno config
and lockfile. The focused runner typechecked this dependency graph offline.

This advances T2i / S5–S7, S11, S14 only within additive isolated source recovery:
manual code is unchanged (S5), the baseline is read-only (S6), and read-only
observation composition is retained (S7/S11). No service principal, grant, SQL,
host/runtime/index integration, signing, submission, deployment, or activation
was added. Full service admission, automatic execution and integrated D1 delivery
remain outside this unit; S14 is not complete.

## Observed checks

Both public exports have eight test groups (16 passed, zero failed):

- Exact endpoint-specific 503 code/message/status and exact trusted
  `unauthorized_admin_wallet` 403; thrown transport/provider 403 is sanitized.
- Genuine SDK create-account envelope/result parsed by the production parser,
  typed history/account fixtures, correct RPC bindings and provider context.
- Null candidate and unknown state/account/candidate stops, exact call counts,
  no write RPCs, no claimable-balance provider call, and no retries.
- Original inherited RPC/provider receiver and methods, scope, clock and option
  limits captured before the first pending read; replacements never run.
- Accessors never invoked; original descriptors/data preserved, including hostile
  hidden properties; valid option endpoints and malformed inputs checked.
- Invalid/backwards clock rejection without caller-data mutation.

RED exited 1 with only two TS2307 missing-module errors: zero tests/assertions
executed. After recovery, GREEN/final exited 0 with typechecking and 16/16 tests
passing (reported test duration 2s). No test corrections or retries were needed.
The runner's typecheck notice is output, not an empty-stderr claim; raw tool output
is retained in the implementation transcript. No historical suite was replayed.

From `supabase/`, the authorized foreground command (30-second timeout) was:

```sh
env -i HOME=/var/tmp/vaca-d1-verify/rf-otc_wkox/home TMPDIR=/var/tmp/vaca-d1-verify/rf-otc_wkox/tmp DENO_DIR=/var/tmp/vaca-d1-verify/rf-otc_wkox/deno-cache NODE_COMPILE_CACHE=/var/tmp/vaca-d1-verify/rf-otc_wkox/node-cache NO_UPDATE_NOTIFIER=1 DENO_NO_UPDATE_CHECK=1 PATH=/usr/bin:/bin /var/tmp/vaca-d1-verify/rf-otc_wkox/deno test --cached-only --frozen --allow-env --deny-net tests/unit/refund-creation-funding-recovery.test.ts
```

## Limits and next step

The fixture does not fake an approved accounting DTO or complete asynchronous
financial success. Final creation/account binding, funding arithmetic composition,
claimable-balance invocation, final funding clock and successful frozen output are
not exercised by these early-stop tests. A valid local SDK record is not remote
ledger provenance or authentication. Independent verification and later bounded
executor/host work remain parent-owned; no broader recovery is implied.
