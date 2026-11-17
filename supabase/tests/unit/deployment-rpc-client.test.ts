import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { hash, Keypair } from "@stellar/stellar-sdk";
import { createClient } from "@supabase/supabase-js";
import { createDeploymentRpcClient } from "../../functions/d1-custody/deployment-rpc-client.ts";
import { DEPLOYED_SCOPE } from "../../functions/d1-custody/deployment-runtime.ts";

Deno.test("RPC normalization preserves receiver, domain values and single-call failure", async () => {
  const data = { unexpected: true }, error = { code: "42501", message: "unauthorized_admin_wallet" };
  let calls = 0, getters = 0;
  let reply: unknown = { data, error, status: 403, count: null };
  const client = { async rpc(name: string, args: Record<string, unknown>) {
    assert.equal(this, client); assert.equal(name, "probe"); assert.deepEqual(args, { id: 1 }); calls++;
    return reply as { data: unknown; error: typeof error | null };
  } };
  const normalized = createDeploymentRpcClient(client);
  const result = await normalized.rpc("probe", { id: 1 });
  assert.deepEqual(Object.keys(result), ["data", "error"]);
  assert.equal(result.data, data); assert.equal(result.error, error); assert.equal(calls, 1);
  for (reply of [null, [], {}, Object.create({ data: null, error: null }),
    { get data() { getters++; return null; }, error: null },
    { data: null, get error() { getters++; return null; } }]) {
    const before: number = calls;
    await assert.rejects(() => Promise.resolve(normalized.rpc("probe", { id: 1 })), /invalid_rpc_response/);
    assert.equal(calls, before + 1); assert.equal(getters, 0);
  }
  let failures = 0;
  const failing = createDeploymentRpcClient({ rpc() { failures++; throw Error("transport_failed"); } });
  await assert.rejects(() => Promise.resolve(failing.rpc("probe", {})), /transport_failed/);
  assert.equal(failures, 1);
});

