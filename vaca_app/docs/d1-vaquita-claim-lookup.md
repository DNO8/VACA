# D1 Vaquita lookup recovery

The mounted `VaquitaScreen` distinguishes a failed claim lookup from a successful empty list. An unavailable lookup shows **No se pudo consultar la ayuda pendiente.**, not an empty-aid assertion, even when there are no promoted local incidents.

Use **Reintentar consulta** to query pending claims again. While it is pending, **Consultando ayuda pendiente…** is visible, the retry is disabled, and the existing incident cards remain available. This retry only calls `pendingClaims`: it does not refresh the feed or execute a claim, funding, trustline, signing or submission fallback. A successful reply clears unavailability and restores the existing empty or claim presentation. Beneficiary claiming still requires its separate explicit action.

## Local checks

Use the pinned, process-local environment in `../../odd/evidence/d1-flutter-local-setup-usage.md`, then run only the new widget test and existing button checks with `flutter --suppress-analytics test --no-pub --reporter expanded test/vaquita_claim_lookup_test.dart test/vaca_button_test.dart`. Preserve the 80-second timeout and 5-second kill grace. Do not replay SDK setup, pub-get, the completed wallet-service proof, or the live Testnet smoke test.

The widget fixture uses in-memory Drift and fake storage/feed/wallet gateway, through the public screen and existing provider overrides. On Linux it resolves the existing `libsqlite3.so.0` SONAME in that test isolate only; no install, system symlink or global library-path change is required. Lookup assertions check zero financial executions/effects, no secure-storage mutation and unchanged incident rows. The explicit claim regression uses fake effects and checks the existing receipt/transaction link presentation.

## Limits

This is local presentation behavior, not backend/chain integration or whole-D1 acceptance. Asset/amount semantics, claimant predicates/deadlines, pagination, partial claim outcomes, authenticated backend composition and recovery/refund financial authorization remain separate work. No production signing, network call, SQL migration or deployment is performed by these checks.
