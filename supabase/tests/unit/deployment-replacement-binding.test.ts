import assert from "node:assert/strict";
import {
  createDeploymentRuntime, createVideoAutoRuntime, DEPLOYED_SCOPE, VIDEO_AUTO_SCOPE,
} from "../../functions/d1-custody/deployment-runtime.ts";

// Public, confirmed Testnet references. These tests never contact a provider.
const replacement = {
  url: "https://tgqxxnldwiqisopiclmk.supabase.co",
  pool: "GAYWVFBP2YPYMU245D6AOE7WWTVZOWGPVIFVGOH5EFFSSQ3VZAVR5JCW",
  namespace: "8126a1f4-ed8a-41ec-905b-9ad3442e5e6e",
  firstLedger: 5859490,
  creationOperationId: "25166317921255425",
};
const oldB = {
  D1_VIDEO_AUTO_POOL_PUBLIC_KEY: "GAPE4SD4RURXR2JFSK3JTVG6TJ53K7ECBILSVLKZY3RFOLXMWWHB5TKT",
  D1_VIDEO_AUTO_NAMESPACE: "3c6f6494-1712-4a1c-ab8e-560a1b8b072e",
  D1_VIDEO_AUTO_FIRST_LEDGER: "5824020",
};
function fixture(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    SUPABASE_URL: replacement.url, SUPABASE_SERVICE_ROLE_KEY: "offline-capability",
    D1_VIDEO_AUTO_ENABLED: "true", D1_VIDEO_AUTO_POOL_PUBLIC_KEY: replacement.pool,
    D1_VIDEO_AUTO_NAMESPACE: replacement.namespace, D1_VIDEO_AUTO_FIRST_LEDGER: "5859490",
    D1_VIDEO_AUTO_OPERATING_OPERATION_ID: "25174263610757121",
    D1_VIDEO_AUTO_OPERATING_FUNDER: "GBHBD3C3IJIJXDQYDJBIE3AG34776MORVPXXZV4AMZKPXIJKUSI6UCQT",
    D1_POOL_PUBLIC_KEY: "GBJU5J6F2L6XXPTYADYS6NIPAP6RAJBN7SAXJDAOWIFSPEWFSCASEIXN",
    D1_NAMESPACE: "5a08ccd6-b4ba-4b31-adc9-fe3e57a6bda7", D1_FIRST_LEDGER: "5676563",
    ...overrides,
  };
  const effects = { clients: 0, rpc: 0, network: 0 };
  const reads: string[] = [];
  const dependencies = {
    getEnv(name: string) { reads.push(name); return values[name]; },
    clientFactory(url: string, key: string) {
      effects.clients++; assert.equal(url, replacement.url); assert.equal(key, "offline-capability");
      return { rpc: () => { effects.rpc++; throw Error("unexpected RPC"); } };
    },
    fetcher: (() => { effects.network++; throw Error("unexpected network"); }) as typeof fetch,
    now: () => 1795327200,
  };
  return { dependencies, effects, reads };
}
async function expectConfig(host: ReturnType<typeof createVideoAutoRuntime>, pool: string) {
  const response = await host(new Request("https://offline.invalid/functions/v1/d1-custody/config"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { network: "TESTNET", pool_public_key: pool, donation_ttl_seconds: 300 });
}
function assertNoPrivateReads(reads: string[]) {
  assert(!reads.some(name => name.endsWith("SECRET_SEED") || name.endsWith("SECRET_KEY")));
}
Deno.test("replacement binding: exact registered tuple serves B without changing manual A", async () => {
  assert.deepEqual(VIDEO_AUTO_SCOPE, replacement);
  assert(Object.isFrozen(VIDEO_AUTO_SCOPE));
  assert.deepEqual(DEPLOYED_SCOPE, {
    pool: "GBJU5J6F2L6XXPTYADYS6NIPAP6RAJBN7SAXJDAOWIFSPEWFSCASEIXN",
    namespace: "5a08ccd6-b4ba-4b31-adc9-fe3e57a6bda7", firstLedger: 5676563,
    creationOperationId: "24380652438728705",
    funder: "GABY7MJYU3ORNMO2THEUSO3R5H2R5FUC7VT5QHTSLGP3PAT3C4QBPEE4", url: replacement.url,
  });
  const f = fixture();
  await expectConfig(createVideoAutoRuntime(f.dependencies), replacement.pool);
  await expectConfig(createDeploymentRuntime(f.dependencies), DEPLOYED_SCOPE.pool);
  assert.deepEqual(f.effects, { clients: 2, rpc: 0, network: 0 });
  assertNoPrivateReads(f.reads);
});
Deno.test("replacement binding: old and mixed tuples fail before effects without disabling A", async () => {
  const overrides = [oldB, ...Object.entries(oldB).map(([key, value]) => ({ [key]: value })),
    { D1_VIDEO_AUTO_OPERATING_OPERATION_ID: replacement.creationOperationId },
    { D1_VIDEO_AUTO_OPERATING_OPERATION_ID: "25145199567056897" }];
  for (const override of overrides) {
    const f = fixture(override);
    assert.throws(() => createVideoAutoRuntime(f.dependencies), {
      name: "Error", message: "Custody configuration unavailable",
    });
    assert.deepEqual(f.effects, { clients: 0, rpc: 0, network: 0 });
    assertNoPrivateReads(f.reads);
    await expectConfig(createDeploymentRuntime(f.dependencies), DEPLOYED_SCOPE.pool);
    assert.deepEqual(f.effects, { clients: 1, rpc: 0, network: 0 });
  }
});
Deno.test("replacement binding: disabled B remains unavailable with no configuration fallback", () => {
  for (const enabled of [undefined, "false"]) {
    const f = fixture({ D1_VIDEO_AUTO_ENABLED: enabled });
    assert.throws(() => createVideoAutoRuntime(f.dependencies), {
      name: "Error", message: "Custody configuration unavailable",
    });
    assert.deepEqual(f.reads, ["D1_VIDEO_AUTO_ENABLED"]);
    assert.deepEqual(f.effects, { clients: 0, rpc: 0, network: 0 });
  }
});
