import { hash, Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { verifyIssuanceCommand } from "../../functions/d1-custody/issuance-command.ts";
import { pool, namespace, requestId, admin, team, closedAt, equal } from "../fixtures/initial-financial-authorization.ts";
const url = "http://local.invalid/functions/v1/d1-custody/issue", configuration = { pool, namespace, now: () => closedAt };
function canonical(x: unknown): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  const o = x as Record<string, unknown>; return "{" + Object.keys(o).sort().map(k => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
}
function body(changes: Record<string, unknown> = {}): Record<string, unknown> {
  const message = { version: 1, network: "TESTNET", pool, namespace, action: "issue", request_id: requestId, timestamp: closedAt, payload: {}, wallet: admin, ...changes };
  return { ...message, signature: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 104)).sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical(message)))).toString("base64") };
}
const request = (b: unknown) => new Request(url, { method: "POST", body: JSON.stringify(b) });
async function reject(r: Request, code: string, status: number, used = true, config = configuration) {
  let caught: unknown; try { await verifyIssuanceCommand(r, config); } catch (e) { caught = e; }
  equal(caught instanceof CustodyError ? [caught.code, caught.status, caught.message] : "uncaught", [code, status, code]); equal(r.bodyUsed, used);
}
Deno.test("issuance command verifies existing wallet-proof convention independent of JSON field order", async () => {
  for (const reversed of [false, true]) {
    const b = body(), r = request(reversed ? Object.fromEntries(Object.entries(b).reverse()) : b), result = await verifyIssuanceCommand(r, configuration);
    equal(result, { kind: "d1_verified_issuance_command", revision: 1, namespace, pool, requestId, authenticatedAdmin: admin }); equal(Object.isFrozen(result), true); equal(r.bodyUsed, true);
  }
});
Deno.test("issuance command binds action namespace pool request and wallet and accepts no caller economics or XDR", async () => {
  for (const changes of [{ action: "prepare" }, { namespace: requestId }, { pool: team }, { network: "PUBLIC" }, { payload: { unsigned_xdr: "AAAA", destination: team, amount: "1.0000000" } }]) await reject(request(body(changes)), "invalid_request", 400);
  for (const change of [{ request_id: namespace }, { wallet: team }, { timestamp: closedAt + 1 }]) await reject(request({ ...body(), ...change }), "invalid_signature", 401);
});
Deno.test("issuance command rejects malformed envelope and JSON without a reusable authorization", async () => {
  for (const changes of [{ version: 2 }, { request_id: "not-a-uuid" }, { timestamp: 0.5 }, { payload: [] }, { extra: true }, { signature: "wrong" }]) await reject(request({ ...body(), ...changes }), "invalid_request", 400);
  const missing = body(); delete missing.wallet; await reject(request(missing), "invalid_request", 400);
  await reject(new Request(url, { method: "POST", body: "{" }), "invalid_request", 400);
  await reject(new Request(url, { method: "POST" }), "invalid_request", 400, false);
});
Deno.test("issuance command uses inclusive sixty-second proof boundaries and fails closed on invalid trusted clock", async () => {
  for (const delta of [-60, 60]) equal((await verifyIssuanceCommand(request(body({ timestamp: closedAt + delta })), configuration)).requestId, requestId);
  for (const delta of [-61, 61]) await reject(request(body({ timestamp: closedAt + delta })), "stale_request", 401);
  for (const now of [NaN, Infinity, -1, 0.5]) await reject(request(body()), "issuance_command_unavailable", 503, true, { ...configuration, now: () => now });
});
Deno.test("issuance command rejects invalid wallet signatures and noncanonical equivalent signature padding", async () => {
  await reject(request(body({ wallet: team })), "invalid_signature", 401); await reject(request(body({ wallet: "invalid" })), "invalid_signature", 401);
  await reject(request({ ...body(), signature: Buffer.alloc(64).toString("base64") }), "invalid_signature", 401);
  const b = body(), s = String(b.signature), alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const equivalent = s.slice(0, -3) + alphabet[alphabet.indexOf(s.at(-3)!) + 1] + "=="; equal(Buffer.from(s, "base64").toString("hex"), Buffer.from(equivalent, "base64").toString("hex"));
  await reject(request({ ...b, signature: equivalent }), "invalid_request", 400);
});
Deno.test("issuance command enforces actual body bytes including exact limit cancellation and fatal UTF8", async () => {
  equal((await verifyIssuanceCommand(new Request(url, { method: "POST", body: JSON.stringify(body()).padEnd(8192, " ") }), configuration)).authenticatedAdmin, admin);
  let cancelled = false, pulls = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(c) { if (pulls++ === 0) c.enqueue(new Uint8Array(8193).fill(32)); else c.close(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  await reject(new Request(url, { method: "POST", body: stream }), "invalid_request", 400); equal(cancelled, true); equal(pulls, 1);
  await reject(new Request(url, { method: "POST", body: new Uint8Array([0xc3, 0x28]) }), "invalid_request", 400);
});
Deno.test("issuance command rejects wrong route method and invalid trusted scope before reading a body", async () => {
  await reject(new Request(url + "/other", { method: "POST", body: JSON.stringify(body()) }), "not_found", 404, false);
  await reject(new Request(url), "method_not_allowed", 405, false);
  await reject(request(body()), "issuance_command_unavailable", 503, false, { ...configuration, pool: "invalid" });
  await reject(request(body()), "issuance_command_unavailable", 503, false, { ...configuration, namespace: "invalid" });
});
