# Scoped remainder execution admission — source only

Migration [`058`](../migrations/058_d1_remainder_execution_service_admission.sql)
adds explicit configured049 service admission to the existing remainder engine.
It preserves real manual administrator branches and adds independent writer
checks before replay or mutation. **Not applied, PostgreSQL-compiled, tested or
independently security/concurrency-verified.** No deployment, activation or funds
authority follows from this source delivery.

## Review path

1. Inspect the 60-function preflight manifest, including effective055/057 pins.
2. Trace the saved-original admission chain through051 and049 before pool locks.
3. Review the twelve targets and thirteen contextual anchors below, then the
   unchanged041–047 validation, financial and permanent-journal bodies.

## Exact admission map

Names below are in `public`; complete signatures and literal pre/post body pins
are in058. The shared gate retains `admin_wallets ... FOR SHARE`; only failed
manual membership calls `d1_assert_refund_service_scope_private`.

| Existing function | Anchor / independent check | Scope source |
|---|---|---|
| `d1_load_remainder_candidate` | Existing gate immediately before candidate lookup return | `s`, authentic039 lookup |
| `d1_record_remainder_candidate` | **New writer gate immediately after041 lookup, before exact replay**; replace existing late gate immediately before `now_seconds` | `lookup` |
| `d1_revalidate_remainder_financial_snapshot_private` | Existing final043 gate immediately before `final_now`, after complete membership/019 rechecks | `facts`, actual042 result |
| `d1_load_remainder_financial_observation` | Existing gate before historical observation lookup return | `lookup`, authentic041 lookup |
| `d1_record_remainder_financial_observation` | New writer gate after041 lookup, before receipt construction/insertion; both full043 calls remain | `lookup` |
| `d1_load_remainder_signing_journal` | Existing gate before historical-return comment; no freshness renewal | `lookup`, authentic041 lookup |
| `d1_claim_remainder_signing` | New writer gate immediately after045 lookup, before existing-claim return | `journal` |
| `d1_record_signed_remainder` | New writer gate immediately after045 lookup, before signed-byte validation/replay/mutation | `journal` |
| `d1_load_remainder_submission_attempt` | Existing gate before historical-B comment/return | `journal`, authentic045 lookup |
| `d1_claim_remainder_submission_attempt` | New writer gate immediately after046 lookup, before existing-attempt return | `lookup` |
| `d1_load_remainder_outcome` | Existing gate before outcome lookup return | `s`, authentic046 lookup |
| `d1_record_remainder_outcome` | New writer gate immediately after047 lookup, before exact replay | `lookup` |

The six new writer gates are explicit authorization, not permission inherited
from a reader.043 independently remains a current financial authorization gate.
No caller snapshot, acquisition payload, candidate DTO or supplied history is
used as an authorization scope. In particular,043 uses042's returned `facts`,
whose namespace/pool come from041, not `p_snapshot` or its funding scope.

## Saved-original scope and locks

The earliest request path is041 →039 →032 →031 →030 →018 as amended by051.
Before any pool/evidence lock,051 discovers the stored preparation's namespace
and its authoritative pool without locking.049 then takes exact service
membership **FOR SHARE**, takes the pool **FOR UPDATE**, and rechecks the pool
binding after waiting.051 locks/rechecks that same request/namespace preparation
**FOR SHARE** before rediscovery. A move/deletion during either wait cannot
silently redirect admission.

The original chain retains preparation/intent, sequence/unsigned/signed/attempt/
outcome,024 history,039 claim,033 active owner,040 fence and041 candidate locks.
Later044–047 journal/index locks and their existing rechecks remain. Every058
fallback is therefore a reentrant049 assertion of already-held membership/pool
locks, not first membership acquisition after pool locking. No extra discovery
or alternate lock protocol is introduced. Manual administrators continue down
the original branch and need no service registry row.

Membership deletion revokes future admission, not already-admitted work: the
shared membership lock lasts to transaction end. The existing post-wait043
complete membership/arithmetic/clock checks,045/046 nonce checks and047 current
history checks remain. These are source-level ordering observations, **not an
observed concurrency verdict**.

## Fail-closed pins and preserved boundaries

- The 60 preflight pins cover every target, the049 assertion,051/050/052/053
  readers, unchanged initial-write guards, effective055 refund dependencies,
  effective057 beneficiary writer,039/040 readers/fence helpers,042 membership
  helpers and045/047 private evidence helpers.025/026 pagination defaults are
  pinned as two defaults with deparsed expression `'0'::text, 100`.
- Literal MD5 pins hash UTF-8 `prosrc`, including delimiter-adjacent newlines.
  Canonical039–047/025/026 bodies supply new pins;055's preflight manifest plus
  its transformed-body pins supply effective dependencies;057 supplies its
  transformed beneficiary-writer pin `12b182af3d84a050af63f82158d7b938`.
  MD5 detects drift; it is neither authentication nor evidence-validity proof.
- Owner, language, security-definer/search-path settings, result/argument names,
  defaults, volatility, parallelism, function flags, cost and exact ACLs are
  checked. Public RPCs retain postgres/service-role execution; private helpers
  retain owner-only execution. No grant, enrollment or new public RPC is added.
- Each anchor must occur once in original and intermediate bodies; existing
  gate anchors also contain return/clock/comment context. All twelve transformed
  bodies have literal pins. All replacement definitions are constructed before
  **any DDL**. Drift raises `unexpected_d1_remainder_service_definition` /
  `P0001`; the surrounding transaction is intended to reject atomically.
- Candidate set/history/owner/deadline checks, monetary accounting, fences,
  immutable receipts, signing actor equality and one-shot semantics remain.
  Signing replay stays `invoked=false`; send replay stays `claimed=false`.
  Historical readers never renew expired financial evidence or original actors.
- Initial issuance mutations and their048/033 guards are not changed. No broad
  admin substitution, GUC/purpose bypass, financial engine replacement, lane
  override, owner release, retry, credential provisioning or host wiring occurs.
  Historical source comments mentioning admin-only access are retained; the
  explicit058 checks now define the additional service branch.

## Remaining proof and scope

Source generation and manual source readback only: **zero tests, probes,
typechecks, builds, runtime/SQL execution, scratch/cache preparation, network,
deployment or financial execution** under S15. No TS source was used or edited.
PostgreSQL syntax/default-expression compatibility, effective catalog pins,
atomic drift rejection, manual preservation, wrong/missing/revoked scope,
request/pool move races, nonce waits, replay and financial behavior remain
unverified. Function pins are not a complete table/trigger/schema audit.

Requires canonical foundational schema and018–047 with effective048–057,
postgres ownership and the existing ACLs. Application requires separate
permission and quiesced callers.049 membership is authorization, **not host
identity**: a trusted private host must bind actor/configuration; untrusted
callers must not select an enrolled actor. This migration neither provisions
that identity nor establishes end-to-end automatic refund readiness.

T2ac source coverage: S7 scoped authorization/manual preservation; S11 scoped
evidence/reconciliation; S15 source-only restrictions; S18–S19 use of recovered
canonical SQL in this checkout. Functional/security/concurrency acceptance
remains outstanding. Primary risks: **item2 authorization; item4 concurrency**.
