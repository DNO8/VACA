import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

/** Server-only composition; never populate this object from HTTP input. */
export interface RefundAutomaticHttpConfiguration {
  readonly token: string;
  readonly maxBatchSize: number;
  readonly runPage: (afterRequestId: string | null) => Promise<unknown>;
}
export interface RefundAutomaticPageResult {
  readonly processed: number;
  /** Held is a subset of processed, not an additional count. */
  readonly held: number;
  readonly nextAfterRequestId: string | null;
}

const route = "/functions/v1/d1-custody/internal-refund-tick";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const bodyPattern = /^[ \t\r\n]*\{[ \t\r\n]*"afterRequestId"[ \t\r\n]*:[ \t\r\n]*(null|"[0-9a-f-]{36}")[ \t\r\n]*\}[ \t\r\n]*$/;
const bodyLimit = 1024;
const responseHeaders = Object.freeze({
  "content-type": "application/json",
  "cache-control": "no-store",
});

function failure(status: number): Response {
  const error = status === 400 ? "invalid_request" : status === 401 ? "unauthorized" :
    status === 404 ? "not_found" : status === 405 ? "method_not_allowed" :
    status === 413 ? "request_too_large" : "refund_tick_unavailable";
  return new Response(JSON.stringify({ error }), {
    status,
    headers: status === 405 ? { ...responseHeaders, allow: "POST" } : responseHeaders,
  });
}
function cursor(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length === 36 && uuidPattern.test(value));
}

/** Reject inherited, accessor, symbol and extra properties without invoking getters. */
function ownValues(value: unknown, names: readonly string[]): unknown[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || keys.some(key => typeof key !== "string" || !names.includes(key))) {
    throw new Error();
  }
  return names.map(name => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !("value" in descriptor)) throw new Error();
    return descriptor.value;
  });
}
function tokenBytes(value: unknown): Buffer | null {
  if (typeof value !== "string" || value.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  // Round trip rejects nonzero padding bits as well as noncanonical encodings.
  return bytes.length === 32 && bytes.toString("base64url") === value ? bytes : null;
}

async function afterRequestId(request: Request): Promise<string | null> {
  if (!request.body) throw 400;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(bodyLimit);
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw 400;
      if (chunk.value.byteLength > bodyLimit - length) {
        // Cancellation must not delay or change the bounded rejection.
        void reader.cancel().catch(() => {});
        throw 413;
      }
      bytes.set(chunk.value, length);
      length += chunk.value.byteLength;
    }
  } finally { reader.releaseLock(); }
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
  // One-field grammar: no duplicate/escaped keys, nested values or trailing JSON.
  const match = bodyPattern.exec(text);
  if (!match) throw 400;
  const value = match[1] === "null" ? null : match[1].slice(1, -1);
  if (!cursor(value)) throw 400;
  return value;
}

function pageResult(value: unknown, maximum: number): RefundAutomaticPageResult {
  const [processed, held, nextAfterRequestId] = ownValues(value, ["processed", "held", "nextAfterRequestId"]);
  if (typeof processed !== "number" || !Number.isSafeInteger(processed) || processed < 0 ||
    processed > maximum || typeof held !== "number" || !Number.isSafeInteger(held) ||
    held < 0 || held > processed || !cursor(nextAfterRequestId)) throw new Error();
  // Serialize only the validated copy, never provider objects or their toJSON hooks.
  return { processed, held, nextAfterRequestId };
}

/** Inert factory: no mount, environment lookup, clock, provider, SQL or financial engine.
 * Missing/invalid configuration creates a fail-closed handler, not a fallback. */
export function createRefundAutomaticHttp(
  configuration?: RefundAutomaticHttpConfiguration,
): (request: Request) => Promise<Response> {
  let captured: Readonly<{
    token: Buffer;
    maximum: number;
    runPage: (after: string | null) => Promise<unknown>;
  }> | null = null;
  try {
    const [token, maximum, runPage] = ownValues(configuration, ["token", "maxBatchSize", "runPage"]);
    const bytes = tokenBytes(token);
    if (!bytes || typeof maximum !== "number" || !Number.isSafeInteger(maximum) ||
      maximum < 1 || maximum > 50 || typeof runPage !== "function") throw new Error();
    const receiver = configuration;
    const original = runPage;
    captured = Object.freeze({
      token: bytes,
      maximum,
      // Capture both function identity and original receiver; do not read .bind/.call.
      runPage: (after: string | null) => Reflect.apply(original, receiver, [after]),
    });
  } catch { /* No exception details or configuration values escape. */ }
  const capability = captured;

  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.pathname !== route) return failure(404);
      if (request.method !== "POST") return failure(405);
      // URL.search alone misses a bare '?'. Reject fragments too; no aliases.
      if (request.url.includes("?") || request.url.includes("#")) return failure(400);
      if (!capability) return failure(503);
      const provided = tokenBytes(request.headers.get("x-d1-refund-token"));
      // A duplicated header is comma-joined by Headers and fails tokenBytes.
      // Equal, fixed-length decoded secrets are compared by the runtime primitive.
      if (!provided || !timingSafeEqual(provided, capability.token)) return failure(401);
    } catch { return failure(503); }

    // Authentication precedes every body read and any executor invocation.
    let after: string | null;
    try { after = await afterRequestId(request); }
    catch (error) { return failure(error === 413 ? 413 : 400); }

    try {
      if (!capability) return failure(503);
      const result = pageResult(await capability.runPage(after), capability.maximum);
      return new Response(JSON.stringify(result), { status: 200, headers: responseHeaders });
    } catch {
      // Execution may already have advanced durable state. Never retry or fall back.
      return failure(503);
    }
  };
}
