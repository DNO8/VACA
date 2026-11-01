// Owned standalone PostgreSQL; synthetic observations are not chain execution evidence.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const repo = path.resolve(__dirname, '../../..');
const pool = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const funder = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const ns = '00000000-0000-4000-8000-000000000001';
const ns2 = '00000000-0000-4000-8000-000000000002';
const lit = v => v === undefined ? 'null' : "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";

test('private immutable operating-credit observation journal', async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-d1-credit-'));
  const data = path.join(fixture, 'data');
  let pid, started = false;
  const run = (tool, args) => {
    const r = spawnSync(process.execPath, [launcher, tool, ...args], { env, encoding: 'utf8', timeout: 10000 });
    assert.ifError(r.error); return r;
  };
  const ok = (tool, args) => {
    const r = run(tool, args); assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.stderr, ''); return r.stdout.trim();
  };
  const args = ['-X', '--no-password', ...connectionArgs, '-p', String(port), '-U', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '-At'];
  const sql = (s, role = 'service_role') => ok('psql', [...args, '-c', (role ? `set role ${role}; ` : '') + s]).replace(/^SET\r?\n/, '');
  const json = s => JSON.parse(sql(s));
  const load = (id, namespace = ns, admin = pool) => `select public.d1_load_operating_credit('${namespace}','${admin}','${id}');`;
  const save = (o, admin = pool) => `select public.d1_record_operating_credit('${ns}','${admin}',${lit(o)});`;
  const state = () => json(`select public.d1_load_discovery_state('${ns}','${pool}');`);
  const pageRpc = p => `select public.d1_record_discovery_page('${ns}','${pool}',${lit(p)});`;
  const observation = (index, creation = false, amount = '1.0000001') => {
    const operationId = String((900n << 32n) + 4096n + BigInt(index));
    const transactionHash = 'a'.repeat(64);
    return { namespace: ns, network: 'TESTNET', pool, funder, operationId, transactionHash, ledger: 900,
      amountStroops: String(BigInt(amount.replace('.', ''))), anchor: { sequence: 900, hash: 'b'.repeat(64), closedAt: 1000 },
      record: { paging_token: operationId, operation_id: operationId, transaction_hash: transactionHash, ledger: 900,
        operation: { kind: creation ? 'account_created' : 'incoming_payment', pool,
          ...(creation ? { funder, starting_balance: amount } : { donor: funder, asset: { type: 'native' }, amount }),
          sdk_type: creation ? 0 : 1, source: funder, confirmed_at: 1000, memo: { type: 'text', value: 'D1OPS' },
          raw: { operation: {}, transaction: {} } } } };
  };
  try {
    ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']);
    started = true;
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    const apply = (name, source) => {
      const file = path.join(fixture, name); fs.writeFileSync(file, source); ok('psql', [...args, '-q', '-f', file]);
    };
    apply('fixture.sql', `create role anon; create role authenticated; create role service_role;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${pool}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const version of ['014', '20261011060218']) apply(version + '.sql', retained.migrations.find(m => m.version === version).statements.join(';\n'));
    for (const name of ['015_d1_testnet_custody.sql', '019_d1_discovery.sql', '021_d1_discovery_state.sql', '022_d1_operating_credit_observations.sql']) {
      const file = path.join(repo, 'supabase/migrations', name);
      if (fs.existsSync(file)) apply(name, fs.readFileSync(file, 'utf8'));
    }
    sql(`select public.d1_activate_pool('${ns}','${pool}',900); select public.d1_activate_pool('${ns2}','${funder}',901);`);
    const a = observation(1), b = observation(2, true, '922337203685.4775807');
    const missing = { kind: 'd1_operating_credit_lookup', revision: 1, namespace: ns, network: 'TESTNET', pool, operation_id: a.operationId, receipt: null };
    assert.deepEqual(json(load(a.operationId)), missing); // Actual public missing-RPC RED.
    const page = { revision: 1, from_cursor: '0', to_cursor: b.operationId, through_ledger: 900,
      ledger_hash: a.anchor.hash, closed_at: 1000, records: [a.record, b.record] };
    const originalPage = json(pageRpc(page));
    const rejected = (source, error, role = 'service_role') => {
      const before = state(), lookup = json(load(a.operationId));
      const r = run('psql', [...args, '-c', `set role ${role}; ${source}`]);
      assert.equal(r.status, 1); assert.equal(r.stdout, 'SET\n'); assert.equal(r.stderr, `ERROR:  ${error}\n`);
      assert.deepEqual(state(), before); assert.deepEqual(json(load(a.operationId)), lookup);
      assert.deepEqual(json(pageRpc(page)), originalPage);
    };
    rejected(save(a), 'invalid_operating_credit'); // No complete empty marker.
    const empty = { ...page, from_cursor: b.operationId, records: [] };
    const emptyReceipt = json(pageRpc(empty));
    const receipt = o => ({ kind: 'd1_operating_credit_observation', revision: 1, authorized_by: pool, observation: o });
    assert.deepEqual(json(save(a)), receipt(a)); assert.deepEqual(json(save(b)), receipt(b));
    assert.deepEqual(json(load(a.operationId)), { ...missing, receipt: receipt(a) });
    assert.equal(json(load(a.operationId, ns2)).receipt, null);
    for (const mutate of [o => o.amountStroops = '2', o => o.record.operation.amount = '2.0000000',
      o => o.record.operation.memo.value = 'OTHER', o => o.record.operation.asset.type = 'issued',
      o => o.transactionHash = 'c'.repeat(64), o => o.anchor.sequence++, o => o.record.operation.raw.extra = true]) {
      const changed = structuredClone(a); mutate(changed); rejected(save(changed), 'operating_credit_conflict');
    }
    // Seed each invalid NEW candidate through opaque 019; SQL must not treat ingestion as validation.
    const bad = [o => o.amountStroops = '01', o => o.record.operation.amount = '0.0000000',
      o => { o.record.operation.amount = '922337203685.4775808'; o.amountStroops = '9223372036854775808'; },
      o => o.record.operation.amount = '1.00000001', o => o.record.operation.memo.value = 'D1OPS ',
      o => o.record.operation.asset = { type: 'issued' }, o => o.record.operation.sdk_type = 0,
      o => o.record.operation.source = pool, o => o.record.operation.confirmed_at = 1002,
      o => o.record.operation.extra = true, o => o.record.ledger = 899,
      o => o.anchor.hash = 'c'.repeat(64), o => o.network = 'PUBLIC', o => o.namespace = ns2,
      o => o.record.operation_id = '1', o => o.record.operation.memo = { type: 'text', value: 'D1OPS', extra: true },
      o => delete o.funder, o => o.extra = true, o => o.ledger = '900'];
    const candidates = bad.map((mutate, i) => {
      const o = observation(i + 3); o.anchor = { sequence: 901, hash: 'd'.repeat(64), closedAt: 1001 };
      mutate(o); return o;
    });
    const minimum = observation(30, false, '0.0000001');
    minimum.anchor = { sequence: 901, hash: 'd'.repeat(64), closedAt: 1001 };
    const tracked = observation(31); tracked.anchor = minimum.anchor;
    const next = { ...page, from_cursor: b.operationId, to_cursor: tracked.operationId,
      through_ledger: 901, ledger_hash: minimum.anchor.hash, closed_at: 1001,
      records: [...candidates.map(o => o.record), minimum.record, tracked.record] };
    json(pageRpc(next)); json(pageRpc({ ...next, from_cursor: next.to_cursor, records: [] }));
    for (const o of candidates) { rejected(save(o), 'invalid_operating_credit'); assert.equal(json(load(o.operationId)).receipt, null); }
    assert.deepEqual(json(save(minimum)), receipt(minimum));
    sql(`insert into public.donation_payments(transaction_hash,operation_id,payment,donation_stroops)
      values ('${tracked.transactionHash}','${tracked.operationId}','{}',1);`, null);
    rejected(save(tracked), 'invalid_operating_credit');
    assert.equal(json(load(tracked.operationId)).receipt, null);
    const unpersisted = observation(32); unpersisted.anchor = minimum.anchor;
    rejected(save(unpersisted), 'invalid_operating_credit');
    const altered = structuredClone(tracked); altered.record.operation.raw.operation = { changed: true };
    rejected(save(altered), 'invalid_operating_credit');
    const historical = observation(1); historical.operationId = String((899n << 32n) + 4097n);
    historical.ledger = 899; historical.record.ledger = 899;
    historical.record.operation_id = historical.record.paging_token = historical.operationId;
    historical.anchor = minimum.anchor;
    sql(`insert into public.d1_discovery_operations values ('${ns}','${historical.operationId}',
      '${historical.transactionHash}','${historical.operationId}',${lit(historical.record)});`, null);
    rejected(save(historical), 'invalid_operating_credit');
    for (const id of ['0', '01', '-1', '18446744073709551616']) rejected(load(id), 'invalid_operating_credit');
    rejected(save(null), 'invalid_operating_credit');
    for (const role of ['anon', 'authenticated']) {
      rejected(load(a.operationId), 'permission denied for function d1_load_operating_credit', role);
      rejected(save(a), 'permission denied for function d1_record_operating_credit', role);
    }
    for (const role of ['anon', 'authenticated', 'service_role']) for (const statement of ['select * from', 'delete from', 'update']) {
      const source = statement === 'update' ? 'update public.d1_operating_credit_observations set operation_id = operation_id;' : `${statement} public.d1_operating_credit_observations;`;
      rejected(source, 'permission denied for table d1_operating_credit_observations', role);
    }
    const advance = { ...next, from_cursor: next.to_cursor, records: [], through_ledger: 902, ledger_hash: 'e'.repeat(64), closed_at: 1002 };
    json(pageRpc(advance));
    sql(`insert into public.admin_wallets values ('${funder}');`, null);
    assert.deepEqual(json(save(a, funder)), receipt(a));
    assert.deepEqual(json(load(a.operationId, ns, funder)).receipt, receipt(a));
    sql(`delete from public.admin_wallets where public_key = '${pool}';`, null);
    const denied = run('psql', [...args, '-c', `set role service_role; ${save(a)}`]);
    assert.equal(denied.status, 1); assert.equal(denied.stdout, 'SET\n'); assert.equal(denied.stderr, 'ERROR:  unauthorized_admin_wallet\n');
    sql(`insert into public.admin_wallets values ('${pool}');`, null);
    assert.deepEqual(json(save(a)), receipt(a)); assert.deepEqual(json(save(b)), receipt(b));
    assert.deepEqual(json(pageRpc(empty)), emptyReceipt); assert.deepEqual(json(pageRpc(page)), originalPage);
    console.log('JOURNAL_AUTHORIZATION_REPLAY_REJECTION_OK');
  } finally {
    if (started) ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']);
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    fs.rmSync(fixture, { recursive: true, force: true });
    assert.equal(fs.existsSync(fixture), false);
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);
  }
});
