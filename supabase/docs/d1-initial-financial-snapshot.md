# Observe initial financial capacity without granting spending authority

`observeInitialFinancialSnapshot(client, configuration)` joins accepted backend
facts before the pool's **first owned execution**. It returns
`d1_initial_financial_snapshot` revision1, not a financial authorization token.
HTTP callers must not supply its facts, source, clock or refund policy.

Configuration binds namespace, pool, request UUID and authenticated admin. Backend
clock values are integer epoch seconds; maximum age is explicitly1–30 seconds,
with future-clock tolerance0–2 seconds. The optional account source is a trusted
backend/test injection; production defaults to `HorizonDiscoverySource`.

## Evidence chain and conservation

- Load the existing owner-bound commitment through the SDK adapter and require
  its namespace. A read-only RPC allowlist and a deliberately unavailable first
  quote prohibit commitment creation or any other mutation.
- Read complete SDK-revalidated transaction history and operating credits. Match
  their full discovery states, not their independent income/TX cursor strings.
- Require verified current-incarnation creation and a controlled account at the
  same ledger/hash/close anchor. Activation alone never proves historical zero.
- Preserve original native/issued donor principal. Crossmatch the selected owner's
  preparation against an actual protected donation by original donor, asset,
  stroops, operation/hash, confirmation time and ledger. Operating credits or an
  absent payment cannot stand in for a donation.
- Quarantine failed/source-only/other pool activity early. Only successful
  effective-pool-source trustline candidates reach strict principal accounting:
  ordinary credit, positive limit, before every protected incoming operation after
  exact D1OPS exclusions. Zero-limit/LP/later setup remains unexplained. This is
  non-principal setup classification, never custody/signing proof or debt discharge.
- Read the account again, require the exact owned observed sequence, and compute
  caps from verified credits, actual pool-paid fees, balances/liabilities and
  sponsorship/reserve fields. Missing funded issued balances fail closed; zero
  issued obligations come only from complete accepted evidence.

The selected issuance fee and selected issued-refund commitment count once in the
budget action. Separately, conservatively provision one current-base-fee payment
per original incoming operation with positive **unissued** principal remaining.
Only the selected issue amount reduces that operation's *planned unissued remainder*;
gross original principal is never discounted. All other native/issued donations
remain covered. Fully issuing a selected deposit leaves no unissued fee for that
deposit. This observation does not persist these additional refund provisions.

## Stable completion and bounded freshness

Reload history state, credit state and the SDK-validated owner/commitment after
account/budget assembly. Any drift fails without retry. Expiry is the earlier of
the original request deadline and anchor close plus configured maximum age.
The final clock must not roll backward, exceed expiry or precede the anchor beyond
the configured tolerance. A matching indexer head alone is not temporal freshness.

RPC/source snapshots accept bounded dense plain JSON:20,000 nodes/entries,40 levels,
1MiB encoded, no accessors, aliases, cycles or symbols. Failures are sanitized to
`initial_financial_snapshot_unavailable`503; only explicit current-admin denial is
preserved as `unauthorized_admin_wallet`403. No retry, write, release, signing,
submission, refund or live account operation follows a rejection.

## Verification boundary and unfinished work

Local SDK/RPC fixtures cover stable assembly, selected-payment provenance, native
and issued protection, unissued fee provisions, insufficient team/physical caps,
missing evidence, all final-read drift, freshness, failed/successful pool activity
and sanitized errors. Isolated fixture clocks/accounts are not live acceptance.

Initial positive credit setup is now accounting-supported under the narrow rule
above; actual setup/signing commands and a complete issued-asset journey are not
supplied. Claim/refund/outgoing execution still requires verified T4 dispositions.
The separate durable SDK gate consumes/revalidates these facts, persists provisions
and checks action-entry freshness; runtime must guard actual signing/submission
and reconcile execution. Post-execution remaining debt, runtime signer, full refunds, client
migration and both D1 lifecycle journeys remain separate unfinished work.
