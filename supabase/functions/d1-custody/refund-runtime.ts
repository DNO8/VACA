import { CustodyError, type CustodyHandler } from "./handler.ts";
import { createRefundHttpHandler, type RefundHttpDependencies } from "./refund-http.ts";
import { REFUND_ROUTES } from "./refund-http-contract.ts";

/** Private server capabilities only; never a request body or public response. */
export interface PrivateRefundRuntime {
  readonly refund: RefundHttpDependencies;
  readonly custodyHandler: CustodyHandler;
}

function unavailable(): never {
  throw new CustodyError("refund_unavailable", 503);
}

/** Capture data descriptors without invoking property getters. */
function ownData(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype) return unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entries: [string, unknown][] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return unavailable();
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) return unavailable();
    entries.push([key, descriptor.value]);
  }
  return Object.fromEntries(entries);
}

/**
 * Inert composition only: no mount, environment, providers or cleanup ownership.
 * The actual HTTP factory captures nested capabilities/settings synchronously.
 */
export function createRefundRuntime(runtime: PrivateRefundRuntime): CustodyHandler {
  const data = ownData(runtime);
  if (Object.keys(data).sort().join(",") !== "custodyHandler,refund" ||
    typeof data.custodyHandler !== "function") return unavailable();
  const custody = data.custodyHandler as CustodyHandler;
  const dependencies = ownData(data.refund);
  const fetcher = dependencies.fetcher;
  if (fetcher !== undefined && typeof fetcher !== "function") return unavailable();
  // Preserve a method-style fetcher's original dependency receiver too.
  if (typeof fetcher === "function") {
    const receiver = data.refund;
    dependencies.fetcher = (...args: Parameters<typeof fetch>) =>
      Reflect.apply(fetcher, receiver, args);
  }
  const refund = createRefundHttpHandler(dependencies as unknown as RefundHttpDependencies);
  const paths = Object.freeze([
    REFUND_ROUTES.refund,
    REFUND_ROUTES.refund_status,
    REFUND_ROUTES.refund_reconcile,
  ]);
  return request => {
    let path: string;
    try {
      path = new URL(request.url).pathname;
    } catch {
      return Promise.resolve(Response.json({ error: "invalid_request" }, {
        status: 400,
        headers: { "cache-control": "no-store" },
      }));
    }
    // Match exactly the same normalized pathname as verifyRefundCommand.
    // All methods on these paths reach its parser, including defined405 errors.
    if (paths.some(candidate => candidate === path)) return refund(request);
    // No clone/body read, response wrapping, catch, retry or fallback handling.
    return Reflect.apply(custody, runtime, [request]);
  };
}
