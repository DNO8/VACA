'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { isolated, quote } = require('../fixtures/refund-scheduler.cjs');
const tick = 'select d1_scheduler.tick();';
const status = 'select d1_scheduler.status();';
const enable = 'select d1_scheduler.set_enabled(true);';
const cursor = '00000000-0000-4000-8000-000000000002';
const body = next => JSON.stringify({ processed: 0, held: 0, nextAfterRequestId: next });
const response = text => `insert into net._http_response values
  ((select max(id) from net.http_request_queue),200,${quote(text)},false,null);`;
const digest = db => createHash('sha256').update(db.sql(`${status}
  select coalesce(json_agg(q)::text,'[]') from net.http_request_queue q;`)).digest('hex');

test('S1/S2 owner boundary, null rejection and column ACL fail closed', async t => {
  const db = await isolated(t);
  assert.equal(db.sql("select schedule||'|'||active from cron.job;"), '* * * * *|false');
  assert.equal(db.sql(tick), 'disabled');
  db.sql('create role outsider;');
  for (const role of ['outsider', 'anon', 'authenticated', 'service_role']) {
    for (const query of [tick, status, enable, 'select * from d1_scheduler.state;']) {
      const before = digest(db), statement = `set role ${role}; ${query}`;
      assert.deepEqual(db.raw(statement), { status: 1, stdout: '', stderr:
        `ERROR:  permission denied for schema d1_scheduler at character ${statement.indexOf('d1_scheduler') + 1}\n` });
      assert.equal(digest(db), before);
    }
  }
  const before = digest(db);
  assert.deepEqual(db.raw('select d1_scheduler.set_enabled(null);'), {
    status: 1, stdout: '', stderr: 'ERROR:  invalid_scheduler_configuration\n' });
  assert.equal(digest(db), before);
  db.sql('grant select(headers) on net.http_request_queue to outsider;');
  assert.equal(db.sql(enable), 'enabled');
  assert.equal(db.sql(tick), 'paused');
  assert.deepEqual(JSON.parse(db.sql(status)), { enabled: true, afterRequestId: null,
    pendingRequestId: null, pauseReason: 'configuration_error' });
  assert.equal(db.sql('select count(*) from net.http_request_queue;'), '0');
});

test('S1 nonprogress, duplicate and boundary responses retain pending evidence', async t => {
  const db = await isolated(t);
  const cases = [
    ['invalid_response', body(cursor)],
    ['invalid_response', body('00000000-0000-4000-8000-000000000001')],
    ['invalid_response', '{"processed":0,"held":0,"nextAfterRequestId":null,"held":0}'],
    ['invalid_response', '{"processed":0,"held":0}'],
    ['invalid_response', '{"processed":0,"held":-1,"nextAfterRequestId":null}'],
    ['held', '{"processed":50,"held":50,"nextAfterRequestId":null}'],
    ['response_unavailable', null],
  ];
  for (const [reason, text] of cases) {
    // A complete transaction must stay inside this single psql invocation.
    const insert = text === null ? response(body(null)).repeat(2) : response(text);
    const out = db.sql(`begin; ${enable} ${tick} ${response(body(cursor))} ${tick}
      ${tick} ${status} ${insert} ${tick} ${status} ${tick}
      select count(*) from net.http_request_queue; rollback;`).split('\n');
    assert.deepEqual(out.slice(0, 4), ['enabled', 'dispatched', 'advanced', 'dispatched']);
    const before = JSON.parse(out[4]);
    assert.equal(before.afterRequestId, cursor);
    assert.equal(out[5], 'paused');
    assert.deepEqual(JSON.parse(out[6]), { ...before, pauseReason: reason });
    assert.equal(out[7], 'paused');
    assert.equal(out[8], '2');
    assert.equal(JSON.parse(db.sql(status)).enabled, false);
    assert.equal(db.sql('select count(*) from net.http_request_queue;'), '0');
  }
});

test('S1 serialized response consumption and logged ownership', async t => {
  const db = await isolated(t);
  assert.equal(db.sql("select relpersistence from pg_class where oid='d1_scheduler.state'::regclass;"), 'p');
  db.sql(enable); db.sql(tick); db.sql(response(body(cursor)));
  const results = await Promise.all([db.asyncSQL(tick), db.asyncSQL(tick), db.asyncSQL(tick)]);
  assert.deepEqual(results.map(db.ok).sort(), ['advanced', 'dispatched', 'pending']);
  assert.deepEqual(JSON.parse(db.sql('select body from net.http_request_queue order by id desc limit 1;')),
    { afterRequestId: cursor });
  assert.equal(db.sql('select count(*) from net.http_request_queue;'), '2');
  const before = JSON.parse(db.sql(status));
  db.sql('select d1_scheduler.set_enabled(false);');
  assert.equal(db.sql(tick), 'disabled');
  assert.deepEqual(JSON.parse(db.sql(status)), { ...before, enabled: false });
  const paused = digest(db);
  assert.deepEqual(db.raw(enable), { status: 1, stdout: '',
    stderr: 'ERROR:  scheduler_reconciliation_required\n' });
  assert.equal(digest(db), paused);
});
