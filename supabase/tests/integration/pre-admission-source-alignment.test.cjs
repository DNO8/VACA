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
// Reconstruct the captured baseline from portable canonical source, never Git history
// or a private/live database. Exact observed MD5s independently bind the result.
function legacy(body, target) {
  if (target.name.endsWith('fence_private')) return body.replace(
    '    --032 ->031 ->030 ->018: admitted actor -> pool FOR UPDATE -> history.\n' +
    '    -- Later readers admit service scopes; callers must enforce write authority.\n' +
    '    -- These private helpers remain ungranted to all API roles.',
    '    -- Actual032 ->031 ->030 ->018: current admin -> pool FOR UPDATE -> history.');
  const gate = /    -- (?:Independent authorization:|Independently gate|Later reader admission)[^\n]*\n(?:    -- Match053:[^\n]*\n)?    perform 1 from public\.admin_wallets where public_key = p_authorized_by for share;\n    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;\n/g;
  assert.equal([...body.matchAll(gate)].length, 1, target.name);
  return body.replace(gate, '').replace('-- Inherit scope ->', '-- Inherit current-admin ->').replace(
    '    -- Recheck original scope after unique-index waits; the independent admin lock remains held.\n' +
    '    perform public.d1_load_issuance_outcome(p_request_id,p_authorized_by);',
    '    perform public.d1_load_issuance_outcome(p_request_id,p_authorized_by); -- Recheck current admin after unique-index waits.');
}

test('047a aligns only captured pre-admission bodies before the unchanged admission chain', async t => {
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
    const canonical = catalog(), errors = publicErrors();
    const restore = () => { for (const target of targets) sql(canonical[key(target)].definition); };
    const setLegacy = () => { for (const target of targets) {
      const item = canonical[key(target)]; sql(changeBody(item.definition, item.body, legacy(item.body, target)));
    } };
    const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : null;
    await t.test('restore the exact canonical bodies from the observed live baseline; preserve all catalog metadata and RPC errors', () => {
      setLegacy();
      const before = catalog();
      for (const target of targets) assert.equal(before[key(target)].hash, target.liveHash);
      if (migration) apply('alignment.sql', migration);
      // Behavioral/catalog RED, not a missing-file assertion.
      const aligned = catalog();
      for (const target of targets) assert.equal(aligned[key(target)].hash, canonical[key(target)].hash, target.name);
      assert.deepEqual(aligned, canonical);
      assert.deepEqual(publicErrors(), errors);
    });
    restore();
    await t.test('canonical baseline is an exact no-op including function identities and comments', () => {
      if (migration) apply('canonical.sql', migration);
      assert.deepEqual(catalog(), canonical); assert.deepEqual(publicErrors(), errors);
    });
    await t.test('reject unknown body or permission drift atomically without partial replacements', { skip: !migration }, () => {
      for (const drift of ['body', 'acl']) {
        setLegacy(); const target = targets.at(-1), beforeDrift = catalog()[key(target)];
        if (drift === 'body') sql(changeBody(beforeDrift.definition, beforeDrift.body, beforeDrift.body + '\n-- unknown drift\n'));
        else sql(`grant execute on function ${target.signature} to anon;`);
        const before = catalog(), beforeErrors = publicErrors();
        const file = path.join(fixture, `drift-${drift}.sql`); fs.writeFileSync(file, migration);
        for (const [verbosity, message] of [['terse', 'unexpected_d1_pre_admission_definition'], ['sqlstate', 'P0001']]) {
          const result = run('psql', [...args, '--set', `VERBOSITY=${verbosity}`, '-f', file]);
          assert.equal(result.status, 3); assert.equal(result.stdout, 'BEGIN\n');
          const prefix = `psql:${file}:`;
          assert.ok(result.stderr.startsWith(prefix));
          assert.match(result.stderr.slice(prefix.length), new RegExp(`^[1-9][0-9]*: ERROR:  ${message}\\n$`));
          assert.deepEqual(catalog(), before); assert.deepEqual(publicErrors(), beforeErrors);
        }
        if (drift === 'acl') sql(`revoke execute on function ${target.signature} from anon;`);
        restore();
      }
    });
    await t.test('alignment enables the complete unchanged ordered048–053,055–058 chain without service enrollment', { skip: !migration }, () => {
      setLegacy(); apply('before-chain.sql', migration);
      for (const number of [48,49,50,51,52,53,55,56,57,58]) {
        const name = names.find(n => n.startsWith(`${String(number).padStart(3,'0')}_`));
        apply(name, fs.readFileSync(path.join(directory, name), 'utf8'));
      }
      assert.equal(sql("select count(*) from public.d1_refund_service_scopes;").trim(), '0');
      assert.equal(sql("select to_regprocedure('public.d1_list_due_refund_originals(uuid,text,text,uuid,integer)') is not null;").trim(), 't');
    });
  } finally {
    if (fs.existsSync(path.join(data, 'postmaster.pid')))
      ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']);
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    fs.rmSync(fixture, { recursive: true, force: true });
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);
  }
});
