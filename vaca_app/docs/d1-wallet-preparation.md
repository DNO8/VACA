# D1 personal-wallet preparation

`StellarWalletService.create()` shares one in-flight creation per service instance.
After a stored seed is available, overlapping `create()`/`fund()` calls for that
same seed share one snapshot/funding/trustline preparation. Successful and failed
in-flight entries are discarded on completion; only a later explicit call starts
another preparation. No automatic retry is introduced.

`fund()` always reads storage first. An absent or empty seed still returns
`stellar_wallet_missing`, even while `create()` is waiting to persist credentials.
It does not create credentials or join a creation on that basis.

This is not a lock across service instances, processes, wallets or Stellar
transactions. It does not serialize claims against preparation. The existing
`_prepareForUsdc()` helper and legacy `claimAll()` remain unchanged; D3's offline
claim scope and per-balance claim coordinator are not replaced or imported.
Personal donor/beneficiary signing stays on its existing path. No backend pool
signer, refund execution, principal settlement or deployed D1 acceptance follows.

## Local verification

The existing `test/stellar_wallet_service_test.dart` fixture uses controlled
Futures and effect counters to reproduce overlapping creation/preparation,
missing-wallet rejection, shared failure and explicit later retry. It retains the
existing creation, load, funding and claim regressions. Tests use fake storage
and gateway operations; no Friendbot, Horizon or live funds are used.
