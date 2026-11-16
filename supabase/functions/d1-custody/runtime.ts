import { createCustodyHandler, type CustodyConfiguration, type CustodyHandler } from "./handler.ts";
import type { IssuanceHttpDependencies } from "./issuance-http.ts";
import type { ReconciliationHttpDependencies } from "./issuance-reconciliation-http.ts";
import type { DonorPaymentHttpDependencies } from "./donor-payment-http.ts";

export interface PrivateCustodyRuntime {
  readonly client: IssuanceHttpDependencies["client"];
  readonly configuration: IssuanceHttpDependencies["configuration"];
  readonly fetcher: typeof fetch;
  readonly reconciliationSource: ReconciliationHttpDependencies["configuration"]["source"];
  readonly availabilityFetcher?: typeof fetch;
}

/** Server-only composition boundary; importing this module reads no environment or private keys. */
export function createCustodyRuntime(
  base: Omit<CustodyConfiguration, "issuance" | "reconciliation">,
  lifecycle?: PrivateCustodyRuntime,
  donorPayment?: DonorPaymentHttpDependencies,
): CustodyHandler {
  // Donor capture is independent of optional issuance/reconciliation wiring.
  // Existing one/two-argument callers and an explicit base hook remain valid.
  const mounted = donorPayment ? { ...base, donorPayment } : base;
  if (!lifecycle) return createCustodyHandler(mounted);
  const { client, configuration, fetcher, reconciliationSource, availabilityFetcher } = lifecycle;
  return createCustodyHandler({
    ...mounted,
    status: base.status ?? {
      client,
      configuration: { namespace: configuration.namespace, pool: configuration.pool, now: configuration.now },
    },
    issuance: { client, configuration, fetcher, availabilityFetcher },
    reconciliation: {
      client,
      configuration: {
        namespace: configuration.namespace,
        pool: configuration.pool,
        now: configuration.now,
        source: reconciliationSource,
      },
    },
  });
}
