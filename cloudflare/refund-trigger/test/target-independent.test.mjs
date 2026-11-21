import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runTick } from '../src/runner.mjs';
const B = 'https://tgqxxnldwiqisopiclmk.supabase.co/functions/v1/d1-custody/video-auto/internal-refund-tick';
const A = B.replace('/video-auto', '');
const env = { ENABLED: 'true', TARGET_URL: B, SCOPE_ID: 'video-auto', MAX_BATCH: '1', GATEWAY_JWT: 'fake.header.signature', REFUND_TOKEN: 'A'.repeat(43) };
function harness(seed = null) {
  let data = structuredClone(seed);
  const effects = { transaction: 0, get: 0, put: 0, sync: 0, send: 0 };
  const digest = () => createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const storage = {
    async transaction(fn) { effects.transaction++; return fn({
      async get() { effects.get++; return structuredClone(data) ?? undefined; },
      async put(k, v) { effects.put++; data = structuredClone(v); }
    }); },
    async sync() { effects.sync++; }
  };
  const fetch = async target => { effects.send++; assert.equal(target, B);
    return Response.json({ processed: 0, held: 0, nextAfterRequestId: null }); };
  return { effects, digest, tick: config => runTick(storage, config, 60000, { fetch }) };
}
test('S2/S3 exact B destination accepted', async () => {
  const h = harness();
  assert.deepEqual(await h.tick(env), { status: 'completed' });
  assert.equal(h.effects.send, 1);
});
test('S2/S3 A and nonexact targets reject without any effect or byte change', async () => {
  const urls = [A, '', B + '/', B + '?', B + '?x=1', B + '#x', B.replace('https:', 'http:'),
    B.replace('https://', 'https://fake@'), B.replace('supabase.co', 'supabase.co.evil.test'),
    B.replace('video-auto', 'VIDEO-AUTO'), 'https://example.test/'];
  for (const seed of [null, { v: 1, phase: 'idle', scope: 'existing-A-record', slot: 0, cursor: null }]) {
    for (const TARGET_URL of urls) {
      const h = harness(seed), before = h.digest();
      assert.deepEqual(await h.tick({ ...env, TARGET_URL }), { status: 'unavailable' }, TARGET_URL);
      assert.equal(h.digest(), before);
      assert.deepEqual(h.effects, { transaction: 0, get: 0, put: 0, sync: 0, send: 0 });
    }
  }
});
test('S1/S2/S3 shipped B config stays disabled and unexposed', async () => {
  const c = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(c.vars.TARGET_URL, B);
  assert.equal(c.vars.ENABLED, 'false'); assert.equal(c.workers_dev, false); assert.equal(c.preview_urls, false);
  assert.deepEqual(c.triggers.crons, []); assert.equal(c.routes, undefined);
  assert.equal(c.vars.GATEWAY_JWT, undefined); assert.equal(c.vars.REFUND_TOKEN, undefined);
  const h = harness(), before = h.digest();
  assert.deepEqual(await h.tick({ ...env, ...c.vars }), { status: 'disabled' });
  assert.equal(h.digest(), before);
  assert.deepEqual(h.effects, { transaction: 0, get: 0, put: 0, sync: 0, send: 0 });
});
