import { CustodyError } from "./handler.ts";
import { verifyRefundCommand, type RefundCommandConfiguration } from "./refund-command.ts";
import type { RefundHttpResponse } from "./refund-http-contract.ts";
import { createRefundExecutor, type RefundExecutionDependencies } from "./refund-execution.ts";

type Data = Record<string, unknown>;
export interface RefundHttpDependencies extends Omit<RefundExecutionDependencies, "now"> {
  readonly configuration: RefundCommandConfiguration;
}
export type RefundHttpHandler = (request: Request) => Promise<Response>;
const unavailable = () => new CustodyError("refund_unavailable", 503);
function check(v: unknown): asserts v { if (!v) throw unavailable(); }
function fields(v: unknown): Data {
  check(v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(v), keys = Reflect.ownKeys(v);
  check(keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(v: unknown, names: string): Data {
  const d = fields(v); check(Object.keys(d).sort().join(",") === names.split(",").sort().join(",")); return d;
}
function method<T extends object, K extends keyof T>(receiver: T, key: K): T[K] {
  check(receiver !== null && typeof receiver === "object");
  let owner: object | null = receiver, d: PropertyDescriptor | undefined;
  while (owner !== null) { d = Object.getOwnPropertyDescriptor(owner, key); if (d) break; owner = Object.getPrototypeOf(owner); }
  check(d && "value" in d && typeof d.value === "function");
  const fn = d.value; return ((...args: unknown[]) => Reflect.apply(fn, receiver, args)) as T[K];
}
const response = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
function stateResponse(dto: RefundHttpResponse, action: string): Response {
  const status = action === "refund_status" ? 200 : ["pending", "unknown"].includes(dto.state) ? 202 :
    action === "refund" && ["not_due", "blocked"].includes(dto.state) ? 409 : 200;
  return response(dto, status);
}
/** Inert server-only factory. No environment, route mount, provider default or key read. */
export function createRefundHttpHandler(dependencies: RefundHttpDependencies): RefundHttpHandler {
  const d = fields(dependencies), configuration = exact(d.configuration, "pool,namespace,now");
  const clock = method(d.configuration as RefundCommandConfiguration, "now");
  const proof = Object.freeze({ pool: configuration.pool as string, namespace: configuration.namespace as string, now: clock });
  // Capture private execution capabilities before receiving any request.
  const execute = createRefundExecutor({ client: d.client as RefundExecutionDependencies["client"], now: clock,
    source: d.source as RefundExecutionDependencies["source"], financial: d.financial as RefundExecutionDependencies["financial"],
    construction: d.construction as RefundExecutionDependencies["construction"], fetcher: d.fetcher as typeof fetch | undefined });
  return async request => {
    let command: Awaited<ReturnType<typeof verifyRefundCommand>>;
    try { command = await verifyRefundCommand(request, proof); }
    catch (error) {
      if (error instanceof CustodyError && ((error.status === 400 && error.code === "invalid_request") ||
        (error.status === 401 && ["stale_request", "invalid_signature"].includes(error.code)) ||
        (error.status === 404 && error.code === "not_found") || (error.status === 405 && error.code === "method_not_allowed")))
        return response({ error: error.code }, error.status);
      return response({ error: "refund_unavailable" }, 503);
    }
    try {
      const result = await execute(Object.freeze({ namespace: command.namespace, pool: command.pool,
        requestId: command.requestId, authenticatedAdmin: command.authenticatedAdmin }), command.action);
      if (result.kind === "error") return response({ error: result.error }, result.error === "unauthorized_admin_wallet" ? 403 : 503);
      return stateResponse(result.state, command.action);
    } catch {
      return response({ error: "refund_unavailable" }, 503);
    }
  };
}
