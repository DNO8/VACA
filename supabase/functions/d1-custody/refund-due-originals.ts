import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";

export interface DueRefundOriginalsConfiguration {
  readonly namespace: string;
  readonly pool: string;
  readonly actor: string;
  readonly network: "TESTNET";
}
export interface DueRefundOriginalsPage {
  readonly kind: "d1_due_refund_originals";
  readonly revision: 1;
  readonly namespace: string;
  readonly pool: string;
  readonly network: "TESTNET";
  /** UTC ISO8601 with exactly three fractional digits: YYYY-MM-DDTHH:mm:ss.sssZ. */
  readonly dbObservedAt: string;
  readonly requestIds: readonly string[];
  readonly nextAfterRequestId: string | null;
}
export interface DueRefundOriginalsClient {
  rpc(name: "d1_list_due_refund_originals", args: {
    p_namespace: string; p_pool: string; p_actor: string;
    p_after_request_id: string | null; p_limit: number;
  }): PromiseLike<{ data: unknown; error: unknown }>;
}
export interface DueRefundOriginalsReader {
  /** Start and resweep with null. A page never grants execution authority. */
  read(afterRequestId?: string | null, limit?: number): Promise<DueRefundOriginalsPage>;
}
const unavailable = () => new CustodyError("due_refund_originals_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function uuid(value: unknown): asserts value is string {
  check(typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value));
}
function address(value: unknown): asserts value is string {
  check(typeof value === "string" && /^G[A-Z2-7]{55}$/.test(value));
  check(Keypair.fromPublicKey(value).publicKey() === value);
}
/** Never evaluate a getter while capturing configuration or returned evidence. */
function own(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  check(descriptor && "value" in descriptor); return descriptor.value;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const names = Reflect.ownKeys(value);
  check(names.length === keys.length && names.every(k => typeof k === "string" && keys.includes(k)));
  const copy: Record<string, unknown> = {};
  for (const key of keys) copy[key] = own(value, key);
  return copy;
}
/** Supabase's real RPC method may live on its prototype; capture a data method,
 * not a getter or a later mutable client.rpc lookup. No alternate transport. */
function captureRpc(client: DueRefundOriginalsClient): DueRefundOriginalsClient["rpc"] {
  check(client !== null && typeof client === "object");
  let current: object | null = client;
  for (let depth = 0; current !== null && depth < 8; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(current, "rpc");
    if (descriptor) {
      check("value" in descriptor && typeof descriptor.value === "function");
      const method = descriptor.value;
      return (name, args) => Reflect.apply(method, client, [name, args]);
    }
    current = Object.getPrototypeOf(current);
  }
  throw unavailable();
}
function ids(value: unknown, limit: number, after: string | null): readonly string[] {
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype);
  const length = own(value, "length");
  check(typeof length === "number" && Number.isInteger(length) && length >= 0 && length <= limit);
  check(Reflect.ownKeys(value).length === length + 1);
  const copy: string[] = []; let previous = after;
  for (let i = 0; i < length; i++) {
    const id = own(value, String(i)); uuid(id);
    check(previous === null || id > previous); // Order also proves uniqueness.
    copy.push(id); previous = id;
  }
  return Object.freeze(copy);
}

/** Server-private composition only. Supply the real private Supabase client and
 * trusted fixed scope; neither configuration nor actor is accepted per page. */
export function createDueRefundOriginalsReader(
  client: DueRefundOriginalsClient, configuration: DueRefundOriginalsConfiguration,
): Readonly<DueRefundOriginalsReader> {
  try {
    const config = exact(configuration, ["namespace", "pool", "actor", "network"]);
    const { namespace, pool, actor, network } = config;
    uuid(namespace); address(pool); address(actor); check(network === "TESTNET");
    const rpc = captureRpc(client);
    return Object.freeze({
      async read(afterRequestId: string | null = null, limit = 50): Promise<DueRefundOriginalsPage> {
        try {
          check(afterRequestId === null || typeof afterRequestId === "string");
          if (afterRequestId !== null) uuid(afterRequestId);
          check(Number.isInteger(limit) && limit >= 1 && limit <= 50);
          const reply = await rpc("d1_list_due_refund_originals", {
            p_namespace: namespace, p_pool: pool, p_actor: actor,
            p_after_request_id: afterRequestId, p_limit: limit,
          });
          check(reply !== null && typeof reply === "object" && !Array.isArray(reply));
          // Supabase transport metadata (status/count/etc.) is not our envelope.
          check(own(reply, "error") === null);
          const page = exact(own(reply, "data"), ["kind", "revision", "namespace", "pool", "network",
            "dbObservedAt", "requestIds", "nextAfterRequestId"]);
          check(page.kind === "d1_due_refund_originals" && page.revision === 1);
          check(page.namespace === namespace && page.pool === pool && page.network === network);
          const observed = page.dbObservedAt;
          check(typeof observed === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observed));
          check(!observed.startsWith("0000") && new Date(observed).toISOString() === observed);
          const requestIds = ids(page.requestIds, limit, afterRequestId);
          const next = page.nextAfterRequestId;
          if (next !== null) {
            uuid(next);
            // Continuation follows the scanned original window, which can
            // contain future rows and therefore fewer (or zero) due IDs.
            check(requestIds.length === 0 || next >= requestIds[requestIds.length - 1]);
            check(afterRequestId === null || next > afterRequestId);
          }
          return Object.freeze({ kind: "d1_due_refund_originals", revision: 1,
            namespace, pool, network: "TESTNET", dbObservedAt: observed,
            requestIds, nextAfterRequestId: next });
        } catch { throw unavailable(); }
      },
    });
  } catch { throw unavailable(); }
}
