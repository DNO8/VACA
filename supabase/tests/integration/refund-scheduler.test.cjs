'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isolated, quote } = require('../fixtures/refund-scheduler.cjs');
const cursor = '00000000-0000-4000-8000-000000000001';
const tick = 'select d1_scheduler.tick();';
const status = 'select d1_scheduler.status();';
const enable = 'select d1_scheduler.set_enabled(true);';
const initial = { enabled: false, afterRequestId: null, pendingRequestId: null, pauseReason: null };
const response = body => `insert into net._http_response(id,status_code,content,timed_out)
  select max(id),200,${quote(body)},false from net.http_request_queue;`;
const valid = next => JSON.stringify({ processed: 0, held: 0, nextAfterRequestId: next });
const lines = text => text.split('\n');

test('migration leaves one owner-only one-minute scheduler disabled and silent', async t => {
  const db = await isolated(t);
  assert.equal(db.sql(tick), 'disabled');
  assert.deepEqual(JSON.parse(db.sql(status)), initial);
  assert.equal(db.sql('select count(*) from net.http_request_queue;'), '0');
  assert.equal(db.sql("select schedule||'|'||active||'|'||command from cron.job;"), '* * * * *|false|select d1_scheduler.tick();');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const before = db.sql(status);
    for (const query of [tick, status, enable]) {
      const statement = `set role ${role}; ${query}`;
      const r = db.raw(statement);
      assert.equal(r.status, 1); assert.equal(r.stdout, '');
      assert.equal(r.stderr, `ERROR:  permission denied for schema d1_scheduler at character ${statement.indexOf('d1_scheduler') + 1}\n`);
    }
    assert.equal(db.sql(status), before);
    assert.equal(db.sql('select count(*) from net.http_request_queue;'), '0');
  }
});

test('exact authenticated dispatch, durable pending exclusion and disable without clearing pending', async t => {
  const db = await isolated(t);
  assert.equal(db.sql(enable), 'enabled');
  assert.equal(db.sql(tick), 'dispatched');
  const before = JSON.parse(db.sql(status));
  assert.equal(before.pendingRequestId, 1);
  assert.equal(db.sql(tick), 'pending');
  assert.deepEqual(JSON.parse(db.sql(status)), before);
  const request = JSON.parse(db.sql('select row_to_json(q) from net.http_request_queue q;'));
  assert.deepEqual(request, { id: 1,
    url: 'https://tgqxxnldwiqisopiclmk.supabase.co/functions/v1/d1-custody/internal-refund-tick',
    body: { afterRequestId: null }, headers: { 'Content-Type': 'application/json',
      Authorization: 'Bearer aaa.bbb.ccc', 'x-d1-refund-token': 'A'.repeat(43) }, timeout_milliseconds: 30000 });
  assert.equal(db.sql('select d1_scheduler.set_enabled(false);'), 'disabled');
  assert.equal(db.sql(tick), 'disabled');
  assert.equal(JSON.parse(db.sql(status)).pendingRequestId, 1);
  const r = db.raw(enable);
  assert.equal(r.status, 1); assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'ERROR:  scheduler_reconciliation_required\n');
  assert.equal(db.sql('select count(*) from net.http_request_queue;'), '1');
});

test('empty nonterminal pages advance and terminal null starts only a later sweep', async t => {
  const db = await isolated(t);
  db.sql(enable); db.sql(tick);
  db.sql(response(valid(cursor)));
  assert.equal(db.sql(tick), 'advanced');
  assert.equal(db.sql('select count(*) from net.http_request_queue;'), '1');
  assert.equal(JSON.parse(db.sql(status)).afterRequestId, cursor);
  assert.equal(db.sql(tick), 'dispatched');
  assert.deepEqual(JSON.parse(db.sql('select body from net.http_request_queue order by id desc limit 1;')), { afterRequestId: cursor });
  db.sql(response(valid(null)));
  assert.equal(db.sql(tick), 'advanced');
  assert.equal(JSON.parse(db.sql(status)).afterRequestId, null);
  assert.equal(db.sql('select count(*) from net.http_request_queue;'), '2');
  assert.equal(db.sql(tick), 'dispatched');
  assert.deepEqual(JSON.parse(db.sql('select body from net.http_request_queue order by id desc limit 1;')), { afterRequestId: null });
});

