# Refund source prerequisites: local incorporation, not activation

This bounded incorporation uses the frozen public `0e15e933` delivery snapshot
(manifest SHA-256 `0fd449839da1679150fa4b776d4409db6b8d50886bb147dab6324ec1fa094352`).
It does not import the complete backend, mount routes or establish financial acceptance.

## Review boundaries

| Unit | Source contract |
| --- | --- |
| Pure arithmetic | `calculateRefundFeeEarmarkBudget` protects the full selected fee cap; `calculateRefundLiquidPrincipal` protects original principal and exclusions. Both are normalized calculations, not fresh evidence or spending authority. |
| Additive APIs | The incorporation plan preserves the historical context/loader while adding same-observation history and candidate creation after validated absence. See the accounting and candidate guides. |
| Saved-initial fixture | The incorporation plan extracts the delivered recovery scaffold without removing existing assertions. Its optional coverage is established before initial observations, never by rewriting saved evidence. |

The existing handler, `/status`, runtime, index, Flutter client, D3, migrations,
dependency locks and environment remain unchanged. The delivered expanded SQL
suite needs migrations034–047; the owned034 suite stays unchanged in this unit.

## Verification limits

Test definitions cover full fee protection, native/issued principal, immutable
original gross, malformed inputs and getter rejection. They are **unexecuted**.
No RED/GREEN, typecheck, SDK execution, SQL, provider, app or device proof is claimed.
Opaque fixture RPC/hash tokens are not PostgreSQL identity or provider evidence.

Parent byte/provenance and unchanged-source checks plus an independent static
review are tracked in `odd/tasks/d1-refund-source-prerequisites.md`.
Real host composition, complete backend incorporation and SDK↔SQL/provider/client
acceptance are separate work. No automatic retry, TTL renewal or lane switch is added.
