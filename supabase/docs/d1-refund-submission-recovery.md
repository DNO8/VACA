# Refund submission recovery — source only

T2m recovers baseline 037 and the private submission capability/transport. **Unverified; no SQL applied.** Nothing is mounted or invoked; no secret read, signing, broadcast or network operation was performed.

## Read in order
1. `../migrations/037_d1_refund_submission_attempts.sql`: `d1_load_refund_submission_attempt` and `d1_claim_refund_submission_attempt` each independently lock/check the current administrator after inherited scope/journal locks, before disclosure, replay, validation returns or mutation. Candidate/financial read access is not submission authority.
2. `../functions/d1-custody/refund-submission-authorization.ts`: `withRefundSubmissionAuthorization` and `RefundSubmissionArtifact`; genuine signer, financial observer, account binding and Stellar SDK validate persisted signed bytes and scope. A fresh durable claim plus matching read-back precedes the single callback; historical attempts return `invoked: false`.
3. `../functions/d1-custody/refund-submission.ts`: `submitRefund` and `RefundSubmissionResponse`; one TESTNET POST using those exact bytes, bounded response/deadline, explicitly unverified result.

## Preserved boundaries
- SQL retains pool serialization, permanent one-shot ownership, globally unique attempt nonce, envelope/hash/snapshot binding, fresh financial validation before insertion and after uniqueness waits, original replay result, RLS, ACLs and empty search path.
- Signing snapshot A and fresh submission snapshot B may differ; neither signed bytes nor A are renewed. Timeout, crash or lost acknowledgement never resets the durable claim: no TTL, retry, resend, fallback or release path.
- TypeScript uses the existing `RefundSignerConfiguration`, `observeAndSaveRefundFinancialEvidence`, `validateRefundAccountBinding`, `HorizonDiscoverySource` methods and SDK 13.3.0 mapping. No API compatibility change, alternate financial engine or dependency stub was introduced.
- The callback is a trusted private capability, not a public raw-XDR entry point. Do not expose envelopes/nonces over HTTP. No existing host, D3, manual code or migrations 048–054 changed.

## Outstanding work and proof
- Explicit limited-scope automatic-service admission remains separate (S7/S11); this recovery remains administrator-gated, not service activation.
- Recover 038 outcome evidence and remaining coordinators separately; transport success is not inclusion, refund settlement or safe ownership release.
- S5/S6/S14 source recovery only; S15 stops tests. No tests, typecheck, build, probes, SQL execution or functional/security/concurrency verification ran.
- Risk 2 authorization and Risk 4 revocation/locking still require independent proof before operational acceptance. Deployment and financial acceptance are not authorized here.
