import { hash, Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { REMAINDER_ROUTES, REMAINDER_BODY_LIMIT_BYTES, REMAINDER_MAX_SKEW_SECONDS,
  type RemainderAction } from "./remainder-http-contract.ts";

export interface RemainderCommandConfiguration {
  readonly pool: string;
  readonly namespace: string;
  readonly now: () => number;
}
/** Structurally matches the real candidate/financial/signing scope; wallet proof is not a role grant. */
export interface RemainderCommandScope {
  readonly namespace: string;
  readonly pool: string;
  readonly requestId: string;
  readonly authenticatedAdmin: string;
}
export interface VerifiedRemainderCommand extends RemainderCommandScope {
  readonly kind: "d1_verified_remainder_command";
  readonly revision: 2;
  readonly action: RemainderAction;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const invalid = () => new CustodyError("invalid_request", 400);
const unavailable = () => new CustodyError("remainder_unavailable", 503);
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(value);
  return names.length === keys.length && keys.every(k => Object.hasOwn(descriptors, k) &&
    descriptors[k].enumerable && "value" in descriptors[k]);
}
/** JSON.parse establishes syntax; token inspection additionally rejects decoded duplicate object keys. */
function parseUniqueJson(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) ?? [];
  const stack: (Set<string> | null)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "{") stack.push(new Set());
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ":") {
      const keys = stack.at(-1), key = JSON.parse(token) as string;
      if (!keys || keys.has(key)) throw invalid();
      keys.add(key);
    }
  }
  return parsed;
}
async function bodyOf(request: Request): Promise<unknown> {
  try {
    if (!request.body) throw invalid();
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > REMAINDER_BODY_LIMIT_BYTES) { void reader.cancel().catch(() => {}); throw invalid(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return parseUniqueJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { throw invalid(); }
}
/** Public Request boundary only: no DB/admin check, provider, financial RPC, key load or signing. */
export async function verifyRemainderCommand(
  request: Request, configuration: RemainderCommandConfiguration,
): Promise<VerifiedRemainderCommand> {
  const path = new URL(request.url).pathname;
  const action = (Object.keys(REMAINDER_ROUTES) as RemainderAction[]).find(a => REMAINDER_ROUTES[a] === path);
  if (action === undefined) throw new CustodyError("not_found", 404);
  if (request.method !== "POST") throw new CustodyError("method_not_allowed", 405);
  let pool: string, namespace: string, clock: () => unknown;
  try {
    if (!exact(configuration, ["pool", "namespace", "now"])) throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(configuration);
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
    body.version !== 2 || body.network !== "TESTNET" || body.pool !== pool || body.namespace !== namespace || body.action !== action ||
    typeof body.request_id !== "string" || !uuid.test(body.request_id) || typeof body.timestamp !== "number" ||
    !Number.isSafeInteger(body.timestamp) || body.timestamp < 0 || !exact(body.payload, []) ||
    typeof body.wallet !== "string" || typeof body.signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(body.signature)) throw invalid();
  const signature = Buffer.from(body.signature, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== body.signature) throw invalid();
  let observedAt: number;
  try {
    const now = clock(); // Fresh AFTER the streamed body await; captured function and original receiver.
    if (typeof now !== "number" || !Number.isSafeInteger(now) || now < 0) throw unavailable();
    observedAt = now;
  } catch { throw unavailable(); }
  if (Math.abs(observedAt - body.timestamp) > REMAINDER_MAX_SKEW_SECONDS) throw new CustodyError("stale_request", 401);
  const { signature: _signature, ...message } = body;
  const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
  let valid = false;
  try {
    valid = Keypair.fromPublicKey(body.wallet).verify(hash(Buffer.from("Stellar Signed Message:\n" + canonical, "utf8")), signature);
  } catch { /* Invalid StrKey or Ed25519 proof establishes no actor. */ }
  if (!valid) throw new CustodyError("invalid_signature", 401);
  return Object.freeze({ kind: "d1_verified_remainder_command", revision: 2, action,
    namespace, pool, requestId: body.request_id, authenticatedAdmin: body.wallet });
}
