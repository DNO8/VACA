'use strict';
// T2a / S5,S7: disposable PostgreSQL authorization evidence only, NOT service admission,
// SDK validation, financial readiness, ledger acceptance, or deployment permission.
// Future048 contract: reject an altered allowlisted definition with P0001 /
// unexpected_d1_issuance_guard_definition, atomically; no normal RPC error changes.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawnSync } = require('node:child_process'), { createHash } = require('node:crypto');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const repo = path.resolve(__dirname, '../../..'), { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const admin = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const unknown = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const revoked = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const text = v => v == null ? 'null' : "'" + String(v).replaceAll("'", "''") + "'";
const lit = v => text(JSON.stringify(v)) + '::jsonb', hash = 'a'.repeat(64);
const mutations = [
  ['d1_save_unsigned_transaction', 'text,text', `'AAAA','${hash}'`, 'null,null'],
  ['d1_record_operating_credit', 'jsonb', `'{"operationId":"1"}'::jsonb`, 'null::jsonb'],
  ['d1_record_issuance_fee_commitment', 'text,text', "'100','300'", 'null,null'],
  ['d1_record_initial_financial_observation', 'jsonb', "'{}'::jsonb", 'null::jsonb'],
  ['d1_record_fresh_initial_financial_observation', 'jsonb', "'{}'::jsonb", 'null::jsonb'],
  ['d1_record_signed_transaction', 'text,text', `'${hash}','AQID'`, 'null,null'],
  ['d1_claim_submission_attempt', 'text,uuid', `'${hash}','${id(9)}'`, 'null,null'],
  ['d1_record_issuance_outcome', 'jsonb', "'{}'::jsonb", 'null::jsonb'],
].map(([name, types, payload, invalid]) => ({ name, signature: `public.${name}(uuid,text,${types})`, payload, invalid,
  target: name === 'd1_record_operating_credit' ? id(2) : id(1),
  reader: name === 'd1_record_operating_credit' ? 'd1_load_discovery_checkpoint' : 'd1_load_unsigned_transaction' }));
const rpc = (m, actor = admin, target = m.target, payload = m.payload) =>
  `select public.${m.name}(${text(target)},${text(actor)},${payload});`;

