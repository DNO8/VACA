import { CustodyError } from "./handler.ts";
import { verifyIssuanceCommand } from "./issuance-command.ts";
import { submitInitialIssuance } from "./initial-issuance-submission.ts";

type SignerConfiguration = Parameters<typeof submitInitialIssuance>[1];
export interface IssuanceHttpDependencies {
  readonly client: Parameters<typeof submitInitialIssuance>[0];
  readonly configuration: Omit<SignerConfiguration, "requestId" | "authenticatedAdmin"> & {
    readonly source: NonNullable<SignerConfiguration["source"]>;
  };
  readonly fetcher: typeof fetch;
}
const unavailable = () => new CustodyError("initial_submission_unavailable", 503);
function failure(error: CustodyError): Response {
  return Response.json({ error: error.code }, {
    status: error.status, headers: { "cache-control": "no-store" },
  });
}
/** Optional backend route. A transport acknowledgement is never an included outcome. */
export async function issueHttp(request: Request, dependencies: IssuanceHttpDependencies, pool: string): Promise<Response> {
  let command: Awaited<ReturnType<typeof verifyIssuanceCommand>>;
  try {
    const configuration = dependencies.configuration;
    if (configuration.pool !== pool) throw unavailable();
    command = await verifyIssuanceCommand(request, configuration);
  } catch (error) {
    // Only the unchanged proof parser's public errors survive this boundary.
    if (error instanceof CustodyError && (
      (error.code === "invalid_request" && error.status === 400) ||
      (["stale_request", "invalid_signature"].includes(error.code) && error.status === 401)
    )) return failure(error);
    return failure(unavailable());
  }
  try {
    const configuration = dependencies.configuration;
    // Runtime checks prevent missing JS dependencies from enabling SDK network defaults.
    if (typeof dependencies.fetcher !== "function" || typeof configuration.loadPoolSigner !== "function" ||
        typeof configuration.source?.readAccountAtCheckpoint !== "function") throw unavailable();
    const client = dependencies.client, fetcher = dependencies.fetcher;
    const bound = { ...configuration, namespace: command.namespace, pool: command.pool,
      requestId: command.requestId, authenticatedAdmin: command.authenticatedAdmin };
    let result: Awaited<ReturnType<typeof submitInitialIssuance>>;
    try {
      result = await submitInitialIssuance(client, bound, fetcher);
    } catch (error) {
      // Only an SDK-validated database denial may cross as 403, never a DI exception.
      if (error instanceof CustodyError && error.code === "unauthorized_admin_wallet" && error.status === 403) return failure(error);
      throw error;
    }
    const transactionHash = result.attempt.transaction_hash;
    if (typeof transactionHash !== "string" || !/^[0-9a-f]{64}$/.test(transactionHash)) throw unavailable();
    return Response.json({ state: "pending", verification: "unverified", requestId: command.requestId, transactionHash }, {
      status: 202, headers: { "cache-control": "no-store" },
    });
  } catch {
    return failure(unavailable());
  }
}
