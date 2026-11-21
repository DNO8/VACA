import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runTick } from '../src/runner.mjs';
import worker, { RefundTrigger } from '../src/worker.mjs';

const url = 'https://tgqxxnldwiqisopiclmk.supabase.co/functions/v1/d1-custody/video-auto/internal-refund-tick';
const env = { ENABLED: 'true', TARGET_URL: url, SCOPE_ID: 'video-auto', MAX_BATCH: '1',
  GATEWAY_JWT: 'synthetic.header.signature', REFUND_TOKEN: 'A'.repeat(43) };
const a = '00000000-0000-0000-0000-000000000001';
const b = '00000000-0000-0000-0000-000000000002';
const result = (processed = 1, held = 0, nextAfterRequestId = null) => ({ processed, held, nextAfterRequestId });
const reply = value => Response.json(value);
// Fake Cloudflare storage boundary: serialized transactions with rollback, explicit durability acknowledgement.
function storage() {
  let value, tail = Promise.resolve();
  const s = { writes: 0, syncs: 0, failAt: 0, failSync: false,
    snapshot: () => structuredClone(value),
    transaction(fn) {
      const op = tail.then(async () => {
        let staged = structuredClone(value), writes = 0;
        const ret = await fn({ get: async () => structuredClone(staged), put: async (_key, next) => {
          if (s.failAt === s.writes + writes + 1) throw Error('synthetic persistence failure');
          staged = structuredClone(next); writes++;
        } });
        value = staged; s.writes += writes; return ret;
      });
      tail = op.catch(() => {}); return op;
    },
    async sync() { s.syncs++; if (s.failSync) throw Error('synthetic sync failure'); },
  }; return s;
}
function setup(fetcher = async () => reply(result())) {
  const store = storage(), calls = [];
  const fetch = async (target, init) => { calls.push({ target, init }); return fetcher(target, init); };
  return { store, calls, tick: (slot = 60000, config = env, timeoutMs = 100) => runTick(store, config, slot, { fetch, timeoutMs }) };
}

