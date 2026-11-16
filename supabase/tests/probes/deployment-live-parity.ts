import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { Keypair, hash } from "@stellar/stellar-sdk";
import { createDeploymentRuntime, DEPLOYED_SCOPE as scope } from "../../functions/d1-custody/deployment-runtime.ts";

const prefix = "https://offline.invalid/functions/v1/d1-custody";
const admin = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 93));
const now = 1700000000;
const values: Record<string, string> = {
  D1_POOL_PUBLIC_KEY: scope.pool, D1_NAMESPACE: scope.namespace,
  D1_FIRST_LEDGER: String(scope.firstLedger), SUPABASE_URL: scope.url,
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-service-key",
};
function proof(patch: Record<string, unknown> = {}) {
  const message: Record<string, unknown> = { version: 1, network: "TESTNET", pool: scope.pool,
    namespace: scope.namespace, action: "issue", request_id: scope.namespace,
    timestamp: now, payload: {}, wallet: admin.publicKey(), ...patch };
  const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
  return JSON.stringify({ ...message, signature: admin.sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical))).toString("base64") });
}
async function snapshot(response: Response) {
  return { status: response.status, body: await response.text(), headers: [...response.headers].sort() };
}
Deno.test("S1/S2 T2: captured v4 route/proof differential and inert rejected requests", async () => {
  const original = { serve: Deno.serve, get: Deno.env.get, fetch: globalThis.fetch, now: Date.now };
  let live!: (request: Request) => Response | Promise<Response>;
  let liveRpc = 0, candidateRpc = 0, provider = 0, secret = 0;
  const get = (name: string) => { if (name.includes("SECRET")) secret++; return values[name]; };
  const denied = { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(scope.url + "/rest/v1/rpc/")) {
      liveRpc++; return Response.json(denied.error, { status: 403 });
    }
    provider++; throw Error("unexpected provider");
  }) as typeof fetch;
  try {
    Deno.env.get = get;
    Date.now = () => now * 1000;
    globalThis.fetch = fetcher;
    Deno.serve = ((handler: typeof live) => { live = handler; return {}; }) as typeof Deno.serve;
    await import("../../.temp/d1-recording-live-v4-tzoej630/index.js");
    assert.equal(typeof live, "function");
    const candidate = createDeploymentRuntime({ getEnv: get, now: () => now, fetcher,
      clientFactory: () => ({ async rpc() { candidateRpc++; return denied; } }) });
    const cases: [string, string, string | undefined][] = [];
    for (const route of ["config", "status", "donor-payment-status", "unknown", "prepare", "issue",
      "reconcile", "refund", "refund-status", "refund-reconcile", "refund-remainder",
      "refund-remainder-status", "refund-remainder-reconcile"]) {
      for (const method of ["GET", "POST", "OPTIONS"]) cases.push([route, method, method === "POST" ? "{}" : undefined]);
    }
    for (const patch of [{ timestamp: now - 61 }, { pool: admin.publicKey() },
      { network: "PUBLIC" }, { namespace: "00000000-0000-4000-8000-000000000000" },
      { wallet: scope.pool }, {}]) cases.push(["issue", "POST", proof(patch)]);
    for (const [route, method, body] of cases) {
      const before = [liveRpc, candidateRpc];
      const request = () => new Request(prefix + "/" + route, { method, body });
      assert.deepEqual(await snapshot(await candidate(request())), await snapshot(await live(request())), route + "/" + method);
      assert.equal(candidateRpc - before[1], liveRpc - before[0], route);
      assert.equal(provider, 0); assert.equal(secret, 0);
    }
    assert.equal(candidateRpc, 1); assert.equal(liveRpc, 1);
    console.log("45 exact response comparisons; membership RPC 1 each; provider/signing 0");
  } finally {
    Deno.serve = original.serve; Deno.env.get = original.get; globalThis.fetch = original.fetch; Date.now = original.now;
  }
});
Deno.test("S1/S2 T2: configuration fails before client creation; malformed automation stays tick-only", async () => {
  for (const key of Object.keys(values)) {
    let clients = 0;
    assert.throws(() => createDeploymentRuntime({ getEnv: name => name === key ? undefined : values[name],
      clientFactory: () => { clients++; throw Error("unexpected client"); }, fetcher: fetch, now: () => now }),
      { message: "Custody configuration unavailable" });
    assert.equal(clients, 0);
  }
  for (const enabled of [undefined, "false", "TRUE", "true"]) {
    const reads: string[] = [];
    const handler = createDeploymentRuntime({ getEnv: name => { reads.push(name); return name === "D1_AUTOMATIC_REFUNDS_ENABLED" ? enabled : values[name]; },
      clientFactory: () => ({ rpc() { throw Error("unexpected RPC"); } }),
      fetcher: (() => { throw Error("unexpected provider"); }) as typeof fetch, now: () => now });
    for (const [route, status, error] of [["internal-refund-tick", 503, "refund_tick_unavailable"],
      ["internal-refund-tick/", 404, "not_found"], ["internal-refund-tick-extra", 404, "not_found"],
      ["refund", 400, "invalid_request"], ["issue", 400, "invalid_request"]] as const) {
      const response = await handler(new Request(prefix + "/" + route, { method: "POST", body: "{}" }));
      assert.equal(response.status, status); assert.deepEqual(await response.json(), { error });
    }
    assert.equal(reads.some(name => name.includes("SECRET")), false);
  }
});
