import { CustodyError } from "./handler.ts";
import { verifyRemainderCommand, type RemainderCommandConfiguration, type RemainderCommandScope } from "./remainder-command.ts";
import type { RemainderHttpResponse, RemainderAction } from "./remainder-http-contract.ts";
import { createRemainderExecutor, type RemainderExecutionDependencies } from "./remainder-execution.ts";

type Client = RemainderExecutionDependencies["client"];
type Data = Record<string, unknown>;
export interface RemainderHttpDependencies extends Omit<RemainderExecutionDependencies, "now"> {
  readonly configuration: RemainderCommandConfiguration;
}
export type RemainderHttpHandler = (request: Request) => Promise<Response>;
const unavailable = () => new CustodyError("remainder_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.length <= 200000 && keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const d = fields(value); check(Object.keys(d).sort().join(",") === names.split(",").sort().join(",")); return d;
}
/** Detached bounded own JSON, never getters, serialization hooks or mutable aliases. */
function snapshot<T>(value: T): T {
  let nodes = 0, budget = 33554432;
  const active = new Set<object>();
  function visit(v: unknown, depth: number): unknown {
    check(++nodes <= 200000 && depth <= 60 && (budget -= 8) >= 0);
    if (typeof v === "string") {
      check(v.length <= budget && (budget -= new TextEncoder().encode(JSON.stringify(v)).length) >= 0); return v;
    }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return v; }
    check(v !== null && typeof v === "object" && !active.has(v)); active.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      check(Object.getPrototypeOf(v) === Array.prototype);
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), n = ds.length.value;
      check(Number.isSafeInteger(n) && n >= 0 && n <= 200000 && Reflect.ownKeys(v).length === n + 1);
      result = Object.freeze(Array.from({ length: n }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d); return visit(d.value, depth + 1);
      }));
    } else result = Object.freeze(Object.fromEntries(Object.entries(fields(v)).map(([k, x]) => {
      visit(k, depth + 1); return [k, visit(x, depth + 1)];
    })));
    active.delete(v); return result;
  }
  return visit(value, 0) as T;
}
function method<T extends object, K extends keyof T>(receiver: T, key: K): T[K] {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, d: PropertyDescriptor | undefined;
  const seen = new Set<object>();
  while (owner !== null) {
    check(!seen.has(owner)); seen.add(owner);
    d = Object.getOwnPropertyDescriptor(owner, key); if (d) break; owner = Object.getPrototypeOf(owner);
  }
  check(d && "value" in d && typeof d.value === "function");
  const fn = d.value; return ((...args: unknown[]) => Reflect.apply(fn, receiver, args)) as T[K];
}
const response = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
function stateResponse(dto: Readonly<RemainderHttpResponse>, action: RemainderAction): Response {
  const status = action === "refund_remainder_status" ? 200 : ["pending", "unknown"].includes(dto.state) ? 202 :
    action === "refund_remainder" && ["not_due", "blocked"].includes(dto.state) ? 409 : 200;
  return response(dto, status);
}
/** Inert private factory: genuine manual proof adapter, with no execution engine of its own. */
export function createRemainderHttpHandler(dependencies: RemainderHttpDependencies): RemainderHttpHandler {
  const d = fields(dependencies);
  check(Object.keys(d).every(k => ["client", "configuration", "source", "financial", "construction", "fetcher"].includes(k)));
  const configuration = exact(d.configuration, "pool,namespace,now");
  const clock = method(d.configuration as RemainderCommandConfiguration, "now"), invoke = method(d.client as Client, "rpc");
  const proof = Object.freeze({ pool: configuration.pool as string, namespace: configuration.namespace as string, now: clock });
  const fetcher = d.fetcher === undefined ? undefined : method(dependencies, "fetcher");
  // Capture the original RPC and optional capabilities before the command/body await.
  const execute = createRemainderExecutor({ client: Object.freeze({ rpc: invoke }), now: clock,
    source: d.source as RemainderExecutionDependencies["source"], financial: d.financial as RemainderExecutionDependencies["financial"],
    construction: d.construction as RemainderExecutionDependencies["construction"], fetcher });
  return async request => {
    let command: Awaited<ReturnType<typeof verifyRemainderCommand>>;
    try { command = await verifyRemainderCommand(request, proof); }
    catch (error) {
      if (error instanceof CustodyError && ((error.status === 400 && error.code === "invalid_request") ||
        (error.status === 401 && ["stale_request", "invalid_signature"].includes(error.code)) ||
        (error.status === 404 && error.code === "not_found") || (error.status === 405 && error.code === "method_not_allowed")))
        return response({ error: error.code }, error.status);
      return response({ error: "remainder_unavailable" }, 503);
    }
    // Verified command has EXTRA discriminator/action keys; exact downstream scope has ONLY these four.
    const scope: RemainderCommandScope = Object.freeze({ namespace: command.namespace, pool: command.pool,
      requestId: command.requestId, authenticatedAdmin: command.authenticatedAdmin });
    try {
      // Preserve manual018 admission and request_not_found mapping before invoking the shared core.
      // No helper exception can impersonate this captured actual RPC's denial or missing-original reply.
      const reply = exact(snapshot(await invoke("d1_load_unsigned_transaction", Object.freeze({
        p_request_id: scope.requestId, p_authorized_by: scope.authenticatedAdmin }))), "data,error");
      if (reply.error !== null) {
        const error = fields(reply.error);
        if (reply.data === null && error.code === "42501" && error.message === "unauthorized_admin_wallet")
          return response({ error: "unauthorized_admin_wallet" }, 403);
        if (reply.data === null && error.code === "22023" && error.message === "d1_preparation_not_found")
          return response({ error: "request_not_found" }, 404);
        throw unavailable();
      }
      const original = exact(reply.data, "kind,revision,request_id,namespace,network,pool,reservation,transaction");
      check(original.kind === "d1_unsigned_transaction_lookup" && original.revision === 1 && original.request_id === scope.requestId &&
        original.namespace === scope.namespace && original.pool === scope.pool && original.network === "TESTNET");
      if (original.transaction === null) return response({ error: "request_not_found" }, 404);
      // The core independently reloads018; this adapter passes no authentication assertion or saved authority.
      const result = await execute(scope, command.action);
      if (result.kind === "error") return response({ error: result.error }, result.error === "unauthorized_admin_wallet" ? 403 : 503);
      return stateResponse(result.state, command.action);
    } catch {
      return response({ error: "remainder_unavailable" }, 503);
    }
  };
}
