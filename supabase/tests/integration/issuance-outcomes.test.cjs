// Owned opaque SQL fixture only: NOT SDK proof, broadcast, terminal state or CB evidence.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawnSync, spawn } = require('node:child_process'), { createHash, randomUUID } = require('node:crypto');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime(), repo = path.resolve(__dirname, '../../..');
const admin = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', other = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const text = v => v === null ? 'null' : "'" + v.replaceAll("'", "''") + "'", lit = v => text(JSON.stringify(v)) + '::jsonb';
// Synthetic PUBLIC StrKeys only; no private keys or real accounts.
function key(n) {
  const bytes = [48, ...Array(32).fill(n)]; let crc = 0;
  for (const b of bytes) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 32768) ? 4129 : 0)) & 65535; }
  bytes.push(crc & 255, crc >> 8); const bits = bytes.map(b => b.toString(2).padStart(8, '0')).join('');
  let result = ''; for (let i = 0; i < bits.length; i += 5) result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i, i + 5), 2)]; return result;
}
test('immutable opaque issuance outcomes bind attempts and ingested records without settling funds', async () => {
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-outcome-')), data = path.join(fixture, 'data'), children = [];
  let pid, started = false, cleanupPromise;
  const args = ['-X', '--no-password', ...connectionArgs, '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '-At'];
  const run = (tool, a, timeout = 10000) => { const r = spawnSync(process.execPath, [launcher, tool, ...a], { env, encoding: 'utf8', timeout }); assert.ifError(r.error); return r; };
  const ok = (tool, a) => { const r = run(tool, a); assert.equal(r.status, 0, r.stderr + r.stdout); assert.equal(r.stderr, ''); return r.stdout.trim(); };
  const sql = (q, role = 'service_role') => ok('psql', [...args, '-c', (role ? `set role ${role}; ` : '') + q]).replace(/^SET\r?\n/, '');
  const json = q => JSON.parse(sql(q)), clock = () => Number(sql('select extract(epoch from clock_timestamp());'));
  const load = (n, actor = admin) => `select public.d1_load_submission_attempt('${id(n)}','${actor}');`;
  const claim = (n, hash, nonce, actor = admin) => `select public.d1_claim_submission_attempt('${id(n)}','${actor}',${text(hash)},${text(nonce)});`;
  const unsigned = n => `public.d1_load_unsigned_transaction('${id(n)}','${admin}')`;
  const fees = n => `public.d1_load_issuance_fee_commitments('${id(n)}','${admin}')`;
  const signed = n => `public.d1_load_signed_transaction('${id(n)}','${admin}')`;
  const inputs = new Map();
  const state = n => json(`select jsonb_build_object('outcome',public.d1_load_issuance_outcome('${id(n)}','${admin}'),'attempt',public.d1_load_submission_attempt('${id(n)}','${admin}'),
    'unsigned',${unsigned(n)},'signed',${signed(n)},'fees',${fees(n)},'preparation',public.d1_prepare(${lit(inputs.get(n))}),
    'intent',public.d1_register_issuance_intent('${id(n)}','${admin}'),
    'history',public.d1_load_transaction_history_state('${id(100 + n)}','${admin}'),
    'credits',public.d1_load_operating_credit_state('${id(100 + n)}','${admin}'));`);
  const rejected = (n, q, error, { role = 'service_role', prefix = '', output = '' } = {}) => {
    const before = state(n), r = run('psql', [...args, '-c', prefix + `set role ${role}; ` + q]);
    assert.equal(r.status, 1); assert.equal(r.stdout, output + 'SET\n'); assert.equal(r.stderr, `ERROR:  ${error}\n`);
    assert.deepEqual(state(n), before, 'rejection preserves attempt, principal, source owner, fees and all evidence');
  };
  // Explicit FIFO input: trusted launcher ignores stdin and buffers stdout.
  const session = source => {
    const file = path.join(fixture, `session-${children.length}.fifo`);
    const mk = spawnSync('mkfifo', ['--mode=600', file], { env, encoding: 'utf8', timeout: 1000 });
    assert.ifError(mk.error); assert.equal(mk.status, 0, mk.stderr); assert.equal(mk.stdout, ''); assert.equal(mk.stderr, '');
    assert.ok(fs.lstatSync(file).isFIFO()); assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const p = spawn(process.execPath, [launcher, 'psql', ...args, '-f', file], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; p.stdout.on('data', b => stdout += b); p.stderr.on('data', b => stderr += b);
    const s = { file, line: 0 }, writer = fs.createWriteStream(file, { flags: fs.constants.O_RDWR | fs.constants.O_NONBLOCK });
    s.writer = writer; s.closed = new Promise(r => writer.on('close', r)); writer.on('error', e => { s.error = e; });
    s.done = new Promise(r => { p.on('error', e => { s.error = e; }); p.on('close', status => r({ status, stdout, stderr })); });
    s.send = (q, end = false) => { s.line += (q + '\n').split('\n').length - 1; if (end) writer.end(q + '\n'); else writer.write(q + '\n'); return s.line; };
    children.push(s); s.send(source); return s;
  };
  // Client-side copy needs no server-file grant; watch before the session starts.
  const marked = async (name, source) => {
    const marker = path.join(fixture, name); let ready;
    const signal = new Promise(r => { ready = r; });
    const watch = fs.watch(fixture, (_event, file) => { if (file === name && fs.existsSync(marker)) ready(); });
    const s = session(source + `\n\\copy (select 1) to '${marker}'`);
    let timer;
    try { await Promise.race([signal, s.done.then(r => { throw Error('session exited before COPY marker: ' + JSON.stringify(r)); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('COPY marker timeout: ' + name)), 5000); })]); assert.ifError(s.error); return s; }
    finally { clearTimeout(timer); watch.close(); }
  };
  // Observe PostgreSQL's ACTUAL lock wait, not just a pre-dispatch COPY marker.
  const dispatchBlocked = async (s, app, q) => {
    const log = path.join(fixture, 'postgres.log'), offset = fs.statSync(log).size;
    let ready, timer;
    const signal = new Promise(resolve => { ready = resolve; });
    const watch = fs.watch(log, () => {
      const appended = fs.readFileSync(log, 'utf8').slice(offset);
      if (appended.split('\n').some(line => line.startsWith(app + ':LOG:  process ') && line.includes(' still waiting for '))) ready();
    });
    try {
      const line = s.send(q, true); // Watcher is armed BEFORE dispatch; holder remains open.
      await Promise.race([signal, s.done.then(r => { throw Error('claim exited without observed contention: ' + JSON.stringify(r)); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('lock-log timeout: ' + app)), 5000); })]);
      assert.ifError(s.error); return line;
    } finally { clearTimeout(timer); watch.close(); }
  };
  const cleanup = () => cleanupPromise ||= (async () => {
    for (const s of children) if (!s.writer.writableEnded && !s.writer.destroyed) s.writer.end();
    await Promise.all(children.map(s => s.closed));
    const file = path.join(data, 'postmaster.pid'); if (!pid && fs.existsSync(file)) pid = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
    if (started || fs.existsSync(file)) { ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']); started = false; }
    await Promise.all(children.map(s => s.done));
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    fs.rmSync(fixture, { recursive: true, force: true }); assert.equal(fs.existsSync(fixture), false);
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);
  })();
  const terminate = () => { cleanup().then(() => process.exit(143), e => { console.error(e); process.exit(1); }); }; process.once('SIGTERM', terminate);
  try {
    ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c log_lock_waits=on -c deadlock_timeout=100ms -c log_line_prefix=%a:`,  '-w', '-t', '5', 'start']); started = true;
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    const apply = (name, q) => { const file = path.join(fixture, name); fs.writeFileSync(file, q); ok('psql', [...args, '-q', '-f', file]); };
    apply('fixture.sql', `create role anon; create role authenticated; create role service_role;
      create table public.admin_wallets(public_key text primary key); create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}'),('${other}'); insert into public.incidents values ('submission','vaquita','${admin}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const v of ['014', '20261011060218']) apply(v + '.sql', retained.migrations.find(m => m.version === v).statements.join(';\n'));
    // Apply actual available015..032; absent032 fails at its PUBLIC RPC, not filesystem access.
    for (const name of fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(n => /^0(1[5-9]|2[0-9]|3[0-2])_/.test(n)).sort()) apply(name, fs.readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8'));
    const confirmed = Math.floor(clock()), deadline = new Date((confirmed + 300) * 1000).toISOString().replace('.000Z', 'Z');
    const seed = n => {
      const pool = key(n), input = { request_id: id(n), authorized_by: admin, confirmed_at: confirmed, ledger: 900,
        memo_hash: createHash('sha256').update('vaca.d1.donation.v1\nsubmission').digest('hex'),
        payment: { transaction_hash: String(n).repeat(64), operation_id: String(n), donor: admin, pool, amount: '2.0000000', asset: { type: 'native' } },
        request: { version: 1, incident_id: 'submission', donor: admin, beneficiary: admin, amount: '1.0000000', asset: { type: 'native' }, deadline } };
      inputs.set(n, input);
      sql(`select public.d1_activate_pool('${id(100 + n)}','${pool}',900); select public.d1_prepare(${lit(input)});
        select public.d1_register_issuance_intent('${id(n)}','${admin}'); select public.d1_reserve_issuance_sequence('${id(n)}','${admin}','10');
        select public.d1_save_unsigned_transaction('${id(n)}','${admin}','AAAA','${'a'.repeat(64)}'); select public.d1_record_issuance_fee_commitment('${id(n)}','${admin}','100','300');`);
    };

    const outcomeLoad = (n, actor = admin) => `select public.d1_load_issuance_outcome('${id(n)}','${actor}');`;
    const record = (n, value, actor = admin) => `select public.d1_record_issuance_outcome('${id(n)}','${actor}',${lit(value)});`;
    const empty = n => ({ kind: 'd1_issuance_outcome_lookup', revision: 1, request_id: id(n), namespace: id(100 + n), network: 'TESTNET', pool: key(n), outcome: null });
    seed(1); assert.deepEqual(json(outcomeLoad(1)), empty(1)); // Intended RED: missing PUBLIC032 RPC.
    const ledgers = new Map();
    const observation = (n, age = 0, ttl = 30) => {
      const at = Math.floor(clock()) - age, ledger = (ledgers.get(n) || 899) + 1; ledgers.set(n, ledger);
      const page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: ledger, ledger_hash: ledger.toString(16).padStart(64, '0'), closed_at: at, records: [] };
      sql(`select public.d1_record_discovery_page('${id(100 + n)}','${admin}',${lit(page)}); select public.d1_record_transaction_page('${id(100 + n)}','${admin}',${lit(page)});`);
      const anchor = { sequence: ledger, hash: page.ledger_hash, closedAt: at }, pool = key(n);
      const donation = { donor: admin, asset: { type: 'native' }, amountStroops: '20000000', operationId: String(n), transactionHash: String(n).repeat(64), confirmedAt: confirmed };
      const snapshot = { kind: 'd1_initial_financial_snapshot', revision: 1, namespace: id(100 + n), network: 'TESTNET', pool, requestId: id(n), anchor, observedAt: at, expiresAt: at + ttl,
        commitment: json(`select ${fees(n)};`).commitment, historyState: json(`select public.d1_load_transaction_history_state('${id(100 + n)}','${admin}');`),
        creditState: json(`select public.d1_load_operating_credit_state('${id(100 + n)}','${admin}');`), creation: { kind: 'opaque_fixture_NOT_SDK_proof' }, originalDonation: donation,
        account: { pool, networkPassphrase: 'Test SDF Network ; September 2015', anchor, sequence: '10', baseFee: '100' }, obligations: { donations: [structuredClone(donation)] },
        unissuedRefundOperationIds: [String(n)], unissuedRefundFeeStroops: '100', budget: { otherFutureFees: '100', transactionFee: '100', newFutureRefundFee: '300' } };
      return json(`select public.d1_record_initial_financial_observation('${id(n)}','${admin}',${lit(snapshot)});`);
    };
    const sign = (n, evidence) => json(`select public.d1_record_signed_transaction('${id(n)}','${admin}','${evidence.snapshot_hash}','AQID');`);

    const historyRecord = (n, failed = false) => {
      const at = Math.floor(clock()), ledger = 901, ledgerHash = 'b'.repeat(64), token = String((901n << 32n) + 4096n);
      const time = new Date(at * 1000).toISOString().replace('.000Z', 'Z'), pool = key(n);
      const transaction = { hash: 'a'.repeat(64), paging_token: token, ledger, created_at: time, source_account: pool, source_account_sequence: '11',
        fee_account: pool, fee_charged: '100', max_fee: '100', successful: !failed, operation_count: 1, envelope_xdr: 'AQID', result_xdr: 'AAAA' };
      const value = { network: 'TESTNET', transactionHash: transaction.hash, source: pool, sequence: '11', feePayer: pool, feeChargedStroops: '100', feeBidStroops: '100',
        outcome: failed ? 'failed' : 'success', ledger, ledgerHash, closedAt: at, pagingToken: token, envelopeXdr: 'AQID', resultXdr: 'AAAA', operationTypes: [14],
        poolOperationSourceIndices: [0], raw: { transaction, ledger: { sequence: ledger, hash: ledgerHash, closed_at: time } },
        context: { pool, firstLedger: 900, anchor: { sequence: ledger, hash: ledgerHash, closedAt: at } } };
      const page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: ledger, ledger_hash: ledgerHash, closed_at: at, records: [] };
      sql(`select public.d1_record_discovery_page('${id(100 + n)}','${admin}',${lit(page)});
        select public.d1_record_transaction_page('${id(100 + n)}','${admin}',${lit({ ...page, to_cursor: token, records: [value] })});`);
      return { kind: 'd1_initial_issuance_outcome', revision: 1, observation: value, outcome: value.outcome, claimableBalanceId: failed ? null : '00000000' + String(n).repeat(64) };
    };
    const evidence = observation(1), signed1 = sign(1, evidence), attempt1 = json(claim(1, evidence.snapshot_hash, randomUUID())).attempt;
    const unrecorded = { kind: 'd1_initial_issuance_outcome', revision: 1, observation: {}, outcome: 'success', claimableBalanceId: '00000000' + '1'.repeat(64) };
    rejected(1, record(1, unrecorded), 'd1_transaction_observation_not_found');
    const value = historyRecord(1);
    for (const role of ['anon', 'authenticated']) {
      rejected(1, outcomeLoad(1), 'permission denied for function d1_load_issuance_outcome', { role });
      rejected(1, record(1, value), 'permission denied for function d1_record_issuance_outcome', { role });
    }
    for (const role of ['anon', 'authenticated', 'service_role']) for (const q of ['select * from public.d1_issuance_outcomes;', 'insert into public.d1_issuance_outcomes default values;', 'update public.d1_issuance_outcomes set receipt=receipt;', 'delete from public.d1_issuance_outcomes;'])
      rejected(1, q, 'permission denied for table d1_issuance_outcomes', { role });
    assert.equal(sql(`select relrowsecurity from pg_class where oid='public.d1_issuance_outcomes'::regclass;`, null), 't');
    sql(`delete from public.admin_wallets where public_key='${other}';`, null);
    rejected(1, outcomeLoad(1, other), 'unauthorized_admin_wallet'); rejected(1, record(1, null, other), 'unauthorized_admin_wallet');
    sql(`insert into public.admin_wallets values ('${other}');`, null);
    for (const bad of [null, [], {}, { ...value, extra: true }, { ...value, revision: '1' }, { ...value, kind: 'unknown' },
      { ...value, claimableBalanceId: null }, { ...value, claimableBalanceId: 'F'.repeat(72) }, { ...value, outcome: 'failed' }])
      rejected(1, record(1, bad), 'invalid_issuance_outcome');
    rejected(1, `select public.d1_record_issuance_outcome('${id(1)}','${admin}',jsonb_set(${lit(value)},'{observation,raw,transaction,padding}',to_jsonb(repeat('x',1048576))));`, 'invalid_issuance_outcome');
    for (const patch of [{ source: other }, { sequence: '12' }, { envelopeXdr: 'BAUG' }, { feeChargedStroops: '99' }, { ledgerHash: 'f'.repeat(64) }, { operationTypes: [10] }])
      rejected(1, record(1, { ...value, observation: { ...value.observation, ...patch } }), 'issuance_outcome_conflict');
    for (const isolation of ['repeatable read', 'serializable']) rejected(1, record(1, value), 'issuance_outcome_isolation_required', { prefix: `begin isolation level ${isolation}; `, output: 'BEGIN\n' });
    // Expired FINANCIAL snapshot is not a reason to reject late execution evidence.
    // Original five-minute donor deadline is structurally reviewed, not waited here.
    // Only this owned TTL wait may exceed the default10s command budget.
    const expired = run('psql', [...args, '-c', `set role service_role; select pg_sleep(greatest(0, ${evidence.snapshot.expiresAt} - extract(epoch from clock_timestamp()) + 0.01));`], 35000);
    assert.equal(expired.status, 0, expired.stderr); assert.equal(expired.stdout, 'SET\n\n'); assert.equal(expired.stderr, '');
    const before = state(1), first = json(record(1, value));
    assert.deepEqual(Object.keys(first).sort(), ['kind','revision','request_id','namespace','network','pool','authorized_by','attempt_id','transaction_hash','envelope_hash','outcome_hash','observed_outcome'].sort());
    assert.match(first.outcome_hash, /^[0-9a-f]{64}$/);
    assert.equal(first.outcome_hash, sql(`select encode(sha256(convert_to(${lit(value)}::text,'UTF8')),'hex');`));
    assert.deepEqual(first, { kind: 'd1_issuance_outcome_journal', revision: 1, request_id: id(1), namespace: id(101), network: 'TESTNET', pool: key(1), authorized_by: admin,
      attempt_id: attempt1.attempt_id, transaction_hash: signed1.transaction_hash, envelope_hash: signed1.envelope_hash, outcome_hash: first.outcome_hash, observed_outcome: value });
    assert.deepEqual(state(1), { ...before, outcome: { ...empty(1), outcome: first } });
    assert.deepEqual(json(record(1, Object.fromEntries(Object.entries(value).reverse()), other)), first);
    for (const isolation of ['repeatable read', 'serializable']) {
      const r = run('psql', [...args, '-c', `set role service_role; begin isolation level ${isolation}; ${record(1, value, other)} commit;`]);
      assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); const lines = r.stdout.split('\n');
      assert.deepEqual(lines.slice(0,2), ['SET','BEGIN']); assert.deepEqual(JSON.parse(lines[2]), first); assert.deepEqual(lines.slice(3), ['COMMIT','']);
    }
    rejected(1, record(1, { ...value, claimableBalanceId: '00000000' + 'f'.repeat(64) }), 'issuance_outcome_conflict');
    sql(`delete from public.admin_wallets where public_key='${admin}';`, null);
    assert.deepEqual(json(outcomeLoad(1, other)), { ...empty(1), outcome: first });
    const revoked = run('psql', [...args, '-c', `set role service_role; ${record(1, null)}`]);
    assert.equal(revoked.status, 1); assert.equal(revoked.stdout, 'SET\n'); assert.equal(revoked.stderr, 'ERROR:  unauthorized_admin_wallet\n');
    sql(`insert into public.admin_wallets values ('${admin}');`, null);
    seed(2); rejected(2, record(2, value), 'd1_submission_attempt_not_found');
    const e2 = observation(2); sign(2, e2); json(claim(2, e2.snapshot_hash, randomUUID())); const failed = historyRecord(2, true);
    rejected(2, record(2, value), 'issuance_outcome_conflict');
    const failedBefore = state(2), failure = json(record(2, failed)); assert.equal(failure.observed_outcome.claimableBalanceId, null);
    assert.equal(failure.observed_outcome.observation.feeChargedStroops, '100');
    assert.deepEqual(state(2), { ...failedBefore, outcome: { ...empty(2), outcome: failure } }); assert.deepEqual(json(outcomeLoad(1)), { ...empty(1), outcome: first });
    seed(3); const e3 = observation(3); sign(3, e3); json(claim(3, e3.snapshot_hash, randomUUID())); const racing = historyRecord(3), raceBefore = state(3);
    const holder = await marked('outcome-held', `begin; set role service_role; ${record(3, racing)}`);
    const contender = await marked('outcome-contender', "set application_name='outcome-race'; set role service_role;");
    await dispatchBlocked(contender, 'outcome-race', record(3, racing, other)); holder.send('commit;', true);
    const [a, b] = await Promise.all([holder.done, contender.done]); assert.equal(a.status, 0, a.stderr); assert.equal(b.status, 0, b.stderr);
    assert.equal(a.stderr, ''); assert.equal(b.stderr, '');
    assert.deepEqual(a.stdout.split('\n').filter((_, i) => i !== 2), ['BEGIN', 'SET', 'COPY 1', 'COMMIT', '']);
    assert.deepEqual(b.stdout.split('\n').slice(0, 3), ['SET', 'SET', 'COPY 1']); assert.equal(b.stdout.split('\n').length, 5);
    const original = JSON.parse(a.stdout.split('\n')[2]); assert.deepEqual(JSON.parse(b.stdout.split('\n')[3]), original);
    assert.equal(original.authorized_by, admin); assert.deepEqual(state(3), { ...raceBefore, outcome: { ...empty(3), outcome: original } });
    assert.deepEqual(json(outcomeLoad(1)), { ...empty(1), outcome: first });
    console.log('ISSUANCE_OUTCOME_AUTH_IMMUTABLE_RECORD_BINDING_ISOLATION_RACE_OK');
  } finally { process.removeListener('SIGTERM', terminate); await cleanup(); }
});
