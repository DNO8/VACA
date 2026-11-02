import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { TransactionHistoryDatabase, type TransactionHistoryState } from "./transaction-ingestion.ts";
import { parseIncludedTransaction, type IncludedTransactionObservation } from "./transaction-observation.ts";

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
function unavailable() { return new CustodyError("transaction_history_unavailable", 503); }
function valid(v: unknown): asserts v { if (!v) throw unavailable(); }
/** Bound every untrusted page before traversing SDK inputs; do not invoke accessors. */
function snapshot(input: unknown): unknown {
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
    return Object.fromEntries((keys as string[]).sort().map(k => [visit(k, depth + 1), visit(d[k].value, depth + 1)]));
  }
  return visit(input, 0);
}
function same(a: unknown, b: unknown) { return JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b)); }
function exact(v: unknown, keys: string): Record<string, unknown> {
  valid(v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype);
  valid(Object.keys(v).sort().join(",") === keys); return v as Record<string, unknown>;
}
/** Read only. Each RPC independently authenticates the captured backend admin binding.
 * All pages and the final reload must match one complete state; drift is not retried.
 * This proves SDK/DTO consistency of saved observations, not consensus or spending authority.
 */
export async function readTransactionHistory(client: { rpc: Rpc }, namespace: string, authenticatedAdmin: string, pool: string): Promise<{
  state: TransactionHistoryState; records: IncludedTransactionObservation[]; confirmedPoolFeesSpentStroops: string;
}> {
  const database = new TransactionHistoryDatabase(client, namespace, authenticatedAdmin, pool, "TESTNET");
  let rpc: Rpc;
  try { rpc = client.rpc.bind(client); } catch { throw unavailable(); }
  const state = await database.loadState();
  try {
    valid(state.coverage_complete && state.checkpoint !== null && state.record_count <= 1000);
    const checkpoint = state.checkpoint, records: IncludedTransactionObservation[] = [], hashes = new Set<string>();
    let after = "0", fees = 0n, bytes = 0;
    // At most 1000 records plus one empty query. Never truncate a complete-history result.
    for (let pageNumber = 0; pageNumber <= 1000; pageNumber++) {
      let response: unknown;
      try { response = await rpc("d1_list_transaction_records", { p_namespace: namespace, p_authorized_by: authenticatedAdmin, p_after: after, p_limit: 100 }); }
      catch { throw unavailable(); }
      const result = exact(snapshot(response), "data,error");
      if (result.error !== null) {
        if (result.error !== null && typeof result.error === "object" && Object.getPrototypeOf(result.error) === Object.prototype &&
          Object.getOwnPropertyDescriptor(result.error, "message")?.value === "unauthorized_admin_wallet") throw new CustodyError("unauthorized_admin_wallet", 403);
        throw unavailable();
      }
      const page = exact(result.data, "from_cursor,has_more,history_state,kind,namespace,network,next_cursor,pool,records,revision");
      valid(page.kind === "d1_transaction_records" && page.revision === 1 && page.namespace === namespace && page.network === "TESTNET" && page.pool === pool);
      valid(page.from_cursor === after && same(page.history_state, state));
      valid(typeof page.has_more === "boolean" && Array.isArray(page.records) && page.records.length <= 100);
      valid(records.length + page.records.length <= state.record_count && (!page.has_more || page.records.length > 0));
      for (const value of page.records) {
        const r = value as IncludedTransactionObservation;
        valid(r !== null && typeof r === "object" && r.context?.pool === pool && r.context.firstLedger === state.first_ledger);
        const anchor = r.context.anchor;
        valid(anchor.sequence <= checkpoint.through_ledger && anchor.closedAt <= checkpoint.closed_at);
        valid(anchor.sequence === checkpoint.through_ledger ? anchor.hash === checkpoint.ledger_hash && anchor.closedAt === checkpoint.closed_at : anchor.closedAt < checkpoint.closed_at);
        const decoded = parseIncludedTransaction({ context: r.context, transaction: r.raw.transaction, ledger: r.raw.ledger });
        valid(same(decoded, r) && BigInt(decoded.pagingToken) > BigInt(after) && BigInt(decoded.pagingToken) <= BigInt(checkpoint.cursor));
        valid(!hashes.has(decoded.transactionHash)); hashes.add(decoded.transactionHash);
        bytes += Buffer.byteLength(JSON.stringify(decoded), "utf8"); valid(bytes <= 8388608);
        if (decoded.feePayer === pool) { fees += BigInt(decoded.feeChargedStroops); valid(fees <= 9223372036854775807n); }
        records.push(decoded); after = decoded.pagingToken;
      }
      valid(page.next_cursor === after);
      if (!page.has_more) {
        valid(records.length === state.record_count && after === checkpoint.cursor);
        valid(same(await database.loadState(), state));
        return { state, records, confirmedPoolFeesSpentStroops: fees.toString() };
      }
      valid(records.length < state.record_count);
    }
    throw unavailable();
  } catch (error) {
    if (error instanceof CustodyError && error.code === "unauthorized_admin_wallet" && error.status === 403) throw error;
    throw unavailable();
  }
}
