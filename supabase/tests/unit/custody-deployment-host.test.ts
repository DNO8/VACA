import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { hash, Keypair } from "@stellar/stellar-sdk";
import { createCustodyDeploymentHost } from "../../functions/d1-custody/deployment-host.ts";
import { createDeploymentRuntime, DEPLOYED_SCOPE } from "../../functions/d1-custody/deployment-runtime.ts";

const pool = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 71));
const funder = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 72));
const namespace = "00000000-0000-4000-8000-000000000071";
const prefix = "https://offline.invalid/functions/v1/d1-custody";
function fixture() {
  const effects = { rpc: 0, provider: 0, secret: 0 };
  const dependencies = {
    pool: pool.publicKey(), namespace, firstLedger: 1,
    creationOperationId: "4294967297", teamFunders: [funder.publicKey()],
    now: () => 1700000000,
    client: { async rpc(_name: string, _args: Record<string, unknown>) {
      effects.rpc++;
      return { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
    } },
    fetcher: (async () => { effects.provider++; throw new Error("unexpected_provider"); }) as typeof fetch,
    readSecret: (_requested: string) => { effects.secret++; return pool.secret(); },
  };
  return { dependencies, effects };
}
Deno.test("deployment host preserves all deployed POST proof boundaries without private effects", async () => {
  const { dependencies, effects } = fixture();
  const handler = createCustodyDeploymentHost(dependencies);
  for (const route of ["prepare", "issue", "reconcile", "refund", "refund-status", "refund-reconcile",
    "refund-remainder", "refund-remainder-status", "refund-remainder-reconcile"]) {
    const response = await handler(new Request(`${prefix}/${route}`, { method: "POST", body: "{}" }));
    assert.equal(response.status, 400, route);
    assert.deepEqual(await response.json(), { error: "invalid_request" }, route);
    assert.equal(response.headers.get("cache-control"), "no-store", route);
    assert.deepEqual(effects, { rpc: 0, provider: 0, secret: 0 }, route);
  }
});

Deno.test("deployment host retains exact public config and does not enable status or donor expansion", async () => {
  const { dependencies, effects } = fixture();
  const handler = createCustodyDeploymentHost(dependencies);
  const config = await handler(new Request(`${prefix}/config`));
  assert.equal(config.status, 200);
  assert.deepEqual(await config.json(), { network: "TESTNET", pool_public_key: pool.publicKey(), donation_ttl_seconds: 300 });
  assert.equal(config.headers.get("cache-control"), "no-store");
  assert.equal(config.headers.get("access-control-allow-origin"), "*");
  for (const route of ["status", "donor-payment-status", "unknown"]) {
    const response = await handler(new Request(`${prefix}/${route}`, { method: "POST", body: "{}" }));
    assert.equal(response.status, 404, route);
    assert.deepEqual(await response.json(), { error: "not_found" }, route);
  }
  assert.deepEqual(effects, { rpc: 0, provider: 0, secret: 0 });
});

Deno.test("deployment preflight verifies proof before membership and never reads signer on denial", async () => {
  for (const [change, status, error] of [
    [{ timestamp: 1699999939 }, 401, "stale_request"],
    [{ pool: funder.publicKey() }, 400, "invalid_request"],
    [{ wallet: pool.publicKey() }, 401, "invalid_signature"],
    [{}, 403, "unauthorized_admin_wallet"],
  ] as const) {
    const { dependencies, effects } = fixture();
    const calls: unknown[] = [];
    const rpc = dependencies.client.rpc;
    dependencies.client.rpc = (name, args) => { calls.push([name, args]); return rpc(name, args); };
    const message: Record<string, unknown> = { version: 1, network: "TESTNET", pool: dependencies.pool,
      namespace, action: "issue", request_id: namespace, timestamp: dependencies.now(), payload: {},
      wallet: funder.publicKey() };
    Object.assign(message, change);
    const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
    const signature = funder.sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical))).toString("base64");
    const response = await createCustodyDeploymentHost(dependencies)(new Request(`${prefix}/issue`, {
      method: "POST", body: JSON.stringify({ ...message, signature }),
    }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(effects, { rpc: status === 403 ? 1 : 0, provider: 0, secret: 0 });
    assert.deepEqual(calls, status === 403 ? [["d1_load_issuance_outcome", {
      p_request_id: namespace, p_authorized_by: funder.publicKey(),
    }]] : []);
  }
});

Deno.test("disabled or malformed automatic settings leave manual host available and tick isolated", async () => {
  for (const enabled of [undefined, "false", "invalid", "true"]) {
    const { dependencies, effects } = fixture();
    const reads: string[] = [];
    const values: Record<string, string | undefined> = { D1_POOL_PUBLIC_KEY: DEPLOYED_SCOPE.pool,
      D1_NAMESPACE: DEPLOYED_SCOPE.namespace, D1_FIRST_LEDGER: String(DEPLOYED_SCOPE.firstLedger),
      SUPABASE_URL: DEPLOYED_SCOPE.url, SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-service-key",
      D1_AUTOMATIC_REFUNDS_ENABLED: enabled };
    const handler = createDeploymentRuntime({ getEnv: name => { reads.push(name); return values[name]; },
      clientFactory: () => dependencies.client, fetcher: dependencies.fetcher, now: dependencies.now });
    for (const route of ["prepare", "issue", "reconcile", "refund", "refund-status", "refund-reconcile",
      "refund-remainder", "refund-remainder-status", "refund-remainder-reconcile"]) {
      const response = await handler(new Request(`${prefix}/${route}`, { method: "POST", body: "{}" }));
      assert.equal(response.status, 400, `${enabled}/${route}`);
      assert.deepEqual(await response.json(), { error: "invalid_request" });
    }
    const tick = await handler(new Request(`${prefix}/internal-refund-tick`, { method: "POST", body: "{}" }));
    assert.equal(tick.status, 503);
    assert.deepEqual(await tick.json(), { error: "refund_tick_unavailable" });
    assert.equal(tick.headers.get("cache-control"), "no-store");
    const near = await handler(new Request(`${prefix}/internal-refund-tick-extra`, { method: "POST", body: "{}" }));
    assert.equal(near.status, 404);
    assert.deepEqual(await near.json(), { error: "not_found" });
    assert.deepEqual(effects, { rpc: 0, provider: 0, secret: 0 });
    assert.equal(reads.includes("D1_POOL_SECRET_SEED"), false);
    assert.equal(reads.includes("D1_REFUND_POOL_SECRET_KEY"), false);
  }
});
