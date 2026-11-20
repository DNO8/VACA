import assert from "node:assert/strict";
import { DEPLOYED_SCOPE } from "../../functions/d1-custody/deployment-runtime.ts";
import { createIndependentCustodyRouter } from "../../functions/d1-custody/deployment-routing.ts";

const base = "https://offline.invalid/functions/v1/d1-custody";
const second = base + "/video-auto";
const pool = "GAPE4SD4RURXR2JFSK3JTVG6TJ53K7ECBILSVLKZY3RFOLXMWWHB5TKT";
const namespace = "3c6f6494-1712-4a1c-ab8e-560a1b8b072e";
const credit = String((5824021n << 32n) + 4097n); // Synthetic public operation reference, never submitted.
function configuration(): Record<string, string> {
  return {
    SUPABASE_URL: DEPLOYED_SCOPE.url, SUPABASE_SERVICE_ROLE_KEY: "offline-service-capability",
    D1_POOL_PUBLIC_KEY: DEPLOYED_SCOPE.pool, D1_NAMESPACE: DEPLOYED_SCOPE.namespace,
    D1_FIRST_LEDGER: String(DEPLOYED_SCOPE.firstLedger),
    D1_VIDEO_AUTO_ENABLED: "true", D1_VIDEO_AUTO_POOL_PUBLIC_KEY: pool,
    D1_VIDEO_AUTO_NAMESPACE: namespace, D1_VIDEO_AUTO_FIRST_LEDGER: "5824020",
    D1_VIDEO_AUTO_OPERATING_FUNDER: DEPLOYED_SCOPE.funder,
    D1_VIDEO_AUTO_OPERATING_OPERATION_ID: credit,
  };
}
let serial = 0;
async function withHost(values: Record<string, string>, run: (h: (r: Request) => Response | Promise<Response>, reads: string[]) => Promise<void>) {
  const oldGet = Deno.env.get, oldServe = Deno.serve, oldFetch = globalThis.fetch;
  const reads: string[] = []; let network = 0;
  let handler!: (r: Request) => Response | Promise<Response>;
  try {
    Deno.env.get = name => { reads.push(name); return values[name]; };
    Deno.serve = ((h: typeof handler) => { handler = h; return {}; }) as typeof Deno.serve;
    globalThis.fetch = () => { network++; throw Error("unexpected network"); };
    await import(`../../functions/d1-custody/deployment-index.ts?independent=${serial++}`);
    assert.equal(typeof handler, "function");
    await run(handler, reads);
    assert.equal(network, 0);
    assert(!reads.some(n => n.endsWith("SECRET_SEED") || n.endsWith("SECRET_KEY")));
  } finally { Deno.env.get = oldGet; Deno.serve = oldServe; globalThis.fetch = oldFetch; }
}
async function expect(response: Response, status: number, body: unknown, noStore = true) {
  assert.equal(response.status, status); assert.deepEqual(await response.json(), body);
  if (noStore) assert.equal(response.headers.get("cache-control"), "no-store");
}
const config = (address: string) => ({ network: "TESTNET", pool_public_key: address, donation_ttl_seconds: 300 });
Deno.test("independent routes: actual entrypoint selects fixed B without redirecting A", async () => {
  await withHost(configuration(), async h => {
    await expect(await h(new Request(second + "/config")), 200, config(pool));
    await expect(await h(new Request(base + "/config")), 200, config(DEPLOYED_SCOPE.pool));
  });
});
Deno.test("independent routes: disabled or malformed B cannot borrow A configuration", async () => {
  for (const override of [{ D1_VIDEO_AUTO_ENABLED: "false" }, { D1_VIDEO_AUTO_NAMESPACE: DEPLOYED_SCOPE.namespace },
    { D1_VIDEO_AUTO_OPERATING_OPERATION_ID: "25013975431254017" }, { D1_VIDEO_AUTO_OPERATING_FUNDER: "" },
    { D1_VIDEO_AUTO_POOL_PUBLIC_KEY: DEPLOYED_SCOPE.pool }, { D1_VIDEO_AUTO_FIRST_LEDGER: "5824021" },
    { D1_VIDEO_AUTO_OPERATING_OPERATION_ID: "18446744073709551616" },
    { D1_VIDEO_AUTO_OPERATING_OPERATION_ID: credit + "\n" }, { D1_VIDEO_AUTO_OPERATING_FUNDER: pool }] as Record<string, string>[]) {
    await withHost({ ...configuration(), ...override }, async (h, reads) => {
      await expect(await h(new Request(second + "/config")), 503, { error: "custody_unavailable" });
      await expect(await h(new Request(base + "/config")), 200, config(DEPLOYED_SCOPE.pool));
      if (override.D1_VIDEO_AUTO_ENABLED === "false")
        assert.deepEqual(reads.filter(n => n.startsWith("D1_VIDEO_AUTO_")), ["D1_VIDEO_AUTO_ENABLED"]);
    });
  }
});
Deno.test("independent routes: missing A does not disable configured B", async () => {
  const values = configuration(); delete values.D1_NAMESPACE;
  await withHost(values, async h => {
    await expect(await h(new Request(base + "/config")), 503, { error: "custody_unavailable" });
    await expect(await h(new Request(second + "/config")), 200, config(pool));
  });
});
Deno.test("independent routes: unknown, nested, trailing and encoded B paths never fall through", async () => {
  await withHost(configuration(), async h => {
    for (const suffix of ["", "/", "/config/", "/nope", "/nested/d1-custody/config", "/%63onfig", "/config%2f", "x/nested/d1-custody/config"])
      await expect(await h(new Request(second + suffix)), 404, { error: "not_found" });
  });
});
Deno.test("independent routes: B method and disabled status contracts stay intact", async () => {
  await withHost(configuration(), async h => {
    for (const suffix of ["prepare", "issue", "reconcile"])
      await expect(await h(new Request(second + "/" + suffix)), 404, { error: "not_found" }, false);
    await expect(await h(new Request(second + "/status", { method: "POST", body: "{}" })), 404, { error: "not_found" }, false);
    await expect(await h(new Request(second + "/prepare", { method: "POST", body: "{}" })), 400, { error: "invalid_request" });
  });
});