Deno.test("deployed entrypoint accepts real SDK envelopes without weakening manual admission", async () => {
  const admin = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 19));
  const requestId = "11111111-2222-4333-8444-555555555555";
  const calls: { name: string; args: unknown }[] = [];
  const unexpected: string[] = [];
  const secretReads: string[] = [];
  const values: Record<string, string> = {
    D1_POOL_PUBLIC_KEY: DEPLOYED_SCOPE.pool, D1_NAMESPACE: DEPLOYED_SCOPE.namespace,
    D1_FIRST_LEDGER: String(DEPLOYED_SCOPE.firstLedger), SUPABASE_URL: DEPLOYED_SCOPE.url,
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-not-a-credential", D1_AUTOMATIC_REFUNDS_ENABLED: "false",
  };
  let handler: (request: Request) => Response | Promise<Response>;
  let expectedRpc = "d1_load_refund_outcome";
  let reply: unknown = { code: "42501", message: "unauthorized_admin_wallet" };
  let replyStatus = 403;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const options = init as { method?: string; body?: unknown } | undefined;
    if (url.origin !== DEPLOYED_SCOPE.url || url.pathname !== `/rest/v1/rpc/${expectedRpc}` || options?.method !== "POST") {
      unexpected.push(url.href); throw Error("unexpected transport");
    }
    const args = JSON.parse(String(options.body));
    assert.deepEqual(args, { p_request_id: requestId, p_authorized_by: admin.publicKey() });
    calls.push({ name: expectedRpc, args });
    return Response.json(reply, { status: replyStatus });
  };
  const fetchBefore = globalThis.fetch;
  const envBefore = Object.getOwnPropertyDescriptor(Deno.env, "get")!;
  const serveBefore = Object.getOwnPropertyDescriptor(Deno, "serve")!;
  try {
    globalThis.fetch = fetcher;
    Object.defineProperty(Deno.env, "get", { ...envBefore, value: (name: string) => {
      if (name.includes("SECRET_SEED") || name.includes("SECRET_KEY")) secretReads.push(name);
      return values[name];
    } });
    Object.defineProperty(Deno, "serve", { ...serveBefore, value: (value: typeof handler) => { handler = value; } });
    const raw = await createClient(DEPLOYED_SCOPE.url, "synthetic-not-a-credential", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher },
    }).rpc(expectedRpc, { p_request_id: requestId, p_authorized_by: admin.publicKey() });
    assert.equal(raw.status, 403); assert.ok(Object.hasOwn(raw, "count"));
    assert.deepEqual(raw.error, reply); calls.length = 0;
    await import("../../functions/d1-custody/deployment-index.ts");
    assert.equal(typeof handler!, "function");
    async function response(path: string, status: number, body: unknown, invalid = false) {
      const message: Record<string, unknown> = { version: path.startsWith("refund-remainder") ? 2 : 1,
        network: "TESTNET", pool: DEPLOYED_SCOPE.pool, namespace: DEPLOYED_SCOPE.namespace,
        action: path.replaceAll("-", "_"), request_id: requestId, timestamp: Math.floor(Date.now() / 1000),
        payload: {}, wallet: admin.publicKey() };
      const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
      const signature = admin.sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical)));
      if (invalid) signature[0] ^= 1;
      calls.length = 0;
      const result = await handler(new Request(`https://offline.invalid/functions/v1/d1-custody/${path}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...message, signature: signature.toString("base64") }),
      }));
      assert.equal(result.status, status, path);
      assert.equal(await result.text(), JSON.stringify(body), path);
      assert.equal(result.headers.get("cache-control"), "no-store", path);
      assert.deepEqual(calls, invalid ? [] : [{ name: expectedRpc,
        args: { p_request_id: requestId, p_authorized_by: admin.publicKey() } }]);
      assert.deepEqual(unexpected, []); assert.deepEqual(secretReads, []);
    }
    for (const path of ["refund", "refund-status", "refund-reconcile", "refund-remainder", "refund-remainder-status", "refund-remainder-reconcile", "issue"]) {
      expectedRpc = path === "issue" ? "d1_load_issuance_outcome" :
        path.startsWith("refund-remainder") || path === "refund-reconcile" ? "d1_load_unsigned_transaction" : "d1_load_refund_outcome";
      await response(path, 403, { error: "unauthorized_admin_wallet" });
      await response(path, 401, { error: "invalid_signature" }, true);
    }
    expectedRpc = "d1_load_unsigned_transaction";
    reply = { code: "22023", message: "d1_preparation_not_found" }; replyStatus = 400;
    await response("refund-remainder-status", 404, { error: "request_not_found" });
    reply = { kind: "d1_unsigned_transaction_lookup", revision: 1, request_id: requestId,
      namespace: DEPLOYED_SCOPE.namespace, network: "TESTNET", pool: DEPLOYED_SCOPE.pool,
      reservation: null, transaction: null }; replyStatus = 200;
    await response("refund-remainder-status", 404, { error: "request_not_found" });
    reply = { ...reply as object, unexpected: true };
    await response("refund-remainder-status", 503, { error: "remainder_unavailable" });
    calls.length = 0;
    const config = await handler!(new Request("https://offline.invalid/functions/v1/d1-custody/config"));
    assert.equal(config.status, 200);
    assert.deepEqual(await config.json(), { network: "TESTNET", pool_public_key: DEPLOYED_SCOPE.pool, donation_ttl_seconds: 300 });
    const tick = await handler!(new Request("https://offline.invalid/functions/v1/d1-custody/internal-refund-tick", { method: "POST", body: "{}" }));
    assert.equal(tick.status, 503); assert.equal(await tick.text(), '{"error":"refund_tick_unavailable"}');
    assert.equal(tick.headers.get("cache-control"), "no-store");
    assert.deepEqual(calls, []); assert.deepEqual(unexpected, []); assert.deepEqual(secretReads, []);
  } finally {
    globalThis.fetch = fetchBefore;
    Object.defineProperty(Deno.env, "get", envBefore);
    Object.defineProperty(Deno, "serve", serveBefore);
  }
});
