import { CustodyError, type CustodyHandler } from "./handler.ts";
import { createRemainderHttpHandler, type RemainderHttpDependencies } from "./remainder-http.ts";
import { REMAINDER_ROUTES } from "./remainder-http-contract.ts";

export interface PrivateRemainderRuntime {
  readonly remainder: RemainderHttpDependencies;
  readonly custodyHandler: CustodyHandler;
}
/** External host supplies its already-combined custody/v1 handler. Nothing is mounted here. */
export function createRemainderRuntime(runtime: PrivateRemainderRuntime): CustodyHandler {
  if (runtime === null || typeof runtime !== "object" || Object.getPrototypeOf(runtime) !== Object.prototype)
    throw new CustodyError("remainder_unavailable", 503);
  const ds = Object.getOwnPropertyDescriptors(runtime), keys = Reflect.ownKeys(runtime);
  if (keys.length !== 2 || !["remainder", "custodyHandler"].every(k => Object.hasOwn(ds, k) && ds[k].enumerable && "value" in ds[k]) ||
    typeof ds.custodyHandler.value !== "function") throw new CustodyError("remainder_unavailable", 503);
  const existing = ds.custodyHandler.value as CustodyHandler;
  // Actual factory synchronously captures nested settings, callbacks AND original receivers.
  const remainder = createRemainderHttpHandler(ds.remainder.value as RemainderHttpDependencies);
  const paths = Object.freeze([REMAINDER_ROUTES.refund_remainder, REMAINDER_ROUTES.refund_remainder_status,
    REMAINDER_ROUTES.refund_remainder_reconcile]);
  return request => {
    let path: string;
    try { path = new URL(request.url).pathname; }
    catch {
      return Promise.resolve(Response.json({ error: "invalid_request" }, {
        status: 400, headers: { "cache-control": "no-store" },
      }));
    }
    if (paths.some(candidate => candidate === path)) return remainder(request);
    // Identical Request; preserve existing receiver, response/rejection and body. No fallback/retry.
    return Reflect.apply(existing, runtime, [request]);
  };
}
