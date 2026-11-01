import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { DiscoveryDatabase } from "./discovery-ingestion.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { parseDiscoveredOperation } from "./discovery.ts";
import { observeOperatingCredit, type OperatingCreditObservation } from "./operating-credit.ts";

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
type Source = Pick<HorizonDiscoverySource, "readOperationAtCheckpoint">;
export interface OperatingCreditReceipt {
  kind: "d1_operating_credit_observation"; revision: 1; authorized_by: string; observation: OperatingCreditObservation;
}
function unavailable(): CustodyError { return new CustodyError("operating_credit_unavailable", 503); }
function valid(value: unknown): asserts value { if (!value) throw unavailable(); }
/** Reject accessors, symbols, holes, cycles and non-JSON values before cloning.
 * Preserve JSONB key order for the returned original; compare separately by structure. */
function snapshot(value: unknown, sorted = false): unknown {
  let nodes = 0;
  function visit(v: unknown, depth: number): unknown {
    valid(++nodes <= 20000 && depth <= 28);
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number") { valid(Number.isSafeInteger(v)); return v; }
    valid(typeof v === "object");
    const array = Array.isArray(v);
    valid(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype));
    const keys = Reflect.ownKeys(v), descriptors = Object.getOwnPropertyDescriptors(v);
    valid(keys.every((key) => typeof key === "string" && "value" in descriptors[key] &&
      (descriptors[key].enumerable || (array && key === "length"))));
    if (array) {
      valid(keys.length === v.length + 1 && v.length <= 20000);
      return Array.from({ length: v.length }, (_, i) => { valid(Object.hasOwn(v, i)); return visit(descriptors[String(i)].value, depth + 1); });
    }
    return Object.fromEntries((sorted ? (keys as string[]).sort() : keys as string[]).map((k) => [k, visit(descriptors[k].value, depth + 1)]));
  }
  const result = visit(value, 0); valid(JSON.stringify(result).length <= 65536); return result;
}
function same(a: unknown, b: unknown): boolean { return JSON.stringify(snapshot(a, true)) === JSON.stringify(snapshot(b, true)); }
function exact(value: unknown, keys: string): Record<string, unknown> {
  valid(value !== null && typeof value === "object" && !Array.isArray(value));
  valid(Object.keys(value).sort().join(",") === keys); return value as Record<string, unknown>;
}
function address(value: unknown): asserts value is string { valid(typeof value === "string"); Keypair.fromPublicKey(value); }
function id(value: unknown): asserts value is string {
  valid(typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n);
}
function uint(value: unknown, min: number, max: number): asserts value is number {
  valid(typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max);
}
function observation(value: unknown, namespace: string, pool: string, operationId: string): OperatingCreditObservation {
  const o = exact(value, "amountStroops,anchor,funder,ledger,namespace,network,operationId,pool,record,transactionHash");
  valid(o.namespace === namespace && o.pool === pool && o.network === "TESTNET" && o.operationId === operationId);
  address(o.funder); valid(o.funder !== pool);
  const a = exact(o.anchor, "closedAt,hash,sequence"); uint(a.sequence, 1, 4294967295); uint(a.closedAt, 0, 253402300799);
  valid(typeof a.hash === "string" && /^[0-9a-f]{64}$/.test(a.hash));
  const r = exact(o.record, "ledger,operation,operation_id,paging_token,transaction_hash");
  const op = r.operation as OperatingCreditObservation["record"]["operation"];
  const raw = exact(op.raw, "operation,transaction");
  const decoded = parseDiscoveredOperation({ operation: raw.operation, transaction: raw.transaction, pool,
    anchor: { sequence: a.sequence, closedAt: a.closedAt } });
  valid(same(decoded, r) && decoded.operation_id === operationId && o.transactionHash === decoded.transaction_hash && o.ledger === decoded.ledger);
  const d = decoded.operation;
  valid(d.memo.type === "text" && d.memo.value === "D1OPS" && d.source === o.funder &&
    (d.kind === "account_created" || (d.kind === "incoming_payment" && d.asset.type === "native")));
  valid(d.pool === pool && (d.kind === "account_created" ? d.funder : d.donor) === o.funder);
  const amount = d.kind === "account_created" ? d.starting_balance : d.amount;
  const stroops = BigInt(amount.replace(".", ""));
  valid(stroops > 0n && stroops <= 9223372036854775807n && o.amountStroops === String(stroops));
  return value as OperatingCreditObservation;
}
/** Trusted backend context only, not an HTTP endpoint or independent chain proof. */
export class OperatingCreditDatabase {
  readonly #rpc: Rpc; readonly #namespace: string; readonly #admin: string; readonly #discovery: DiscoveryDatabase;
  constructor(client: { rpc: Rpc }, namespace: string, authenticatedAdmin: string) {
    try {
      valid(typeof namespace === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(namespace));
      address(authenticatedAdmin); this.#rpc = client.rpc.bind(client); this.#namespace = namespace; this.#admin = authenticatedAdmin;
      this.#discovery = new DiscoveryDatabase({ rpc: this.#rpc }, namespace, authenticatedAdmin);
      Object.freeze(this.#discovery);
    } catch { throw unavailable(); }
  }
  private async call(name: "d1_load_operating_credit" | "d1_record_operating_credit", extra: Record<string, unknown>): Promise<unknown> {
    let failure: CustodyError | undefined;
    try {
      const result = await this.#rpc(name, { p_namespace: this.#namespace, p_authorized_by: this.#admin, ...extra });
      valid(result !== null && typeof result === "object" && Object.getPrototypeOf(result) === Object.prototype);
      const descriptors = Object.getOwnPropertyDescriptors(result);
      valid(descriptors.data && "value" in descriptors.data && descriptors.error && "value" in descriptors.error);
      if (descriptors.error.value === null) return snapshot(descriptors.data.value);
      const error = descriptors.error.value;
      if (error !== null && typeof error === "object" && Object.getPrototypeOf(error) === Object.prototype) {
        const message = Object.getOwnPropertyDescriptor(error, "message");
        if (message && "value" in message && typeof message.value === "string") {
          if (message.value === "unauthorized_admin_wallet") failure = new CustodyError(message.value, 403);
          if (message.value === "operating_credit_conflict") failure = new CustodyError(message.value, 409);
        }
      }
    } catch { /* Unknown outcomes never trigger retry/readback. */ }
    throw failure ?? unavailable();
  }
  async load(operationId: string): Promise<{ pool: string; receipt: OperatingCreditReceipt | null }> {
    try { id(operationId); } catch { throw unavailable(); }
    const data = await this.call("d1_load_operating_credit", { p_operation_id: operationId });
    try {
      const l = exact(data, "kind,namespace,network,operation_id,pool,receipt,revision");
      valid(l.kind === "d1_operating_credit_lookup" && l.revision === 1 && l.namespace === this.#namespace &&
        l.network === "TESTNET" && l.operation_id === operationId); address(l.pool);
      return { pool: l.pool, receipt: l.receipt === null ? null : this.receipt(l.receipt, l.pool, operationId) };
    } catch { throw unavailable(); }
  }
  private receipt(value: unknown, pool: string, operationId: string): OperatingCreditReceipt {
    const r = exact(value, "authorized_by,kind,observation,revision");
    valid(r.kind === "d1_operating_credit_observation" && r.revision === 1); address(r.authorized_by);
    observation(r.observation, this.#namespace, pool, operationId); return value as OperatingCreditReceipt;
  }
  async observeAndSave(pool: string, operationId: string, funders: readonly string[], source: Source): Promise<OperatingCreditReceipt> {
    let observed: OperatingCreditObservation;
    try {
      observed = snapshot(await observeOperatingCredit(this.#discovery, operationId, funders, source)) as OperatingCreditObservation;
      observation(observed, this.#namespace, pool, operationId);
    } catch (error) {
      if (error instanceof CustodyError && error.message === "unauthorized_admin_wallet" && error.status === 403) throw error;
      throw unavailable();
    }
    const data = await this.call("d1_record_operating_credit", { p_observation: snapshot(observed) });
    try {
      const receipt = this.receipt(data, pool, operationId);
      valid(receipt.authorized_by === this.#admin && same(receipt.observation, observed)); return receipt;
    } catch { throw unavailable(); }
  }
}
/** Load first. A committed but lost save can only recover on an explicit later call. */
export async function recordOperatingCredit(database: OperatingCreditDatabase, operationId: string, teamFunders: readonly string[],
  source?: Source): Promise<OperatingCreditReceipt> {
  // Capture backend configuration before the first await; providers are not touched on replay.
  let funders: readonly string[], read: Source["readOperationAtCheckpoint"] | undefined;
  try { funders = snapshot(teamFunders) as string[]; }
  catch { funders = []; } // Historical classification does not depend on today's allowlist.
  try { if (source) read = source.readOperationAtCheckpoint.bind(source); } catch { /* Only needed on a miss. */ }
  const lookup = await database.load(operationId);
  if (lookup.receipt) return lookup.receipt;
  if (source && !read) throw unavailable();
  const provider = source ? undefined : new HorizonDiscoverySource();
  const method = read ?? provider!.readOperationAtCheckpoint.bind(provider);
  const reader: Source = { async readOperationAtCheckpoint(context, requestedId) {
    return snapshot(await method(context, requestedId)) as OperatingCreditObservation["record"];
  } };
  return await database.observeAndSave(lookup.pool, operationId, funders, reader);
}
