import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { HorizonDiscoverySource, type DiscoveryCheckpoint, type TransactionObservationPage } from "./discovery-source.ts";
import { parseIncludedTransaction } from "./transaction-observation.ts";
import type { DiscoveryState } from "./discovery-ingestion.ts";
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
type Source = Pick<HorizonDiscoverySource, "readTransactionPageAtCheckpoint">;
export interface TransactionHistoryState {
  kind: "d1_transaction_history_state"; revision: 1; namespace: string; network: "TESTNET"; pool: string;
  first_ledger: number; income_state: DiscoveryState; checkpoint: DiscoveryCheckpoint | null;
  coverage_complete: boolean; page_count: number; record_count: number;
}
export interface TransactionHistoryReceipt {
  kind: "d1_transaction_page"; revision: 1; namespace: string; network: "TESTNET"; pool: string;
  first_ledger: number; authorized_by: string; page: TransactionObservationPage; checkpoint: DiscoveryCheckpoint;
  page_count: number; record_count: number; page_record_count: number;
}
function unavailable() { return new CustodyError("transaction_history_unavailable", 503); }
function valid(v: unknown): asserts v { if (!v) throw unavailable(); }
/** JSONB structural equality ignores object ordering only. Bound traversal before SDK/write. */
function snapshot(value: unknown, sorted = false): unknown {
  let nodes = 0, bytes = 1048576;
  function visit(v: unknown, depth: number): unknown {
    valid(++nodes <= 160000 && depth <= 32 && (bytes -= 8) >= 0);
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { valid(Number.isSafeInteger(v)); return v; }
    if (typeof v === "string") {
      valid(v.length <= bytes && !/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v));
      valid((bytes -= Buffer.byteLength(JSON.stringify(v), "utf8")) >= 0); return v;
    }
    valid(v !== null && typeof v === "object"); const array = Array.isArray(v);
    valid(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype));
    const keys = Reflect.ownKeys(v), d = Object.getOwnPropertyDescriptors(v);
    valid(keys.length <= 160000 && keys.every(k => typeof k === "string" && "value" in d[k] && (d[k].enumerable || (array && k === "length"))));
    if (array) {
      const length = d.length.value; valid(length <= 160000 && keys.length === length + 1);
      return Array.from({ length }, (_, i) => { valid(Object.hasOwn(d, i)); return visit(d[String(i)].value, depth + 1); });
    }
    return Object.fromEntries((sorted ? (keys as string[]).sort() : keys as string[]).map(k => [visit(k, depth + 1), visit(d[k].value, depth + 1)]));
  }
  return visit(value, 0);
}
function same(a: unknown, b: unknown) { return JSON.stringify(snapshot(a, true)) === JSON.stringify(snapshot(b, true)); }
function exact(v: unknown, keys: string): Record<string, unknown> {
  valid(v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype);
  valid(Object.keys(v).sort().join(",") === keys); return v as Record<string, unknown>;
}
function uint(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): asserts v is number {
  valid(typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max);
}
function address(v: unknown): asserts v is string { valid(typeof v === "string" && Keypair.fromPublicKey(v).publicKey() === v); }
function cursor(v: unknown, ledger: number): bigint {
  valid(typeof v === "string" && /^(0|[1-9][0-9]{0,19})$/.test(v)); const n = BigInt(v);
  valid(n <= 18446744073709551615n && (n === 0n || ((n & 4095n) === 0n && ((n >> 12n) & 1048575n) > 0n && n >> 32n > 0n && n >> 32n <= BigInt(ledger)))); return n;
}
function checkpoint(v: unknown, first: number, tx: boolean): DiscoveryCheckpoint {
  const c = exact(v, "closed_at,cursor,ledger_hash,through_ledger"); uint(c.through_ledger, first, 4294967295); uint(c.closed_at, 0, 253402300799);
  valid(typeof c.ledger_hash === "string" && /^[0-9a-f]{64}$/.test(c.ledger_hash));
  if (tx) { const n = cursor(c.cursor, c.through_ledger); valid(n === 0n || n >> 32n >= BigInt(first)); }
  else { valid(typeof c.cursor === "string" && /^(0|[1-9][0-9]{0,19})$/.test(c.cursor)); valid(BigInt(c.cursor) <= 18446744073709551615n && BigInt(c.cursor) >> 32n <= BigInt(c.through_ledger)); }
  return v as DiscoveryCheckpoint;
}
function progresses(old: DiscoveryCheckpoint, next: DiscoveryCheckpoint) {
  valid(next.through_ledger >= old.through_ledger && next.closed_at >= old.closed_at);
  valid(next.through_ledger === old.through_ledger ? next.ledger_hash === old.ledger_hash && next.closed_at === old.closed_at : next.closed_at > old.closed_at);
}
/** Immutable trusted backend binding; authentication is performed by each 024 RPC. */
export class TransactionHistoryDatabase {
  readonly #rpc: Rpc; readonly #namespace: string; readonly #admin: string; readonly #pool: string;
  constructor(client: { rpc: Rpc }, namespace: string, authenticatedAdmin: string, pool: string, network: "TESTNET") {
    try {
      valid(typeof namespace === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(namespace));
      address(authenticatedAdmin); address(pool); valid(network === "TESTNET");
      this.#rpc = client.rpc.bind(client); this.#namespace = namespace; this.#admin = authenticatedAdmin; this.#pool = pool; Object.freeze(this);
    } catch { throw unavailable(); }
  }
  private async call(name: "d1_load_transaction_history_state" | "d1_record_transaction_page", extra: Record<string, unknown> = {}): Promise<unknown> {
    let failure: CustodyError | undefined;
    try {
      const result = await this.#rpc(name, { p_namespace: this.#namespace, p_authorized_by: this.#admin, ...extra });
      valid(result !== null && typeof result === "object" && Object.getPrototypeOf(result) === Object.prototype);
      const d = Object.getOwnPropertyDescriptors(result); valid(d.data && "value" in d.data && d.error && "value" in d.error);
      if (d.error.value === null) return snapshot(d.data.value);
      const e = d.error.value;
      if (e !== null && typeof e === "object" && Object.getPrototypeOf(e) === Object.prototype) {
        const m = Object.getOwnPropertyDescriptor(e, "message");
        if (m && "value" in m && typeof m.value === "string") {
          if (m.value === "unauthorized_admin_wallet") failure = new CustodyError(m.value, 403);
          if (m.value === "transaction_history_conflict") failure = new CustodyError(m.value, 409);
        }
      }
    } catch { /* Unknown save outcomes retain ownership; never retry/read back. */ }
    throw failure ?? unavailable();
  }
  private binding(s: Record<string, unknown>) {
    valid(s.namespace === this.#namespace && s.network === "TESTNET" && s.pool === this.#pool && s.revision === 1);
    uint(s.first_ledger, 1, 4294967295);
  }
  async loadState(): Promise<TransactionHistoryState> {
    const data = await this.call("d1_load_transaction_history_state");
    try {
      const s = exact(data, "checkpoint,coverage_complete,first_ledger,income_state,kind,namespace,network,page_count,pool,record_count,revision");
      this.binding(s); valid(s.kind === "d1_transaction_history_state"); uint(s.page_count); uint(s.record_count);
      valid(typeof s.coverage_complete === "boolean" && s.record_count <= s.page_count * 100);
      const income = exact(s.income_state, "checkpoint,coverage_complete,first_ledger,kind,namespace,network,pool,revision"); this.binding(income);
      valid(income.kind === "d1_discovery_state" && income.first_ledger === s.first_ledger && income.coverage_complete === true);
      const anchor = checkpoint(income.checkpoint, s.first_ledger as number, false);
      if (s.checkpoint === null) valid(s.page_count === 0 && s.record_count === 0 && s.coverage_complete === false);
      else {
        const tx = checkpoint(s.checkpoint, s.first_ledger as number, true); progresses(tx, anchor); valid(s.page_count > 0);
        valid(s.record_count === 0 ? tx.cursor === "0" : tx.cursor !== "0");
        if (s.coverage_complete) valid(tx.through_ledger === anchor.through_ledger && tx.ledger_hash === anchor.ledger_hash && tx.closed_at === anchor.closed_at);
      }
      return data as TransactionHistoryState;
    } catch { throw unavailable(); }
  }
  async recordPage(state: TransactionHistoryState, page: TransactionObservationPage): Promise<TransactionHistoryReceipt> {
    const data = await this.call("d1_record_transaction_page", { p_page: snapshot(page) });
    try {
      const r = exact(data, "authorized_by,checkpoint,first_ledger,kind,namespace,network,page,page_count,page_record_count,pool,record_count,revision"); this.binding(r);
      valid(r.kind === "d1_transaction_page" && r.first_ledger === state.first_ledger); address(r.authorized_by);
      valid(same(r.page, page) && same(r.checkpoint, { cursor: page.to_cursor, through_ledger: page.through_ledger, ledger_hash: page.ledger_hash, closed_at: page.closed_at }));
      // A racing identical winner or exact SQL replay retains its original authorizer.
      const replay = state.coverage_complete && page.records.length === 0;
      valid(r.page_count === state.page_count + (replay ? 0 : 1) && r.record_count === state.record_count + page.records.length && r.page_record_count === page.records.length);
      uint(r.page_count, 1); uint(r.record_count); return data as TransactionHistoryReceipt;
    } catch { throw unavailable(); }
  }
}
/** One source call and one awaited save. Completion is anchor scoped, never financial readiness. */
export async function ingestTransactionPage(database: TransactionHistoryDatabase, source?: Source): Promise<{
  receipt: TransactionHistoryReceipt; anchor: DiscoveryCheckpoint; completeAtAnchor: boolean;
}> {
  const state = await database.loadState();
  let page: TransactionObservationPage, complete: boolean;
  try {
    // Capture all persisted context before the source await; current account contains BigInts
    // and is deliberately neither JSON-snapshotted nor returned from this coordinator.
    const context = snapshot({ pool: state.pool, firstLedger: state.first_ledger, checkpoint: state.income_state.checkpoint }) as {
      pool: string; firstLedger: number; checkpoint: DiscoveryCheckpoint;
    };
    const from = state.checkpoint?.cursor ?? "0", expected = structuredClone(context);
    const observation = await (source ?? new HorizonDiscoverySource()).readTransactionPageAtCheckpoint(context, from);
    valid(observation !== null && typeof observation === "object" && Object.getPrototypeOf(observation) === Object.prototype);
    const d = Object.getOwnPropertyDescriptors(observation);
    valid(d.page && "value" in d.page && d.complete && "value" in d.complete);
    page = snapshot(d.page.value) as TransactionObservationPage; valid(typeof d.complete.value === "boolean"); complete = d.complete.value;
    const p = exact(page, "closed_at,from_cursor,ledger_hash,records,revision,through_ledger,to_cursor");
    valid(p.revision === 1 && p.from_cursor === from && Array.isArray(p.records) && p.records.length <= 100);
    const anchor = expected.checkpoint;
    valid(p.through_ledger === anchor.through_ledger && p.ledger_hash === anchor.ledger_hash && p.closed_at === anchor.closed_at);
    valid(typeof complete === "boolean" && complete === (page.records.length === 0));
    let previous = cursor(from, anchor.through_ledger); cursor(p.to_cursor, anchor.through_ledger);
    for (const record of page.records) {
      const decoded = parseIncludedTransaction({ context: { pool: expected.pool, firstLedger: expected.firstLedger,
        anchor: { sequence: anchor.through_ledger, hash: anchor.ledger_hash, closedAt: anchor.closed_at } },
        transaction: record.raw.transaction, ledger: record.raw.ledger });
      valid(same(decoded, record)); const next = cursor(decoded.pagingToken, anchor.through_ledger); valid(next > previous); previous = next;
    }
    valid(previous === cursor(page.to_cursor, anchor.through_ledger));
  } catch { throw unavailable(); }
  const anchor = { cursor: page.to_cursor, through_ledger: page.through_ledger, ledger_hash: page.ledger_hash, closed_at: page.closed_at };
  const receipt = await database.recordPage(state, page);
  return { receipt, anchor, completeAtAnchor: complete };
}
