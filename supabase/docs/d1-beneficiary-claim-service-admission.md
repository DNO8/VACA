# Explicit service admission for beneficiary evidence

**Source only / unverified.** Migration057 is not applied. No tests, typecheck,
SQL execution, concurrency proof or independent security verdict accompanied
this source change under S15. No principal, secret or service-scope row is created.

## Narrow change

057 changes only `d1_record_beneficiary_claim(uuid,text,jsonb)`. It retains the
current manual administrator membership check and row lock. A nonadministrator
must instead pass the existing private049 scope assertion using namespace and
pool from the authenticated original lookup, before either mutation or exact
replay. It does not infer writing permission merely from successful reading.

The inherited pinned read path reaches051 before the pool/evidence locks:

`039 lookup → 032 outcome → 031 attempt → 030 signed → 018 unsigned / 051 admission`

051 derives scope from the saved original, locks service membership first, then
pool/preparation and rechecks the original. The new057 guard is a reentrant scope
check, not first acquisition after evidence locking.049 still checks the actual
pool binding. Concurrent revocation waits for admitted transactions; it does not
cancel already-admitted work. This ordering is source intent, not tested proof.

## Preserved boundaries

- No caller-supplied namespace/pool, purpose flag, GUC bypass or broad admin grant.
- No new RPC, helper, table grants, direct-table access or self-enrollment.
- No edits to historical039,040,055 or056.
- Every existing acquisition-shape, membership, immutable conflict and original
  actor/receipt replay rule remains outside the replaced authorization fragment.
- A journaled beneficiary claim is opaque positive-evidence membership, **not**
  SQL verification of the Stellar SDK proof, settled principal or refund authority.
- Actual SDK acquisition/validation must precede recording. This migration neither
  supplies that missing integration nor enables041–047 remainder writes.
- Provisioning must use the dedicated scoped actor, not add it to `admin_wallets`.
  Registry membership is not host authentication; the private HTTP/token boundary
  and service-role database connection remain separate requirements.

## Fail-closed application preflight

Before its one `CREATE OR REPLACE`,057 pins thirteen effective function bodies,
argument names/types through exact signatures, owner/language/function flags,
search path and exact ACLs. Eleven unchanged dependency pins come from055's
source manifest; the039 reader/writer pins come from the exact adopted peer source.
It requires one exact authorization anchor and the expected transformed body.
MD5 is a source-drift checksum, not a security proof. Definition or metadata drift
raises `unexpected_d1_beneficiary_service_definition` (`P0001`) and aborts the
transaction. No permissive patch/retry path is included.

Application requires a separately authorized maintenance window with callers
quiesced. Do not run this file merely because the source exists. Compatibility
of the combined039/040/048–057 sequence, manual/service regression behavior,
revocation, lock order and runtime validation remains unproven.
