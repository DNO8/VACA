'use strict';
// Real disposable PostgreSQL; net/cron/Vault below are interface doubles only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { resolveFixtureRuntime } = require('../integration/fixture-runtime.cjs');
const migration = path.resolve(__dirname, '../../migrations/059_d1_refund_scheduler.sql');
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";

async function isolated(t) {
  const { launcher, temp, env } = resolveFixtureRuntime();
  assert.deepEqual(env, {});
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = String(server.address().port);
  await new Promise(resolve => server.close(resolve));
  const root = fs.mkdtempSync(path.join(temp, 'd1-scheduler-'));
  const data = path.join(root, 'data');
  const args = ['-X', '--no-password', '-p', port, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-q', '--set', 'VERBOSITY=terse'];
  const run = (tool, argv) => {
    const r = spawnSync(process.execPath, [launcher, tool, ...argv], { env, encoding: 'utf8', timeout: 15000 });
    assert.ifError(r.error);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const ok = r => { assert.equal(r.status, 0, JSON.stringify(r)); assert.equal(r.stderr, ''); return r.stdout.trim(); };
  const raw = q => run('psql', [...args, '-c', q]);
  const sql = q => ok(raw(q));
  const apply = text => {
    const file = path.join(root, 'input.sql');
    fs.writeFileSync(file, text);
    return ok(run('psql', [...args, '-f', file]));
  };
  t.after(() => {
    if (fs.existsSync(path.join(data, 'postmaster.pid'))) {
      const pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
      ok(run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']));
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  ok(run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']));
  ok(run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']));
  apply(`
    create role anon; create role authenticated; create role service_role;
    create schema net; create schema vault; create schema cron;
    create table net.http_request_queue(id bigserial primary key, url text, body jsonb, headers jsonb, timeout_milliseconds int);
    create table net._http_response(id bigint, status_code int, content text, timed_out boolean, error_msg text);
    create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
    insert into vault.decrypted_secrets values ('d1_refund_gateway_jwt','aaa.bbb.ccc'),('d1_refund_tick_token',repeat('A',43));
    create table cron.job(jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
    create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values(job_name,schedule,command) returning jobid $$;
    create function cron.alter_job(job_id bigint, schedule text default null, command text default null,
      database text default null, username text default null, active boolean default null) returns void language sql as $$
      update cron.job set active=alter_job.active where jobid=job_id $$;
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds int default 2000) returns bigint language sql as $$
      insert into net.http_request_queue(url,body,headers,timeout_milliseconds)
      values(url,body,headers,timeout_milliseconds) returning id $$;
  `);
  // Before implementation, public-interface calls below fail (RED), not fixture setup.
  if (fs.existsSync(migration)) apply(fs.readFileSync(migration, 'utf8'));
  const asyncSQL = q => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcher, 'psql', ...args, '-c', q], { env });
    let stdout = '', stderr = '';
    child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
  return { sql, raw, apply, asyncSQL, ok, quote };
}
module.exports = { isolated, quote };
