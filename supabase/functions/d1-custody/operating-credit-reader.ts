import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { DiscoveryDatabase, type DiscoveryState } from "./discovery-ingestion.ts";
import { OperatingCreditDatabase, type OperatingCreditReceipt } from "./operating-credit-journal.ts";
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
export interface OperatingCreditState {
  kind: "d1_operating_credit_state"; revision: 1; namespace: string; network: "TESTNET"; pool: string;
  receipt_count: number; set_hash: string; discovery_state: DiscoveryState;
}
function unavailable() { return new CustodyError("operating_credit_unavailable", 503); }
function valid(v: unknown): asserts v { if (!v) throw unavailable(); }
/** Page-bounded structural JSONB snapshot: never invoke accessors or JSON hooks. */
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
/** Recorded historical observations, NOT a fresh financial authorization or funder approval.
 * Reuses the accepted historical receipt validator, never providers/current funder config.
 */
export async function readOperatingCredits(client: { rpc: Rpc }, namespace: string, authenticatedAdmin: string, pool: string): Promise<{
  state: OperatingCreditState; receipts: OperatingCreditReceipt[]; observedCreditStroops: string;
}> {
  try {
    const discoveryDatabase = new DiscoveryDatabase(client, namespace, authenticatedAdmin);
    const creditDatabase = new OperatingCreditDatabase(client, namespace, authenticatedAdmin);
    const rpc = client.rpc.bind(client), discovery = await discoveryDatabase.loadState();
    valid(discovery.pool === pool && discovery.coverage_complete && discovery.checkpoint !== null);
    async function call(name: "d1_load_operating_credit_state" | "d1_list_operating_credits", extra: Record<string, unknown> = {}) {
      const result = exact(snapshot(await rpc(name, { p_namespace: namespace, p_authorized_by: authenticatedAdmin, ...extra })), "data,error");
      if (result.error !== null) {
        if (typeof result.error === "object" && Object.getOwnPropertyDescriptor(result.error, "message")?.value === "unauthorized_admin_wallet") throw new CustodyError("unauthorized_admin_wallet", 403);
        throw unavailable();
      }
      return result.data;
    }
    function stateValue(data: unknown): OperatingCreditState {
      const s = exact(data, "discovery_state,kind,namespace,network,pool,receipt_count,revision,set_hash");
      valid(s.kind === "d1_operating_credit_state" && s.revision === 1 && s.namespace === namespace && s.network === "TESTNET" && s.pool === pool);
      valid(Number.isSafeInteger(s.receipt_count) && (s.receipt_count as number) >= 0 && (s.receipt_count as number) <= 1000);
      valid(typeof s.set_hash === "string" && /^[0-9a-f]{64}$/.test(s.set_hash) && same(s.discovery_state, discovery));
      return data as OperatingCreditState;
    }
    const state = stateValue(await call("d1_load_operating_credit_state")), checkpoint = discovery.checkpoint;
    const receipts: OperatingCreditReceipt[] = []; let after = "0", total = 0n, bytes = 0;
    for (let pageNumber = 0; pageNumber <= 1000; pageNumber++) {
      const page = exact(await call("d1_list_operating_credits", { p_after: after, p_limit: 100 }), "credit_state,from_cursor,has_more,kind,namespace,network,next_cursor,pool,receipts,revision");
      valid(page.kind === "d1_operating_credits" && page.revision === 1 && page.namespace === namespace && page.network === "TESTNET" && page.pool === pool);
      valid(page.from_cursor === after && same(stateValue(page.credit_state), state));
      valid(Array.isArray(page.receipts) && page.receipts.length <= 100 && typeof page.has_more === "boolean");
      valid(receipts.length + page.receipts.length <= state.receipt_count && (!page.has_more || page.receipts.length > 0));
      for (const value of page.receipts) {
        const r = value as OperatingCreditReceipt, o = r.observation, id = o.operationId;
        valid(typeof id === "string" && /^[1-9][0-9]{0,19}$/.test(id) && BigInt(id) <= 18446744073709551615n && BigInt(id) > BigInt(after));
        valid(BigInt(id) <= BigInt(checkpoint.cursor) && o.ledger >= discovery.first_ledger && o.ledger <= checkpoint.through_ledger);
        valid(o.anchor.sequence <= checkpoint.through_ledger && o.anchor.closedAt <= checkpoint.closed_at);
        valid(o.anchor.sequence === checkpoint.through_ledger ? o.anchor.hash === checkpoint.ledger_hash && o.anchor.closedAt === checkpoint.closed_at : o.anchor.closedAt < checkpoint.closed_at);
        const historical = await creditDatabase.load(id); // Accepted raw SDK/full-receipt validator, read only.
        valid(historical.pool === pool && historical.receipt !== null && same(historical.receipt, r));
        bytes += Buffer.byteLength(JSON.stringify(r), "utf8"); valid(bytes <= 8388608);
        total += BigInt(o.amountStroops); valid(total <= 9223372036854775807n);
        receipts.push(historical.receipt); after = id;
      }
      valid(page.next_cursor === after);
      if (!page.has_more) {
        valid(receipts.length === state.receipt_count && same(stateValue(await call("d1_load_operating_credit_state")), state));
        return { state, receipts, observedCreditStroops: total.toString() };
      }
      valid(receipts.length < state.receipt_count);
    }
    throw unavailable();
  } catch (error) {
    if (error instanceof CustodyError && error.code === "unauthorized_admin_wallet" && error.status === 403) throw error;
    throw unavailable();
  }
}
