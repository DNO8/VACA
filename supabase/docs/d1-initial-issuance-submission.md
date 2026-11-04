# One-shot initial submission transport

`submitInitialIssuance(client, trustedSignerConfiguration, trustedFetcher = fetch)`
is an internal backend composition, not a mounted HTTP route. It calls the
accepted `withInitialSubmissionAuthorization` itself. No caller envelope, nonce,
URL, authorization header or reusable permission is accepted.

## One request, no automatic recovery

Only the fresh, durable031 `claimed:true` acknowledgement permits one POST to
`https://horizon-testnet.stellar.org/transactions`. The body is a URL-encoded
`tx` containing the internally validated, saved signed envelope. Redirects are
errors, credentials are omitted and only form/JSON media headers are supplied.
Historical attempts and losing claims never post or consult private/fresh
providers. Unknown claim acknowledgements never reach the transport.

A fixed10-second deadline covers **fetch and the entire streamed body**.
The request is aborted and any acquired reader cancelled on completion/error;
cancellation is not awaited indefinitely. Actual response chunks are limited
to131072bytes regardless of Content-Length. Fatal UTF8 and bounded JSON
(20000nodes,28levels,safe integer numbers,valid Unicode) reject malformed data.
Only HTTP200 `application/json` with a JSON object whose `hash` matches the
internally known transaction hash returns a transport acknowledgement.

## Acknowledgement is not execution

The031 result retains its `invoked` discriminator. Only an invoked request has
`value`: deeply frozen `kind: "d1_initial_submission_response"`, `revision:1`,
`verification: "unverified"`, `transactionHash` and opaque `response`.
**Even plausible successful/result/ledger fields are not interpreted.** No CB
mapping, inclusion, actual fee, consumed sequence or terminal state is proved.
A later verified reconciliation must use the exact signed journal and accepted
issuance outcome decoder; this unit does not perform that read or persist it.

Transport/HTTP403/404/timeout/body/hash failures are sanitized by the031 gate as
`initial_submission_unavailable`503. Only its existing explicit database admin
denial can yield403. Unknown outcomes retain the immutable attempt and owner:
no retry, GET/readback, replan, refund, release or reset is attempted. A later
historical invocation cannot resubmit, including after an unknown response.
No actual provider, key loader or runtime is activated. Tests inject mocked
fetch and ephemeral fixture keys only; deployment/live signing remain separate.