test('048 independent issuance mutation authorization (NOT service/financial proof)', async t => {
  assert.equal(process.platform, 'linux');
  assert.equal(fs.realpathSync(path.dirname(launcher)), path.join(repo, '.tooling/d1-backend'));
  assert.equal(fs.realpathSync(temp), path.join(repo, '.tooling/d1-backend/tmp'));
  assert.deepEqual(env, {}); assert.deepEqual(connectionArgs, []);
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-issuance-auth-')), data = path.join(fixture, 'data');
  const args = ['-X', '--no-password', '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
  let pid, cleaned = false;
  const run = (tool, a) => {
    const r = spawnSync(process.execPath, [launcher, tool, ...a], { env, encoding: 'utf8', timeout: 10000 });
    assert.ifError(r.error); return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const ok = (tool, a) => { const r = run(tool, a); assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); return r.stdout; };
  const sql = (q, role = 'service_role') => ok('psql', [...args, '--set', 'VERBOSITY=terse', '-c',
    (role ? `set role ${role}; ` : '') + q]).replace(/^SET\n/, '').trim();
  const json = (q, role) => JSON.parse(sql(q, role));
  const probe = q => Object.fromEntries(['terse', 'sqlstate'].map(v => [v,
    run('psql', [...args, '--set', `VERBOSITY=${v}`, '-c', q])]));
  const error = (r, code, message, stdout = 'SET\n', label = message) => {
    assert.deepEqual(r.terse, { status: 1, stdout, stderr: `ERROR:  ${message}\n` }, label);
    assert.deepEqual(r.sqlstate, { status: 1, stdout, stderr: `ERROR:  ${code}\n` }, label);
  };
  const apply = (name, source) => {
    const file = path.join(fixture, name); fs.writeFileSync(file, source);
    ok('psql', [...args, '--set', 'VERBOSITY=terse', '-q', '-f', file]); return file;
  };
  const definitions = () => json(`select jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';`, null);
  const metadata = () => json(`select jsonb_agg((to_jsonb(p)-'prosrc'-'prosqlbody') ||
    jsonb_build_object('comment',obj_description(p.oid,'pg_proc')) order by p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';`, null);
  const replaceBody = (signature, body) => {
    const original = json(`select jsonb_build_object('definition',pg_get_functiondef(oid),'body',prosrc)
      from pg_proc where oid=${text(signature)}::regprocedure;`, null);
    assert.equal(original.definition.split(original.body).length, 2);
    return original.definition.replace(original.body, () => body(original.body));
  };
  const cleanup = () => {
    if (cleaned) return;
    const pidfile = path.join(data, 'postmaster.pid');
    if (fs.existsSync(pidfile)) {
      pid ||= Number(fs.readFileSync(pidfile, 'utf8').split('\n')[0]);
      ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']);
    }
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    fs.rmSync(fixture, { recursive: true, force: true }); cleaned = true;
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);
  };
  const terminate = signal => { try { cleanup(); } finally { process.exit(signal === 'SIGINT' ? 130 : 143); } };
  const onTerm = () => terminate('SIGTERM'), onInt = () => terminate('SIGINT');
  process.once('SIGTERM', onTerm); process.once('SIGINT', onInt);
  try {
    ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']);
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    apply('fixture.sql', `create role anon; create role authenticated; create role service_role bypassrls;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}'),('${revoked}');
      insert into public.incidents values ('issuance-auth','vaquita','${admin}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const version of ['014', '20261011060218']) apply(version + '.sql', retained.migrations.find(m => m.version === version).statements.join(';\n'));
    const directory = path.join(repo, 'supabase/migrations'), names = fs.readdirSync(directory).sort();
    for (const name of names.filter(n => /^0(1[5-9]|2[0-9]|3[0-4])_.*\.sql$/.test(n))) apply(name, fs.readFileSync(path.join(directory, name), 'utf8'));
    const confirmed = Math.floor(Number(sql('select extract(epoch from clock_timestamp());'))) - 2;
    const input = { request_id: id(1), authorized_by: admin, confirmed_at: confirmed, ledger: 900,
      memo_hash: createHash('sha256').update('vaca.d1.donation.v1\nissuance-auth').digest('hex'),
      payment: { transaction_hash: 'b'.repeat(64), operation_id: '1', donor: admin, pool: admin, amount: '2.0000000', asset: { type: 'native' } },
      request: { version: 1, incident_id: 'issuance-auth', donor: admin, beneficiary: admin, amount: '1.0000000', asset: { type: 'native' },
        deadline: new Date((confirmed + 300) * 1000).toISOString().replace('.000Z', 'Z') } };
    sql(`select public.d1_activate_pool('${id(2)}','${admin}',900);`);
    const prepare = `select public.d1_prepare(${lit(input)});`;
    const intent = `select public.d1_register_issuance_intent('${id(1)}','${admin}');`;
    const reserve = `select public.d1_reserve_issuance_sequence('${id(1)}','${admin}','10');`;
    const writes = [prepare, intent, reserve, rpc(mutations[0]), rpc(mutations[2])];
    const receipts = writes.map(q => json(q));
    assert.equal(receipts[2].intent.preparation_input.request.deadline, input.request.deadline);
    assert.equal(receipts[3].transaction_sequence, '11'); assert.deepEqual(receipts[3].reservation, receipts[2]);
    assert.equal(receipts[4].authorized_by, admin);
    const load = name => `public.${name}('${id(1)}','${admin}')`;
    // Public retained accounting SELECT grants (real service_role BYPASSRLS), and
    // public authorized loaders only: no reads of private journal storage.
    const state = () => json(`select jsonb_build_object(
      'requests',(select jsonb_agg(to_jsonb(r) order by request_id) from public.release_requests r),
      'payments',(select jsonb_agg(to_jsonb(p) order by transaction_hash,operation_id) from public.donation_payments p),
      'allocations',(select jsonb_agg(to_jsonb(a) order by request_id) from public.donation_allocations a),
      'unsigned',${load('d1_load_unsigned_transaction')},'fees',${load('d1_load_issuance_fee_commitments')},
      'signed',${load('d1_load_signed_transaction')},'attempt',${load('d1_load_submission_attempt')},
      'outcome',${load('d1_load_issuance_outcome')},'active',public.d1_load_active_issuance_sequence('${id(2)}','${admin}'),
      'credit',public.d1_load_operating_credit_state('${id(2)}','${admin}'));`);
    const stored = state(); assert.equal(stored.payments.length, 1); assert.equal(stored.payments[0].allocated_stroops, 10000000);
    assert.deepEqual(json(`select public.d1_load_unsigned_transaction('${id(1)}','${revoked}');`), stored.unsigned);
    sql(`delete from public.admin_wallets where public_key='${revoked}';`, null);
    const baselineDefinitions = definitions(), baselineMetadata = metadata(), cases = [];
    for (const m of mutations) {
      for (const actor of [unknown, revoked]) cases.push({ q: rpc(m, actor), code: '42501', message: 'unauthorized_admin_wallet' });
      for (const [actor, target] of [[admin, null], [unknown, null], ['not-a-wallet', m.target], [null, m.target]])
        cases.push({ q: rpc(m, actor, target), code: '22023', message: m.reader === 'd1_load_discovery_checkpoint' ? 'invalid_discovery_page' : 'invalid_unsigned_transaction' });
      cases.push({ q: rpc(m, admin, id(999)), code: '22023', message: m.reader === 'd1_load_discovery_checkpoint' ? 'pool_not_activated' : 'd1_preparation_not_found' });
      const invalidMessage = ['invalid_unsigned_transaction', 'invalid_operating_credit', 'invalid_issuance_fee_commitment',
        'invalid_initial_financial_observation', 'invalid_initial_financial_observation', 'invalid_signed_transaction',
        'invalid_submission_attempt', 'invalid_issuance_outcome'][mutations.indexOf(m)];
      for (const actor of [admin, unknown]) cases.push({ q: rpc(m, actor, m.target, m.invalid),
        code: actor === admin || m === mutations[0] ? '22023' : '42501',
        message: actor === admin || m === mutations[0] ? invalidMessage : 'unauthorized_admin_wallet' });
      for (const role of ['anon', 'authenticated']) cases.push({ q: rpc(m), role, code: '42501', message: `permission denied for function ${m.name}` });
    }
    //018's bounds, canonical pad bits, hash, and shape-before-auth priority.
    const validShapes = [`'AA==','${hash}'`, `repeat('A',65536),'${hash}'`];
    for (const payload of [...validShapes, `'AB==','${hash}'`, `'AAA','${hash}'`, `'AAAA','BAD'`, `repeat('A',65540),'${hash}'`])
      cases.push({ q: rpc(mutations[0], unknown, id(1), payload), code: validShapes.includes(payload) ? '42501' : '22023',
        message: validShapes.includes(payload) ? 'unauthorized_admin_wallet' : 'invalid_unsigned_transaction' });
    const sample = c => {
      const before = state(), result = probe(`set role ${c.role || 'service_role'}; ${c.q}`);
      assert.deepEqual(state(), before, 'denial leaves public receipts and capacity counters unchanged');
      error(result, c.code, c.message);
      return result;
    };
    const baseline = cases.map(sample);
    const candidates = names.filter(n => /^048_.*\.sql$/.test(n)); assert.ok(candidates.length <= 1);
    const migration = candidates.length ? fs.readFileSync(path.join(directory, candidates[0]), 'utf8') : null;
    if (migration) apply(candidates[0], migration);
    // NO missing048/body-presence assertion: these are the intended RED tests.
    for (const m of mutations) await t.test(`${m.name}: current admin gate BEFORE shared reader`, () => {
      const before = state(), beforeDefinitions = definitions();
      const sentinel = `fixture_shared_reader_reached_${m.name}`;
      const instrument = replaceBody(`public.${m.reader}(uuid,text)`, () => `begin raise exception '${sentinel}' using errcode='P0001'; end;`);
      const invoke = actor => probe(`begin; ${instrument}; set local role service_role; ${rpc(m, actor)}`);
      // Each probe owns a separate transaction; error/disconnect rolls back DDL.
      const genuine = invoke(admin), denied = [unknown, revoked].map(invoke);
      assert.deepEqual(definitions(), beforeDefinitions); assert.deepEqual(state(), before);
      error(genuine, 'P0001', sentinel, 'BEGIN\nCREATE FUNCTION\nSET\n');
      for (const r of denied) error(r, '42501', 'unauthorized_admin_wallet', 'BEGIN\nCREATE FUNCTION\nSET\n',
        `${m.name}: non-admin must be rejected before shared reader sentinel`);
    });
    await t.test('preserve public errors, ACLs, OIDs, metadata, original admin writes/replays and counters', () => {
      assert.deepEqual(metadata(), baselineMetadata);
      assert.deepEqual(cases.map(sample), baseline, 'exact exit/stdout/stderr and SQLSTATE before/after048');
      assert.deepEqual(writes.map(q => json(q)), receipts); assert.deepEqual(state(), stored);
      const after = definitions();
      for (const [signature, definition] of Object.entries(baselineDefinitions))
        if (!mutations.some(m => signature === m.signature.replace('public.', ''))) assert.equal(after[signature], definition, signature);
    });
    await t.test('original admin can create and replay a fresh real preparation through unsigned journal', () => {
      const fresh = { ...input, request_id: id(3), payment: { ...input.payment, pool: unknown, transaction_hash: 'c'.repeat(64) } };
      const chain = [`select public.d1_prepare(${lit(fresh)});`,
        `select public.d1_register_issuance_intent('${id(3)}','${admin}');`,
        `select public.d1_reserve_issuance_sequence('${id(3)}','${admin}','20');`, rpc(mutations[0], admin, id(3))];
      const before = state();
      const output = sql(`begin; set local role service_role;
        select public.d1_activate_pool('${id(4)}','${unknown}',900); ${chain.join(' ')} ${chain.join(' ')} rollback;`, null).split('\n');
      assert.equal(output.shift(), 'BEGIN'); assert.equal(output.shift(), 'SET'); assert.equal(output.pop(), 'ROLLBACK');
      const [activation, ...results] = output.map(v => JSON.parse(v));
      assert.equal(activation.namespace, id(4)); assert.deepEqual(results.slice(0, 4), results.slice(4));
      assert.equal(results[3].request_id, id(3)); assert.equal(results[3].transaction_sequence, '21');
      assert.equal(results[3].deadline, fresh.request.deadline); assert.deepEqual(results[3].reservation, results[2]);
      assert.deepEqual(results[2].intent.preparation_input, fresh); assert.deepEqual(state(), before);
    });
    await t.test('048 rejects changed allowlisted definition atomically', { skip: !migration && '048 absent; guard-independence REDs above remain active' }, () => {
      const guarded = definitions();
      try {
        // Restore captured baseline, not git history, then alter ONLY the last
        // allowlisted mutation with a harmless comment. No arbitrary injection.
        for (const m of mutations) sql(baselineDefinitions[m.signature.replace('public.', '')], null);
        sql(replaceBody(mutations.at(-1).signature, body => body + '\n-- fixture definition drift\n'), null);
        const before = definitions(), meta = metadata(), beforeState = state();
        const file = path.join(fixture, '048-drift.sql'); fs.writeFileSync(file, migration);
        // -f is essential: one -c string would supply implicit atomicity itself.
        for (const [verbosity, message] of [['terse', 'unexpected_d1_issuance_guard_definition'], ['sqlstate', 'P0001']]) {
          const r = run('psql', [...args, '--set', `VERBOSITY=${verbosity}`, '-f', file]);
          assert.equal(r.status, 3); assert.equal(r.stdout, 'BEGIN\n');
          const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          assert.match(r.stderr, new RegExp(`^psql:${escaped}:[1-9][0-9]*: ERROR:  ${message}\\n$`));
          assert.deepEqual(definitions(), before, 'no partially installed guards after failure');
          assert.deepEqual(metadata(), meta); assert.deepEqual(state(), beforeState);
        }
      } finally { for (const m of mutations) sql(guarded[m.signature.replace('public.', '')], null); }
    });
  } finally {
    try { cleanup(); } finally { process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt); }
  }
});
