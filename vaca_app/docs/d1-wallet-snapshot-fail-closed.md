# D1 personal-wallet account lookup failures

The wallet gateway no longer represents every account lookup failure as an unfunded wallet. Server failures, rate limiting, transport errors and malformed responses propagate to the existing service failure paths: `stellar_wallet_load`, `stellar_horizon_error`, or `stellar_usdc_setup` during preparation. An unknown initial snapshot therefore cannot trigger FriendBot, trustline preparation, pending-claim queries or beneficiary claim submission through that preparation path.

A typed SDK `ErrorResponse` with HTTP404 from this specific **personal-account lookup** retains the existing unfunded snapshot. Legitimate explicit preparation of a missing personal account remains available. This is not a claimable-balance/transaction-outcome absence rule, financial authorization, ownership release or automatic retry policy.

Successful native/USDC snapshot mapping and legitimate personal beneficiary signing are unchanged. No backend pool signer, service interface, D3 coordinator, dependency or aggregate claim UI is changed.

## Scoped local verification

Use the pinned process-local environment in `../../odd/evidence/d1-flutter-local-setup-usage.md`, with separate serial operations bounded to80seconds plus5seconds kill grace. Run `flutter --suppress-analytics test --no-pub --reporter expanded test/stellar_wallet_snapshot_test.dart test/stellar_wallet_service_test.dart`, then focused analysis of the gateway and new snapshot test. Do not replay installation/pub-get or invoke the live Testnet smoke test.

The new test injects fake HTTP into a fresh SDK instance; all requests remain in memory. Recorded fake financial methods verify zero downstream effects after an unknown initial snapshot across load/refresh/create/fund/claimAll. Existing wallet-service cases remain the regression check for legitimate preparation/claim behavior. These tests do not establish live/backend/chain integration or whole-D1 acceptance, and do not redesign partial-success reporting after a later failure.