test('disabled configuration is inert, including public HTTP and scheduled entry', async () => {
  const h = setup(), poison = new Proxy({}, { get() { throw Error('must not read bindings'); } });
  assert.deepEqual(await h.tick(60000, { ENABLED: 'false' }), { status: 'disabled' });
  assert.equal((await worker.fetch(new Request('https://example.test/'), poison)).status, 404);
  await worker.scheduled({ scheduledTime: 60000, cron: '* * * * *' }, { ENABLED: 'false' });
  assert.equal(h.calls.length, 0); assert.equal(h.store.writes, 0);
});
test('scheduled handler awaits fixed singleton and sends only a scheduled slot', async () => {
  let called = 0;
  const config = { ...env, REFUND_TRIGGER: { idFromName(name) { assert.equal(name, 'refund-trigger-v1'); return 7; }, get(id) {
    assert.equal(id, 7); return { async fetch(req) { called++; assert.equal(req.method, 'POST');
      assert.equal(await req.text(), '{"slot":60000}'); return reply({ status: 'completed' }); } };
  } } };
  await worker.scheduled({ scheduledTime: 60001, cron: '* * * * *' }, config);
  assert.equal(called, 1);
  await worker.scheduled({ scheduledTime: NaN, cron: '* * * * *' }, config);
  assert.equal(called, 1);
});
test('one exact B financial HTTP request follows durable intent acknowledgement', async () => {
  const h = setup(async () => { assert.equal(h.store.snapshot().phase, 'in_flight'); assert.equal(h.store.syncs, 1); return reply(result()); });
  assert.deepEqual(await h.tick(), { status: 'completed' });
  assert.equal(h.calls.length, 1);
  const { target, init } = h.calls[0]; assert.equal(target, url); assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error'); assert.equal(init.body, '{"afterRequestId":null}');
  assert.deepEqual(init.headers, { 'content-type': 'application/json', authorization: `Bearer ${env.GATEWAY_JWT}`, 'x-d1-refund-token': env.REFUND_TOKEN });
  assert.equal(h.store.snapshot().phase, 'idle'); assert.equal(h.store.writes, 2);
  assert.ok(!JSON.stringify(h.store.snapshot()).includes(env.GATEWAY_JWT));
  assert.ok(!JSON.stringify(h.store.snapshot()).includes(env.REFUND_TOKEN));
});
test('original A destination is rejected before storage or transport effects', async () => {
  const original = 'https://tgqxxnldwiqisopiclmk.supabase.co/functions/v1/d1-custody/internal-refund-tick';
  for (const admitted of [false, true]) {
    const h = setup();
    if (admitted) assert.deepEqual(await h.tick(), { status: 'completed' });
    const before = h.store.snapshot(), writes = h.store.writes, syncs = h.store.syncs, calls = h.calls.length;
    assert.deepEqual(await h.tick(120000, { ...env, TARGET_URL: original }), { status: 'unavailable' });
    assert.deepEqual(h.store.snapshot(), before);
    assert.equal(h.store.writes, writes); assert.equal(h.store.syncs, syncs); assert.equal(h.calls.length, calls);
  }
});
test('invalid destination, configuration and event cannot write or send', async () => {
  for (const patch of [{ TARGET_URL: url + '?' }, { TARGET_URL: url.replace('https:', 'http:') },
    { TARGET_URL: 'https://attacker.test/' }, { SCOPE_ID: '' }, { MAX_BATCH: '51' },
    { GATEWAY_JWT: 'bad\r\nheader' }, { REFUND_TOKEN: 'B'.repeat(43) }]) {
    const h = setup(); assert.equal((await h.tick(60000, { ...env, ...patch })).status, 'unavailable');
    assert.equal(h.calls.length, 0); assert.equal(h.store.writes, 0);
  }
  const h = setup(); assert.equal((await h.tick(-1)).status, 'unavailable'); assert.equal(h.calls.length, 0);
});
test('failed transaction or durability acknowledgement never sends', async () => {
  for (const fault of ['write', 'sync']) { const h = setup(); if (fault === 'write') h.store.failAt = 1; else h.store.failSync = true;
    assert.equal((await h.tick()).status, 'unavailable'); assert.equal(h.calls.length, 0);
    if (fault === 'sync') { h.store.failSync = false; assert.equal((await h.tick(120000)).status, 'blocked'); }
  }
});
test('overlap and restart cannot resend admitted intent; duplicate and stale slots remain inert', async () => {
  let release, started; const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const h = setup(async () => { started(); await gate; return reply(result()); });
  const first = h.tick();
  assert.equal(await Promise.race([entered.then(() => true), first.then(() => false)]), true, 'creator must start transport');
  assert.equal((await h.tick(120000)).status, 'blocked');
  assert.equal((await runTick(h.store, env, 180000, { fetch: async () => assert.fail('restart resend') })).status, 'blocked');
  release(); assert.equal((await first).status, 'completed');
  const before = h.store.snapshot();
  for (const slot of [60000, 0]) assert.equal((await h.tick(slot)).status, 'duplicate');
  assert.deepEqual(h.store.snapshot(), before); assert.equal(h.calls.length, 1);
});
test('cursor advances including empty scanned windows, terminal page starts next sweep', async () => {
  const replies = [result(0, 0, a), result(1, 0, b), result(), result()];
  const h = setup(async () => reply(replies.shift()));
  for (let i = 1; i <= 4; i++) assert.equal((await h.tick(i * 60000)).status, 'completed');
  assert.deepEqual(h.calls.map(x => JSON.parse(x.init.body).afterRequestId), [null, a, b, null]);
});
test('held, HTTP failures, malformed and oversized responses permanently stop later events', async () => {
  const replies = [() => reply(result(1, 1)), () => new Response('private diagnostic', { status: 503 }),
    () => new Response(null, { status: 302 }), () => reply({ ...result(), unexpected: 1 }),
    () => reply(result(2)), () => reply(result(0, 1)), () => reply(result(1, 0, 'bad')),
    () => new Response('{"processed":0,"processed":1,"held":0,"nextAfterRequestId":null}'),
    () => new Response(' '.repeat(1025)), () => new Response(new Uint8Array([255]))];
  for (const make of replies) {
    const h = setup(async () => make()); assert.equal((await h.tick()).status, 'paused');
    const before = h.store.snapshot(); assert.equal((await h.tick(120000)).status, 'blocked');
    assert.deepEqual(h.store.snapshot(), before); assert.equal(h.calls.length, 1);
    assert.ok(!JSON.stringify(before).includes('private diagnostic'));
  }
});
test('cursor regression pauses rather than repeating the page', async () => {
  let n = 0; const h = setup(async () => reply(result(0, 0, n++ === 0 ? b : a)));
  await h.tick(); assert.equal((await h.tick(120000)).status, 'paused');
  assert.equal((await h.tick(180000)).status, 'blocked'); assert.equal(h.calls.length, 2);
});
test('transport failure and unresponsive fetch/body timeout abort without retry', async () => {
  for (const mode of ['throw', 'fetch', 'body']) {
    const h = setup(async () => { if (mode === 'throw') throw Error(env.REFUND_TOKEN);
      if (mode === 'fetch') return new Promise(() => {});
      return new Response(new ReadableStream({ start() {} })); });
    assert.equal((await h.tick(60000, env, 10)).status, 'paused');
    assert.equal((await h.tick(120000)).status, 'blocked'); assert.equal(h.calls.length, 1);
    assert.ok(!JSON.stringify(h.store.snapshot()).includes(env.REFUND_TOKEN));
    if (mode !== 'throw') assert.equal(h.calls[0].init.signal.aborted, true);
  }
});
test('failed outcome commit retains durable intent; changed scope never resets ownership', async () => {
  const h = setup(); h.store.failAt = 2;
  assert.equal((await h.tick()).status, 'unavailable'); assert.equal(h.store.snapshot().phase, 'in_flight');
  h.store.failAt = 0; assert.equal((await h.tick(120000)).status, 'blocked'); assert.equal(h.calls.length, 1);
  const clean = setup(); await clean.tick(); const before = clean.store.snapshot();
  assert.equal((await clean.tick(120000, { ...env, SCOPE_ID: 'different' })).status, 'blocked');
  assert.deepEqual(clean.store.snapshot(), before); assert.equal(clean.calls.length, 1);
});
test('Durable Object rejects noninternal inputs without storage or transport effects', async () => {
  const object = new RefundTrigger({ storage: new Proxy({}, { get() { assert.fail('storage accessed'); } }) }, env);
  for (const req of [new Request('https://refund-trigger.internal/reset'),
    new Request('https://refund-trigger.internal/scheduled', { method: 'POST', body: '{"slot":60000,"reset":true}' }),
    new Request('https://refund-trigger.internal/scheduled', { method: 'POST', body: 'x'.repeat(1025) })]) {
    assert.equal((await object.fetch(req)).status, 404);
  }
});
test('scheduled entry reaches actual Durable Object handler and deduplicates without network', async () => {
  const savedFetch = globalThis.fetch, savedLog = console.log, logs = [], store = storage(); let sends = 0;
  globalThis.fetch = async (target, init) => { sends++; assert.equal(target, url);
    assert.equal(init.body, '{"afterRequestId":null}'); return reply(result()); };
  console.log = line => logs.push(line);
  try {
    const object = new RefundTrigger({ storage: store }, env);
    const config = { ...env, REFUND_TRIGGER: { idFromName: () => 'fixed', get: () => object } };
    const event = { scheduledTime: 60000, cron: '* * * * *' };
    await worker.scheduled(event, config); await worker.scheduled(event, config);
    assert.equal(sends, 1); assert.equal(store.writes, 2);
    assert.deepEqual(logs, ['{"event":"refund_trigger","status":"completed"}', '{"event":"refund_trigger","status":"duplicate"}']);
  } finally { globalThis.fetch = savedFetch; console.log = savedLog; }
});

test('deployment configuration targets B, is inert and contains no runtime credential values', async () => {
  const cfg = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(cfg.vars.TARGET_URL, url); assert.equal(cfg.vars.SCOPE_ID, 'video-auto');
  assert.equal(cfg.workers_dev, false); assert.equal(cfg.preview_urls, false);
  assert.deepEqual(cfg.triggers.crons, []); assert.equal(cfg.vars.ENABLED, 'false');
  assert.equal(cfg.routes, undefined); assert.equal(cfg.vars.GATEWAY_JWT, undefined); assert.equal(cfg.vars.REFUND_TOKEN, undefined);
  assert.equal(cfg.durable_objects.bindings[0].class_name, 'RefundTrigger');
  const h = setup(), before = h.store.snapshot();
  assert.deepEqual(await h.tick(60000, { ...env, ...cfg.vars }), { status: 'disabled' });
  assert.deepEqual(h.store.snapshot(), before);
  assert.equal(h.store.writes, 0); assert.equal(h.store.syncs, 0); assert.equal(h.calls.length, 0);
});
