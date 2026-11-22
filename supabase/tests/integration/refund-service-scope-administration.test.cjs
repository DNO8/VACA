'use strict';
// Disposable SQL behavior only: not host authentication or deployment proof.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const repo = path.resolve(__dirname, '../../..');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const admin = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const actor = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const other = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV';
const ns = '00000000-0000-4000-8000-000000000001', ns2 = '00000000-0000-4000-8000-000000000002';
const absent = '00000000-0000-4000-8000-000000000003';
const quote = v => v == null ? 'null' : "'" + v.replaceAll("'", "''") + "'";
const call = (op, a = actor, n = ns, p = admin) =>
  `select public.d1_${op}_refund_service_scope(${quote(a)},${quote(n)},${quote(p)});`;
const admit = `select fixture.admit('${actor}','${ns}','${admin}');`;

test('060 operator-only service-scope administration', async t => {
  assert.equal(process.platform, 'linux');
  assert.deepEqual(env, {}); assert.deepEqual(connectionArgs, []);
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const fixture = fs.mkdtempSync(path.join(temp, 'fixture-')), data = path.join(fixture, 'data');
  const args = ['-X', '--no-password', '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
  const children = new Set(); let pid;
  const run = argv => {
    const r = spawnSync(process.execPath, [launcher, ...argv], { env, encoding: 'utf8', timeout: 15000 });
    assert.ifError(r.error); return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const ok = argv => { const r = run(argv); assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); return r.stdout; };
  const sql = q => ok(['psql', ...args, '--set', 'VERBOSITY=terse', '-c', q]).trim();
  const apply = (name, q) => {
    const file = path.join(fixture, name); fs.writeFileSync(file, q);
    ok(['psql', ...args, '--set', 'VERBOSITY=terse', '-q', '-f', file]);
  };
  const scopes = () => sql(`select coalesce(jsonb_agg(to_jsonb(s) order by actor,namespace,pool),'[]') from public.d1_refund_service_scopes s;`);
  const state = () => sql(`select jsonb_build_array(${['admin_wallets', 'd1_pools', 'd1_preparations', 'release_requests'].map(table =>
    `(select coalesce(jsonb_agg(to_jsonb(s) order by to_jsonb(s)::text),'[]') from public.${table} s)`).join(',')});`);
  const reject = (q, message, code = '22023', role = null) => {
    const before = scopes(), original = state(), prefix = role ? `set role ${role}; ` : '';
    for (const [verbosity, error] of [['terse', message], ['sqlstate', code]]) {
      const result = run(['psql', ...args, '--set', `VERBOSITY=${verbosity}`, '-c', prefix + q]);
      assert.deepEqual(result, { status: 1, stdout: role ? 'SET\n' : '', stderr: `ERROR:  ${error}\n` });
      console.log(`REJECTION ${JSON.stringify({ role, verbosity, ...result })}`);
      assert.equal(scopes(), before); assert.equal(state(), original);
    }
  };
  const asyncSQL = q => {
    const child = spawn(process.execPath, [launcher, 'psql', ...args, '--set', 'VERBOSITY=terse', '-c', q],
      { env, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child); let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 15000);
    const done = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (status, signal) => { clearTimeout(timer); children.delete(child); resolve({ status, signal, stdout, stderr }); });
    });
    return { done };
  };
  const observe = async q => {
    const deadline = Date.now() + 4000;
    do { if (sql(q) === 't') return; await new Promise(resolve => setImmediate(resolve)); } while (Date.now() < deadline);
    assert.fail('expected PostgreSQL concurrency state not observed within 4s');
  };
  const sleeping = name => observe(`select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event='PgSleep');`);
  const blocked = (waiter, holder) => observe(`select exists(select 1 from pg_stat_activity w join pg_stat_activity h
    on h.pid=any(pg_blocking_pids(w.pid)) where w.application_name='${waiter}' and h.application_name='${holder}');`);
  const receipt = (stdout, result) => { assert.deepEqual(result, { status: 0, signal: null, stdout, stderr: '' }); console.log(`CONCURRENT ${JSON.stringify(result)}`); };
  const cleanup = () => {
    if (fs.existsSync(path.join(data, 'postmaster.pid'))) {
      pid ||= Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
      ok(['pg_ctl', '-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']);
    }
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    fs.rmSync(fixture, { recursive: true, force: true });
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED ${fixture}`);
  };
  const terminate = () => { try { cleanup(); } finally { process.exit(143); } };
  process.once('SIGTERM', terminate);
  try {
    ok(['initdb', '-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok(['pg_ctl', '-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']);
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    apply('seed.sql', `create role anon; create role authenticated; create role service_role bypassrls;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const version of ['014', '20261011060218']) apply(version + '.sql', retained.migrations.find(m => m.version === version).statements.join(';\n'));
    for (const file of ['015_d1_testnet_custody.sql', '049_d1_refund_service_scope.sql']) apply(file, fs.readFileSync(path.join(repo, 'supabase/migrations', file), 'utf8'));
    sql(`set role service_role; select public.d1_activate_pool('${ns}','${admin}',900); select public.d1_activate_pool('${ns2}','${other}',901);`);
    // Unrelated A membership is pre-existing, not provisioned by the new API.
    sql(`insert into public.d1_refund_service_scopes values ('${other}','${ns2}','${other}');`);
    const original = state(), unrelated = scopes();
    const migration = path.join(repo, 'supabase/migrations/060_d1_refund_service_scope_administration.sql');
    if (fs.existsSync(migration)) apply('060.sql', fs.readFileSync(migration, 'utf8'));
    apply('wrapper.sql', `create schema fixture; grant usage on schema fixture to service_role;
      create function fixture.admit(a text,n uuid,p text) returns text language plpgsql security definer set search_path='' as $$
      begin perform public.d1_assert_refund_service_scope_private(a,n,p); return 'admitted'; end; $$;
      revoke all on function fixture.admit(text,uuid,text) from public,anon,authenticated,service_role;
      grant execute on function fixture.admit(text,uuid,text) to service_role;`);
    // This public-interface assertion is also the intentional pre-implementation RED.
    assert.equal(sql(call('enroll')), 'enrolled');
    await t.test('exact enrollment/replay/revocation preserves A, admins and lifecycle state', () => {
      const enrolled = scopes(); assert.equal(sql(call('enroll')), 'enrolled'); assert.equal(scopes(), enrolled);
      assert.equal(sql(`set role service_role; ${admit}`), 'SET\nadmitted');
      assert.equal(sql(call('revoke')), 'revoked'); assert.equal(sql(call('revoke')), 'revoked');
      assert.equal(scopes(), unrelated); assert.equal(state(), original);
      reject(admit, 'unauthorized_admin_wallet', '42501', 'service_role');
    });
    await t.test('invalid arguments and missing/mismatched binding reject atomically', () => {
      for (const op of ['enroll', 'revoke']) for (const values of [[null,ns,admin], ['*',ns,admin], ['invalid',ns,admin], [actor,null,admin], [actor,ns,null], [actor,ns,'invalid']])
        reject(call(op, ...values), 'invalid_refund_service_scope');
      for (const values of [[actor,absent,admin], [actor,ns,other], [actor,ns2,admin]])
        reject(call('enroll', ...values), 'invalid_refund_service_scope');
      // A pre-existing stale binding must survive failed enrollment but be revocable.
      sql(`insert into public.d1_refund_service_scopes values ('${actor}','${ns2}','${admin}');`);
      reject(call('enroll', actor, ns2, admin), 'invalid_refund_service_scope');
      assert.equal(sql(call('revoke', actor, ns2, admin)), 'revoked'); assert.equal(scopes(), unrelated);
    });
    await t.test('application roles cannot administer, access registry or invoke private admission', () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const op of ['enroll', 'revoke']) reject(call(op), `permission denied for function d1_${op}_refund_service_scope`, '42501', role);
        reject(`insert into public.d1_refund_service_scopes values ('${actor}','${ns}','${admin}');`, 'permission denied for table d1_refund_service_scopes', '42501', role);
        reject(`select public.d1_assert_refund_service_scope_private('${actor}','${ns}','${admin}');`, 'permission denied for function d1_assert_refund_service_scope_private', '42501', role);
      }
      for (const op of ['enroll', 'revoke']) assert.equal(sql(`select not prosecdef and proconfig=array['search_path=""']
        and not exists(select 1 from aclexplode(proacl) a where a.grantee=0) from pg_proc
        where oid='public.d1_${op}_refund_service_scope(text,uuid,text)'::regprocedure;`), 't');
    });
    await t.test('PUBLIC-only outsider cannot administer either interface', () => {
      sql('create role scope_admin_outsider;');
      for (const op of ['enroll', 'revoke']) {
        reject(call(op), `permission denied for function d1_${op}_refund_service_scope`, '42501', 'scope_admin_outsider');
      }
    });
    await t.test('checksum-invalid actor rejects both operations atomically', () => {
      const corruptActor = actor.slice(0, -1) + 'A';
      assert.notEqual(corruptActor, actor);
      for (const op of ['enroll', 'revoke']) reject(call(op, corruptActor), 'invalid_refund_service_scope');
    });
    await t.test('admitted transaction delays administrative revocation; next admission denied', async () => {
      assert.equal(sql(call('enroll')), 'enrolled');
      const admitted = asyncSQL(`set application_name='admin_admitted'; begin; set role service_role; ${admit} select pg_sleep(5); commit;`);
      await sleeping('admin_admitted');
      const revoker = asyncSQL(`set application_name='admin_revoker'; ${call('revoke')}`);
      await blocked('admin_revoker', 'admin_admitted');
      receipt('SET\nBEGIN\nSET\nadmitted\n\nCOMMIT\n', await admitted.done);
      receipt('SET\nrevoked\n', await revoker.done);
      reject(admit, 'unauthorized_admin_wallet', '42501', 'service_role'); assert.equal(scopes(), unrelated);
    });
    await t.test('enrollment rechecks a binding changed while it waits', async () => {
      const updater = asyncSQL(`set application_name='admin_rebinding'; begin;
        update public.d1_pools set pool='${actor}' where namespace='${ns}'; select pg_sleep(5); commit;`);
      await sleeping('admin_rebinding');
      const enrolling = asyncSQL(`set application_name='admin_binding_wait'; ${call('enroll')}`);
      await blocked('admin_binding_wait', 'admin_rebinding');
      receipt('SET\nBEGIN\nUPDATE 1\n\nCOMMIT\n', await updater.done);
      const rejected = await enrolling.done;
      assert.deepEqual(rejected, { status: 1, signal: null, stdout: 'SET\n', stderr: 'ERROR:  invalid_refund_service_scope\n' });
      console.log(`CONCURRENT ${JSON.stringify(rejected)}`);
      assert.equal(scopes(), unrelated);
      sql(`update public.d1_pools set pool='${admin}' where namespace='${ns}';`);
      assert.equal(state(), original);
    });
    await t.test('same-triple administration serializes before pool lock', async () => {
      const holder = asyncSQL(`set application_name='admin_holder'; begin; ${call('revoke')} select pg_sleep(5); commit;`);
      await sleeping('admin_holder');
      const enrolling = asyncSQL(`set application_name='admin_enrolling'; ${call('enroll')}`);
      await blocked('admin_enrolling', 'admin_holder');
      assert.equal(sql(`select exists(select 1 from pg_stat_activity where application_name='admin_enrolling' and wait_event='advisory');`), 't');
      // It cannot own a pool lock while waiting: another owner can update it now.
      assert.equal(sql(`begin; set local lock_timeout='1s'; update public.d1_pools set first_ledger=first_ledger where namespace='${ns}'; commit;`), 'BEGIN\nSET\nUPDATE 1\nCOMMIT');
      receipt('SET\nBEGIN\nrevoked\n\nCOMMIT\n', await holder.done); receipt('SET\nenrolled\n', await enrolling.done);
      assert.equal(sql(call('revoke')), 'revoked'); assert.equal(scopes(), unrelated); assert.equal(state(), original);
    });
  } finally {
    for (const child of children) child.kill('SIGTERM');
    cleanup(); process.removeListener('SIGTERM', terminate);
  }
});
