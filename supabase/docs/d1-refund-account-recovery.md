# Refund account observation recovery (T2g)

Recovered `functions/d1-custody/refund-account-observation.ts` byte-for-byte from the authorized public baseline.
This inert leaf is a future dependency, not a donor API, executor activation, or financial acceptance.
There are no new callers, host/runtime wiring, SQL writes, service grants, deployment, signing, or funds movement.
Existing manual paths and imported modules are unchanged (S5/S6); capability checks support only this S7/S11 slice.

`validateRefundAccountBinding` checks normalized Testnet candidate/history/account consistency and timing, not provenance or spending authority.
`captureRefundReadClient` captures a receiver-bound method, permits fourteen reads, and detaches parameters/replies.
Returned database denials remain data; invocation failures, including forged403 errors, become `refund_account_observation_unavailable` (503).
`observeSavedRefundAccount` rejects a validated null candidate before invoking the injected account source.

Scoped check: `deno test --cached-only --frozen --allow-env --deny-net tests/unit/refund-account-recovery.test.ts` from `supabase` with the isolated toolchain/cache.
The focused fixture covers detachment, freezing, scope/sequence/network/history binding, timing boundaries, hostile data, and read-only transport.
Synthetic unsigned SDK fixtures do **not** prove a full successful asynchronous observer, authentication, ledger provenance, or financial eligibility.
Historical suites, integrated financial acceptance, host/service activation, and independent verification are separate and are not claimed here.
