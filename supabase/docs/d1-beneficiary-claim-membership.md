# Beneficiary-claim membership

> Parent source adoption under S17 from peer commit `b8553173d1821b7d6acc541643f98055e99e0cb2`.
> Tests in this guide are retained definitions and historical peer-reported
> results only (048–054 scope). No parent tests, SQL application or independent
> verification ran during adoption. Compatibility with parent055 is unverified.
> Commands below are reference material, not permission to execute under S15.

Migration [039](../migrations/039_d1_beneficiary_claims.sql) retains positive beneficiary-claim evidence bound to the original payment and successful issuance. Remainder accounting consumes that evidence; this journal is **not SDK verification, settlement, current availability or spending authority**.

## Public contract

The functions are `SECURITY DEFINER`, use an empty search path, and grant execution only to `service_role`. That database grant does not authenticate an end-user wallet or authorize an automatic financial action.

| RPC | Contract |
| --- | --- |
| `d1_load_beneficiary_claim(uuid,text)` | Returns the original scope and nullable claim after the issuance/history readers admit the actor. |
| `d1_record_beneficiary_claim(uuid,text,jsonb)` | Independently requires a current administrator, including for exact replay. Validates and retains one acquisition, its original actor and the SHA-256 of PostgreSQL JSONB text. Conflicting content is rejected. |
| `d1_list_beneficiary_claim_set(uuid,text)` | Returns a history-bound, request-ordered set and its digest; limited to 1,000 receipts and 33,554,432 receipt bytes. |

The record RPC holds an `admin_wallets` share lock until transaction completion. This explicit check is necessary because later migrations admit scoped service readers through the underlying loaders. **Read admission never authorizes this writer or its replay.** Automatic write admission remains a separate backend integration decision, not administrator impersonation.

The private table has RLS, no direct API-role access, one receipt per request, and unique claimable-balance and transaction/operation identities. There is no update, deletion, release, retry or owner-retirement RPC.

## Evidence and errors

A new receipt must match retained original request/payment/issuance evidence: donor, beneficiary, asset, principal, operation/hash, original authorizer, attempt, outcome, claimable balance and original confirmation-plus-300-second deadline. The incoming payment and successful issuance must exist in retained history. Claim inclusion must precede that original deadline and match the supplied anchor and raw/parsed objects.

Claimed principal is positive and no greater than original gross. Gross minus that principal is the remainder; fees stay separate. Claiming one unit of a two-unit payment does not settle both units. Missing evidence, an empty response, 404 or timeout is not a zero claim or permission to refund.

SQL checks bounded shapes, amounts, canonical encoding and membership. Opaque fixture XDR and DTO agreement do not establish signatures, consensus, provider authenticity or actual claim validity. Dependent SDK validation is still required. A supplied beneficiary transaction need not already exist in the pool history; if present, its retained observation must agree.

| SQLSTATE | Error |
| --- | --- |
| `42501` | `unauthorized_admin_wallet` for a writer actor without current admin membership, including exact replay |
| `22023` | `invalid_beneficiary_claim` for malformed acquisition |
| `23505` | `beneficiary_claim_conflict` for contradictory evidence or changed replay; native uniqueness errors also use this state |
| `25000` | `beneficiary_claim_isolation_required` for first insertion outside read committed |
| `54000` | `beneficiary_claim_set_limit` for an oversized set |

Exact replay preserves the original acquisition and actor. Rejection must preserve stored public receipts, sequence ownership, history and counters.

## Local verification

Use the existing isolated toolchain and owned disposable PostgreSQL, never a live database:

```sh
D1_TOOL_ROOT=/absolute/installed/toolchain node --test supabase/tests/integration/beneficiary-claim-membership.test.cjs
D1_TOOL_ROOT=/absolute/installed/toolchain D1_CURRENT_ADMISSIONS=1 node --test supabase/tests/integration/beneficiary-claim-membership.test.cjs
```

The default fixture covers retained migrations and 015–038 plus 039. The second mode also applies the actual 048–054 admissions and asserts that an admitted nonadmin reader cannot create or replay a claim; no parent execution is claimed. Trusted fixture-owner setup provisions only synthetic identities/service configuration; domain history is created through public RPCs. Rejection checks assert exact psql exit/stdout/stderr and unchanged public state. With `ON_ERROR_STOP off`, SQLSTATE and stderr—not a nonzero client exit—identify rejection.

The source derives from the readonly historical 039, with an independent writer-admin check added for compatibility with current readers. The `LOCAL UNVERIFIED SOURCE` marker is retained; executed evidence and outstanding checks are tracked in [the parent source-integration task](../../odd/tasks/d1-automatic-refunds.md). These tests do not establish SDK validity, complete refund automation, deployed migration equivalence or financial acceptance. No deployment, integration or funds are authorized by this document.
