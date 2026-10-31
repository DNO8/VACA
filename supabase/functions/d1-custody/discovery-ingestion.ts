import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { HorizonDiscoverySource, type DiscoveryCheckpoint, type DiscoveryPage } from "./discovery-source.ts";

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export interface DiscoveryState {
  kind: "d1_discovery_state"; revision: 1; namespace: string; network: "TESTNET"; pool: string;
  first_ledger: number; checkpoint: DiscoveryCheckpoint | null; coverage_complete: boolean;
}
export interface DiscoveryReceipt {
  kind: "d1_discovery_page"; revision: 1; namespace: string; network: "TESTNET"; pool: string;
  from_cursor: string; to_cursor: string; checkpoint_ledger: number; checkpoint_hash: string;
  page_count: number; record_count: number;
}
function requireValid(value: unknown): asserts value {
  if (!value) throw new CustodyError("dependency_unavailable", 503);
}
function object(value: unknown): Record<string, unknown> {
  requireValid(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  requireValid(Object.values(Object.getOwnPropertyDescriptors(value)).every((d) => "value" in d));
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: string): Record<string, unknown> {
  const dto = object(value);
  requireValid(Reflect.ownKeys(dto).length === keys.split(",").length && Object.keys(dto).sort().join(",") === keys);
  return dto;
}
function uint(value: unknown, max: number, min = 0): asserts value is number {
  requireValid(typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max);
}
function token(value: unknown): bigint {
  requireValid(typeof value === "string" && /^(0|[1-9][0-9]{0,19})$/.test(value));
  const n = BigInt(value); requireValid(n <= 18446744073709551615n); return n;
}
function anchor(value: Record<string, unknown>): void {
  uint(value.through_ledger, 4294967295, 1); uint(value.closed_at, 253402300799);
  requireValid(typeof value.ledger_hash === "string" && /^[0-9a-f]{64}$/.test(value.ledger_hash));
}
function address(value: unknown): asserts value is string {
  requireValid(typeof value === "string"); Keypair.fromPublicKey(value);
}
function validatePage(page: DiscoveryPage): void {
  const p = exact(page, "closed_at,from_cursor,ledger_hash,records,revision,through_ledger,to_cursor");
  requireValid(p.revision === 1); anchor(p);
  let cursor = token(p.from_cursor); token(p.to_cursor);
  requireValid(Array.isArray(p.records) && p.records.length <= 50);
  for (const raw of p.records) {
    const r = exact(raw, "ledger,operation,operation_id,paging_token,transaction_hash");
    uint(r.ledger, page.through_ledger, 1);
    const next = token(r.paging_token);
    requireValid(next > cursor && (next >> 32n) <= BigInt(page.through_ledger) && token(r.operation_id) > 0n);
    requireValid(typeof r.transaction_hash === "string" && /^[0-9a-f]{64}$/.test(r.transaction_hash));
    object(r.operation); cursor = next;
  }
  requireValid(cursor === token(p.to_cursor));
}
/** Namespace and identity are trusted backend bindings, NOT proof of authentication. */
export class DiscoveryDatabase {
  constructor(private readonly client: RpcClient, private readonly namespace: string, private readonly authenticatedAdmin: string) {
    try {
      requireValid(typeof namespace === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(namespace));
      address(authenticatedAdmin);
    } catch { throw new CustodyError("dependency_unavailable", 503); }
  }
  private async rpc(name: string, extra: Record<string, unknown> = {}): Promise<unknown> {
    let result;
    try {
      result = object(await this.client.rpc(name, { p_namespace: this.namespace, p_authorized_by: this.authenticatedAdmin, ...extra }));
      requireValid(Object.hasOwn(result, "data") && Object.hasOwn(result, "error"));
      if (result.error === null) return result.data;
      const error = object(result.error);
      requireValid(Object.hasOwn(error, "message") && typeof error.message === "string");
      const statuses: Record<string, number> = { unauthorized_admin_wallet: 403, pool_not_activated: 422, discovery_conflict: 409 };
      if (Object.hasOwn(statuses, error.message)) {
        // Construct only from known own string messages; no raw dependency error escapes.
        result = new CustodyError(error.message, statuses[error.message]);
      } else result = null;
    } catch { result = null; }
    throw result instanceof CustodyError ? result : new CustodyError("dependency_unavailable", 503);
  }
  async loadState(): Promise<DiscoveryState> {
    const data = await this.rpc("d1_load_discovery_state");
    try {
      const s = exact(data, "checkpoint,coverage_complete,first_ledger,kind,namespace,network,pool,revision");
      requireValid(s.kind === "d1_discovery_state" && s.revision === 1 && s.namespace === this.namespace && s.network === "TESTNET");
      address(s.pool); uint(s.first_ledger, 4294967295, 1);
      requireValid(typeof s.coverage_complete === "boolean");
      if (s.checkpoint === null) requireValid(s.coverage_complete === false);
      else {
        const c = exact(s.checkpoint, "closed_at,cursor,ledger_hash,through_ledger"); anchor(c);
        requireValid(token(c.cursor) >> 32n <= BigInt(c.through_ledger as number));
        requireValid((c.through_ledger as number) >= s.first_ledger);
      }
      return data as DiscoveryState;
    } catch { throw new CustodyError("dependency_unavailable", 503); }
  }
  async recordPage(pool: string, page: DiscoveryPage): Promise<DiscoveryReceipt> {
    let expected;
    try {
      address(pool); validatePage(page);
      expected = { kind: "d1_discovery_page", revision: 1, namespace: this.namespace, network: "TESTNET", pool,
        from_cursor: page.from_cursor, to_cursor: page.to_cursor, checkpoint_ledger: page.through_ledger,
        checkpoint_hash: page.ledger_hash, record_count: page.records.length };
    } catch { throw new CustodyError("dependency_unavailable", 503); }
    const data = await this.rpc("d1_record_discovery_page", { p_page: page });
    try {
      const r = exact(data, "checkpoint_hash,checkpoint_ledger,from_cursor,kind,namespace,network,page_count,pool,record_count,revision,to_cursor");
      requireValid(Object.entries(expected).every(([key, value]) => r[key] === value));
      uint(r.page_count, Number.MAX_SAFE_INTEGER, 1);
      return data as DiscoveryReceipt;
    } catch { throw new CustodyError("dependency_unavailable", 503); }
  }
}
/** One page only. Unknown saves retain ownership: no retry/readback/compensation. */
export async function ingestDiscoveryPage(database: DiscoveryDatabase,
  source: Pick<HorizonDiscoverySource, "readPage"> = new HorizonDiscoverySource(),
): Promise<{ receipt: DiscoveryReceipt; anchor: DiscoveryCheckpoint; completeAtAnchor: boolean }> {
  const state = await database.loadState();
  let observation;
  try {
    observation = await source.readPage({ pool: state.pool, firstLedger: state.first_ledger, checkpoint: structuredClone(state.checkpoint) });
    const o = exact(observation, "complete,page"), p = o.page as DiscoveryPage;
    validatePage(p);
    requireValid(o.complete === (p.records.length === 0) && p.from_cursor === (state.checkpoint?.cursor ?? "0"));
    requireValid(p.through_ledger >= state.first_ledger);
    if (state.checkpoint) {
      const old = state.checkpoint;
      requireValid(p.through_ledger >= old.through_ledger && p.closed_at >= old.closed_at);
      requireValid(p.through_ledger === old.through_ledger ? p.ledger_hash === old.ledger_hash && p.closed_at === old.closed_at : p.closed_at > old.closed_at);
    }
  } catch { throw new CustodyError("dependency_unavailable", 503); }
  // Snapshot before the write: receipt progress refers only to this saved anchor.
  let p: DiscoveryPage;
  try { p = structuredClone(observation.page); }
  catch { throw new CustodyError("dependency_unavailable", 503); }
  const anchor = { cursor: p.to_cursor, through_ledger: p.through_ledger, ledger_hash: p.ledger_hash, closed_at: p.closed_at };
  const completeAtAnchor = observation.complete;
  const receipt = await database.recordPage(state.pool, p);
  return { receipt, anchor, completeAtAnchor };
}
