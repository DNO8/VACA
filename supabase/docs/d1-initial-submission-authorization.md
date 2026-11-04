# Consume a private initial submission acknowledgement

`withInitialSubmissionAuthorization(client, trustedSignerConfiguration, backendAction)` composes the accepted SDK signed journal, fresh financial gate and private031 claim. It is an internal backend boundary, not wallet authentication or a mounted HTTP route. The client and configuration must be backend-owned; neither an HTTP-supplied grant, nonce nor signed XDR is accepted.

## One-shot flow

1. Load031 first and validate its exact scope and bounded DTO.
2. If an attempt exists, validate actual018/030 signed bytes using the accepted SDK coordinator without clock, account, key-provider or fresh-write access. Check that attempt's actual028 snapshot membership, scoped reservation, transaction hash and decoded-envelope hash. Preserve the original actor/nonce and return `invoked: false`. Never call the action.
3. Otherwise, obtain the SDK signed journal internally, then construct a fresh financial authorization. Fresh snapshot B may differ from the signed journal's original snapshot A, but must bind the identical unsigned transaction and reservation.
4. Generate a UUID nonce internally and await exactly one031 claim. Validate the exact four-field acknowledgement and thirteen-field attempt. A false acknowledgement preserves the original receipt, validates its historical membership and never invokes the action.
5. A true acknowledgement must match this call's nonce, current admin, actual signed envelope/hash/reservation and fresh snapshot B. Its epoch-second timestamp must be a safe nonnegative integer within two seconds of the checked interval and strictly before expiry.
6. Recheck a safe, nondecreasing clock after the awaited claim and validation, immediately before calling the backend action once with deeply frozen signed bytes/hash/attempt. The action's return value is preserved, not recursively frozen.

The result has kind `d1_initial_submission_attempt`, revision1 and the immutable attempt. `invoked: true` includes the action's `value`; `invoked: false` has no action value. Invocation is **not proof of broadcast, inclusion, success, a claimable balance or final accounting**. Never serialize signed bytes or a service acknowledgement to HTTP clients.

## Errors and unknown outcomes

| Error | Status | Meaning |
|---|---|---|
| `unauthorized_admin_wallet` |403| Only explicit RPC null-data denial with code42501 and that exact message. |
| `initial_submission_unavailable` |503| Invalid DTO/binding, stale or decreasing clock, unknown claim/action result, transport/provider/source exception, or forged dependency/action403. No dependency details leak. |

RPC values are plain JSON bounded to20,000 nodes, depth40 and2MiB serialized UTF-8; getters, cycles, object aliases, sparse arrays and non-finite numbers are rejected. Only trusted SDK-produced artifact data is exposed to the action.

Unknown acknowledgement, action failure or expiry after a recorded claim retains ownership. There is no automatic retry, readback, release or reset. A separately initiated later call can return historical evidence but cannot invoke again. Current admin membership is checked by the service RPCs; wallet proof remains the owning runtime's responsibility.

## Local evidence boundary

Unit fixtures use real SDK native/issued transactions with ephemeral keys and mock private RPCs. They cover A/B snapshot distinction, historical membership, original actors, losing claims, nonce/scope/hash/reservation/timestamp/DTO rejection, awaited claims, expiry/clock rollback, denial provenance and unknown outcomes. Existing SQL concurrency verification remains separate. No HTTP/Horizon submission, reconciliation, terminal disposition, deployment, real provider activation or full-D1 completion is introduced here.
