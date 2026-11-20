import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { createCustodyHandler, CustodyError, type CustodyHandler } from "./handler.ts";
import { CustodyDatabase, TestnetPayments } from "./adapters.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { DiscoveryDatabase, ingestDiscoveryPage } from "./discovery-ingestion.ts";
import { TransactionHistoryDatabase, ingestTransactionPage } from "./transaction-ingestion.ts";
import { OperatingCreditDatabase, recordOperatingCredit } from "./operating-credit-journal.ts";
import { createIssuanceCoordinator } from "./issuance-coordinator.ts";
import { IssuanceFeeCommitmentDatabase } from "./issuance-fee-commitment.ts";
import { verifyIssuanceCommand } from "./issuance-command.ts";
import { createRefundRuntime } from "./refund-runtime.ts";
import { createRemainderRuntime } from "./remainder-runtime.ts";

export interface DeploymentHostDependencies {
  readonly client: ConstructorParameters<typeof CustodyDatabase>[0];
  readonly pool: string;
  readonly namespace: string;
  readonly firstLedger: number;
  readonly creationOperationId: string;
  readonly operatingCreditOperationId?: string;
  readonly teamFunders: readonly string[];
  readonly readSecret: (pool: string) => string | Promise<string>;
  readonly fetcher: typeof fetch;
  readonly now: () => number;
}
const unavailable = () => new CustodyError("initial_submission_unavailable", 503);
function requireValid(value: unknown): asserts value { if (!value) throw unavailable(); }
function object(value: unknown): Record<string, unknown> {
  requireValid(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function failure(error: CustodyError): Response {
  return Response.json({ error: error.code }, { status: error.status, headers: { "cache-control": "no-store" } });
}

/** Retained v4 composition; no environment access or signing at construction. */
export function createCustodyDeploymentHost(dependencies: DeploymentHostDependencies): CustodyHandler {
  const { client, pool, namespace, firstLedger, creationOperationId, readSecret, fetcher, now } = dependencies;
  const teamFunders = Object.freeze([...dependencies.teamFunders]);
  const creditOperationId = dependencies.operatingCreditOperationId ?? creationOperationId;
  requireValid(/^[1-9][0-9]{0,19}$/.test(creditOperationId) && String(BigInt(creditOperationId)) === creditOperationId &&
    BigInt(creditOperationId) <= 18446744073709551615n && (BigInt(creditOperationId) >> 32n) >= BigInt(firstLedger));
  Keypair.fromPublicKey(pool);
  requireValid(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(namespace));
  requireValid(Number.isSafeInteger(firstLedger) && firstLedger > 0);
  requireValid(/^[1-9][0-9]{0,19}$/.test(creationOperationId) && BigInt(creationOperationId) >> 32n === BigInt(firstLedger));
  requireValid(teamFunders.length > 0 && new Set(teamFunders).size === teamFunders.length);
  for (const funder of teamFunders) requireValid(Keypair.fromPublicKey(funder).publicKey() === funder && funder !== pool);
  const source = new HorizonDiscoverySource(fetcher);
  const database = new CustodyDatabase(client);
  const configuration = Object.freeze({ pool, namespace, now });
  const financial = Object.freeze({ maximumAgeSeconds: 30, futureToleranceSeconds: 2,
    async loadPoolSigner(requested: string): Promise<Keypair> {
      try {
        requireValid(requested === pool);
        const seed = await readSecret(pool);
        requireValid(typeof seed === "string" && StrKey.isValidEd25519SecretSeed(seed));
        const key = Keypair.fromSecret(seed);
        requireValid(key.canSign() && key.publicKey() === pool && key.secret() === seed);
        return key;
      } catch { throw new CustodyError("initial_signing_unavailable", 503); }
    },
  });
  const base = createCustodyHandler({ poolSigner: Keypair.fromPublicKey(pool),
    ledger: new TestnetPayments(fetcher), database, now,
    issuance: { client, configuration: { ...configuration, ...financial, source }, fetcher, availabilityFetcher: fetcher },
    reconciliation: { client, configuration: { ...configuration, source } },
    donorPayment: { client, configuration },
  });
  const feeCommitment = new IssuanceFeeCommitmentDatabase(client, { pool, futureRefundFee: () => "300" });
  async function lookup(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await client.rpc(name, args);
    if (result.error !== null) {
      const error = object(result.error);
      if (result.data === null && error.code === "42501" && error.message === "unauthorized_admin_wallet") {
        throw new CustodyError("unauthorized_admin_wallet", 403);
      }
      throw unavailable();
    }
    const data = object(result.data);
    requireValid(data.namespace === namespace && data.pool === pool && data.network === "TESTNET" && data.revision === 1);
    return data;
  }
  async function prepareIssuance(request: Request): Promise<void> {
    const command = await verifyIssuanceCommand(request, configuration);
    const args = { p_request_id: command.requestId, p_authorized_by: command.authenticatedAdmin };
    const outcome = await lookup("d1_load_issuance_outcome", args);
    requireValid(outcome.kind === "d1_issuance_outcome_lookup" && outcome.request_id === command.requestId);
    if (outcome.outcome !== null) return;
    const attempt = await lookup("d1_load_submission_attempt", args);
    requireValid(attempt.kind === "d1_submission_attempt_lookup" && attempt.request_id === command.requestId);
    if (attempt.attempt !== null) return;
    const discovery = new DiscoveryDatabase(client, namespace, command.authenticatedAdmin);
    const before = await discovery.loadState();
    requireValid(before.pool === pool && before.first_ledger === firstLedger);
    const income = await ingestDiscoveryPage(discovery, source);
    requireValid(income.completeAtAnchor && income.receipt.pool === pool);
    const history = await ingestTransactionPage(new TransactionHistoryDatabase(client, namespace,
      command.authenticatedAdmin, pool, "TESTNET"), source);
    requireValid(history.completeAtAnchor);
    await recordOperatingCredit(new OperatingCreditDatabase(client, namespace, command.authenticatedAdmin),
      creditOperationId, teamFunders, source);
    const saved = await discovery.loadState();
    requireValid(saved.pool === pool && saved.first_ledger === firstLedger && saved.coverage_complete && saved.checkpoint);
    const account = await source.readAccountAtCheckpoint({ pool, firstLedger, checkpoint: saved.checkpoint });
    requireValid(account.pool === pool && account.anchor.sequence === saved.checkpoint.through_ledger &&
      account.anchor.hash === saved.checkpoint.ledger_hash && account.anchor.closedAt === saved.checkpoint.closed_at);
    await createIssuanceCoordinator({ pool, database, now, fee: () => account.baseFee,
      observeAccount: async requested => {
        requireValid(requested === pool);
        return { network: "TESTNET", pool, sequence: account.sequence };
      },
    })(command.requestId, command.authenticatedAdmin);
    await feeCommitment.record(command.requestId, command.authenticatedAdmin);
  }
  return async request => {
    try {
      const path = new URL(request.url).pathname;
      if (request.method === "POST" && path === "/functions/v1/d1-custody/issue") await prepareIssuance(request.clone());
      const construction = { feePerOperationStroops: "100", validUntil: now() + 60 };
      const manual = { client, configuration, source, financial, construction, fetcher };
      return await createRemainderRuntime({ remainder: manual,
        custodyHandler: createRefundRuntime({ refund: manual, custodyHandler: base }) })(request);
    } catch (error) {
      return failure(error instanceof CustodyError &&
          ["invalid_request", "stale_request", "invalid_signature", "unauthorized_admin_wallet"].includes(error.code) &&
          [400, 401, 403].includes(error.status) ? error : unavailable());
    }
  };
}
