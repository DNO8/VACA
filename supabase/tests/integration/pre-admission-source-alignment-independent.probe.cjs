'use strict';
// Public DDL/catalog and RPC checks against disposable PostgreSQL only.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawnSync } = require('node:child_process');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const repo = path.resolve(__dirname, '../../..'), runtime = resolveFixtureRuntime();
const directory = path.join(repo, 'supabase/migrations');
const migrationPath = path.join(directory, '047a_d1_pre_admission_source_alignment.sql');
const quote = s => "'" + s.replaceAll("'", "''") + "'";
const targets = [
  ['d1_acquire_refund_lane_fence_private', 'uuid,uuid,text,text,text', '3744ffa41ca206c7d329f569db3197e8'],
  ['d1_claim_refund_signing', 'uuid,text,text,uuid', '7b8978f2e56e724d8c33e55ec543471b'],
  ['d1_claim_refund_submission_attempt', 'uuid,text,text,uuid', 'c9a0a47489402bf3da45c14e9617b41f'],
  ['d1_load_refund_outcome', 'uuid,text', 'ca2e3d50303e8094304b5c04aab53195'],
  ['d1_load_refund_signing_journal', 'uuid,text', '0a51aece7a36d12a53a2ca5c24b280e1'],
  ['d1_load_refund_submission_attempt', 'uuid,text', '8c2bb7db4003b2a5c11c48cdf2a513fc'],
  ['d1_record_beneficiary_claim', 'uuid,text,jsonb', '6c633d39a54a560c7ef83d7211371963'],
  ['d1_record_refund_outcome', 'uuid,text,jsonb,jsonb', '6e0f5229a90b05306b377dccdb3067f3'],
  ['d1_record_signed_refund_transaction', 'uuid,text,uuid,text,text', '121ae4df245df2e858e662ad479ddaef'],
].map(([name, args, liveHash]) => ({ name, args, liveHash, signature: `public.${name}(${args})` }));
test('independent captured baseline alignment, drift and gate probes', async t => {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const fixture = fs.mkdtempSync(path.join(runtime.temp, 'd1-alignment-')), data = path.join(fixture, 'data');
  const args = ['-X', '--no-password', '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
  const run = (tool, argv) => {
    const r = spawnSync(process.execPath, [runtime.launcher, tool, ...argv], { env: runtime.env, encoding: 'utf8', timeout: 10000 });
    assert.ifError(r.error); return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const ok = (tool, argv) => { const r = run(tool, argv); assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); return r.stdout; };
  const sql = q => ok('psql', [...args, '--set', 'VERBOSITY=terse', '-c', q]);
  const json = q => JSON.parse(sql(q));
  const apply = (name, source) => {
    const file = path.join(fixture, name); fs.writeFileSync(file, source);
    return ok('psql', [...args, '--set', 'VERBOSITY=terse', '-q', '-f', file]);
  };
  const catalog = () => json(`select jsonb_object_agg(p.oid::regprocedure::text,
    jsonb_build_object('definition',pg_get_functiondef(p.oid),'body',p.prosrc,'hash',md5(p.prosrc),
    'metadata',to_jsonb(p)-'prosrc','comment',obj_description(p.oid,'pg_proc')))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';`);
  const changeBody = (definition, oldBody, newBody) => {
    assert.equal(definition.split(oldBody).length, 2); return definition.replace(oldBody, () => newBody);
  };
  const key = target => target.signature.replace('public.', '');
  const publicErrors = () => targets.map(target => run('psql', [...args, '--set', 'VERBOSITY=terse', '-c',
    `set role service_role; select public.${target.name}(${target.args.split(',').map(type => `null::${type}`).join(',')});`]));
  let pid;
  try {
    ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']);
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    apply('fixture.sql', 'create role anon; create role authenticated; create role service_role bypassrls;\n' +
      'create table public.admin_wallets(public_key text primary key);\n' +
      'create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);');
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const version of ['014', '20261011060218']) apply(`${version}.sql`, retained.migrations.find(m => m.version === version).statements.join(';\n'));
    const names = fs.readdirSync(directory).sort();
    for (const name of names.filter(n => /^0(1[5-9]|2[0-9]|3[0-9]|4[0-7])_.*\.sql$/.test(n)))
      apply(name, fs.readFileSync(path.join(directory, name), 'utf8'));
    sql(`comment on function ${targets[1].signature} is 'preserve this catalog comment';`);

    const crypto = require('node:crypto');
    const captureDir = path.join(runtime.temp, 'recording-migration-preflight-l2dbpjf2');
    const rawBytes = fs.readFileSync(path.join(captureDir, 'raw-mcp-catalog.json'));
    assert.equal(crypto.createHash('sha256').update(rawBytes).digest('hex'), 'ef5592a16a628f2fd204a13190aa7ffb94cdc023619c628e4d62bfa9378bf883');
    const raw = JSON.parse(rawBytes).result;
    const captured = JSON.parse(raw.slice(raw.indexOf('[{"recovery_snapshot"'), raw.lastIndexOf('</untrusted-data-')).trim())[0].recovery_snapshot;
    assert.deepEqual(captured, JSON.parse(fs.readFileSync(path.join(captureDir, 'catalog-baseline.json'))));
    const canonical = catalog();
    const actual = targets.map(target => captured.functions.find(f => f.signature === target.signature));
    assert.equal(actual.filter(Boolean).length, 9);
    const restore = () => targets.forEach(target => sql(canonical[key(target)].definition));
    const load = () => actual.forEach(f => sql(f.definition));
    const migration = fs.readFileSync(migrationPath, 'utf8');
    const file = path.join(fixture, 'alignment.sql'); fs.writeFileSync(file, migration);
    const rows = () => {
      const tables = json("select jsonb_agg(tablename order by tablename) from pg_tables where schemaname='public'");
      return crypto.createHash('sha256').update(JSON.stringify(tables.map(name => json(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.${name} t`)))).digest('hex');
    };
    sql("insert into public.admin_wallets values ('independent-admin'); insert into public.incidents values ('independent-preserved','open','public-key');");
    console.log('SERVER_VERSION='+sql('show server_version').trim());
    await t.test('actual raw-captured nine definitions align exactly and preserve rows/catalog', () => {
      load(); for (const target of targets) assert.equal(catalog()[key(target)].hash, target.liveHash);
      const before = rows(); apply('actual.sql', migration);
      assert.deepEqual(catalog(), canonical); assert.equal(rows(), before);
    });
    await t.test('mixed captured/canonical works; repeat is a physical catalog no-op', () => {
      actual.forEach((f,i) => { if (i%2===0) sql(f.definition); });
      const before = rows(); apply('mixed.sql', migration); assert.deepEqual(catalog(),canonical);
      const versions = () => sql("select string_agg(oid::text||':'||xmin::text,',' order by oid) from pg_proc where pronamespace='public'::regnamespace");
      const v=versions(); apply('noop.sql',migration); assert.equal(versions(),v); assert.equal(rows(),before);
    });
    await t.test('unknown body, catalog and ACL reject before any DDL and preserve all rows/metadata', () => {
      // Sequence changes survive rollback: detect attempted DDL, not just committed DDL.
      sql("create sequence public.independent_ddl_calls; create function public.independent_ddl_watch() returns event_trigger language plpgsql as $$begin perform nextval('public.independent_ddl_calls'); end$$; create event trigger independent_watch on ddl_command_start execute function public.independent_ddl_watch();");
      const target=targets.at(-1), sig=target.signature;
      for (const drift of ['body','cost','security','search_path','acl']) {
        load();
        if (drift==='body') { const f=catalog()[key(target)]; sql(changeBody(f.definition,f.body,f.body+'\n-- independently unknown\n')); }
        if (drift==='cost') sql(`alter function ${sig} cost 101`);
        if (drift==='security') sql(`alter function ${sig} security invoker`);
        if (drift==='search_path') sql(`alter function ${sig} set search_path to public`);
        if (drift==='acl') sql(`grant execute on function ${sig} to authenticated`);
        const before=catalog(), data=rows(), ddl=sql('select last_value from public.independent_ddl_calls');
        for (const verbosity of ['terse','sqlstate']) {
          const r=run('psql',[...args,'--set',`VERBOSITY=${verbosity}`,'-f',file]);
          assert.equal(r.status,3); assert.equal(r.stdout,'BEGIN\n');
          assert.equal(r.stderr,`psql:${file}:142: ERROR:  ${verbosity==='terse'?'unexpected_d1_pre_admission_definition':'P0001'}\n`);
          assert.deepEqual(catalog(),before); assert.equal(rows(),data); assert.equal(sql('select last_value from public.independent_ddl_calls'),ddl);
        }
        if(drift==='acl') sql(`revoke execute on function ${sig} from authenticated`);
        sql(`alter function ${sig} cost 100`); restore();
      }
      sql('drop event trigger independent_watch; drop function public.independent_ddl_watch(); drop sequence public.independent_ddl_calls;');
    });
    await t.test('private helper is unavailable to each API role', () => {
      for (const role of ['anon','authenticated','service_role']) {
        const r=run('psql',[...args,'--set','VERBOSITY=terse','-c',`set role ${role}; select public.d1_acquire_refund_lane_fence_private(null,null,null,null,null)`]);
        assert.equal(r.status,1); assert.equal(r.stderr,'ERROR:  permission denied for function d1_acquire_refund_lane_fence_private\n');
      }
    });
    await t.test('all eight independent gates reject non-admin after an admitted upstream reader', () => {
      // Public CREATE OR REPLACE models future admitted reads; no financial engine execution.
      const upstream = {
        d1_claim_refund_signing:'d1_load_refund_signing_journal',
        d1_claim_refund_submission_attempt:'d1_load_refund_submission_attempt',
        d1_load_refund_outcome:'d1_load_refund_submission_attempt',
        d1_load_refund_signing_journal:'d1_load_refund_candidate',
        d1_load_refund_submission_attempt:'d1_load_refund_signing_journal',
        d1_record_beneficiary_claim:'d1_load_beneficiary_claim',
        d1_record_refund_outcome:'d1_load_refund_outcome',
        d1_record_signed_refund_transaction:'d1_load_refund_signing_journal',
      };
      for(const target of targets.slice(1)) {
        const up=upstream[target.name], k=Object.keys(canonical).find(k=>k.startsWith(up+'(')), f=canonical[k];
        sql(changeBody(f.definition,f.body," begin return '{}'::jsonb; end; "));
        const data=rows();
        const values=target.args.split(',').map((type,i)=>i===1?"'independent-nonadmin'::text":`null::${type}`).join(',');
        for(const verbosity of ['terse','sqlstate']) {
          const r=run('psql',[...args,'--set',`VERBOSITY=${verbosity}`,'-c',`set role service_role; select public.${target.name}(${values})`]);
          assert.equal(r.status,1); assert.equal(r.stderr,`ERROR:  ${verbosity==='terse'?'unauthorized_admin_wallet':'42501'}\n`,target.name); assert.equal(rows(),data);
        }
        sql(f.definition);
      }
      assert.deepEqual(catalog(),canonical);
    });

  } finally {
    if (fs.existsSync(path.join(data, 'postmaster.pid')))
      ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']);
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    console.log('PRESERVED_FIXTURE='+fixture);
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_PRESERVED`);
  }
});
