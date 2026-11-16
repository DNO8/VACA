# Full-gross refund coordinator recovery

Source-only recovery from baseline `954f1e3e4e87818f255c36287e167d23eb6332e3`.
This is not deployment, activation, or a functional/security verification result.
Tests, typechecks, builds and runtime probes are unexecuted under S15.

## Lifecycle and response contract

- `refund-http-contract.ts` defines the existing v1 routes, states and response shape.
- `refund-lifecycle-observation.ts` joins stored original and refund evidence,
  validates SDK transaction bindings, and retains the original confirmation +300s deadline.
- Its observation explicitly grants neither execution nor settlement authority.
- Unstable joins and unresolved attempts remain unknown. Historical evidence does
  not renew spending permission or release durable ownership.

## Integration boundary

These modules do not mount an endpoint or provision a service identity. Existing
host, donor and status routes remain untouched. The manual signed-command path,
settlement observer and inert wrapper follow in separate source slices.
Automatic execution still requires explicit limited service admission and
server-authoritative selection; evidence-read permission alone is insufficient.
