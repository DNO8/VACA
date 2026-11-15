'use strict';
// Inert registry/private assertion only: the disposable wrapper is NOT host identity proof.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const repo = path.resolve(__dirname, '../../..');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const admin = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const actor = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const other = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV';
const ns = '00000000-0000-4000-8000-000000000001';
const ns2 = '00000000-0000-4000-8000-000000000002';
const absent = '00000000-0000-4000-8000-000000000003';
const quote = v => v == null ? 'null' : "'" + v.replaceAll("'", "''") + "'";
const registry = 'public.d1_refund_service_scopes';
const checker = 'public.d1_assert_refund_service_scope_private';
const signature = `${checker}(text,uuid,text)`;
const call = (a = actor, n = ns, p = admin) => `select fixture.admit(${quote(a)},${quote(n)},${quote(p)});`;

test('049 inert refund service scopes (not production admission)', async t => {
  assert.equal(process.platform, 'linux');
  assert.equal(fs.realpathSync(path.dirname(launcher)), path.join(repo, '.tooling/d1-backend'));
  assert.equal(fs.realpathSync(temp), path.join(repo, '.tooling/d1-backend/tmp'));
  assert.deepEqual(env, {}); assert.deepEqual(connectionArgs, []);
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-service-scope-')), data = path.join(fixture, 'data');
  const args = ['-X', '--no-password', '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
  const children = new Set(); let pid;
  const run = (tool, argv) => {
    const r = spawnSync(process.execPath, [launcher, tool, ...argv], { env, encoding: 'utf8', timeout: 10000 });
    assert.ifError(r.error); return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const ok = (tool, argv) => { const r = run(tool, argv); assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); return r.stdout; };
  const sql = (q, role = null) => ok('psql', [...args, '--set', 'VERBOSITY=terse', '-c',
    (role ? `set role ${role}; ` : '') + q]).replace(/^SET\n/, '').trim();
  const apply = (name, q) => {
    const file = path.join(fixture, name); fs.writeFileSync(file, q);
    ok('psql', [...args, '--set', 'VERBOSITY=terse', '-q', '-f', file]);
  };
  const reject = (q, message = 'unauthorized_admin_wallet', role = 'service_role', code = '42501') => {
    for (const [verbosity, error] of [['terse', message], ['sqlstate', code]]) {
      assert.deepEqual(run('psql', [...args, '--set', `VERBOSITY=${verbosity}`, '-c', `set role ${role}; ${q}`]),
        { status: 1, stdout: 'SET\n', stderr: `ERROR:  ${error}\n` });
    }
  };
  const baseline = () => sql(`select jsonb_build_object('functions',
    (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname<>'d1_assert_refund_service_scope_private'),
    'tables',jsonb_build_array(${['admin_wallets', 'incidents', 'd1_pools', 'd1_preparations',
      'd1_discovery_checkpoints', 'd1_discovery_pages', 'd1_discovery_operations'].map(table =>
        `(select coalesce(jsonb_agg(j order by j::text),'[]') from (select to_jsonb(t) j from public.${table} t) s)`).join(',')}));`);
  const scopeState = () => sql(`select coalesce(jsonb_agg(to_jsonb(s) order by actor,namespace,pool),'[]') from ${registry} s;`);
  const grant = (a = actor, n = ns, p = admin) => sql(`insert into ${registry} values (${quote(a)},${quote(n)},${quote(p)});`);
  const remove = () => sql(`delete from ${registry};`);
  const asyncSQL = q => {
    const child = spawn(process.execPath, [launcher, 'psql', ...args, '--set', 'VERBOSITY=terse', '-c', q],
      { env, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child); let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 12000);
    const done = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (status, signal) => { clearTimeout(timer); children.delete(child); resolve({ status, signal, stdout, stderr }); });
    });
    return { done };
  };
  // Bounded SQL observations synchronize on actual PostgreSQL lock/activity state,
  // not elapsed sleep or a guessed arrival order. pg_sleep below simulates admitted work.
  const observe = async q => {
    const deadline = Date.now() + 4000;
    do { if (sql(q) === 't') return; await new Promise(resolve => setImmediate(resolve)); } while (Date.now() < deadline);
    assert.fail('expected concurrent database state was not observed within 4s');
  };
  const cleanup = () => {
    if (fs.existsSync(path.join(data, 'postmaster.pid'))) {
      pid ||= Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
      ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']);
    }
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    fs.rmSync(fixture, { recursive: true, force: true });
  };
  const terminate = () => { try { cleanup(); } finally { process.exit(143); } };
  process.once('SIGTERM', terminate);
  try {
    ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']);
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    apply('seed.sql', `create role anon; create role authenticated; create role service_role bypassrls;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const version of ['014', '20261011060218']) apply(version + '.sql', retained.migrations.find(m => m.version === version).statements.join(';\n'));
    for (const file of ['015_d1_testnet_custody.sql', '019_d1_discovery.sql']) apply(file, fs.readFileSync(path.join(repo, 'supabase/migrations', file), 'utf8'));
    sql(`select public.d1_activate_pool('${ns}','${admin}',900); select public.d1_activate_pool('${ns2}','${other}',901);`, 'service_role');
    const original = baseline();
    const migration = path.join(repo, 'supabase/migrations/049_d1_refund_service_scope.sql');
    if (fs.existsSync(migration)) apply('049.sql', fs.readFileSync(migration, 'utf8'));
    apply('wrapper.sql', `create schema fixture; grant usage on schema fixture to service_role;
      create function fixture.admit(a text,n uuid,p text) returns text language plpgsql security definer set search_path='' as $$
      begin perform ${checker}(a,n,p); return 'admitted'; end; $$;
      revoke all on function fixture.admit(text,uuid,text) from public,anon,authenticated,service_role;
      grant execute on function fixture.admit(text,uuid,text) to service_role;`);
    await t.test('empty registry denies unregistered actors with the exact authorization error', () => {
      reject(call()); assert.equal(scopeState(), '[]'); assert.equal(baseline(), original);
    });
    await t.test('exact scope only; invalid and mismatched bindings leave data unchanged', () => {
      grant(); const before = scopeState();
      assert.equal(sql(call(), 'service_role'), 'admitted');
      for (const values of [[other,ns,admin], [actor,ns2,other], [actor,absent,admin], [actor,ns,other],
        [null,ns,admin], ['invalid',ns,admin], [actor,null,admin], [actor,ns,null], [actor,ns,'invalid']]) {
        reject(call(...values)); assert.equal(scopeState(), before); assert.equal(baseline(), original);
      }
      grant(actor,ns2,admin); const mismatch = scopeState();
      reject(call(actor,ns2,admin)); assert.equal(scopeState(), mismatch); remove();
    });
    await t.test('no self-enrollment, direct private calls or public grants, even with bypassrls', () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const q of [`select * from ${registry};`, `insert into ${registry} values ('${actor}','${ns}','${admin}');`,
          `update ${registry} set actor='${other}';`, `delete from ${registry};`, `truncate ${registry};`]) {
          reject(q, 'permission denied for table d1_refund_service_scopes', role); assert.equal(scopeState(), '[]');
        }
        reject(`select ${checker}('${actor}','${ns}','${admin}');`, 'permission denied for function d1_assert_refund_service_scope_private', role);
      }
      assert.equal(sql(`select relrowsecurity from pg_class where oid='${registry}'::regclass;`), 't');
      assert.equal(sql(`select count(*) from pg_policy where polrelid='${registry}'::regclass;`), '0');
      assert.equal(sql(`select prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='${signature}'::regprocedure;`), 't');
      assert.equal(sql(`select count(*) from pg_proc p, lateral aclexplode(p.proacl) a where p.oid='${signature}'::regprocedure and a.grantee=0;`), '0');
      assert.equal(baseline(), original);
    });
    await t.test('registry constraints reject wildcard/null/non-key grants', () => {
      for (const [a,n,p,message,code] of [[null,ns,admin,'null value in column "actor" of relation "d1_refund_service_scopes" violates not-null constraint','23502'],
        [actor,null,admin,'null value in column "namespace" of relation "d1_refund_service_scopes" violates not-null constraint','23502'],
        [actor,ns,null,'null value in column "pool" of relation "d1_refund_service_scopes" violates not-null constraint','23502'],
        ['*',ns,admin,'new row for relation "d1_refund_service_scopes" violates check constraint "d1_refund_service_scopes_actor_check"','23514'],
        [actor,ns,'*','new row for relation "d1_refund_service_scopes" violates check constraint "d1_refund_service_scopes_pool_check"','23514']]) {
        reject(`insert into ${registry} values (${quote(a)},${quote(n)},${quote(p)});`, message, 'postgres', code);
        assert.equal(scopeState(), '[]');
      }
    });
    await t.test('revocation denies the next call; reinsertion restores only exact membership', () => {
      grant(); assert.equal(sql(call(), 'service_role'), 'admitted'); remove(); reject(call());
      grant(); assert.equal(sql(call(), 'service_role'), 'admitted'); remove(); assert.equal(baseline(), original);
    });
    await t.test('admitted transaction holds membership until commit; revoker waits', async () => {
      grant();
      const admitted = asyncSQL(`set application_name='scope_admitted'; begin; set role service_role; ${call()} select pg_sleep(6); commit;`);
      await observe("select exists(select 1 from pg_stat_activity where application_name='scope_admitted' and wait_event='PgSleep');");
      const revoker = asyncSQL(`set application_name='scope_revoker'; delete from ${registry};`);
      await observe("select exists(select 1 from pg_stat_activity r join pg_stat_activity a on a.pid=any(pg_blocking_pids(r.pid)) where r.application_name='scope_revoker' and a.application_name='scope_admitted');");
      assert.deepEqual(await admitted.done, { status: 0, signal: null, stdout: 'SET\nBEGIN\nSET\nadmitted\n\nCOMMIT\n', stderr: '' });
      assert.deepEqual(await revoker.done, { status: 0, signal: null, stdout: 'SET\nDELETE 1\n', stderr: '' });
      reject(call()); assert.equal(scopeState(), '[]'); assert.equal(baseline(), original);
    });
    await t.test('admission waiting behind revocation cannot use the deleted membership', async () => {
      grant();
      const revoker = asyncSQL(`set application_name='scope_deleting'; begin; delete from ${registry}; select pg_sleep(6); commit;`);
      await observe("select exists(select 1 from pg_stat_activity where application_name='scope_deleting' and wait_event='PgSleep');");
      const waiting = asyncSQL(`set application_name='scope_waiting'; set role service_role; ${call()}`);
      await observe("select exists(select 1 from pg_stat_activity r join pg_stat_activity a on a.pid=any(pg_blocking_pids(r.pid)) where r.application_name='scope_waiting' and a.application_name='scope_deleting');");
      assert.deepEqual(await revoker.done, { status: 0, signal: null, stdout: 'SET\nBEGIN\nDELETE 1\n\nCOMMIT\n', stderr: '' });
      assert.deepEqual(await waiting.done, { status: 1, signal: null, stdout: 'SET\nSET\n', stderr: 'ERROR:  unauthorized_admin_wallet\n' });
      assert.equal(scopeState(), '[]'); assert.equal(baseline(), original);
    });
    await t.test('administrator is not implicit service membership', () => {
      const before = baseline(); reject(call(admin));
      assert.equal(scopeState(), '[]'); assert.equal(baseline(), before);
    });
    await t.test('pool binding changed while assertion waits is rechecked', async () => {
      grant(); const before = baseline(), scopes = scopeState();
      try {
        const updater = asyncSQL(`set application_name='scope_binding_update'; begin;
          update public.d1_pools set pool=${quote(actor)} where namespace=${quote(ns)};
          select pg_sleep(6); commit;`);
        await observe("select exists(select 1 from pg_stat_activity where application_name='scope_binding_update' and wait_event='PgSleep');");
        const waiting = asyncSQL(`set application_name='scope_binding_wait'; set role service_role; ${call()}`);
        await observe(`select exists(select 1 from pg_stat_activity w join pg_stat_activity u
          on u.pid=any(pg_blocking_pids(w.pid)) where w.application_name='scope_binding_wait' and u.application_name='scope_binding_update');`);
        assert.deepEqual(await updater.done, { status: 0, signal: null, stdout: 'SET\nBEGIN\nUPDATE 1\n\nCOMMIT\n', stderr: '' });
        assert.deepEqual(await waiting.done, { status: 1, signal: null, stdout: 'SET\nSET\n', stderr: 'ERROR:  unauthorized_admin_wallet\n' });
        reject(call()); assert.equal(scopeState(), scopes);
      } finally { sql(`update public.d1_pools set pool=${quote(admin)} where namespace=${quote(ns)};`); remove(); }
      assert.equal(baseline(), before);
    });
    await t.test('existing admin discovery contract unchanged; registry never grants production access', () => {
      grant();
      const reader = (n = ns, a = admin) => `select public.d1_load_discovery_checkpoint(${quote(n)},${quote(a)});`;
      assert.deepEqual(JSON.parse(sql(reader(), 'service_role')), { kind: 'd1_discovery_checkpoint_lookup', revision: 1,
        namespace: ns, network: 'TESTNET', pool: admin, checkpoint: null });
      reject(reader(ns,actor));
      reject(reader(null), 'invalid_discovery_page', 'service_role', '22023');
      reject(reader(absent), 'pool_not_activated', 'service_role', '22023');
      assert.equal(baseline(), original); remove();
    });
  } finally {
    for (const child of children) child.kill('SIGTERM');
    cleanup(); process.removeListener('SIGTERM', terminate);
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);
  }
});
