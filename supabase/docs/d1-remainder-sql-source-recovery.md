# Remainder SQL recovered as source only

Seven missing migrations were exclusive-created from immutable Git blobs, without
SQL application or automatic-service admission. This is T2y source recovery, not
functional, security, concurrency or financial acceptance.

## Provenance and dependency order

Read-only source repository: `/home/danilo/worktrees/vaca-d1-wsl-baseline`.
Canonical commit: `954f1e3e4e87818f255c36287e167d23eb6332e3`.
Each destination below is under `supabase/migrations/`; bytes were obtained with
`git show <commit>:<path>` and written in binary exclusive-create mode. No mutable
checkout files were copied, no overlay was performed, and no SQL was edited.

Read in dependency order **041 → 042 → 043 → 044 → 045 → 046 → 047**, after the
existing original/history/ownership dependencies and 039/040:

| File | Canonical blob | Role |
|---|---|---|
| `041_d1_remainder_candidates.sql` | `cddc574e017b6870e137bd91c649fd4eb0d21752` | Immutable candidate and private v2 fence acquisition |
| `042_d1_remainder_financial_membership.sql` | `994eccb2a19f5ac051fa5ce841238e74c2f769e6` | Allowlisted reads and complete current membership |
| `043_d1_remainder_financial_money.sql` | `8011f67e3bc9cb88bd681994a87a79211ee57559` | Independent arithmetic, income, reserve and freshness validation |
| `044_d1_remainder_financial_observations.sql` | `78ead0b47aa4b25c3c22316ba52c35c099a6d848` | Immutable JSONB-digested evidence |
| `045_d1_remainder_signing_journal.sql` | `7236d55f9fd4d9b799c5b058036e9baed1377f12` | One-shot signing claim and opaque signed-byte journal |
| `046_d1_remainder_submission_attempts.sql` | `e4231a97ce5b9ef121ba93445b96d634144a518b` | One-shot submission ownership |
| `047_d1_remainder_outcomes.sql` | `9c50c15b7fb925a177794772e2b76b9fa7190f1c` | Positive outcome/history membership |

This ordering is a source review map, not migration execution authorization.
039/040 and 048–057 were not modified; the existing parent source, including
055–057, is not evidence that any migration has been applied.

## Retained authorization and lock boundaries

- Canonical public RPCs are granted to `service_role`, but that transport grant
  is not automatic-worker admission. Independent `admin_wallets ... FOR SHARE`
  checks remain in 041 and the downstream loaders/revalidator. Loaders gate
  returns and writer replay paths; admitting an upstream reader alone does not
  remove these manual gates. No principal, scope or permission was added.
- The source reuses the existing loaders and their pool/original/history locks,
  then active owner 033, permanent fence 040 and candidate 041, followed by the
  evidence/signing/submission/outcome journals. Pool serialization covers absent
  rows. Current membership and freshness checks surround relevant insert/index
  waits; the source retains READ COMMITTED requirements and admin membership locks.
- 041 acquires the private verified-remainder fence only after candidate checks,
  in the same transaction. 040's cross-lane ownership and immutable fence remain
  untouched: no release, expiry, reassignment, v1 fallback or retry was added.
- 042/043 retain whole-set and history-prefix binding, original gross/principal
  checks, protection of other donors, fee/reserve coverage, current sequence and
  final clock checks. 044 revalidates identical write replay; historical reads
  do not renew financial evidence. 045/046 retain permanent one-shot claims and
  fresh evidence checks rather than takeover after expiry or missing bytes.
- 047 binds outcomes to saved attempts, exact signed bytes and positive durable
  history. These SQL checks do not verify SDK signatures/provider truth, send
  transactions, authorize settlement or release ownership.

## Scope and outstanding verification

S5/S6/S18/S19 are addressed only by additive canonical recovery in the reassigned
checkout; peer inactivity is human-confirmed, not runtime-inspected. S7/S11
remain incomplete for remainder automatic execution/evidence admission: manual
gates are deliberately retained for a later separately scoped change. S15 is
observed: self-review consisted only of reading 039–047 source and provenance.

No tests, probes, assertions, typechecks, builds, SQL/runtime execution, scratch
or cache preparation, network access, deployment or funds movement occurred.
Still unexecuted: migration/dependency compatibility, behavior and replay tests,
SDK/SQL integration, independent authorization review (risk item 2), and lock,
revocation, uniqueness-wait and cross-lane concurrency proof (risk item 4).
Parent packaging into reviewable behavior slices and later explicitly authorized
verification remain outstanding; this document grants no operational readiness.
