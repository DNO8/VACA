// Opaque NON-SDK SQL evidence fixtures: never funding/signing approval.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawnSync, spawn } = require('node:child_process'), { createHash } = require('node:crypto');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime(), repo = path.resolve(__dirname, '../../..');
const pool = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', other = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lit = v => v === null ? 'null' : "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
test('private initial financial observations bind locked state without granting authority', async () => {
  const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-initial-finance-')), data = path.join(fixture, 'data'); let pid, started = false;
  const args = ['-X', '--no-password', ...connectionArgs, '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '-At'];
  const run = (tool, a) => { const r = spawnSync(process.execPath, [launcher, tool, ...a], { env, encoding: 'utf8', timeout: 40000 }); assert.ifError(r.error); return r; };
  const ok = (tool, a) => { const r = run(tool, a); assert.equal(r.status, 0, r.stderr + r.stdout); assert.equal(r.stderr, ''); return r.stdout.trim(); };
  const sql = (q, role = 'service_role') => ok('psql', [...args, '-c', (role ? `set role ${role}; ` : '') + q]).replace(/^SET\r?\n/, '');
  const json = q => JSON.parse(sql(q));
  const load = (hash = '0'.repeat(64), n = 1, admin = pool) => `select public.d1_load_initial_financial_observation('${id(n)}','${admin}','${hash}');`;
  const candidates = new Map();
  const save = (snapshot, n = 1, admin = pool) => { const q = `select public.d1_record_initial_financial_observation('${id(n)}','${admin}',${lit(snapshot)});`; candidates.set(q, { snapshot, n }); return q; };
  const unsigned = n => `select public.d1_load_unsigned_transaction('${id(n)}','${pool}');`;
  const fee = () => `select public.d1_load_issuance_fee_commitments('${id(1)}','${pool}');`;
  let storedHash = '0'.repeat(64);
  const state = () => ({ lookup: json(load(storedHash)), unsigned: json(unsigned(1)), fees: json(fee()) });
  const rejected = (q, message, role = 'service_role') => {
    const candidate = candidates.get(q) ?? [...candidates].find(([statement]) => q.endsWith(statement))?.[1];
    const expression = candidate?.expression ?? (candidate?.snapshot ? lit(candidate.snapshot) : null);
    const hash = expression ? sql(`select encode(sha256(convert_to((${expression})::text,'UTF8')),'hex');`) : null;
    const prior = hash ? json(load(hash, candidate.n)) : null;
    const before = state(), r = run('psql', [...args, '-c', `set role ${role}; ${q}`]);
    assert.equal(r.status, 1); assert.equal(r.stdout, q.startsWith('begin isolation level') ? 'SET\nBEGIN\n' : 'SET\n'); assert.equal(r.stderr, `ERROR:  ${message}\n`); assert.deepEqual(state(), before);
    if (hash) assert.deepEqual(json(load(hash, candidate.n)), prior);
  };
  const concurrent = (q, asService = true) => new Promise((resolve, reject) => { const p = spawn(process.execPath, [launcher, 'psql', ...args, '-c', (asService ? 'set role service_role; ' : '') + q], { env }); let stdout = '', stderr = '';
    p.stdout.on('data', b => stdout += b); p.stderr.on('data', b => stderr += b); p.once('error', reject); p.once('close', status => resolve({ status, stdout, stderr })); });
  const cleanup = () => {
    const file = path.join(data, 'postmaster.pid'); if (!pid && fs.existsSync(file)) pid = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
    if (started || fs.existsSync(file)) { ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']); started = false; }
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }); fs.rmSync(fixture, { recursive: true, force: true });
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);
  };
  const terminate = () => { cleanup(); process.exit(143); }; process.once('SIGTERM', terminate);
  try {
    ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']); started = true;
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    const apply = (name, q) => { const p = path.join(fixture, name); fs.writeFileSync(p, q); ok('psql', [...args, '-q', '-f', p]); };
    apply('fixture.sql', `create role anon; create role authenticated; create role service_role;
      create table public.admin_wallets(public_key text primary key); create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${pool}'),('${other}'); insert into public.incidents values ('incident','vaquita','${pool}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const v of ['014', '20261011060218']) apply(v + '.sql', retained.migrations.find(m => m.version === v).statements.join(';\n'));
    for (const name of fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(n => /^0(1[5-9]|2[0-8])_/.test(n)).sort()) apply(name, fs.readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8'));
    sql(`select public.d1_activate_pool('${id(100)}','${pool}',900); select public.d1_activate_pool('${id(101)}','${other}',900);`);
    const now = Math.floor(Date.now() / 1000), deadline = new Date((now + 300) * 1000).toISOString().replace('.000Z', 'Z');
    for (const n of [1, 2, 3]) {
      const input = { request_id: id(n), authorized_by: pool, confirmed_at: now, ledger: 900, memo_hash: createHash('sha256').update('vaca.d1.donation.v1\nincident').digest('hex'),
        payment: { transaction_hash: String(n).repeat(64), operation_id: String(n), donor: pool, pool: n === 3 ? other : pool, amount: '2.0000000', asset: { type: 'native' } },
        request: { version: 1, incident_id: 'incident', donor: pool, beneficiary: pool, amount: '1.0000000', asset: { type: 'native' }, deadline } };
      json(`select public.d1_prepare(${lit(input)});`);
      if (n !== 2) sql(`select public.d1_register_issuance_intent('${id(n)}','${pool}'); select public.d1_reserve_issuance_sequence('${id(n)}','${pool}','10');`);
    }
    sql(`select public.d1_save_unsigned_transaction('${id(1)}','${pool}','AAAA','${'a'.repeat(64)}'); select public.d1_record_issuance_fee_commitment('${id(1)}','${pool}','100','300');`);
    const empty = json(load()); // Missing public RPC RED before028 exists.
    assert.equal(empty.observation, null); assert.equal(empty.namespace, id(100)); assert.equal(empty.transaction_hash, 'a'.repeat(64));
    assert.equal(json(load('0'.repeat(64), 2)).observation, null); assert.equal(json(load('0'.repeat(64), 3)).namespace, id(101));
    const page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: 900, ledger_hash: 'b'.repeat(64), closed_at: now, records: [] };
    sql(`select public.d1_record_discovery_page('${id(100)}','${pool}',${lit(page)}); select public.d1_record_transaction_page('${id(100)}','${pool}',${lit(page)});`);
    const history = json(`select public.d1_load_transaction_history_state('${id(100)}','${pool}');`), credits = json(`select public.d1_load_operating_credit_state('${id(100)}','${pool}');`);
    const commitment = json(fee()).commitment, originalDonation = { donor: pool, asset: { type: 'native' }, amountStroops: '20000000', operationId: '1', transactionHash: '1'.repeat(64), confirmedAt: now };
    const anchor = { sequence: 900, hash: 'b'.repeat(64), closedAt: now };
    const snapshot = { kind: 'd1_initial_financial_snapshot', revision: 1, namespace: id(100), network: 'TESTNET', pool, requestId: id(1), anchor, observedAt: now, expiresAt: now + 30,
      commitment, historyState: history, creditState: credits, creation: { kind: 'opaque_fixture_NOT_SDK_proof' }, originalDonation,
      account: { pool, networkPassphrase: 'Test SDF Network ; September 2015', anchor, sequence: '10', baseFee: '100' },
      obligations: { donations: [structuredClone(originalDonation)] }, unissuedRefundOperationIds: ['1'], unissuedRefundFeeStroops: '100',
      budget: { otherFutureFees: '100', transactionFee: '100', newFutureRefundFee: '300' } };
    const before = state(), races = await Promise.all([concurrent(save(snapshot)), concurrent(save(snapshot))]);
    for (const r of races) { assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); }
    const receipt = JSON.parse(races[0].stdout.replace(/^SET\r?\n/, '')); assert.deepEqual(JSON.parse(races[1].stdout.replace(/^SET\r?\n/, '')), receipt);
    storedHash = receipt.snapshot_hash; assert.match(storedHash, /^[0-9a-f]{64}$/); assert.deepEqual(receipt.snapshot, snapshot); assert.equal(receipt.transaction_hash, 'a'.repeat(64)); assert.equal(receipt.authorized_by, pool);
    assert.deepEqual(json(load(storedHash)).observation, receipt); assert.deepEqual(json(load(storedHash, 3)).observation, null);
    const after = state(); assert.deepEqual(after.unsigned, before.unsigned); assert.deepEqual(after.fees, before.fees);
    const fresh = structuredClone(snapshot); fresh.observedAt++; const renewal = json(save(fresh)); assert.notEqual(renewal.snapshot_hash, storedHash);
    assert.deepEqual(json(load(renewal.snapshot_hash)).observation, renewal); assert.deepEqual(json(load(storedHash)).observation, receipt); assert.deepEqual(state().fees, before.fees);
    for (const mutate of [s => { s.namespace = id(101); }, s => { s.commitment.future_refund_fee_stroops = '301'; }, s => { s.historyState.page_count++; }, s => { s.creditState.set_hash = 'f'.repeat(64); }]) {
      const v = structuredClone(snapshot); mutate(v); rejected(save(v), 'initial_financial_observation_conflict');
    }
    for (const mutate of [s => { s.observedAt = '1'; }, s => { s.expiresAt = now + 301; }, s => { s.unissuedRefundFeeStroops = '0'; }, s => { s.unissuedRefundFeeStroops = '9223372036854775808'; s.budget.otherFutureFees = s.unissuedRefundFeeStroops; }, s => { s.unissuedRefundFeeStroops = 100; s.budget.otherFutureFees = 100; }, s => { s.unissuedRefundOperationIds = []; }, s => { s.budget.transactionFee = '101'; }, s => { s.account.sequence = '11'; }]) {
      const v = structuredClone(snapshot); mutate(v); rejected(save(v), 'invalid_initial_financial_observation');
    }
    const expression = `jsonb_set(${lit(snapshot)},'{creation,oversize}',to_jsonb(repeat('X',1048576)))`;
    const oversized = `select public.d1_record_initial_financial_observation('${id(1)}','${pool}',${expression});`; candidates.set(oversized, { expression, n: 1 });
    rejected(oversized, 'invalid_initial_financial_observation');
    rejected(save(null), 'invalid_initial_financial_observation'); rejected(save(snapshot, 2), 'd1_issuance_sequence_not_found'); rejected(save(snapshot, 3), 'd1_unsigned_transaction_not_found');
    const expired = structuredClone(snapshot); expired.observedAt = now - 1; expired.expiresAt = now; rejected(save(expired), 'initial_financial_observation_expired');
    for (const isolation of ['repeatable read', 'serializable']) {
      const v = structuredClone(snapshot); v.observedAt += 2; rejected(`begin isolation level ${isolation}; ${save(v)}`, 'initial_financial_observation_isolation_required');
      const replay = sql(`begin isolation level ${isolation}; ${save(snapshot)} commit;`).split('\n'); assert.equal(replay[0], 'BEGIN'); assert.equal(replay[2], 'COMMIT'); assert.deepEqual(JSON.parse(replay[1]), receipt);
    }
    for (const role of ['anon', 'authenticated']) { rejected(load(storedHash), 'permission denied for function d1_load_initial_financial_observation', role); rejected(save(snapshot), 'permission denied for function d1_record_initial_financial_observation', role); }
    for (const role of ['anon', 'authenticated', 'service_role']) for (const q of ['select * from public.d1_initial_financial_observations;', 'delete from public.d1_initial_financial_observations;', 'update public.d1_initial_financial_observations set receipt=receipt;']) rejected(q, 'permission denied for table d1_initial_financial_observations', role);
    assert.deepEqual(json(save(snapshot, 1, other)), receipt); sql(`delete from public.admin_wallets where public_key = '${other}';`, null);
    rejected(load(storedHash, 1, other), 'unauthorized_admin_wallet'); rejected(save(null, 1, other), 'unauthorized_admin_wallet');
    // Public state advance, then an event-driven owned lock proves freshness AFTER waiting.
    const advancedNow = Math.floor(Date.now() / 1000), advanced = { ...page, through_ledger: 901, ledger_hash: 'c'.repeat(64), closed_at: advancedNow };
    sql(`select public.d1_record_discovery_page('${id(100)}','${pool}',${lit(advanced)}); select public.d1_record_transaction_page('${id(100)}','${pool}',${lit(advanced)});`);
    const stale = structuredClone(snapshot); stale.observedAt += 3; rejected(save(stale), 'initial_financial_observation_conflict');
    const timed = structuredClone(snapshot); timed.historyState = json(`select public.d1_load_transaction_history_state('${id(100)}','${pool}');`); timed.creditState = json(`select public.d1_load_operating_credit_state('${id(100)}','${pool}');`);
    timed.anchor = { sequence: 901, hash: 'c'.repeat(64), closedAt: advancedNow }; timed.account.anchor = structuredClone(timed.anchor); timed.observedAt = advancedNow; timed.expiresAt = advancedNow + 2;
    const stable = state(), marker = path.join(fixture, 'lock-held'), ready = Promise.withResolvers(); let held = false;
    timed.observedAt = Math.floor(Date.now() / 1000); timed.expiresAt = timed.observedAt + 3;
    const timedHash = sql(`select encode(sha256(convert_to((${lit(timed)})::text,'UTF8')),'hex');`); assert.equal(json(load(timedHash)).observation, null);
    const watch = fs.watch(fixture, (_event, name) => { if (name === 'lock-held' && fs.existsSync(marker)) { held = true; ready.resolve(); } });
    try {
      const blocker = concurrent(`begin; select public.d1_load_unsigned_transaction('${id(1)}','${pool}'); copy(select 1) to '${marker}'; select pg_sleep(4); commit;`, false);
      await Promise.race([ready.promise, blocker.then(() => { assert.equal(held, true, 'Locker exited before readiness'); })]);
      assert.equal(sql(`select extract(epoch from clock_timestamp()) < ${timed.expiresAt};`), 't');
      const [lock, writer] = await Promise.all([blocker, concurrent(save(timed))]); assert.equal(lock.status, 0, lock.stderr); assert.equal(lock.stderr, '');
      assert.equal(writer.status, 1); assert.equal(writer.stdout, 'SET\n'); assert.equal(writer.stderr, 'ERROR:  initial_financial_observation_expired\n'); assert.deepEqual(state(), stable); assert.equal(json(load(timedHash)).observation, null);
    } finally { watch.close(); }
    // One bounded SQL clock wait proves *actual* expired replay, never a fake timestamp override.
    sql(`select pg_sleep(greatest(0, ${snapshot.expiresAt} - extract(epoch from clock_timestamp()) + 0.02));`);
    assert.equal(sql(`select extract(epoch from clock_timestamp()) > ${snapshot.expiresAt};`), 't');
    assert.deepEqual(json(save(snapshot)), receipt); assert.deepEqual(json(load(storedHash)).observation, receipt);
    console.log('INITIAL_FINANCIAL_OBSERVATION_SCOPE_REPLAY_FRESHNESS_ISOLATION_OK');
  } finally { process.removeListener('SIGTERM', terminate); cleanup(); }
});