test('HTTP, transport, held and malformed responses pause with cursor and request evidence unchanged', async t => {
  const db = await isolated(t);
  const cases = [
    ['http_error', "insert into net._http_response values ((select max(id) from net.http_request_queue),503,'{}',false,null);"],
    ['transport_error', "insert into net._http_response values ((select max(id) from net.http_request_queue),200,null,true,null);"],
    ['transport_error', "insert into net._http_response values ((select max(id) from net.http_request_queue),null,null,false,'synthetic error');"],
    ['held', response(JSON.stringify({ processed: 1, held: 1, nextAfterRequestId: cursor }))],
    ...['{}', '[]', 'null', 'not-json', '{"processed":0,"processed":0,"held":0,"nextAfterRequestId":null}',
      '{"processed":"0","held":0,"nextAfterRequestId":null}',
      '{"processed":51,"held":0,"nextAfterRequestId":null}',
      '{"processed":0,"held":1,"nextAfterRequestId":null}',
      '{"processed":-1,"held":0,"nextAfterRequestId":null}',
      '{"processed":0.5,"held":0,"nextAfterRequestId":null}',
      '{"processed":0,"held":0,"nextAfterRequestId":"BAD"}',
      '{"processed":0,"held":0,"nextAfterRequestId":null,"extra":1}'].map(body => ['invalid_response', response(body)]),
  ];
  for (const [reason, insert] of cases) {
    const out = lines(db.sql(`begin; ${enable} ${tick} ${status} ${insert} ${tick} ${status} ${tick}
      select count(*) from net.http_request_queue; rollback;`));
    assert.equal(out[0], 'enabled'); assert.equal(out[1], 'dispatched');
    const before = JSON.parse(out[2]);
    assert.equal(out[3], 'paused');
    assert.deepEqual(JSON.parse(out[4]), { ...before, pauseReason: reason });
    assert.equal(out[5], 'paused'); assert.equal(out[6], '1');
  }
});

test('credential/queue admission fails closed without dispatch or credential disclosure', async t => {
  const db = await isolated(t);
  const scenarios = [
    "grant select on net.http_request_queue to public;",
    "grant select on net.http_request_queue to service_role;",
    "update vault.decrypted_secrets set decrypted_secret='invalid' where name='d1_refund_tick_token';",
    "delete from vault.decrypted_secrets where name='d1_refund_gateway_jwt';",
  ];
  for (const setup of scenarios) {
    const out = lines(db.sql(`begin; ${setup} ${enable} ${tick} ${status}
      select count(*) from net.http_request_queue; rollback;`));
    assert.equal(out[0], 'enabled'); assert.equal(out[1], 'paused');
    assert.deepEqual(JSON.parse(out[2]), { ...initial, enabled: true, pauseReason: 'configuration_error' });
    assert.equal(out[3], '0');
  }
});

test('concurrent callers dispatch once; transaction rollback never queues a request', async t => {
  const db = await isolated(t);
  db.sql(enable);
  const results = await Promise.all(Array.from({ length: 6 }, () => db.asyncSQL(tick)));
  const outputs = results.map(db.ok);
  assert.equal(outputs.filter(x => x === 'dispatched').length, 1);
  assert.equal(outputs.filter(x => x === 'pending').length, 5);
  assert.equal(db.sql('select count(*) from net.http_request_queue;'), '1');
  const before = db.sql(status);
  db.sql(`begin; ${response(valid(cursor))} ${tick} rollback;`);
  assert.equal(db.sql(status), before);
  assert.equal(db.sql('select count(*) from net.http_request_queue;'), '1');
});

test('wrong response IDs stay pending; lost responses pause without automatic resend', async t => {
  const db = await isolated(t);
  db.sql(enable); db.sql(tick);
  const before = JSON.parse(db.sql(status));
  db.sql(`insert into net._http_response values (9999,200,${quote(valid(null))},false,null);`);
  assert.equal(db.sql(tick), 'pending');
  assert.deepEqual(JSON.parse(db.sql(status)), before);
  // Real elapsed time, no internal-state edits, clock injection or financial calls.
  db.ok(await db.asyncSQL('select pg_sleep(91);'));
  assert.equal(db.sql(tick), 'paused');
  assert.deepEqual(JSON.parse(db.sql(status)), { ...before, pauseReason: 'response_missing' });
  assert.equal(db.sql(tick), 'paused');
  assert.equal(db.sql('select count(*) from net.http_request_queue;'), '1');
});
