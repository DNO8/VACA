import { hash, Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { REFUND_ROUTES, type RefundAction } from "./refund-http-contract.ts";

export interface RefundCommandConfiguration {
  readonly pool: string;
  readonly namespace: string;
  readonly now: () => number;
}
export interface VerifiedRefundCommand {
  readonly kind: "d1_verified_refund_command";
  readonly revision: 1;
  readonly action: RefundAction;
  readonly namespace: string;
  readonly pool: string;
  readonly requestId: string;
  readonly authenticatedAdmin: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const invalid = () => new CustodyError("invalid_request", 400);
const unavailable = () => new CustodyError("refund_unavailable", 503);
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
async function bodyOf(request: Request): Promise<unknown> {
  try {
    if (!request.body) throw invalid();
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length;
        if (length > 8192) { await reader.cancel(); throw invalid(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { throw invalid(); }
}
/** Wallet proof only. Every handler still needs current DB membership and financial guards. */
export async function verifyRefundCommand(
  request: Request, configuration: RefundCommandConfiguration,
): Promise<VerifiedRefundCommand> {
  const path = new URL(request.url).pathname;
  const action = (Object.keys(REFUND_ROUTES) as RefundAction[]).find(a => REFUND_ROUTES[a] === path);
  if (action === undefined) throw new CustodyError("not_found", 404);
  if (request.method !== "POST") throw new CustodyError("method_not_allowed", 405);
  let pool: string, namespace: string, clock: () => unknown;
  try {
    if (configuration === null || typeof configuration !== "object" ||
      Object.getPrototypeOf(configuration) !== Object.prototype) throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(configuration), keys = Reflect.ownKeys(configuration);
    if (keys.length !== 3 || !["pool", "namespace", "now"].every(k =>
      Object.hasOwn(descriptors, k) && descriptors[k].enumerable && "value" in descriptors[k])) throw unavailable();
    const capturedPool = descriptors.pool.value, capturedNamespace = descriptors.namespace.value, now = descriptors.now.value;
    if (typeof capturedPool !== "string" || typeof capturedNamespace !== "string" ||
      !uuid.test(capturedNamespace) || typeof now !== "function") throw unavailable();
    Keypair.fromPublicKey(capturedPool);
    pool = capturedPool; namespace = capturedNamespace;
    clock = () => Reflect.apply(now, configuration, []);
  } catch { throw unavailable(); }
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") throw invalid();
  const body = await bodyOf(request);
  if (!exact(body, ["version", "network", "pool", "namespace", "action", "request_id", "timestamp", "payload", "wallet", "signature"]) ||
    body.version !== 1 || body.network !== "TESTNET" || body.pool !== pool || body.namespace !== namespace || body.action !== action ||
    typeof body.request_id !== "string" || !uuid.test(body.request_id) || typeof body.timestamp !== "number" ||
    !Number.isSafeInteger(body.timestamp) || body.timestamp < 0 || !exact(body.payload, []) ||
    typeof body.wallet !== "string" || typeof body.signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(body.signature)) throw invalid();
  const signature = Buffer.from(body.signature, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== body.signature) throw invalid();
  let observedAt: number;
  try {
    const now = clock();
    if (typeof now !== "number" || !Number.isSafeInteger(now) || now < 0) throw unavailable();
    observedAt = now;
  } catch { throw unavailable(); }
  if (Math.abs(observedAt - body.timestamp) > 60) throw new CustodyError("stale_request", 401);
  const { signature: _signature, ...message } = body;
  const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
  let valid = false;
  try {
    valid = Keypair.fromPublicKey(body.wallet).verify(hash(Buffer.from("Stellar Signed Message:\n" + canonical)), signature);
  } catch { /* Invalid public keys or signatures never establish an actor. */ }
  if (!valid) throw new CustodyError("invalid_signature", 401);
  return Object.freeze({ kind: "d1_verified_refund_command", revision: 1, action,
    namespace, pool, requestId: body.request_id, authenticatedAdmin: body.wallet });
}
