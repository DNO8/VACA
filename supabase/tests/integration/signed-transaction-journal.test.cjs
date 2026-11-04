// Opaque NON-SDK bytes only: SQL persistence is NOT signature/body/funding evidence.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawnSync, spawn } = require('node:child_process'), { createHash } = require('node:crypto');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime(), repo = path.resolve(__dirname, '../../..');
const pool = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', other = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const text = v => v === null ? 'null' : "'" + v.replaceAll("'", "''") + "'";
const lit = v => text(JSON.stringify(v)) + '::jsonb';
test('signed journal is immutable evidence, never fresh execution permission', async () => {
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-signed-journal-')), data = path.join(fixture, 'data');
  let pid, started = false;
  const args = ['-X', '--no-password', ...connectionArgs, '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '-At'];
  const run = (tool, a) => { const r = spawnSync(process.execPath, [launcher, tool, ...a], { env, encoding: 'utf8', timeout: 40000 }); assert.ifError(r.error); return r; };
  const ok = (tool, a) => { const r = run(tool, a); assert.equal(r.status, 0, r.stderr + r.stdout); assert.equal(r.stderr, ''); return r.stdout.trim(); };
  const sql = (q, role = 'service_role') => ok('psql', [...args, '-c', (role ? `set role ${role}; ` : '') + q]).replace(/^SET\r?\n/, '');
  const json = q => JSON.parse(sql(q));
  const load = (admin = pool) => `select public.d1_load_signed_transaction('${id(1)}','${admin}');`;
  const unsigned = () => `select public.d1_load_unsigned_transaction('${id(1)}','${pool}');`;
  const fee = () => `select public.d1_load_issuance_fee_commitments('${id(1)}','${pool}');`;
  const record = (hash, bytes = 'AQID', admin = pool) => `select public.d1_record_signed_transaction('${id(1)}','${admin}',${text(hash)},${text(bytes)});`;
  const state = () => ({ signed: json(load()), unsigned: json(unsigned()), fees: json(fee()) });
  const rejected = (q, error, { role = 'service_role', prefix = '', output = '' } = {}) => {
    const before = state(), r = run('psql', [...args, '-c', prefix + `set role ${role}; ` + q]);
    assert.equal(r.status, 1); assert.equal(r.stdout, output + 'SET\n'); assert.equal(r.stderr, `ERROR:  ${error}\n`);
    assert.deepEqual(state(), before, 'rejection must preserve public journal, owner and fee state');
  };
  const concurrent = (q, service = true) => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [launcher, 'psql', ...args, '-c', (service ? 'set role service_role; ' : '') + q], { env });
    let stdout = '', stderr = ''; p.stdout.on('data', b => stdout += b); p.stderr.on('data', b => stderr += b);
    p.once('error', reject); p.once('close', status => resolve({ status, stdout, stderr }));
  });
  const cleanup = () => {
    const file = path.join(data, 'postmaster.pid'); if (!pid && fs.existsSync(file)) pid = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
    if (started || fs.existsSync(file)) { ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']); started = false; }
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    fs.rmSync(fixture, { recursive: true, force: true }); console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);
  };
  const terminate = () => { cleanup(); process.exit(143); }; process.once('SIGTERM', terminate);
  try {
    ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']); started = true;
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    const apply = (name, q) => { const file = path.join(fixture, name); fs.writeFileSync(file, q); ok('psql', [...args, '-q', '-f', file]); };
    apply('fixture.sql', `create role anon; create role authenticated; create role service_role;
      create table public.admin_wallets(public_key text primary key); create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${pool}'),('${other}'); insert into public.incidents values ('incident','vaquita','${pool}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const v of ['014', '20261011060218']) apply(v + '.sql', retained.migrations.find(m => m.version === v).statements.join(';\n'));
    // Absence of030 MUST NOT skip the public RPC assertion below.
    for (const name of fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(n => /^0(1[5-9]|2[0-9]|30)_/.test(n)).sort()) apply(name, fs.readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8'));
    sql(`select public.d1_activate_pool('${id(100)}','${pool}',900);`);
    const now = Math.floor(Date.now() / 1000), deadline = new Date((now + 300) * 1000).toISOString().replace('.000Z', 'Z');
    const input = { request_id: id(1), authorized_by: pool, confirmed_at: now, ledger: 900,
      memo_hash: createHash('sha256').update('vaca.d1.donation.v1\nincident').digest('hex'),
      payment: { transaction_hash: '1'.repeat(64), operation_id: '1', donor: pool, pool, amount: '2.0000000', asset: { type: 'native' } },
      request: { version: 1, incident_id: 'incident', donor: pool, beneficiary: pool, amount: '1.0000000', asset: { type: 'native' }, deadline } };
    json(`select public.d1_prepare(${lit(input)});`);
    sql(`select public.d1_register_issuance_intent('${id(1)}','${pool}'); select public.d1_reserve_issuance_sequence('${id(1)}','${pool}','10');
      select public.d1_save_unsigned_transaction('${id(1)}','${pool}','AAAA','${'a'.repeat(64)}'); select public.d1_record_issuance_fee_commitment('${id(1)}','${pool}','100','300');`);
    const empty = json(load()); // Intended RED: missing public function, not missing-file skip.
    assert.deepEqual(empty, { kind: 'd1_signed_transaction_lookup', revision: 1, request_id: id(1), namespace: id(100), network: 'TESTNET', pool, transaction: null });
    let ledger = 899;
    const observation = (ttl = 30) => {
      const clock = Number(sql('select floor(extract(epoch from clock_timestamp()))::bigint;'));
      const page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: ++ledger, ledger_hash: ledger.toString(16).padStart(64, '0'), closed_at: clock, records: [] };
      sql(`select public.d1_record_discovery_page('${id(100)}','${pool}',${lit(page)}); select public.d1_record_transaction_page('${id(100)}','${pool}',${lit(page)});`);
      const anchor = { sequence: ledger, hash: page.ledger_hash, closedAt: clock };
      const donation = { donor: pool, asset: { type: 'native' }, amountStroops: '20000000', operationId: '1', transactionHash: '1'.repeat(64), confirmedAt: now };
      const snapshot = { kind: 'd1_initial_financial_snapshot', revision: 1, namespace: id(100), network: 'TESTNET', pool, requestId: id(1), anchor, observedAt: clock, expiresAt: clock + ttl,
        commitment: json(fee()).commitment, historyState: json(`select public.d1_load_transaction_history_state('${id(100)}','${pool}');`),
        creditState: json(`select public.d1_load_operating_credit_state('${id(100)}','${pool}');`), creation: { kind: 'opaque_fixture_NOT_SDK_proof' }, originalDonation: donation,
        account: { pool, networkPassphrase: 'Test SDF Network ; September 2015', anchor, sequence: '10', baseFee: '100' },
        obligations: { donations: [structuredClone(donation)] }, unissuedRefundOperationIds: ['1'], unissuedRefundFeeStroops: '100',
        budget: { otherFutureFees: '100', transactionFee: '100', newFutureRefundFee: '300' } };
      return json(`select public.d1_record_initial_financial_observation('${id(1)}','${pool}',${lit(snapshot)});`);
    };
    let evidence = observation();
    for (const role of ['anon', 'authenticated']) {
      rejected(load(), 'permission denied for function d1_load_signed_transaction', { role });
      rejected(record(evidence.snapshot_hash), 'permission denied for function d1_record_signed_transaction', { role });
    }
    for (const role of ['anon', 'authenticated', 'service_role']) for (const q of ['select * from public.d1_signed_transactions;', 'delete from public.d1_signed_transactions;', 'update public.d1_signed_transactions set receipt=receipt;'])
      rejected(q, 'permission denied for table d1_signed_transactions', { role });
    sql(`delete from public.admin_wallets where public_key='${other}';`, null);
    rejected(load(other), 'unauthorized_admin_wallet'); rejected(record(null, null, other), 'unauthorized_admin_wallet');
    sql(`insert into public.admin_wallets values ('${other}');`, null);
    for (const hash of [null, '', 'A'.repeat(64), 'a'.repeat(63)]) rejected(record(hash), 'invalid_signed_transaction');
    for (const bytes of [null, '', 'AAA', 'AA=A', 'AB==', 'AQI=\n', '!!!!']) rejected(record(evidence.snapshot_hash, bytes), 'invalid_signed_transaction');
    rejected(`select public.d1_record_signed_transaction('${id(1)}','${pool}','${evidence.snapshot_hash}',repeat('A',65540));`, 'invalid_signed_transaction');
    rejected(record('0'.repeat(64)), 'd1_initial_financial_observation_not_found');
    rejected(`select public.d1_record_signed_transaction('${id(1)}','${pool}','${'0'.repeat(64)}',repeat('A',65536));`, 'd1_initial_financial_observation_not_found');
    for (const isolation of ['repeatable read', 'serializable']) rejected(record(evidence.snapshot_hash), 'signed_transaction_isolation_required', { prefix: `begin isolation level ${isolation}; `, output: 'BEGIN\n' });
    // Only ephemeral fixture fault injection uses tables. Assertions use public RPCs;
    // the failed transaction rolls every injected change back before state comparison.
    const faults = [
      "update public.d1_issuance_sequences set receipt=jsonb_set(receipt,'{transaction_sequence}','\"12\"');",
      "update public.d1_unsigned_transactions set receipt=jsonb_set(receipt,'{transaction_hash}','\"" + 'b'.repeat(64) + "\"');",
      "update public.d1_issuance_fee_commitments set receipt=jsonb_set(receipt,'{issuance_fee_stroops}','\"101\"');",
      `insert into public.d1_operating_credit_observations values ('${id(100)}','2','{}');`
    ];
    for (const fault of faults) rejected(record(evidence.snapshot_hash), 'initial_financial_observation_conflict', { prefix: 'begin; ' + fault, output: 'BEGIN\n' + (fault.startsWith('insert') ? 'INSERT 0 1\n' : 'UPDATE 1\n') });
    rejected(record(evidence.snapshot_hash), 'd1_unsigned_transaction_not_found', { prefix: 'begin; delete from public.d1_unsigned_transactions; ', output: 'BEGIN\nDELETE 1\n' });
    const old = evidence; evidence = observation();
    rejected(record(old.snapshot_hash), 'initial_financial_observation_conflict'); // Stored hash still must check current history.
    rejected(record(evidence.snapshot_hash), 'deadline_expired', { prefix: "begin; update public.d1_preparations set input=jsonb_set(input,'{request,deadline}',to_jsonb(clock_timestamp()::text)); ", output: 'BEGIN\nUPDATE 1\n' });
    // Event-driven owned COPY marker: launcher ignores stdin and buffers stdout.
    for (const boundary of ['expiry', 'deadline']) {
      evidence = observation(5);
      if (boundary === 'deadline') sql(`update public.d1_preparations set input=jsonb_set(input,'{request,deadline}',to_jsonb(to_timestamp(${evidence.snapshot.observedAt + 4})::text));`, null);
      const stable = state(), marker = path.join(fixture, 'lock-' + boundary); let held = false, resolveReady;
      const ready = new Promise(resolve => { resolveReady = resolve; });
      const watch = fs.watch(fixture, (_event, name) => { if (name === 'lock-' + boundary && fs.existsSync(marker)) { held = true; resolveReady(); } });
      try {
        const blocker = concurrent(`begin; ${unsigned()} copy(select 1) to '${marker}'; select pg_sleep(6); commit;`, false);
        await Promise.race([ready, blocker.then(() => assert.equal(held, true, 'locker exited before readiness'))]);
        assert.equal(sql(`select extract(epoch from clock_timestamp()) < ${evidence.snapshot.observedAt + 4};`), 't');
        const [lock, writer] = await Promise.all([blocker, concurrent(record(evidence.snapshot_hash))]);
        assert.equal(lock.status, 0, lock.stderr); assert.equal(lock.stderr, '');
        const error = boundary === 'deadline' ? 'deadline_expired' : 'initial_financial_observation_expired';
        assert.equal(writer.status, 1); assert.equal(writer.stdout, 'SET\n'); assert.equal(writer.stderr, `ERROR:  ${error}\n`);
        assert.deepEqual(state(), stable);
        rejected(record(evidence.snapshot_hash), error); // Strict boundary, no lock wait, old028 hash.
      } finally {
        watch.close();
        if (boundary === 'deadline') sql(`update public.d1_preparations set input=jsonb_set(input,'{request,deadline}',to_jsonb(${text(deadline)}::text));`, null);
      }
    }
    evidence = observation(5);
    const before = state(), bytes = ['AQID', 'BAUG'];
    const races = await Promise.all(bytes.map(b => concurrent(record(evidence.snapshot_hash, b))));
    assert.equal(races.filter(r => r.status === 0).length, 1, JSON.stringify(races));
    const winner = races.findIndex(r => r.status === 0), loser = races[1 - winner];
    assert.equal(races[winner].stderr, ''); assert.equal(loser.status, 1); assert.equal(loser.stdout, 'SET\n'); assert.equal(loser.stderr, 'ERROR:  signed_transaction_conflict\n');
    const receipt = JSON.parse(races[winner].stdout.replace(/^SET\r?\n/, ''));
    assert.deepEqual(receipt, { kind: 'd1_signed_transaction_journal', revision: 1, request_id: id(1), namespace: id(100), network: 'TESTNET', pool,
      authorized_by: pool, transaction_hash: 'a'.repeat(64), snapshot_hash: evidence.snapshot_hash, signed_xdr: bytes[winner],
      envelope_hash: createHash('sha256').update(Buffer.from(bytes[winner], 'base64')).digest('hex'), reservation: before.unsigned.reservation });
    assert.deepEqual(json(load()), { ...empty, transaction: receipt });
    assert.deepEqual(json(unsigned()), before.unsigned); assert.deepEqual(json(fee()), before.fees);
    rejected(record(old.snapshot_hash, bytes[winner]), 'signed_transaction_conflict');
    rejected(record(evidence.snapshot_hash, bytes[1 - winner]), 'signed_transaction_conflict');
    sql(`select pg_sleep(greatest(0, ${evidence.snapshot.expiresAt} - extract(epoch from clock_timestamp()) + 0.02));`);
    assert.equal(sql(`select extract(epoch from clock_timestamp()) >= ${evidence.snapshot.expiresAt};`), 't');
    for (const admin of [pool, other]) {
      assert.deepEqual(json(record(evidence.snapshot_hash, bytes[winner], admin)), receipt);
      assert.deepEqual(json(load(admin)), { ...empty, transaction: receipt });
    }
    for (const isolation of ['repeatable read', 'serializable']) {
      const out = sql(`begin isolation level ${isolation}; ${record(evidence.snapshot_hash, bytes[winner], other)} commit;`).split('\n');
      assert.equal(out[0], 'BEGIN'); assert.equal(out[2], 'COMMIT'); assert.deepEqual(JSON.parse(out[1]), receipt);
    }
    const replays = await Promise.all([concurrent(record(evidence.snapshot_hash, bytes[winner])), concurrent(record(evidence.snapshot_hash, bytes[winner]))]);
    for (const r of replays) { assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); assert.deepEqual(JSON.parse(r.stdout.replace(/^SET\r?\n/, '')), receipt); }
    sql(`delete from public.admin_wallets where public_key='${other}';`, null);
    rejected(record(evidence.snapshot_hash, bytes[winner], other), 'unauthorized_admin_wallet'); rejected(load(other), 'unauthorized_admin_wallet');
    assert.deepEqual(json(unsigned()), before.unsigned); assert.deepEqual(json(fee()), before.fees);
    console.log('SIGNED_JOURNAL_AUTH_IMMUTABILITY_FRESHNESS_ISOLATION_RACES_OK');
  } finally { process.removeListener('SIGTERM', terminate); cleanup(); }
});
