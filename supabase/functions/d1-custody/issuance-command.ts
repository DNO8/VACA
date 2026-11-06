import { hash, Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";

export interface IssuanceCommandConfiguration { readonly pool: string; readonly namespace: string; readonly now: () => number }
export interface VerifiedIssuanceCommand {
  readonly kind: "d1_verified_issuance_command"; readonly revision: 1;
  readonly namespace: string; readonly pool: string; readonly requestId: string; readonly authenticatedAdmin: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const invalid = () => new CustodyError("invalid_request", 400);
const unavailable = () => new CustodyError("issuance_command_unavailable", 503);
function exact(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === [...keys].sort().join(",");
}
async function bodyOf(request: Request): Promise<unknown> {
  try {
    if (!request.body) throw invalid();
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length; if (length > 8192) { await reader.cancel(); throw invalid(); } chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { throw invalid(); }
}
/** Internal runtime boundary: wallet proof is not current admin membership or durable permission. */
export function verifyIssuanceCommand(request: Request, configuration: IssuanceCommandConfiguration): Promise<VerifiedIssuanceCommand> {
  return verifyCommand(request, configuration, "issue");
}
export function verifyReconciliationCommand(request: Request, configuration: IssuanceCommandConfiguration): Promise<VerifiedIssuanceCommand> {
  return verifyCommand(request, configuration, "reconcile");
}
async function verifyCommand(request: Request, configuration: IssuanceCommandConfiguration, action: "issue" | "reconcile"): Promise<VerifiedIssuanceCommand> {
  if (new URL(request.url).pathname !== "/functions/v1/d1-custody/" + action) throw new CustodyError("not_found", 404);
  if (request.method !== "POST") throw new CustodyError("method_not_allowed", 405);
  let pool: string, namespace: string, clock: () => number;
  try {
    pool = configuration.pool; namespace = configuration.namespace; clock = configuration.now.bind(configuration);
    Keypair.fromPublicKey(pool); if (typeof namespace !== "string" || !uuid.test(namespace)) throw unavailable();
  } catch { throw unavailable(); }
  const body = await bodyOf(request);
  if (!exact(body, ["version", "network", "pool", "namespace", "action", "request_id", "timestamp", "payload", "wallet", "signature"]) ||
      body.version !== 1 || body.network !== "TESTNET" || body.pool !== pool || body.namespace !== namespace || body.action !== action ||
      typeof body.request_id !== "string" || !uuid.test(body.request_id) || typeof body.timestamp !== "number" || !Number.isSafeInteger(body.timestamp) || body.timestamp < 0 ||
      !exact(body.payload, []) || typeof body.wallet !== "string" || typeof body.signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(body.signature)) throw invalid();
  const signatureBytes = Buffer.from(body.signature, "base64");
  if (signatureBytes.length !== 64 || signatureBytes.toString("base64") !== body.signature) throw invalid();
  let now: number;
  try { now = clock(); if (!Number.isSafeInteger(now) || now < 0) throw unavailable(); } catch { throw unavailable(); }
  if (Math.abs(now - body.timestamp) > 60) throw new CustodyError("stale_request", 401);
  const { signature: _signature, ...message } = body;
  // All signed values are scalars except the structurally required empty payload.
  const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
  let valid = false;
  try { valid = Keypair.fromPublicKey(body.wallet).verify(hash(Buffer.from("Stellar Signed Message:\n" + canonical)), signatureBytes); } catch { /* Fail closed. */ }
  if (!valid) throw new CustodyError("invalid_signature", 401);
  return Object.freeze({ kind: "d1_verified_issuance_command", revision: 1, namespace, pool, requestId: body.request_id, authenticatedAdmin: body.wallet });
}
