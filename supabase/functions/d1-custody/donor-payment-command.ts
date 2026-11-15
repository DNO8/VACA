import { hash, Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";

export interface DonorPaymentCommandConfiguration {
  readonly namespace: string;
  readonly pool: string;
  readonly now: () => number;
}
export interface VerifiedDonorPaymentCommand {
  readonly kind: "d1_verified_donor_payment_command";
  readonly revision: 1;
  readonly network: "TESTNET";
  readonly namespace: string;
  readonly pool: string;
  readonly paymentTransactionHash: string;
  readonly paymentOperationId: string;
  readonly verifiedDonor: string;
}
const invalid = () => new CustodyError("invalid_request", 400);
const unavailable = () => new CustodyError("donor_payment_unavailable", 503);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fields = ["version", "network", "namespace", "pool", "action", "payment_transaction_hash",
  "payment_operation_id", "timestamp", "payload", "wallet", "signature"].sort();
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === keys.join(",");
}
function address(value: unknown): value is string {
  if (typeof value !== "string" || !/^G[A-Z2-7]{55}$/.test(value)) return false;
  try { return Keypair.fromPublicKey(value).publicKey() === value; } catch { return false; }
}

/** Grammar-only walk: decode keys before comparing, never parse an object before this pass. */
function uniqueJSON(text: string): unknown {
  let cursor = 0;
  const stringToken = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  const scalarToken = /(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/y;
  function whitespace() {
    while (cursor < text.length && /[ \t\r\n]/.test(text[cursor])) cursor++;
  }
  function token(pattern: RegExp): string {
    pattern.lastIndex = cursor;
    const match = pattern.exec(text);
    if (!match) throw invalid();
    cursor = pattern.lastIndex;
    return match[0];
  }
  function value(depth: number): void {
    if (depth > 32) throw invalid();
    whitespace();
    const first = text[cursor];
    if (first === '"') { token(stringToken); return; }
    if (first !== "{" && first !== "[") { token(scalarToken); return; }
    cursor++;
    const object = first === "{", end = object ? "}" : "]", keys = new Set<string>();
    whitespace();
    if (text[cursor] === end) { cursor++; return; }
    while (true) {
      whitespace();
      if (object) {
        const key: string = JSON.parse(token(stringToken));
        if (keys.has(key)) throw invalid();
        keys.add(key);
        whitespace();
        if (text[cursor++] !== ":") throw invalid();
      }
      value(depth + 1);
      whitespace();
      const separator = text[cursor++];
      if (separator === end) return;
      if (separator !== ",") throw invalid();
    }
  }
  value(0);
  whitespace();
  if (cursor !== text.length) throw invalid();
  return JSON.parse(text);
}
async function bodyOf(request: Request): Promise<unknown> {
  try {
    if (!request.body) throw invalid();
    const reader = request.body.getReader(), bytes = new Uint8Array(8192);
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array) || value.byteLength > bytes.length - length) {
          try { await reader.cancel(); } catch { /* Cancellation cannot change the rejection. */ }
          throw invalid();
        }
        bytes.set(value, length);
        length += value.byteLength;
      }
    } finally { reader.releaseLock(); }
    // Preserve a BOM as a token so it is rejected, rather than silently stripping it.
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
    return uniqueJSON(text);
  } catch { throw invalid(); }
}

/** Authentication only: neither payment ownership nor administrator/refund permission. */
export async function verifyDonorPaymentCommand(
  request: Request, configuration: DonorPaymentCommandConfiguration,
): Promise<Readonly<VerifiedDonorPaymentCommand>> {
  let method: string, hasQuery: boolean;
  try {
    method = request.method;
    // URL.search is empty for a bare '?'; the serialized URL retains the delimiter.
    hasQuery = new URL(request.url).href.split("#", 1)[0].includes("?");
  } catch { throw unavailable(); }
  if (method !== "POST") throw new CustodyError("method_not_allowed", 405);
  if (hasQuery) throw invalid();
  let namespace: string, pool: string, clock: () => number;
  try {
    namespace = configuration.namespace; pool = configuration.pool;
    const now = configuration.now;
    if (typeof namespace !== "string" || !uuid.test(namespace) || !address(pool) ||
      typeof now !== "function") throw unavailable();
    clock = now.bind(configuration);
  } catch { throw unavailable(); }
  const body = await bodyOf(request);
  if (!exact(body, fields) || body.version !== 1 || body.network !== "TESTNET" ||
    body.namespace !== namespace || body.pool !== pool || body.action !== "donor_payment_status" ||
    typeof body.payment_transaction_hash !== "string" || !/^[0-9a-f]{64}$/.test(body.payment_transaction_hash) ||
    typeof body.payment_operation_id !== "string" || !/^[1-9][0-9]{0,18}$/.test(body.payment_operation_id) ||
    BigInt(body.payment_operation_id) > 9223372036854775807n ||
    typeof body.timestamp !== "number" || !Number.isSafeInteger(body.timestamp) || body.timestamp < 0 ||
    !exact(body.payload, []) || !address(body.wallet) ||
    typeof body.signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(body.signature)) throw invalid();
  const signature = Buffer.from(body.signature, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== body.signature) throw invalid();
  let now: number;
  try {
    now = clock();
    if (!Number.isSafeInteger(now) || now < 0) throw unavailable();
  } catch { throw unavailable(); }
  if (Math.abs(now - body.timestamp) > 60) throw new CustodyError("stale_request", 401);
  let valid: boolean;
  try {
    const { signature: _signature, ...unsigned } = body;
    const canonical = JSON.stringify(Object.fromEntries(Object.keys(unsigned).sort().map(k => [k, unsigned[k]])));
    valid = Keypair.fromPublicKey(body.wallet).verify(
      hash(Buffer.from("Stellar Signed Message:\n" + canonical, "utf8")), signature,
    );
  } catch { throw unavailable(); }
  if (!valid) throw new CustodyError("invalid_signature", 401);
  return Object.freeze({
    kind: "d1_verified_donor_payment_command", revision: 1, network: "TESTNET", namespace, pool,
    paymentTransactionHash: body.payment_transaction_hash,
    paymentOperationId: body.payment_operation_id, verifiedDonor: body.wallet,
  });
}
