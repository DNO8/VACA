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
test('one-shot private submission claims preserve immutable ownership and historical evidence', async () => {
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-submission-')), data = path.join(fixture, 'data'), children = [];
  let pid, started = false, cleanupPromise;
  const args = ['-X', '--no-password', ...connectionArgs, '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '-At'];
  const run = (tool, a) => { const r = spawnSync(process.execPath, [launcher, tool, ...a], { env, encoding: 'utf8', timeout: 10000 }); assert.ifError(r.error); return r; };
  const ok = (tool, a) => { const r = run(tool, a); assert.equal(r.status, 0, r.stderr + r.stdout); assert.equal(r.stderr, ''); return r.stdout.trim(); };
  const sql = (q, role = 'service_role') => ok('psql', [...args, '-c', (role ? `set role ${role}; ` : '') + q]).replace(/^SET\r?\n/, '');
  const json = q => JSON.parse(sql(q)), clock = () => Number(sql('select extract(epoch from clock_timestamp());'));
  const load = (n, actor = admin) => `select public.d1_load_submission_attempt('${id(n)}','${actor}');`;
  const claim = (n, hash, nonce, actor = admin) => `select public.d1_claim_submission_attempt('${id(n)}','${actor}',${text(hash)},${text(nonce)});`;
  const unsigned = n => `public.d1_load_unsigned_transaction('${id(n)}','${admin}')`;
  const fees = n => `public.d1_load_issuance_fee_commitments('${id(n)}','${admin}')`;
  const signed = n => `public.d1_load_signed_transaction('${id(n)}','${admin}')`;
  const inputs = new Map();
  const state = n => json(`select jsonb_build_object('attempt',public.d1_load_submission_attempt('${id(n)}','${admin}'),
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
    // Apply actual available015..031; absent031 must fail at its PUBLIC RPC, not filesystem access.
    for (const name of fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(n => /^0(1[5-9]|2[0-9]|3[01])_/.test(n)).sort()) apply(name, fs.readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8'));
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
    seed(1);
    const empty = n => ({ kind: 'd1_submission_attempt_lookup', revision: 1, request_id: id(n), namespace: id(100 + n), network: 'TESTNET', pool: key(n), attempt: null });
    assert.deepEqual(json(load(1)), empty(1)); // Intended RED: d1_load_submission_attempt is missing.
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
    const a = observation(1), signedA = sign(1, a), nonce = randomUUID();
    for (const role of ['anon', 'authenticated']) {
      rejected(1, load(1), 'permission denied for function d1_load_submission_attempt', { role });
      rejected(1, claim(1, a.snapshot_hash, nonce), 'permission denied for function d1_claim_submission_attempt', { role });
    }
    for (const role of ['anon', 'authenticated', 'service_role']) for (const q of ['select * from public.d1_submission_attempts;', 'insert into public.d1_submission_attempts default values;', 'update public.d1_submission_attempts set receipt=receipt;', 'delete from public.d1_submission_attempts;'])
      rejected(1, q, 'permission denied for table d1_submission_attempts', { role });
    assert.equal(sql(`select relrowsecurity from pg_class where oid='public.d1_submission_attempts'::regclass;`, null), 't');
    sql(`delete from public.admin_wallets where public_key='${other}';`, null);
    rejected(1, load(1, other), 'unauthorized_admin_wallet'); rejected(1, claim(1, null, null, other), 'unauthorized_admin_wallet');
    sql(`insert into public.admin_wallets values ('${other}');`, null);
    for (const hash of [null, '', 'A'.repeat(64), 'a'.repeat(63)]) rejected(1, claim(1, hash, nonce), 'invalid_submission_attempt');
    rejected(1, claim(1, a.snapshot_hash, null), 'invalid_submission_attempt');
    rejected(1, claim(1, '0'.repeat(64), nonce), 'd1_initial_financial_observation_not_found');
    for (const isolation of ['repeatable read', 'serializable']) rejected(1, claim(1, a.snapshot_hash, nonce), 'submission_attempt_isolation_required', { prefix: `begin isolation level ${isolation}; `, output: 'BEGIN\n' });
    const b = observation(1, 0, 5); assert.notEqual(b.snapshot_hash, signedA.snapshot_hash);
    rejected(1, claim(1, a.snapshot_hash, nonce), 'initial_financial_observation_conflict');
    const before = state(1), lower = clock(), first = json(claim(1, b.snapshot_hash, nonce)), upper = clock();
    assert.deepEqual(Object.keys(first).sort(), ['kind', 'revision', 'claimed', 'attempt'].sort()); assert.equal(first.kind, 'd1_submission_claim'); assert.equal(first.revision, 1); assert.equal(first.claimed, true);
    const receipt = first.attempt;
    assert.deepEqual(receipt, { kind: 'd1_submission_attempt', revision: 1, request_id: id(1), namespace: id(101), network: 'TESTNET', pool: key(1), authorized_by: admin,
      transaction_hash: signedA.transaction_hash, envelope_hash: signedA.envelope_hash, snapshot_hash: b.snapshot_hash, attempt_id: nonce, claimed_at: receipt.claimed_at, reservation: before.unsigned.reservation });
    const claimedAt = receipt.claimed_at; assert.equal(typeof claimedAt, 'number'); assert.ok(Number.isSafeInteger(claimedAt));
    assert.ok(claimedAt >= Math.floor(lower) && claimedAt <= Math.floor(upper), 'claimed_at is UTC epoch seconds bounded by actual DB clock');
    assert.deepEqual(state(1), { ...before, attempt: { ...empty(1), attempt: receipt } });
    const replay = q => assert.deepEqual(json(q), { ...first, claimed: false });
    replay(claim(1, b.snapshot_hash, nonce)); replay(claim(1, a.snapshot_hash, randomUUID(), other)); replay(claim(1, '0'.repeat(64), randomUUID()));
    for (const isolation of ['repeatable read', 'serializable']) {
      const r = run('psql', [...args, '-c', `set role service_role; begin isolation level ${isolation}; ${claim(1, b.snapshot_hash, nonce, other)} commit;`]);
      assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); const lines = r.stdout.split('\n');
      assert.deepEqual(lines.slice(0, 2), ['SET', 'BEGIN']); assert.deepEqual(lines.slice(3), ['COMMIT', '']); assert.deepEqual(JSON.parse(lines[2]), { ...first, claimed: false });
    }
    const c = observation(1); replay(claim(1, c.snapshot_hash, randomUUID(), other)); const rotatedState = state(1);
    sql(`delete from public.admin_wallets where public_key='${admin}';`, null);
    assert.deepEqual(json(load(1, other)), { ...empty(1), attempt: receipt });
    const denied = run('psql', [...args, '-c', `set role service_role; ${claim(1, null, null)}`]);
    assert.equal(denied.status, 1); assert.equal(denied.stdout, 'SET\n'); assert.equal(denied.stderr, 'ERROR:  unauthorized_admin_wallet\n');
    sql(`insert into public.admin_wallets values ('${admin}');`, null); assert.deepEqual(json(load(1)), { ...empty(1), attempt: receipt }); assert.deepEqual(state(1), rotatedState);
    seed(2); const unsignedOnly = observation(2);
    rejected(2, claim(2, unsignedOnly.snapshot_hash, randomUUID()), 'd1_signed_transaction_not_found'); sign(2, unsignedOnly);
    rejected(2, claim(2, unsignedOnly.snapshot_hash, nonce), 'submission_attempt_conflict'); assert.deepEqual(json(load(1)), { ...empty(1), attempt: receipt });
    seed(3); const raceEvidence = observation(3); sign(3, raceEvidence); const raceBefore = state(3), nonces = [randomUUID(), randomUUID()], raceLower = clock();
    const held = await marked('first-claim', `begin; set role service_role; ${claim(3, raceEvidence.snapshot_hash, nonces[0])}`);
    const contender = await marked('second-started', "set application_name='submission-race'; set role service_role;");
    await dispatchBlocked(contender, 'submission-race', claim(3, raceEvidence.snapshot_hash, nonces[1], other)); held.send('commit;', true);
    const results = await Promise.all([held.done, contender.done]), raceUpper = clock();
    assert.equal(results[0].status, 0, results[0].stderr); assert.equal(results[1].status, 0, results[1].stderr);
    assert.deepEqual(results[0].stdout.split('\n').filter((_, i) => i !== 2), ['BEGIN', 'SET', 'COPY 1', 'COMMIT', '']);
    assert.deepEqual(results[1].stdout.split('\n').slice(0, 3), ['SET', 'SET', 'COPY 1']); assert.equal(results[1].stdout.split('\n').length, 5);
    assert.equal(results[0].stderr, ''); assert.equal(results[1].stderr, '');
    const winner = JSON.parse(results[0].stdout.split('\n')[2]), loser = JSON.parse(results[1].stdout.split('\n')[3]);
    assert.deepEqual(winner, { kind: 'd1_submission_claim', revision: 1, claimed: true, attempt: winner.attempt }); assert.deepEqual(loser, { ...winner, claimed: false });
    assert.deepEqual(winner.attempt, { ...receipt, request_id: id(3), namespace: id(103), pool: key(3), snapshot_hash: raceEvidence.snapshot_hash, attempt_id: nonces[0], claimed_at: winner.attempt.claimed_at, reservation: raceBefore.unsigned.reservation });
    const raceAt = winner.attempt.claimed_at; assert.equal(typeof raceAt, 'number'); assert.ok(Number.isSafeInteger(raceAt));
    assert.ok(raceAt >= Math.floor(raceLower) && raceAt <= Math.floor(raceUpper)); assert.deepEqual(state(3), { ...raceBefore, attempt: { ...empty(3), attempt: winner.attempt } });
    seed(4); const expiryA = observation(4); sign(4, expiryA);
    // Keep the current029 anchor/owner bindings; only shorten a NEW observation's TTL.
    // A backwards closed_at would violate019 before exercising the intended lock rule.
    const expirySnapshot = { ...expiryA.snapshot, expiresAt: Math.floor(clock()) + 2, creation: { kind: 'opaque_fixture_NOT_SDK_proof', stage: 'expiryB' } };
    const expiryB = json(`select public.d1_record_initial_financial_observation('${id(4)}','${admin}',${lit(expirySnapshot)});`), expiryBefore = state(4);
    assert.ok(clock() < expiryB.snapshot.expiresAt, 'aged snapshot valid before owner lock');
    const owner = await marked('owner-held', `begin; select receipt from public.d1_issuance_sequences where request_id='${id(4)}' for update;`);
    const writer = await marked('expiry-writer-started', "set application_name='submission-expiry'; set role service_role;");
    const errorLine = await dispatchBlocked(writer, 'submission-expiry', claim(4, expiryB.snapshot_hash, randomUUID()));
    assert.ok(clock() < expiryB.snapshot.expiresAt, 'writer actually blocked on owner while snapshot still fresh');
    owner.send(`select pg_sleep(greatest(0, ${expiryB.snapshot.expiresAt} - extract(epoch from clock_timestamp()) + 0.05)); commit;`, true);
    const [lockResult, expired] = await Promise.all([owner.done, writer.done]);
    assert.equal(lockResult.status, 0, lockResult.stderr); assert.equal(lockResult.stderr, ''); assert.equal(expired.status, 3); assert.equal(expired.stdout, 'SET\nSET\nCOPY 1\n');
    assert.equal(expired.stderr, `psql:${writer.file}:${errorLine}: ERROR:  initial_financial_observation_expired\n`);
    assert.deepEqual(state(4), expiryBefore); assert.deepEqual(json(load(4)), empty(4));
    rejected(4, claim(4, expiryB.snapshot_hash, randomUUID()), 'initial_financial_observation_expired');
    sql(`select pg_sleep(greatest(0, ${b.snapshot.expiresAt} - extract(epoch from clock_timestamp()) + 0.01));`);
    replay(claim(1, b.snapshot_hash, nonce, other)); assert.deepEqual(json(load(1)), { ...empty(1), attempt: receipt });
    console.log('SUBMISSION_ONE_SHOT_AUTH_IMMUTABILITY_NONCE_RACE_OWNER_EXPIRY_OK');
  } finally { process.removeListener('SIGTERM', terminate); await cleanup(); }
});
