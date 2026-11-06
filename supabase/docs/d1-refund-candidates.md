# Durable refund candidates (local Testnet storage)
Migration034 stores opaque unsigned refund bytes and an exclusive subordinate successor owner; it does **not** authorize spending, signing or submission.

## Service-role RPCs
- `d1_load_refund_candidate(p_request_id uuid, p_authorized_by text)` authenticates a current admin and returns `{kind:"d1_refund_candidate_lookup",revision:1,request_id,namespace,network:"TESTNET",pool,candidate,active_request_id}`. Candidate/owner may be null; owner identity is a read fact, not eligibility. Lookup can precede032.
- `d1_record_refund_candidate(p_request_id uuid, p_authorized_by text, p_unsigned_xdr text, p_transaction_hash text)` requires immutable032 success or failed inclusion, the same held033 initial owner, and wall-clock expiry of the original confirmation+300-second deadline after lock waits. Unknown outcomes retain ownership; no fallback refund.
- Receipt: `{kind:"d1_refund_candidate",revision:1,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,source_sequence,transaction_sequence,deadline,unsigned_xdr,transaction_hash}`. Scope/initial sequence/deadline come from locked immutable history; the successor is initial transaction sequence+1, with int64 overflow rejected.
- Base64 must be canonical, nonempty and at most 65536 characters; hash must be 64 lowercase hexadecimal characters. These are **shape checks**, not SDK XDR/hash verification. Exact current-admin replay preserves the original authorizer and bytes; different bytes/hash conflict. First writes require READ COMMITTED; guarded exact replay supports stronger isolation.

## Errors
Inherited018 validation/authentication errors remain unchanged, including `22023 invalid_unsigned_transaction` for invalid request/actor and `42501 unauthorized_admin_wallet` for noncurrent admins.
| SQLSTATE | New message(s) |
|---|---|
|22023|`invalid_refund_candidate`, `d1_issuance_sequence_not_found`, `d1_issuance_outcome_not_found`, `refund_deadline_not_reached`, `invalid_refund_sequence`|
|23505|`refund_candidate_conflict`|
|55000|`issuance_source_not_owned`, `refund_source_busy`|
|25000|`refund_candidate_isolation_required`|

## Preservation and remaining work
Both new tables have RLS and deny direct access to public/anon/authenticated/service_role; only the two SECURITY DEFINER RPCs grant service execution. Immutable request-keyed history references018/017, never active033; separate namespace-keyed active ownership references candidate history.
Initial033 ownership,027 fee commitments, gross donor principal, payment/allocation records and historical actors remain unchanged. Team-funded fees/reserves must not reduce donor principal. No release, delete, expiry, reactivation, reassignment or retry API is added; replay cannot restore a retired owner.
Public integration tests cover reachable creation/conflict races and unchanged public state after rejection. Foreign-owner/busy/retirement branches cannot currently be manufactured through033's public APIs; they are defensive invariants, not claimed executed cases.
A later fresh SDK financial gate must load and rederive **all** plan bytes/identities before key loading, including original-donor repayment and separate team-funded costs. Financial eligibility, signing, durable refund execution, settlement and beneficiary/expired journeys remain unfinished; SQL fixtures prove no live ledger outcome.
