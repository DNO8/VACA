import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { DiscoveryDatabase } from "./discovery-ingestion.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { type DiscoveryRecord, parseDiscoveredOperation } from "./discovery.ts";

export interface OperatingCreditObservation {
  namespace: string;
  network: "TESTNET";
  pool: string;
  funder: string;
  operationId: string;
  transactionHash: string;
  ledger: number;
  amountStroops: string;
  anchor: { sequence: number; hash: string; closedAt: number };
  record: DiscoveryRecord;
}
function valid(value: unknown): asserts value {
  if (!value) throw new Error("invalid_operating_credit");
}
function operationToken(value: unknown): bigint {
  valid(typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value));
  const id = BigInt(value); valid(id <= 18446744073709551615n); return id;
}
/** Backend-only observation, NOT approval, spendable credit, or funding readiness.
 * teamFunders and source are trusted backend configuration, never request fields.
 */
export async function observeOperatingCredit(database: DiscoveryDatabase, operationId: string,
  teamFunders: readonly string[], source: Pick<HorizonDiscoverySource, "readOperationAtCheckpoint"> = new HorizonDiscoverySource(),
): Promise<OperatingCreditObservation> {
  let state;
  try { state = await database.loadState(); }
  catch (error) {
    // Preserve only the current-admin denial emitted by the validated RPC adapter.
    if (error instanceof CustodyError && error.message === "unauthorized_admin_wallet" && error.status === 403) throw error;
    throw new CustodyError("operating_credit_unavailable", 503);
  }
  try {
    valid(state.coverage_complete && state.checkpoint !== null);
    const { namespace, pool, first_ledger: firstLedger } = state, checkpoint = { ...state.checkpoint };
    const id = operationToken(operationId), ledger = id >> 32n;
    valid(id <= BigInt(checkpoint.cursor) && ledger >= BigInt(firstLedger) && ledger <= BigInt(checkpoint.through_ledger));
    valid(Array.isArray(teamFunders) && teamFunders.length > 0);
    const funders = new Set<string>();
    for (const funder of teamFunders) {
      valid(typeof funder === "string"); Keypair.fromPublicKey(funder);
      valid(!funders.has(funder) && funder !== pool); funders.add(funder);
    }
    const observed = await source.readOperationAtCheckpoint({ pool, firstLedger, checkpoint: { ...checkpoint } }, operationId);
    // Re-decode the raw boundary. Never trust injected classification/memo/amount.
    const record = parseDiscoveredOperation({ ...observed.operation.raw, pool,
      anchor: { sequence: checkpoint.through_ledger, closedAt: checkpoint.closed_at } });
    valid(JSON.stringify(observed) === JSON.stringify(record));
    valid(record.operation_id === operationId && record.ledger >= firstLedger && record.ledger <= checkpoint.through_ledger);
    const op = record.operation;
    valid(op.memo.type === "text" && op.memo.value === "D1OPS");
    valid(op.kind === "account_created" || (op.kind === "incoming_payment" && op.asset.type === "native"));
    const funder = op.kind === "account_created" ? op.funder : op.donor;
    valid(funder === op.source && funder !== pool && funders.has(funder) && op.pool === pool);
    const amount = op.kind === "account_created" ? op.starting_balance : op.amount;
    valid(/^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(amount));
    const stroops = BigInt(amount.replace(".", ""));
    valid(stroops > 0n && stroops <= 9223372036854775807n);
    return { namespace, network: "TESTNET", pool, funder, operationId, transactionHash: record.transaction_hash,
      ledger: record.ledger, amountStroops: String(stroops),
      anchor: { sequence: checkpoint.through_ledger, hash: checkpoint.ledger_hash, closedAt: checkpoint.closed_at }, record };
  } catch {
    throw new CustodyError("operating_credit_unavailable", 503);
  }
}
