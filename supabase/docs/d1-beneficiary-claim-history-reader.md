# Positive claim history reader

`new BeneficiaryClaimHistoryReader(fetcher).read({ requestId, initial })` retrieves
positive Testnet claim evidence and returns `BeneficiaryClaimProjection`.
`initial` is the raw accounting input, not a precomputed basis. It is validated
and detached before transport. Omit `fetcher` to use the platform fetch.

The reader pins `https://horizon-testnet.stellar.org`, validates the network and
retained-history bounds, checks the supplied anchor header before and after
retrieval, and queries `/claimable_balances/{derivedId}/transactions` directly.
It never requires a live balance resource or reads an account transaction stream.
GET requests reject redirects and omit credentials; hypermedia links are ignored.

Availability limits: one 10-second deadline for the ENTIRE operation, including
fetch/body waits; 1 MiB per streamed UTF-8 JSON response; at most 3 ascending pages
of 20 transactions. Headers are cached. Whole pages are validated before selecting
a positive claim. Failed/nonbeneficiary activity does not count as beneficiary proof.
Explicit operation sources and multi-operation personal-wallet claims are supported.

Empty, pruned, unavailable, malformed or exhausted evidence throws sanitized
`CustodyError("beneficiary_claim_history_unavailable", 503)`, never “unclaimed.”
There are no retries, writes, signatures, terminal releases or refund permissions.
Gross debt, unissued amounts and quarantine remain unchanged. Pinned indexer
consistency is NOT independent consensus, current financial readiness or completeness.
No HTTP handler or production key provider is mounted by this module.
