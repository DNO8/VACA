# D1 refund signing: source-only recovery

T2l restores 036 and `refund-authorized-signer.ts` from the read-only WSL baseline.
This is unverified source, not operational readiness or permission to deploy, activate, sign or move funds.
Coverage: S5–S7, S11, S14–S15; scoped automatic-service admission remains separate.

## Authorization boundary

- 053 admits scoped-service candidate reads, not signing-journal disclosure or signing authority.
- Each 036 RPC independently locks current `admin_wallets` membership with `FOR SHARE` after inherited scope/pool/candidate locks and before validation, disclosure, replay or mutation; denial is `unauthorized_admin_wallet` / SQLSTATE `42501`.
- This applies to journal loads, existing signing-claim replay and existing signed-byte replay, not only fresh writes through 035.
- Baseline `SECURITY DEFINER`, empty search path, RLS, table revocations and `service_role` RPC execution ACLs remain; those transport ACLs do not admit a scoped-service actor.
- Pool serialization, namespace/request binding, permanent one-shot nonce ownership and post-insert financial revalidation remain in source. No TTL, reclaim or retry is added.

## Recovered signer

`signAndSaveAuthorizedRefund` exports the existing composition, with `RefundSignerConfiguration`, `SignedRefundReceipt` and `PersistedSignedRefund` types.
It uses the genuine financial observer, account binding, SDK and configured `loadPoolSigner(pool)` capability only after a positive fresh claim; existing or uncertain claims cannot authorize another provider invocation.
The signer source has no compatibility adjustment from baseline. No provider, clock, financial engine, secret handling, host mount or automatic start was invented.
Signed bytes and nonce remain private; SQL stores opaque evidence, not chain proof or renewed submission authority.

## Remaining dependencies and proof

036 depends on existing 034 candidates, 035 financial observations and their earlier schema/role/administrator dependencies; owned 034/035 and 048–054 are untouched.
Later scoped-service migration must explicitly admit each required refund read/write/replay operation without granting broad administration or issuance authority (S7/S11).
037 submission ownership/admission and its transport recovery are still separate work; signing evidence alone cannot authorize submission or settlement.
All tests, typechecks, builds, probes, runtime/SQL/network execution and independent security/locking verification are unexecuted under S15.
Risk 2 (authorization) and Risk 4 (locking/revocation) remain unproved. Nothing was deployed, applied, activated or signed.
