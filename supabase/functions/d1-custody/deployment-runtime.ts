import { createCustodyDeploymentHost, type DeploymentHostDependencies } from "./deployment-host.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { readRefundAutomaticConfiguration } from "./refund-automatic-configuration.ts";
import { createRefundAutomaticPage, type RefundOriginalConfirmationPolicy } from "./refund-automatic-page.ts";
import { createRefundAutomaticHttp } from "./refund-automatic-http.ts";

// Public bindings retained from deployed v4; configuration cannot select another target.
export const DEPLOYED_SCOPE = Object.freeze({
  pool: "GBJU5J6F2L6XXPTYADYS6NIPAP6RAJBN7SAXJDAOWIFSPEWFSCASEIXN",
  namespace: "5a08ccd6-b4ba-4b31-adc9-fe3e57a6bda7", firstLedger: 5676563,
  creationOperationId: "24380652438728705",
  funder: "GABY7MJYU3ORNMO2THEUSO3R5H2R5FUC7VT5QHTSLGP3PAT3C4QBPEE4",
  url: "https://tgqxxnldwiqisopiclmk.supabase.co",
});
// Approved inclusive original-confirmation bound: Chile midnight on 2026-11-15.
// Fixed rollout scope, never a moving "yesterday", request field or secret setting.
export const DEPLOYED_ORIGINAL_CONFIRMATION_POLICY: RefundOriginalConfirmationPolicy = Object.freeze({
  confirmedAtOrAfter: Date.parse("2026-11-15T03:00:00Z") / 1000,
});
interface Dependencies {
  getEnv(name: string): string | undefined;
  clientFactory(url: string, serviceKey: string): DeploymentHostDependencies["client"];
  fetcher: typeof fetch;
  now(): number;
}

/** Explicit deployment composition; the separate experimental index remains untouched. */
export function createDeploymentRuntime(dependencies: Dependencies) {
  const { getEnv, clientFactory, fetcher, now } = dependencies;
  const required = (name: string): string => {
    const value = getEnv(name);
    if (!value) throw new Error("Custody configuration unavailable");
    return value;
  };
  if (required("D1_POOL_PUBLIC_KEY") !== DEPLOYED_SCOPE.pool ||
      required("D1_NAMESPACE") !== DEPLOYED_SCOPE.namespace ||
      required("D1_FIRST_LEDGER") !== String(DEPLOYED_SCOPE.firstLedger) ||
      required("SUPABASE_URL") !== DEPLOYED_SCOPE.url) throw new Error("Custody configuration unavailable");
  const client = clientFactory(DEPLOYED_SCOPE.url, required("SUPABASE_SERVICE_ROLE_KEY"));
  const base = createCustodyDeploymentHost({ client, ...DEPLOYED_SCOPE,
    teamFunders: [DEPLOYED_SCOPE.funder], fetcher, now,
    readSecret: requested => {
      if (requested !== DEPLOYED_SCOPE.pool) throw new Error("Custody configuration unavailable");
      return required("D1_POOL_SECRET_SEED");
    },
  });
  let automatic = createRefundAutomaticHttp();
  try {
    const configuration = readRefundAutomaticConfiguration(getEnv, DEPLOYED_SCOPE.pool);
    if (configuration !== null) {
      const { token, ...pageConfiguration } = configuration;
      const runPage = createRefundAutomaticPage({ ...pageConfiguration, client, now,
        originalConfirmationPolicy: DEPLOYED_ORIGINAL_CONFIRMATION_POLICY,
        source: new HorizonDiscoverySource(fetcher), fetcher });
      automatic = createRefundAutomaticHttp({ token, maxBatchSize: configuration.maxBatchSize,
        runPage: after => runPage(after, configuration.maxBatchSize) });
    }
  } catch { /* Tick configuration never disables the existing initial/manual host. */ }
  const tick = automatic;
  return (request: Request) => new URL(request.url).pathname === "/functions/v1/d1-custody/internal-refund-tick"
    ? tick(request) : base(request);
}
