// Owned PostgreSQL, opaque unsigned bytes and declarations: NOT SDK/funding evidence.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawnSync, spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const repo = path.resolve(__dirname, '../../..');
const key = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const other = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lit = v => v == null ? 'null' : "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
const text = v => v == null ? 'null' : "'" + String(v).replaceAll("'", "''") + "'";
test('private owner-bound immutable issuance and future refund fee commitments', async () => {
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-d1-fees-')), data = path.join(fixture, 'data');
  let pid, started = false;
  const run = (tool, args) => { const r = spawnSync(process.execPath, [launcher, tool, ...args], { env, encoding: 'utf8', timeout: 10000 }); assert.ifError(r.error); return r; };
  const ok = (tool, args) => { const r = run(tool, args); assert.equal(r.status, 0, r.stderr + r.stdout); assert.equal(r.stderr, ''); return r.stdout.trim(); };
  const args = ['-X', '--no-password', ...connectionArgs, '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '-At'];
  const sql = (s, role = 'service_role') => ok('psql', [...args, '-c', (role ? `set role ${role}; ` : '') + s]).replace(/^SET\r?\n/, '');
  const json = s => JSON.parse(sql(s));
  const load = (n = 1, admin = key) => `select public.d1_load_issuance_fee_commitments('${id(n)}','${admin}');`;
  const save = (n = 1, issuance = '100', refund = '300', admin = key) => `select public.d1_record_issuance_fee_commitment('${id(n)}','${admin}',${text(issuance)},${text(refund)});`;
  const unsigned = n => `select public.d1_load_unsigned_transaction('${id(n)}','${key}');`;
  const unsignedSave = n => `select public.d1_save_unsigned_transaction('${id(n)}','${key}','AAAA','${'a'.repeat(64)}');`;
  const snapshot = () => ({ commitment: json(load()), unsigned: json(unsigned(1)), absent: json(unsigned(2)) });
  const rejected = (source, error, role = 'service_role') => {
    const before = snapshot(), r = run('psql', [...args, '-c', `set role ${role}; ${source}`]);
    assert.equal(r.status, 1); assert.equal(r.stdout, 'SET\n'); assert.equal(r.stderr, `ERROR:  ${error}\n`); assert.deepEqual(snapshot(), before);
  };
  const concurrent = source => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcher, 'psql', ...args, '-c', 'set role service_role; ' + source], { env });
    let stdout = '', stderr = ''; child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    child.once('error', reject); child.once('close', status => resolve({ status, stdout, stderr }));
  });
  try {
    ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']);
    started = true; pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    const apply = (name, source) => { const p = path.join(fixture, name); fs.writeFileSync(p, source); ok('psql', [...args, '-q', '-f', p]); };
    apply('fixture.sql', `create role anon; create role authenticated; create role service_role;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${key}'),('${other}');
      insert into public.incidents values ('fixture-incident','vaquita','${key}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const version of ['014', '20261011060218']) apply(version + '.sql', retained.migrations.find(m => m.version === version).statements.join(';\n'));
    for (const name of ['015_d1_testnet_custody.sql', '016_d1_issuance_intents.sql', '017_d1_issuance_sequences.sql', '018_d1_unsigned_transactions.sql', '027_d1_issuance_fee_commitments.sql']) {
      const p = path.join(repo, 'supabase/migrations', name); if (fs.existsSync(p)) apply(name, fs.readFileSync(p, 'utf8'));
    }
    sql(`select public.d1_activate_pool('${id(100)}','${key}',900); select public.d1_activate_pool('${id(101)}','${other}',900);`);
    const confirmed = Math.floor(Date.now() / 1000) - 2, deadline = new Date((confirmed + 300) * 1000).toISOString().replace('.000Z', 'Z');
    for (const n of [1, 2, 3]) {
      const pool = n === 3 ? other : key;
      const input = { request_id: id(n), authorized_by: key, confirmed_at: confirmed, ledger: 900,
        memo_hash: createHash('sha256').update('vaca.d1.donation.v1\nfixture-incident').digest('hex'),
        payment: { transaction_hash: String(n).repeat(64), operation_id: String(n), donor: key, pool, asset: { type: 'native' }, amount: '2.0000000' },
        request: { version: 1, incident_id: 'fixture-incident', donor: key, beneficiary: key, asset: { type: 'native' }, amount: '1.0000000', deadline } };
      json(`select public.d1_prepare(${lit(input)});`);
      if (n !== 2) { sql(`select public.d1_register_issuance_intent('${id(n)}','${key}');`); sql(`select public.d1_reserve_issuance_sequence('${id(n)}','${key}','10');`); }
    }
    const owner = json(unsigned(1));
    const empty = json(load()); // Actual public missing-RPC RED for027.
    assert.deepEqual(empty, { kind: 'd1_issuance_fee_commitment_lookup', revision: 1, request_id: id(1), namespace: id(100), network: 'TESTNET', pool: key, reservation: owner.reservation, commitment: null, commitments: [] });
    rejected(save(2), 'd1_issuance_sequence_not_found');
    for (const bad of ['0', '01', '-1', '9223372036854775808', null, 'x']) {
      rejected(save(1, bad), 'invalid_issuance_fee_commitment'); rejected(save(1, '100', bad), 'invalid_issuance_fee_commitment');
    }
    rejected(save(1, '9223372036854775807', '1'), 'invalid_issuance_fee_commitment');
    for (const [issuance, refund] of [['1', '9223372036854775806'], ['9223372036854775806', '1']]) {
      const lines = sql('begin; ' + save(3, issuance, refund) + ' rollback;').split('\n');
      assert.equal(lines[0], 'BEGIN'); assert.equal(lines[2], 'ROLLBACK'); assert.equal(lines.length, 3);
      const boundary = JSON.parse(lines[1]); assert.equal(boundary.issuance_fee_stroops, issuance); assert.equal(boundary.future_refund_fee_stroops, refund);
      assert.equal(boundary.namespace, id(101)); assert.equal(json(load(3)).commitment, null);
    }
    const races = await Promise.all([concurrent(save()), concurrent(save())]);
    for (const r of races) { assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); }
    const receipt = JSON.parse(races[0].stdout.replace(/^SET\r?\n/, ''));
    assert.deepEqual(JSON.parse(races[1].stdout.replace(/^SET\r?\n/, '')), receipt);
    assert.deepEqual(receipt, { kind: 'd1_issuance_fee_commitment', revision: 1, request_id: id(1), namespace: id(100), network: 'TESTNET', pool: key,
      authorized_by: key, reservation: owner.reservation, issuance_fee_stroops: '100', future_refund_fee_stroops: '300', deadline });
    const committed = json(load()); assert.deepEqual(committed.commitment, receipt); assert.deepEqual(committed.commitments, [receipt]);
    assert.deepEqual(json(load(2)).commitments, [receipt]); assert.equal(json(load(2)).commitment, null);
    assert.deepEqual(json(load(3)).commitments, []); assert.equal(json(load(3)).namespace, id(101));
    assert.deepEqual(json(unsigned(1)), owner); rejected(save(1, '101'), 'issuance_fee_commitment_conflict');
    const conflicts = await Promise.all([concurrent(save()), concurrent(save(1, '100', '301'))]);
    assert.equal(conflicts[0].status, 0); assert.equal(conflicts[1].status, 1); assert.equal(conflicts[1].stdout, 'SET\n'); assert.equal(conflicts[1].stderr, 'ERROR:  issuance_fee_commitment_conflict\n');
    assert.deepEqual(json(load()), committed);
    const bytes = json(unsignedSave(1)); assert.equal(bytes.unsigned_xdr, 'AAAA');
    // Owner-only fixture expiry; no production time override or ownership release.
    sql(`update public.d1_preparations set input = pg_catalog.jsonb_set(input,'{request,deadline}',to_jsonb('2000-01-01T00:00:00Z'::text)) where request_id in ('${id(1)}','${id(3)}');`, null);
    assert.deepEqual(json(save()), receipt); assert.deepEqual(json(unsignedSave(1)), bytes); rejected(save(3), 'deadline_expired');
    assert.deepEqual(json(save(1, '100', '300', other)), receipt); // Current admin replay keeps original authorizer.
    for (const role of ['anon', 'authenticated']) {
      rejected(load(), 'permission denied for function d1_load_issuance_fee_commitments', role);
      rejected(save(), 'permission denied for function d1_record_issuance_fee_commitment', role);
    }
    for (const role of ['anon', 'authenticated', 'service_role']) for (const source of ['select * from public.d1_issuance_fee_commitments;', 'delete from public.d1_issuance_fee_commitments;', 'update public.d1_issuance_fee_commitments set receipt = receipt;']) rejected(source, 'permission denied for table d1_issuance_fee_commitments', role);
    sql(`delete from public.admin_wallets where public_key = '${other}';`, null);
    rejected(load(1, other), 'unauthorized_admin_wallet'); rejected(save(1, null, null, other), 'unauthorized_admin_wallet');
    assert.deepEqual(json(load()).commitment, receipt); assert.deepEqual(json(unsigned(1)).transaction, bytes);
    console.log('FEE_COMMITMENT_OWNER_REPLAY_REJECTION_ISOLATION_RACE_OK');
  } finally {
    if (started) ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']);
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    fs.rmSync(fixture, { recursive: true, force: true }); assert.equal(fs.existsSync(fixture), false);
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);
  }
});