Deno.test("independent routes: translation preserves body, query, headers and method", async () => {
  const bytes = '{ "signature":"opaque", "payload": { "value":1 } }';
  const suffixes = ["config", "prepare", "issue", "reconcile", "status", "donor-payment-status",
    "refund", "refund-status", "refund-reconcile", "refund-remainder", "refund-remainder-status",
    "refund-remainder-reconcile", "internal-refund-tick"];
  let manual = 0, video = 0;
  const h = createIndependentCustodyRouter(() => async r => { manual++; return new Response(r.url); },
    () => async r => {
      video++; assert.equal(r.method, "POST"); assert.equal(await r.text(), bytes);
      assert.equal(r.headers.get("x-proof-test"), "unchanged"); return new Response(r.url);
    });
  for (const suffix of suffixes) for (const query of ["", "?afterRequestId=unchanged", "?", "#"]) {
    const r = new Request(second + "/" + suffix + query, { method: "POST", body: bytes, headers: { "x-proof-test": "unchanged" } });
    const expected = r.url.replace("/video-auto/", "/");
    assert.equal(await (await h(r)).text(), expected);
  }
  assert.equal(video, suffixes.length * 4); assert.equal(manual, 0);
  for (const url of [base + "/video%2dauto/nested/d1-custody/config", second + "/nested/d1-custody/config"]) {
    await expect(await h(new Request(url)), 404, { error: "not_found" });
  }
  assert.equal(manual, 0); assert.equal(video, suffixes.length * 4);
  assert.equal(await (await h(new Request(base + "/config"))).text(), base + "/config");
  assert.equal(manual, 1);
});
Deno.test("independent routes: automatic configuration cannot borrow manual service settings", async () => {
  const values = { ...configuration(), D1_VIDEO_AUTO_AUTOMATIC_REFUNDS_ENABLED: "true",
    D1_REFUND_SERVICE_ACTOR: DEPLOYED_SCOPE.funder };
  await withHost(values, async (h, reads) => {
    await expect(await h(new Request(second + "/internal-refund-tick", { method: "POST", body: "{}" })),
      503, { error: "refund_tick_unavailable" });
    await expect(await h(new Request(second + "/config")), 200, config(pool));
    assert(reads.includes("D1_VIDEO_AUTO_REFUND_SERVICE_ACTOR"));
    assert(!reads.includes("D1_REFUND_SERVICE_ACTOR"));
  });
});
