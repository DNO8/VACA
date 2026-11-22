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

export const VIDEO_AUTO_SCOPE = Object.freeze({
  url: DEPLOYED_SCOPE.url,
  pool: "GAYWVFBP2YPYMU245D6AOE7WWTVZOWGPVIFVGOH5EFFSSQ3VZAVR5JCW",
  namespace: "8126a1f4-ed8a-41ec-905b-9ad3442e5e6e", firstLedger: 5859490,
  creationOperationId: "25166317921255425",
});

/** Existing manual configuration and bindings are unchanged. */
export function createDeploymentRuntime(dependencies: Dependencies) {
  return createScopedRuntime(dependencies, DEPLOYED_SCOPE);
}

/** The second host has no D1 setting fallback to the first host. */
export function createVideoAutoRuntime(dependencies: Dependencies) {
  if (dependencies.getEnv("D1_VIDEO_AUTO_ENABLED") !== "true") throw new Error("Custody configuration unavailable");
  const getEnv = (name: string) => dependencies.getEnv(name.startsWith("D1_")
    ? "D1_VIDEO_AUTO_" + name.slice(3) : name);
  const operation = getEnv("D1_OPERATING_OPERATION_ID");
  if (typeof operation !== "string" || !/^[1-9][0-9]{0,19}$/.test(operation) ||
      String(BigInt(operation)) !== operation || BigInt(operation) > 18446744073709551615n ||
      (BigInt(operation) >> 32n) < BigInt(VIDEO_AUTO_SCOPE.firstLedger) ||
      operation === VIDEO_AUTO_SCOPE.creationOperationId) throw new Error("Custody configuration unavailable");
  const funder = getEnv("D1_OPERATING_FUNDER") ?? "";
  return createScopedRuntime({ ...dependencies, getEnv }, { ...VIDEO_AUTO_SCOPE, funder }, operation);
}

function createScopedRuntime(dependencies: Dependencies, scope: {
  pool: string; namespace: string; firstLedger: number; creationOperationId: string; funder: string; url: string;
}, operatingCreditOperationId?: string) {
  const { getEnv, clientFactory, fetcher, now } = dependencies;
  const required = (name: string): string => {
    const value = getEnv(name);
    if (!value) throw new Error("Custody configuration unavailable");
    return value;
  };
  if (required("D1_POOL_PUBLIC_KEY") !== scope.pool ||
      required("D1_NAMESPACE") !== scope.namespace ||
      required("D1_FIRST_LEDGER") !== String(scope.firstLedger) ||
      required("SUPABASE_URL") !== scope.url) throw new Error("Custody configuration unavailable");
  const client = clientFactory(scope.url, required("SUPABASE_SERVICE_ROLE_KEY"));
  const base = createCustodyDeploymentHost({ client, ...scope, operatingCreditOperationId,
    teamFunders: [scope.funder], fetcher, now,
    readSecret: requested => {
      if (requested !== scope.pool) throw new Error("Custody configuration unavailable");
      return required("D1_POOL_SECRET_SEED");
    },
  });
  let automatic = createRefundAutomaticHttp();
  try {
    const configuration = readRefundAutomaticConfiguration(getEnv, scope.pool);
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
