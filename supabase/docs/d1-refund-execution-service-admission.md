# Scoped refund execution admission — source only

Migration [`055`](../migrations/055_d1_refund_execution_service_admission.sql)
adds explicit scoped-service fallbacks to ten existing refund/reconciliation
RPCs. Manual administrator branches remain. **This source has not been applied,
compiled by PostgreSQL, functionally tested, or independently security-verified.**
It does not authenticate a backend host, provision a principal, activate an
executor, or authorize deployment or financial execution.

## Review path

1. Review the 35-function preflight manifest, especially effective post048 and
   post053 bodies, the private049 assertion, and the unchanged051 request reader.
2. Review the eleven exact replacement anchors: both candidate gates, the final
   financial gate, seven signing/submission/refund-outcome gates, and the sole
   initial-outcome exception.
3. Trace admission from stored request scope through049 and051, then inspect the
   original034–038 ownership, economics, clocks and permanent-journal bodies.

## Explicit admission list

All signatures below are in `public`. No new RPC or helper is created. Existing
RPC signatures, result shapes, ownership and ACLs are retained by replacement.

| Existing RPC signature | Admission changed |
|---|---|
| `d1_record_refund_candidate(uuid,text,text,text)` | Early053 gate before validation/replay **and** late034 gate before current-clock check/insertion |
| `d1_record_refund_financial_observation(uuid,text,jsonb)` | Final035 gate before clock validation, exact replay and insertion |
| `d1_load_refund_signing_journal(uuid,text)` | Independent036 gate before journal disclosure |
| `d1_claim_refund_signing(uuid,text,text,uuid)` | Independent036 gate before existing-claim replay or new signing claim |
| `d1_record_signed_refund_transaction(uuid,text,uuid,text,text)` | Independent036 gate before signed-byte replay or recording |
| `d1_load_refund_submission_attempt(uuid,text)` | Independent037 gate before attempt disclosure |
| `d1_claim_refund_submission_attempt(uuid,text,text,uuid)` | Independent037 gate before replay or new submission claim |
| `d1_load_refund_outcome(uuid,text)` | Independent038 gate before outcome disclosure |
| `d1_record_refund_outcome(uuid,text,jsonb,jsonb)` | Independent038 gate before exact replay or recording |
| `d1_record_issuance_outcome(uuid,text,jsonb)` | Explicit exception to its048 gate, solely for032 historical included-result reconciliation |

The last row cannot create an initial unsigned transaction, financial approval,
signature or submission attempt. Its existing body still requires the stored
initial attempt, signed bytes and matching immutable transaction-history record.
It records opaque included-result evidence, not consensus truth or settlement.

## Scope and lock ordering

The existing current-admin `FOR SHARE` check remains first at each changed gate;
only failed membership enters the service fallback. There is no caller-supplied
namespace/pool, purpose flag, GUC override, or broad administrator substitution.

For refund calls, the pinned reader chain reaches051 before pool/evidence locks:

1. Discover the preparation's namespace and authoritative pool without locking.
2. Call049 `d1_assert_refund_service_scope_private(text,uuid,text)`:
   lock exact `(actor, namespace, pool)` membership **FOR SHARE**, then the
   authoritative pool **FOR UPDATE**, and recheck its binding after waiting.
3. Recheck the same request/namespace preparation **FOR SHARE** before the
   original reader rediscovery and downstream journal locks.
4. At each changed refund gate, reassert049 against the locked reader's returned
   namespace/pool. This is revalidation of already-held locks, not first service
   admission after taking evidence locks.

The032 exception precedes its first reader. A local PL/pgSQL block repeats051's
request-derived discovery and preparation recheck, calling the existing049
assertion rather than implementing membership/pool locking independently.
A missing scope or a preparation moved/deleted during the wait is rejected with
`unauthorized_admin_wallet` / `42501`. Membership locks last until transaction
completion: deletion revokes future admission, not already-admitted work.

## Preserved boundaries

- Seven other048 mutation guards and their entire effective bodies remain
  unchanged: unsigned save, operating-credit record, issuance fee commitment,
  initial and fresh-initial financial observation, initial signed transaction,
  and initial submission claim.033 initial reservation is also unchanged.
- Candidate034 parent/subordinate ownership, busy/conflict checks, expired-only
  creation and historical replay without owner resurrection remain in place.
- Financial035 body, complete fee/history/credit/economics checks and final
  current-clock checks remain. Its existing historical reader is not rewritten.
- Signing replay remains `invoked=false`; submission replay remains
  `claimed=false`. Original signing-actor equality for finishing a new signed
  record remains. No reset, retry, TTL release or reassignment is added.
- Discovery019 and history024 writes already inherit050.055 pins their source
  but does not rewrite or further broaden them.054 donor capture is untouched.
- Registry membership is an authorization fact, **not host identity**. A trusted
  private host must bind the actor and configuration; untrusted callers must not
  choose an actor merely because its key appears in the registry.

## Fail-closed source provenance

Pins were derived without executing SQL: hash the UTF-8 bytes between canonical
`AS $$` delimiters, including leading/trailing newlines; apply048's exact guard
insertion, then050/051/052/053's literal transformations. Existing prior manifest
pins were compared during source generation before deriving the new effective
pins. In particular, candidate read/write pins include053, and032 includes048.

The migration checks all 35 expected bodies and function metadata/ACLs first.
It then constructs all ten definitions in memory, requiring each of eleven
contextual anchors exactly once, the body once in `pg_get_functiondef`, and the
expected transformed-body digest. Only after every check does it execute DDL.
A mismatch raises `unexpected_d1_refund_execution_service_definition` / `P0001`.
The transaction is intended to reject drift atomically; it is not a replayable
migration or a compatibility patch for arbitrary deployed definitions.

## Prerequisites and outstanding proof

Requires the canonical local018–038 dependencies and effective048–053 chain,
foundational schema/key validation/admin registry, PostgreSQL catalog support
used by the prior preflights, `postgres` ownership, and the existing exact
service-role-only RPC ACLs.049 must retain its owner-only execution ACL. No new
helper or principal is created, and no table/RPC grants change.

Application must be separately authorized with callers quiesced. Peer039–047
work was neither inspected nor integrated: lane fencing, beneficiary/remainder
eligibility, settlement and any later function replacement require separate
composition review. Source pins intentionally reject conflicting replacements;
they are not a complete schema/trigger compatibility audit.

Under S15/S16, no SQL/runtime execution, tests, probes, typechecks, builds,
database connection or scratch preparation occurred. PostgreSQL syntax/catalog
compatibility, atomic rejection, manual preservation, scope-denial behavior,
revocation/move concurrency, one-shot replay and financial behavior remain
**unverified**. Risks: item2 authorization, item4 membership/pool lock order,
and item1 unapplied migration. Trusted host identity, authoritative lane
selection and executor activation are not delivered by this migration.

This source addresses T2s / S1,S5,S6,S7,S11,S15,S16 within the SQL boundary only;
it does not establish end-to-end automatic-refund readiness or financial acceptance.
