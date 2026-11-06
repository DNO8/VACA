import { createCustodyHandler, type CustodyConfiguration, type CustodyHandler } from "./handler.ts";
import type { IssuanceHttpDependencies } from "./issuance-http.ts";
import type { ReconciliationHttpDependencies } from "./issuance-reconciliation-http.ts";

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
): CustodyHandler {
  if (!lifecycle) return createCustodyHandler(base);
  const { client, configuration, fetcher, reconciliationSource, availabilityFetcher } = lifecycle;
  return createCustodyHandler({
    ...base,
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
