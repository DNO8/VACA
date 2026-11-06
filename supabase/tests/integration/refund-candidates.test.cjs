// Owned PostgreSQL, opaque SQL bytes only: NOT SDK, consensus, funding or execution authority.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawnSync, spawn } = require('node:child_process'), { createHash, randomUUID } = require('node:crypto');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime(), repo = path.resolve(__dirname, '../../..');
const admin = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', other = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const text = v => v == null ? 'null' : "'" + String(v).replaceAll("'", "''") + "'", lit = v => text(JSON.stringify(v)) + '::jsonb';
function key(n) {
  const bytes = [48, ...Array(32).fill(n)]; let crc = 0;
  for (const b of bytes) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 32768) ? 4129 : 0)) & 65535; }
  bytes.push(crc & 255, crc >> 8); const bits = bytes.map(b => b.toString(2).padStart(8, '0')).join('');
  let result = ''; for (let i = 0; i < bits.length; i += 5) result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i, i + 5), 2)]; return result;
}
test('refund candidates retain initial owners and immutable evidence across expiry, races and rejection', async () => {
  const socket = net.createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port; await new Promise(r => socket.close(r));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-refund-')), data = path.join(fixture, 'data'), children = [], inputs = new Map();
  let pid, started = false, cleanupPromise;
  const args = ['-X', '--no-password', ...connectionArgs, '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '-At'];
  const run = (tool, a) => { const r = spawnSync(process.execPath, [launcher, tool, ...a], { env, encoding: 'utf8', timeout: 10000 }); assert.ifError(r.error); return r; };
  const ok = (tool, a) => { const r = run(tool, a); assert.equal(r.status, 0, r.stderr + r.stdout); assert.equal(r.stderr, ''); return r.stdout.trim(); };
  const sql = (q, role = 'service_role') => ok('psql', [...args, '-c', (role ? `set role ${role}; ` : '') + q]).replace(/^SET\r?\n/, '');
  const json = q => JSON.parse(sql(q)), clock = () => Number(sql('select extract(epoch from clock_timestamp());'));
  const call = (name, n, actor = admin) => `public.${name}('${id(n)}','${actor}')`;
  const load = (n, actor = admin) => `select ${call('d1_load_refund_candidate', n, actor)};`;
  const record = (n, bytes = 'AQID', hash = 'c'.repeat(64), actor = admin) => `select public.d1_record_refund_candidate('${id(n)}',${text(actor)},${text(bytes)},${text(hash)});`;
  const oldState = () => json(`select jsonb_build_object('requests',(select jsonb_agg(to_jsonb(t) order by request_id) from public.release_requests t),
    'payments',(select jsonb_agg(to_jsonb(t) order by transaction_hash,operation_id) from public.donation_payments t),
    'allocations',(select jsonb_agg(to_jsonb(t) order by request_id) from public.donation_allocations t),
    'evidence',jsonb_build_array(${[...inputs].map(([n, input]) => `jsonb_build_object('preparation',public.d1_prepare(${lit(input)}),
      'intent',${call('d1_register_issuance_intent', n)},'unsigned',${call('d1_load_unsigned_transaction', n)},
      'fees',${call('d1_load_issuance_fee_commitments', n)},'signed',${call('d1_load_signed_transaction', n)},
      'attempt',${call('d1_load_submission_attempt', n)},'outcome',${call('d1_load_issuance_outcome', n)},
      'initial_owner',${call('d1_load_active_issuance_sequence', 100 + n)})`).join(',')}));`);
  const state = () => ({ old: oldState(), refund: json(`select jsonb_build_array(${[...inputs.keys()].map(n => call('d1_load_refund_candidate', n)).join(',')});`) });
  // Preserve the real psql error plus its SQLSTATE, without replacing public calls with private mutations.
  const rejected = (q, code, message, role = 'service_role', prefix = '') => {
    const before = state(), file = path.join(fixture, 'rejection.sql');
    fs.writeFileSync(file, `\\set ON_ERROR_STOP off\n${prefix}set role ${role};\n${q}\n\\echo SQLSTATE=:LAST_ERROR_SQLSTATE\n`);
    const r = run('psql', [...args, '-f', file]), errorLine = 2 + q.split('\n').length;
    // ON_ERROR_STOP off permits normal EOF exit0; native SQLSTATE/error below prove rejection.
    assert.equal(r.status, 0, JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr }));
    assert.equal(r.stdout, (prefix ? 'BEGIN\n' : '') + `SET\nSQLSTATE=${code}\n`);
    assert.equal(r.stderr, `psql:${file}:${errorLine}: ERROR:  ${message}\n`); assert.deepEqual(state(), before);
  };
  // Original FIFO/COPY marker and PostgreSQL lock-log wait pattern: launcher ignores stdin.
  const session = source => {
    const file = path.join(fixture, `session-${children.length}.fifo`);
    const mk = spawnSync('mkfifo', ['--mode=600', file], { env, encoding: 'utf8', timeout: 1000 });
    assert.ifError(mk.error); assert.equal(mk.status, 0, mk.stderr); assert.equal(mk.stdout, ''); assert.equal(mk.stderr, '');
    assert.ok(fs.lstatSync(file).isFIFO()); assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    // A Linux process group includes the synchronous launcher and its psql child.
    const p = spawn(process.execPath, [launcher, 'psql', ...args, '-f', file], { env, detached: process.platform === 'linux', stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', finishTimer, fail;
    p.stdout.on('data', b => stdout += b); p.stderr.on('data', b => stderr += b);
    const s = { file, line: 0, fd: fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_NONBLOCK), ending: false, stopped: false };
    const diagnostic = message => Error(`${message}: ${JSON.stringify({ file, pid: p.pid, stdout, stderr })}`);
    s.closeInput = () => { if (s.fd !== null) { fs.closeSync(s.fd); s.fd = null; } };
    s.exited = new Promise(resolve => {
      p.on('error', e => { s.error = diagnostic('session spawn failed: ' + e.message); fail(s.error); });
      p.on('close', (status, signal) => { clearTimeout(finishTimer); s.result = { status, signal, stdout, stderr }; resolve(s.result); });
    });
    const failure = new Promise((_, reject) => { fail = reject; });
    s.done = Promise.race([s.exited, failure]); s.done.catch(() => {});
    let delivery = Promise.resolve();
    s.send = (q, end = false) => {
      assert.ok(!s.ending && !s.stopped, 'send after session input closed');
      s.ending = end; const bytes = Buffer.from(q + '\n'); s.line += (q + '\n').split('\n').length - 1;
      delivery = delivery.then(async () => {
        const deadline = Date.now() + 5000; let offset = 0;
        // Nonblocking writes may be short or EAGAIN. Retain every byte and yield
        // so psql can drain its pipe; serialize commands, including the ready marker.
        while (offset < bytes.length && !s.stopped) {
          if (s.result || Date.now() >= deadline) throw diagnostic(`FIFO delivery failed at byte ${offset}/${bytes.length}`);
          try {
            const written = fs.writeSync(s.fd, bytes, offset, bytes.length - offset);
            if (written > 0) { offset += written; continue; }
          } catch (e) {
            if (!['EAGAIN', 'EWOULDBLOCK', 'EINTR'].includes(e.code)) throw diagnostic(`FIFO write ${e.code} at byte ${offset}/${bytes.length}`);
          }
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        if (end && !s.stopped) {
          s.closeInput();
          // A contender can legitimately wait through the original ~8s deadline.
          finishTimer = setTimeout(() => fail(diagnostic('session did not exit within 15s after complete delivery')), 15000);
        }
      });
      delivery.catch(e => { s.error = e; s.closeInput(); fail(e); });
      return s.line;
    };
    s.stop = signal => {
      if (s.result || !p.pid) return;
      try { if (process.platform === 'linux') process.kill(-p.pid, signal); else p.kill(signal); }
      catch (e) { if (e.code !== 'ESRCH') throw e; }
    };
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
  const blocked = async (s, app, q, captureError = false) => {
    const log = path.join(fixture, 'postgres.log'), offset = fs.statSync(log).size; let line;
    await observe(log, content => content.slice(offset).split('\n').some(v => v.startsWith(app + ':LOG:  process ') && v.includes(' still waiting for ')),
      () => {
        line = s.line + (captureError ? 2 : 1);
        s.send(captureError ? `\\set ON_ERROR_STOP off\n${q}\n\\echo SQLSTATE=:LAST_ERROR_SQLSTATE\n\\quit` : q, true);
      }, s.done); assert.ifError(s.error); return line;
  };
  const successful = r => { assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); };
  const fileError = (s, line, r, code, message) => {
    // psql 17's \\quit has no status argument. ON_ERROR_STOP off + normal
    // quit/EOF exits0; exact server SQLSTATE/stderr and unchanged-state checks
    // (not an invented client exit1) prove the intended rejection.
    assert.equal(r.status, 0); assert.equal(r.stdout, `SET\nSET\nCOPY 1\nSQLSTATE=${code}\n`);
    assert.equal(r.stderr, `psql:${s.file}:${line}: ERROR:  ${message}\n`);
  };
  const cleanup = () => cleanupPromise ||= (async () => {
    for (const s of children) { s.stopped = true; s.closeInput(); }
    const file = path.join(data, 'postmaster.pid'); if (!pid && fs.existsSync(file)) pid = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
    let stopError;
    try { if (started || fs.existsSync(file)) { ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']); started = false; } }
    catch (e) { stopError = e; }
    // Let the launcher reap psql and remove its own scratch first. Neither a
    // broken writer nor a stalled child may turn finally/SIGTERM into an endless wait.
    const settle = async () => {
      let timer;
      try { await Promise.race([Promise.all(children.map(s => s.exited)), new Promise(resolve => { timer = setTimeout(resolve, 500); })]); }
      finally { clearTimeout(timer); }
    };
    await settle();
    for (const s of children) s.stop('SIGTERM');
    await settle();
    for (const s of children) s.stop('SIGKILL');
    await settle();
    assert.ok(children.every(s => s.result), 'owned session cleanup incomplete: ' + JSON.stringify(children.map(s => ({ file: s.file, result: s.result, error: s.error?.message }))));
    if (stopError) throw stopError;
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
      insert into public.admin_wallets values ('${admin}'),('${other}'); insert into public.incidents values ('refund','vaquita','${admin}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const v of ['014', '20261011060218']) apply(v + '.sql', retained.migrations.find(m => m.version === v).statements.join(';\n'));
    for (const name of fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(n => /^0(1[5-9]|2[0-9]|3[0-3])_/.test(n)).sort()) apply(name, fs.readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8'));
    const migration = path.join(repo, 'supabase/migrations/034_d1_refund_candidates.sql');
    if (fs.existsSync(migration)) apply(path.basename(migration), fs.readFileSync(migration, 'utf8'));
    const seed = (n, sequence = '2') => {
      const at = Math.floor(clock()), confirmed = at - 292, end = confirmed + 300, pool = key(n), deadline = new Date(end * 1000).toISOString().replace('.000Z', 'Z');
      const input = { request_id: id(n), authorized_by: admin, confirmed_at: confirmed, ledger: 900,
        memo_hash: createHash('sha256').update('vaca.d1.donation.v1\nrefund').digest('hex'),
        payment: { transaction_hash: n.toString(16).padStart(64, '0'), operation_id: String(n), donor: admin, pool, amount: '2.0000000', asset: { type: 'native' } },
        request: { version: 1, incident_id: 'refund', donor: admin, beneficiary: admin, amount: '1.0000000', asset: { type: 'native' }, deadline } };
      const anchor = { sequence: 900, hash: '9'.repeat(64), closedAt: at }, page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: 900, ledger_hash: anchor.hash, closed_at: at, records: [] };
      const donation = { donor: admin, asset: { type: 'native' }, amountStroops: '20000000', operationId: String(n), transactionHash: input.payment.transaction_hash, confirmedAt: confirmed };
      const snapshot = { kind: 'd1_initial_financial_snapshot', revision: 1, namespace: id(100 + n), network: 'TESTNET', pool, requestId: id(n), anchor, observedAt: at, expiresAt: end,
        creation: { kind: 'opaque_fixture_NOT_SDK_proof' }, originalDonation: donation, account: { pool, networkPassphrase: 'Test SDF Network ; September 2015', anchor, sequence, baseFee: '100' },
        obligations: { donations: [donation] }, unissuedRefundOperationIds: [String(n)], unissuedRefundFeeStroops: '100', budget: { otherFutureFees: '100', transactionFee: '100', newFutureRefundFee: '300' } };
      // One psql transaction: all initial public writes must finish before the ORIGINAL deadline.
      sql(`begin; select public.d1_activate_pool('${id(100 + n)}','${pool}',900); select public.d1_prepare(${lit(input)});
        select ${call('d1_register_issuance_intent', n)}; select public.d1_reserve_issuance_sequence('${id(n)}','${admin}','${sequence}');
        select public.d1_save_unsigned_transaction('${id(n)}','${admin}','AAAA','${'a'.repeat(64)}'); select public.d1_record_issuance_fee_commitment('${id(n)}','${admin}','100','300');
        select public.d1_record_discovery_page('${id(100 + n)}','${admin}',${lit(page)}); select public.d1_record_transaction_page('${id(100 + n)}','${admin}',${lit(page)});
        do $seed$ declare s jsonb; f jsonb; begin
          s := ${lit(snapshot)} || jsonb_build_object('commitment',public.d1_load_issuance_fee_commitments('${id(n)}','${admin}')->'commitment',
            'historyState',public.d1_load_transaction_history_state('${id(100 + n)}','${admin}'),'creditState',public.d1_load_operating_credit_state('${id(100 + n)}','${admin}'));
          f := public.d1_record_initial_financial_observation('${id(n)}','${admin}',s);
          perform public.d1_record_signed_transaction('${id(n)}','${admin}',f->>'snapshot_hash','AQID');
          perform public.d1_claim_submission_attempt('${id(n)}','${admin}',f->>'snapshot_hash','${randomUUID()}');
          if clock_timestamp() >= '${deadline}'::timestamptz then raise exception 'fixture_missed_original_deadline'; end if;
        end $seed$; commit;`);
      inputs.set(n, input); assert.ok(clock() < end, 'initial public chain missed deadline; never retry/backdate'); return { end, deadline, sequence: (BigInt(sequence) + 1n).toString() };
    };
    const outcome = (n, sequence, failed = false) => {
      const at = Math.floor(clock()), pool = key(n), time = new Date(at * 1000).toISOString().replace('.000Z', 'Z'), token = String((901n << 32n) + 4096n);
      const transaction = { hash: 'a'.repeat(64), paging_token: token, ledger: 901, created_at: time, source_account: pool, source_account_sequence: sequence,
        fee_account: pool, fee_charged: '100', max_fee: '100', successful: !failed, operation_count: 1, envelope_xdr: 'AQID', result_xdr: 'AAAA' };
      const observation = { network: 'TESTNET', transactionHash: transaction.hash, source: pool, sequence, feePayer: pool, feeChargedStroops: '100', feeBidStroops: '100',
        outcome: failed ? 'failed' : 'success', ledger: 901, ledgerHash: 'b'.repeat(64), closedAt: at, pagingToken: token, envelopeXdr: 'AQID', resultXdr: 'AAAA', operationTypes: [14], poolOperationSourceIndices: [0],
        raw: { transaction, ledger: { sequence: 901, hash: 'b'.repeat(64), closed_at: time } }, context: { pool, firstLedger: 900, anchor: { sequence: 901, hash: 'b'.repeat(64), closedAt: at } } };
      const page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: 901, ledger_hash: observation.ledgerHash, closed_at: at, records: [] };
      const results = sql(`select public.d1_record_discovery_page('${id(100 + n)}','${admin}',${lit(page)}); select public.d1_record_transaction_page('${id(100 + n)}','${admin}',${lit({ ...page, to_cursor: token, records: [observation] })});
        select public.d1_record_issuance_outcome('${id(n)}','${admin}',${lit({ kind: 'd1_initial_issuance_outcome', revision: 1, observation, outcome: observation.outcome, claimableBalanceId: failed ? null : '00000000' + '1'.repeat(64) })});`);
      return JSON.parse(results.split('\n').at(-1));
    };
    const empty = n => ({ kind: 'd1_refund_candidate_lookup', revision: 1, request_id: id(n), namespace: id(100 + n), network: 'TESTNET', pool: key(n), candidate: null, active_request_id: null });
    const first = seed(1);
    // Intended first RED: undefined PUBLIC034 function (42883), not a missing migration file.
    const initialLookup = run('psql', [...args, '--set', 'VERBOSITY=sqlstate', '-c', `set role service_role; ${load(1)}`]);
    assert.equal(initialLookup.status, 0, initialLookup.stderr + initialLookup.stdout); assert.equal(initialLookup.stderr, '');
    assert.deepEqual(JSON.parse(initialLookup.stdout.replace(/^SET\r?\n/, '')), empty(1));
    const observed = outcome(1, first.sequence), old = oldState();
    rejected(record(1), '22023', 'refund_deadline_not_reached');
    assert.ok(clock() < first.end, '032 and before-deadline rejection must complete before D');
    const holder = await marked(`begin; set role service_role; select ${call('d1_load_unsigned_transaction', 1)};`);
    const waiting = await marked("set application_name='refund-deadline'; set role service_role;");
    assert.ok(clock() < first.end, 'contender begins before original deadline');
    await blocked(waiting, 'refund-deadline', record(1));
    sql(`select pg_sleep(greatest(0, extract(epoch from '${first.deadline}'::timestamptz-clock_timestamp()) + 0.01));`);
    holder.send('commit;', true); successful(await holder.done); const waited = await waiting.done; successful(waited);
    const receipt = JSON.parse(waited.stdout.split('\n')[3]); assert.ok(clock() >= first.end);
    const expected = { kind: 'd1_refund_candidate', revision: 1, request_id: id(1), namespace: id(101), network: 'TESTNET', pool: key(1), authorized_by: admin,
      initial_transaction_hash: 'a'.repeat(64), initial_outcome_hash: observed.outcome_hash, source_sequence: '3', transaction_sequence: '4', deadline: first.deadline, unsigned_xdr: 'AQID', transaction_hash: 'c'.repeat(64) };
    assert.equal(waited.stdout, 'SET\nSET\nCOPY 1\n' + sql(`select ${lit(expected)}::text;`) + '\n');
    assert.deepEqual(receipt, expected); assert.deepEqual(oldState(), old);
    assert.deepEqual(json(load(1)), { ...empty(1), candidate: expected, active_request_id: id(1) });
    assert.deepEqual(json(record(1, 'AQID', 'c'.repeat(64), other)), expected);
    rejected(record(1, 'BAUG'), '23505', 'refund_candidate_conflict'); rejected(record(1, 'AQID', 'd'.repeat(64)), '23505', 'refund_candidate_conflict');
    const failed = seed(2), failedOutcome = outcome(2, failed.sequence, true), unknown = seed(3);
    assert.deepEqual(json(load(3)), empty(3));
    assert.notEqual(json(`select ${call('d1_load_submission_attempt', 3)};`).attempt, null, '031 attempt alone must not substitute for032');
    rejected(record(3), '22023', 'd1_issuance_outcome_not_found');
    const max = seed(4, '9223372036854775806'); outcome(4, max.sequence);
    sql(`select pg_sleep(greatest(0, ${Math.max(failed.end, unknown.end, max.end)}-extract(epoch from clock_timestamp()) + 0.01));`);
    const beforeFailed = oldState(), failedReceipt = json(record(2));
    assert.deepEqual(failedReceipt, { ...expected, request_id: id(2), namespace: id(102), pool: key(2), initial_outcome_hash: failedOutcome.outcome_hash, deadline: failed.deadline });
    assert.deepEqual(json(load(2)), { ...empty(2), candidate: failedReceipt, active_request_id: id(2) });
    assert.deepEqual(oldState(), beforeFailed); rejected(record(4), '22023', 'invalid_refund_sequence');
    rejected(record(3), '22023', 'd1_issuance_outcome_not_found'); assert.deepEqual(json(load(3)), empty(3));
    for (const bytes of [null, '', 'A', 'AB==', 'AAAA\n', '!!!!', 'AAAA'.repeat(16385)]) rejected(record(1, bytes), '22023', 'invalid_refund_candidate');
    for (const hash of [null, '', 'A'.repeat(64), 'c'.repeat(63), 'c'.repeat(65)]) rejected(record(1, 'AQID', hash), '22023', 'invalid_refund_candidate');
    rejected(`select public.d1_load_refund_candidate(null,'${admin}');`, '22023', 'invalid_unsigned_transaction');
    rejected(`select public.d1_record_refund_candidate(null,'${admin}','AQID','${'c'.repeat(64)}');`, '22023', 'invalid_unsigned_transaction');
    rejected(record(1, 'AQID', 'c'.repeat(64), null), '22023', 'invalid_unsigned_transaction');
    rejected(`select public.d1_load_refund_candidate('${id(1)}','bad');`, '22023', 'invalid_unsigned_transaction');
    const race = seed(5); outcome(5, race.sequence);
    sql(`select pg_sleep(greatest(0, ${race.end}-extract(epoch from clock_timestamp()) + 0.01));`);
    rejected(record(5, 'AB=='), '22023', 'invalid_refund_candidate');
    rejected(record(5, 'AQID', 'C'.repeat(64)), '22023', 'invalid_refund_candidate');
    for (const isolation of ['repeatable read', 'serializable']) rejected(record(5), '25000', 'refund_candidate_isolation_required', 'service_role', `begin isolation level ${isolation}; `);
    const raceBefore = state();
    const maximumBytes = 'AAAA'.repeat(16384); // Exactly65536 canonical characters is accepted, not just rejected above the cap.
    const beforeRace = oldState(), winner = await marked(`begin; set role service_role; ${record(5, maximumBytes)}`);
    const loser = await marked("set application_name='refund-race'; set role service_role;");
    const loserLine = await blocked(loser, 'refund-race', record(5, 'BAUG'), true); winner.send('commit;', true);
    const won = await winner.done; successful(won); fileError(loser, loserLine, await loser.done, '23505', 'refund_candidate_conflict');
    const raceReceipt = JSON.parse(won.stdout.split('\n')[2]); assert.deepEqual(oldState(), beforeRace);
    assert.deepEqual(raceReceipt, { ...expected, request_id: id(5), namespace: id(105), pool: key(5),
      initial_outcome_hash: json(`select ${call('d1_load_issuance_outcome', 5)};`).outcome.outcome_hash,
      deadline: race.deadline, unsigned_xdr: maximumBytes });
    assert.equal(won.stdout, 'BEGIN\nSET\n' + sql(`select ${lit(raceReceipt)}::text;`) + '\nCOPY 1\nCOMMIT\n');
    assert.deepEqual(json(load(5)), { ...empty(5), candidate: raceReceipt, active_request_id: id(5) });
    assert.deepEqual(state(), { old: raceBefore.old, refund: raceBefore.refund.map(v => v.request_id === id(5)
      ? { ...v, candidate: raceReceipt, active_request_id: id(5) } : v) });
    for (const isolation of ['repeatable read', 'serializable']) {
      const r = sql(`begin isolation level ${isolation}; ${record(5, maximumBytes, 'c'.repeat(64), other)} commit;`);
      assert.deepEqual(JSON.parse(r.split('\n')[1]), raceReceipt); assert.equal(r.split('\n')[0], 'BEGIN'); assert.equal(r.split('\n')[2], 'COMMIT');
    }
    const beforeRevoke = state(), revoke = await marked(`begin; delete from public.admin_wallets where public_key='${other}';`);
    const revoked = await marked("set application_name='refund-revoked'; set role service_role;");
    const revokeLine = await blocked(revoked, 'refund-revoked', record(1, 'AQID', 'c'.repeat(64), other), true); revoke.send('commit;', true);
    successful(await revoke.done); fileError(revoked, revokeLine, await revoked.done, '42501', 'unauthorized_admin_wallet'); assert.deepEqual(state(), beforeRevoke);
    rejected(load(1, other), '42501', 'unauthorized_admin_wallet');
    for (const role of ['anon', 'authenticated']) {
      rejected(load(1), '42501', 'permission denied for function d1_load_refund_candidate', role);
      rejected(record(1), '42501', 'permission denied for function d1_record_refund_candidate', role);
    }
    for (const table of ['d1_refund_candidates', 'd1_active_refund_sequences']) {
      assert.equal(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass;`, null), 't');
      for (const role of ['anon', 'authenticated', 'service_role']) for (const q of [`select * from public.${table};`, `insert into public.${table} default values;`, `update public.${table} set namespace=namespace;`, `delete from public.${table};`])
        rejected(q, '42501', `permission denied for table ${table}`, role);
    }
    //033 has no retirement API: foreign initial/refund owners cannot be manufactured legally.
    // The reachable same-request conflicting-candidate race above covers serialized first creation.
    // No private owner writes are used to force defensive busy/reactivation branches.
    const preserved = oldState();
    const initial = json(`select ${call('d1_load_active_issuance_sequence', 101)};`);
    assert.deepEqual(json(`select public.d1_reserve_issuance_sequence('${id(1)}','${admin}','2');`), initial);
    assert.deepEqual(json(`select public.d1_save_unsigned_transaction('${id(1)}','${admin}','AAAA','${'a'.repeat(64)}');`), preserved.evidence[0].unsigned.transaction);
    assert.deepEqual(json(`select public.d1_record_issuance_fee_commitment('${id(1)}','${admin}','100','300');`), preserved.evidence[0].fees.commitment);
    assert.deepEqual(json(record(1, 'AQID', 'c'.repeat(64))), expected); assert.deepEqual(oldState(), preserved);
    console.log('REFUND_CANDIDATE_PUBLIC_EXPIRY_OWNERSHIP_REPLAY_REJECTION_OK');
  } finally { process.removeListener('SIGTERM', terminate); await cleanup(); }
});
