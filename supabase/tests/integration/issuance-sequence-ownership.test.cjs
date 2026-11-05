// Owned PostgreSQL and opaque observations only: NOT SDK, consensus or release authority.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawnSync, spawn } = require('node:child_process'), { createHash, randomUUID } = require('node:crypto');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime(), repo = path.resolve(__dirname, '../../..');
const admin = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', other = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const text = v => v == null ? 'null' : "'" + String(v).replaceAll("'", "''") + "'", lit = v => text(JSON.stringify(v)) + '::jsonb';
// Synthetic public StrKeys; no signing material or real account observations.
function key(n) {
  const bytes = [48, ...Array(32).fill(n)]; let crc = 0;
  for (const b of bytes) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 32768) ? 4129 : 0)) & 65535; }
  bytes.push(crc & 255, crc >> 8); const bits = bytes.map(b => b.toString(2).padStart(8, '0')).join('');
  let result = ''; for (let i = 0; i < bits.length; i += 5) result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i, i + 5), 2)]; return result;
}
test('033 preserves populated reservation history and permanent active source ownership', async () => {
  const socket = net.createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port; await new Promise(r => socket.close(r));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-sequence-owner-')), data = path.join(fixture, 'data'), children = [], inputs = new Map(), namespaces = new Map();
  let pid, started = false, cleanupPromise, migrated = false;
  const args = ['-X', '--no-password', ...connectionArgs, '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '-At'];
  const run = (tool, a) => { const r = spawnSync(process.execPath, [launcher, tool, ...a], { env, encoding: 'utf8', timeout: 10000 }); assert.ifError(r.error); return r; };
  const ok = (tool, a) => { const r = run(tool, a); assert.equal(r.status, 0, r.stderr + r.stdout); assert.equal(r.stderr, ''); return r.stdout.trim(); };
  const sql = (q, role = 'service_role') => ok('psql', [...args, '-c', (role ? `set role ${role}; ` : '') + q]).replace(/^SET\r?\n/, '');
  const json = q => JSON.parse(sql(q)), clock = () => Number(sql('select extract(epoch from clock_timestamp());'));
  const call = (name, n, actor = admin) => `public.${name}('${id(n)}','${actor}')`;
  // psql prints SQL NULL as an empty field; render it as JSON null for assertions.
  const active = (namespace, actor = admin) => `select coalesce(${call('d1_load_active_issuance_sequence', namespace, actor)},'null'::jsonb);`;
  const reserve = (n, sequence = '10', actor = admin) => `select public.d1_reserve_issuance_sequence('${id(n)}','${actor}',${text(sequence)});`;
  const state = () => json(`select jsonb_build_object('requests',(select jsonb_agg(to_jsonb(t) order by request_id) from public.release_requests t),
    'payments',(select jsonb_agg(to_jsonb(t) order by transaction_hash,operation_id) from public.donation_payments t),
    'allocations',(select jsonb_agg(to_jsonb(t) order by request_id) from public.donation_allocations t),
    'active',${migrated ? `jsonb_build_array(${[...new Set(namespaces.values())].map(n => call('d1_load_active_issuance_sequence', n)).join(',')})` : 'null'},
    'evidence',jsonb_build_array(${[...inputs].map(([n, input]) => `jsonb_build_object('preparation',public.d1_prepare(${lit(input)}),
      'unsigned',${call('d1_load_unsigned_transaction', n)},'fees',${call('d1_load_issuance_fee_commitments', n)},
      'signed',${call('d1_load_signed_transaction', n)},'attempt',${call('d1_load_submission_attempt', n)},'outcome',${call('d1_load_issuance_outcome', n)})`).join(',')}));`);
  const rejected = (q, error, role = 'service_role') => {
    const before = state(), r = run('psql', [...args, '-c', `set role ${role}; ` + q]);
    assert.equal(r.status, 1); assert.equal(r.stdout, 'SET\n'); assert.equal(r.stderr, `ERROR:  ${error}\n`); assert.deepEqual(state(), before);
  };
  // Trusted launcher ignores stdin. Use existing FIFO/client-side marker pattern.
  const session = source => {
    const file = path.join(fixture, `session-${children.length}.fifo`);
    const mk = spawnSync('mkfifo', ['--mode=600', file], { env, encoding: 'utf8', timeout: 1000 });
    assert.ifError(mk.error); assert.equal(mk.status, 0, mk.stderr); assert.equal(mk.stdout, ''); assert.equal(mk.stderr, '');
    assert.ok(fs.lstatSync(file).isFIFO()); assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const p = spawn(process.execPath, [launcher, 'psql', ...args, '-f', file], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; p.stdout.on('data', b => stdout += b); p.stderr.on('data', b => stderr += b);
    const writer = fs.createWriteStream(file, { flags: fs.constants.O_RDWR | fs.constants.O_NONBLOCK }), s = { writer, file, line: 0 };
    writer.on('error', e => { s.error = e; }); s.closed = new Promise(r => writer.on('close', r));
    s.done = new Promise(r => { p.on('error', e => { s.error = e; }); p.on('close', status => r({ status, stdout, stderr })); });
    s.send = (q, end = false) => { s.line += (q + '\n').split('\n').length - 1; if (end) writer.end(q + '\n'); else writer.write(q + '\n'); return s.line; };
    children.push(s); s.send(source); return s;
  };
  const observe = async (file, predicate, action, done) => {
    let signal, timer; const ready = new Promise(r => { signal = r; });
    const watch = fs.watch(path.dirname(file), () => { if (fs.existsSync(file) && predicate(fs.readFileSync(file, 'utf8'))) signal(); });
    try { action(); await Promise.race([ready, done.then(r => { throw Error('session exited before marker: ' + JSON.stringify(r)); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('fixture marker timeout')), 5000); })]); }
    finally { clearTimeout(timer); watch.close(); }
  };
  const marked = async source => {
    const marker = path.join(fixture, `ready-${children.length}`), s = session(source);
    await observe(marker, () => true, () => s.send(`\\copy (select 1) to '${marker}'`), s.done); assert.ifError(s.error); return s;
  };
  const blocked = async (s, app, q) => {
    const log = path.join(fixture, 'postgres.log'), offset = fs.statSync(log).size; let line;
    await observe(log, content => content.slice(offset).split('\n').some(v => v.startsWith(app + ':LOG:  process ') && v.includes(' still waiting for ')),
      () => { line = s.send(q, true); }, s.done); assert.ifError(s.error); return line;
  };
  const successful = r => { assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); };
  const fileError = (s, line, r, message) => {
    assert.equal(r.status, 3); assert.equal(r.stdout, 'SET\nSET\nCOPY 1\n');
    assert.equal(r.stderr, `psql:${s.file}:${line}: ERROR:  ${message}\n`);
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
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c log_lock_waits=on -c deadlock_timeout=100ms -c log_line_prefix=%a:`, '-w', '-t', '5', 'start']); started = true;
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    const apply = (name, source) => { const file = path.join(fixture, name); fs.writeFileSync(file, source); ok('psql', [...args, '-q', '-f', file]); };
    apply('fixture.sql', `create role anon; create role authenticated; create role service_role;
      create table public.admin_wallets(public_key text primary key); create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}'),('${other}'); insert into public.incidents values ('sequence','vaquita','${admin}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const v of ['014', '20261011060218']) apply(v + '.sql', retained.migrations.find(m => m.version === v).statements.join(';\n'));
    for (const name of fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(n => /^0(1[5-9]|2[0-9]|3[0-2])_/.test(n)).sort()) apply(name, fs.readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8'));
    const seed = (n, namespace = 100 + n, seconds = 300) => {
      const confirmed = Math.floor(clock()) - (300 - seconds), pool = key(namespace), deadline = new Date((confirmed + 300) * 1000).toISOString().replace('.000Z', 'Z');
      const input = { request_id: id(n), authorized_by: admin, confirmed_at: confirmed, ledger: 900,
        memo_hash: createHash('sha256').update('vaca.d1.donation.v1\nsequence').digest('hex'),
        payment: { transaction_hash: n.toString(16).padStart(64, '0'), operation_id: String(n), donor: admin, pool, amount: '2.0000000', asset: { type: 'native' } },
        request: { version: 1, incident_id: 'sequence', donor: admin, beneficiary: admin, amount: '1.0000000', asset: { type: 'native' }, deadline } };
      sql(`select public.d1_activate_pool('${id(namespace)}','${pool}',900); select public.d1_prepare(${lit(input)}); select public.d1_register_issuance_intent('${id(n)}','${admin}');`);
      inputs.set(n, input); namespaces.set(n, namespace); return deadline;
    };
    // Populate the actual018/027/028/030/031/032 chain BEFORE033. No forged permits.
    seed(1); const reservation = json(reserve(1));
    const bytes = json(`select public.d1_save_unsigned_transaction('${id(1)}','${admin}','AAAA','${'a'.repeat(64)}');`);
    const fee = json(`select public.d1_record_issuance_fee_commitment('${id(1)}','${admin}','100','300');`);
    const at = Math.floor(clock()), anchor = { sequence: 900, hash: '9'.repeat(64), closedAt: at }, pool = key(101);
    const page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: 900, ledger_hash: anchor.hash, closed_at: at, records: [] };
    sql(`select public.d1_record_discovery_page('${id(101)}','${admin}',${lit(page)}); select public.d1_record_transaction_page('${id(101)}','${admin}',${lit(page)});`);
    const donation = { donor: admin, asset: { type: 'native' }, amountStroops: '20000000', operationId: '1', transactionHash: inputs.get(1).payment.transaction_hash, confirmedAt: inputs.get(1).confirmed_at };
    const snapshot = { kind: 'd1_initial_financial_snapshot', revision: 1, namespace: id(101), network: 'TESTNET', pool, requestId: id(1), anchor, observedAt: at, expiresAt: at + 30,
      commitment: fee, historyState: json(`select ${call('d1_load_transaction_history_state', 101)};`), creditState: json(`select ${call('d1_load_operating_credit_state', 101)};`),
      creation: { kind: 'opaque_fixture_NOT_SDK_proof' }, originalDonation: donation, account: { pool, networkPassphrase: 'Test SDF Network ; September 2015', anchor, sequence: '10', baseFee: '100' },
      obligations: { donations: [donation] }, unissuedRefundOperationIds: ['1'], unissuedRefundFeeStroops: '100', budget: { otherFutureFees: '100', transactionFee: '100', newFutureRefundFee: '300' } };
    const financial = json(`select public.d1_record_initial_financial_observation('${id(1)}','${admin}',${lit(snapshot)});`);
    const signed = json(`select public.d1_record_signed_transaction('${id(1)}','${admin}','${financial.snapshot_hash}','AQID');`);
    const attempt = json(`select public.d1_claim_submission_attempt('${id(1)}','${admin}','${financial.snapshot_hash}','${randomUUID()}');`).attempt;
    const closed = Math.floor(clock()), time = new Date(closed * 1000).toISOString().replace('.000Z', 'Z'), token = String((901n << 32n) + 4096n);
    const transaction = { hash: bytes.transaction_hash, paging_token: token, ledger: 901, created_at: time, source_account: pool, source_account_sequence: '11',
      fee_account: pool, fee_charged: '100', max_fee: '100', successful: true, operation_count: 1, envelope_xdr: 'AQID', result_xdr: 'AAAA' };
    const observation = { network: 'TESTNET', transactionHash: transaction.hash, source: pool, sequence: '11', feePayer: pool, feeChargedStroops: '100', feeBidStroops: '100',
      outcome: 'success', ledger: 901, ledgerHash: 'b'.repeat(64), closedAt: closed, pagingToken: token, envelopeXdr: 'AQID', resultXdr: 'AAAA', operationTypes: [14], poolOperationSourceIndices: [0],
      raw: { transaction, ledger: { sequence: 901, hash: 'b'.repeat(64), closed_at: time } }, context: { pool, firstLedger: 900, anchor: { sequence: 901, hash: 'b'.repeat(64), closedAt: closed } } };
    const later = { ...page, through_ledger: 901, ledger_hash: observation.ledgerHash, closed_at: closed };
    sql(`select public.d1_record_discovery_page('${id(101)}','${admin}',${lit(later)}); select public.d1_record_transaction_page('${id(101)}','${admin}',${lit({ ...later, to_cursor: token, records: [observation] })});`);
    const outcome = { kind: 'd1_initial_issuance_outcome', revision: 1, observation, outcome: 'success', claimableBalanceId: '00000000' + '1'.repeat(64) };
    const outcomeReceipt = json(`select public.d1_record_issuance_outcome('${id(1)}','${admin}',${lit(outcome)});`);
    seed(9, 101); // Unowned sibling must still see ALL namespace fee history.
    const expiry = seed(2, 102, 8), rivalExpiry = seed(3, 102, 8); seed(8, 102);
    const expiredOwner = json(reserve(2));
    sql(`select pg_sleep(greatest(0, extract(epoch from greatest('${expiry}'::timestamptz,'${rivalExpiry}'::timestamptz) - clock_timestamp()) + 0.01));`);
    assert.ok(clock() >= Math.max(Date.parse(expiry), Date.parse(rivalExpiry)) / 1000); const beforeMigration = state();
    const tables = () => JSON.parse(sql("select coalesce(jsonb_agg(tablename order by tablename),'[]') from pg_tables where schemaname='public';", null));
    const oldTables = tables(), migration = path.join(repo, 'supabase/migrations/033_d1_issuance_sequence_ownership.sql');
    if (fs.existsSync(migration)) apply(path.basename(migration), fs.readFileSync(migration, 'utf8'));
    // Intended public undefined_function RED with033 absent, not a filesystem assertion.
    assert.deepEqual(json(active(101)), reservation);
    assert.deepEqual(json(active(102, other)), expiredOwner, 'ALL old owners backfilled, even expired');
    assert.deepEqual(state(), beforeMigration, 'migration preserves all public receipts, actors, bytes, links and counters');
    migrated = true; const immutable = state();
    assert.deepEqual(json(reserve(2, '10', other)), expiredOwner);
    assert.deepEqual(json(`select public.d1_save_unsigned_transaction('${id(1)}','${other}','AAAA','${'a'.repeat(64)}');`), bytes);
    assert.deepEqual(json(`select public.d1_record_issuance_fee_commitment('${id(1)}','${other}','100','300');`), fee);
    assert.deepEqual(json(`select public.d1_record_signed_transaction('${id(1)}','${other}','${financial.snapshot_hash}','AQID');`), signed);
    assert.deepEqual(json(`select public.d1_claim_submission_attempt('${id(1)}','${other}',null,null);`), { kind: 'd1_submission_claim', revision: 1, claimed: false, attempt });
    assert.deepEqual(json(`select public.d1_record_issuance_outcome('${id(1)}','${other}',${lit(outcome)});`), outcomeReceipt);
    assert.deepEqual(state(), immutable);
    rejected(reserve(2, '11'), 'issuance_sequence_conflict'); rejected(reserve(3), 'deadline_expired'); rejected(reserve(8), 'issuance_source_busy');
    for (const bad of [null, '01', '-1', '9223372036854775807']) rejected(reserve(2, bad), 'invalid_issuance_sequence');
    // A new post033 namespace: same source races yield exactly one first owner.
    seed(4, 104); seed(5, 104); assert.equal(json(active(104)), null);
    const beforeRace = state(), holder = await marked(`begin; set role service_role; ${reserve(4)}`);
    const contender = await marked("set application_name='owner-race'; set role service_role;");
    const line = await blocked(contender, 'owner-race', reserve(5)); holder.send('commit;', true);
    const [winner, loser] = await Promise.all([holder.done, contender.done]); successful(winner); fileError(contender, line, loser, 'issuance_source_busy');
    const owner = JSON.parse(winner.stdout.split('\n')[2]);
    assert.deepEqual(winner.stdout.split('\n').filter((_, i) => i !== 2), ['BEGIN', 'SET', 'COPY 1', 'COMMIT', '']);
    assert.equal(owner.request_id, id(4)); assert.equal(owner.intent.preparation_input.authorized_by, admin);
    assert.deepEqual(json(active(104)), owner); assert.deepEqual(json(reserve(4, '10', other)), owner);
    const afterRace = state();
    assert.deepEqual(afterRace, { ...beforeRace, active: beforeRace.active.map((v, i) => [...new Set(namespaces.values())][i] === 104 ? owner : v),
      evidence: beforeRace.evidence.map((v, i) => [...inputs.keys()][i] === 4 ? { ...v, unsigned: { ...v.unsigned, reservation: owner }, fees: { ...v.fees, reservation: owner } } : v) });
    // Actual pool-lock wait crosses a short, valid five-minute-derived deadline.
    const waitDeadline = seed(6, 106, 8), beforeWait = state();
    const lock = await marked(`begin; set role service_role; select ${call('d1_load_unsigned_transaction', 6)};`);
    const waiting = await marked("set application_name='owner-expiry'; set role service_role;");
    const waitLine = await blocked(waiting, 'owner-expiry', reserve(6));
    sql(`select pg_sleep(greatest(0, extract(epoch from '${waitDeadline}'::timestamptz - clock_timestamp()) + 0.01));`);
    lock.send('commit;', true); successful(await lock.done); fileError(waiting, waitLine, await waiting.done, 'deadline_expired');
    assert.deepEqual(state(), beforeWait); assert.equal(json(active(106)), null);
    // Revocation wins the admin SHARE-lock wait; a saved receipt cannot bypass it.
    const beforeRevoke = state(), revoke = await marked(`begin; delete from public.admin_wallets where public_key='${other}';`);
    const revoked = await marked("set application_name='owner-revoked'; set role service_role;");
    const revokeLine = await blocked(revoked, 'owner-revoked', reserve(4, '10', other)); revoke.send('commit;', true);
    successful(await revoke.done); fileError(revoked, revokeLine, await revoked.done, 'unauthorized_admin_wallet');
    assert.deepEqual(state(), beforeRevoke); rejected(active(104, other), 'unauthorized_admin_wallet');
    rejected(reserve(4, null, other), 'invalid_issuance_sequence');
    rejected(`select public.d1_load_active_issuance_sequence(null,'${admin}');`, 'invalid_issuance_sequence');
    rejected(`select public.d1_load_active_issuance_sequence('${id(104)}','not-a-wallet');`, 'invalid_issuance_sequence');
    rejected(active(999), 'pool_not_activated');
    for (const role of ['anon', 'authenticated']) {
      rejected(active(104), 'permission denied for function d1_load_active_issuance_sequence', role);
      rejected(reserve(4), 'permission denied for function d1_reserve_issuance_sequence', role);
    }
    // Discover033's new table names, rather than imposing a private naming contract.
    const privateTables = ['d1_issuance_sequences', ...tables().filter(t => !oldTables.includes(t))];
    assert.ok(privateTables.length > 1, '033 introduces separate private active ownership');
    for (const table of privateTables) {
      assert.match(table, /^[a-z_][a-z0-9_]*$/);
      assert.equal(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass;`, null), 't');
      for (const role of ['anon', 'authenticated', 'service_role']) for (const q of [`select * from public.${table};`, `insert into public.${table} default values;`, `update public.${table} set namespace=namespace;`, `delete from public.${table};`])
        rejected(q, `permission denied for table ${table}`, role);
    }
    assert.deepEqual(json(`select ${call('d1_load_issuance_fee_commitments', 1)};`).commitments, [fee]);
    const siblingFees = json(`select ${call('d1_load_issuance_fee_commitments', 9)};`);
    assert.deepEqual(siblingFees.commitments, [fee]); assert.equal(siblingFees.commitment, null); assert.equal(siblingFees.reservation, null);
    assert.deepEqual(json(`select ${call('d1_load_issuance_fee_commitments', 8)};`).commitments, []);
    assert.deepEqual(json(active(101)), reservation); assert.deepEqual(json(active(102)), expiredOwner);
    console.log('SEQUENCE_POPULATED_MIGRATION_HISTORY_ACTIVE_OWNER_EXPIRY_LOCK_AUTH_OK');
  } finally { process.removeListener('SIGTERM', terminate); await cleanup(); }
});
