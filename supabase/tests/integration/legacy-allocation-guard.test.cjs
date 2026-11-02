// Synthetic owned PostgreSQL only; no ledger, signing or deployment evidence.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawnSync, spawn } = require('node:child_process');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const repo = path.resolve(__dirname, '../../..');
const admin = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const pool = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const ns = '00000000-0000-4000-8000-000000000001';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lit = v => "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
// Encode synthetic public account bytes, never signing keys.
function key(n) {
  const bytes = [48, ...Array(32).fill(n)]; let crc = 0;
  for (const byte of bytes) { crc ^= byte << 8; for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 32768) ? 4129 : 0)) & 65535; }
  bytes.push(crc & 255, crc >> 8);
  const bits = bytes.map(b => b.toString(2).padStart(8, '0')).join('');
  let result = ''; for (let i = 0; i < bits.length; i += 5) result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i, i + 5), 2)];
  return result;
}

test('legacy guard preserves receipts and excludes activation races', async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-d1-guard-'));
  const data = path.join(fixture, 'data'), children = [];
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
  const payment = (n, p = pool) => ({ transaction_hash: 'a'.repeat(64), operation_id: String(n), donor: admin,
    pool: p, asset: { type: 'native' }, amount: '2.0000000' });
  const confirmed = Math.floor(Date.now() / 1000) - 1;
  const request = { version: 1, incident_id: 'guard', donor: admin, beneficiary: admin,
    asset: { type: 'native' }, amount: '1.0000000', deadline: new Date((confirmed + 300) * 1000).toISOString().replace('.000Z', 'Z') };
  const allocate = (n, p = payment(n), name = 'allocate_donation_to_release_request') =>
    `select public.${name}('${id(n)}','${admin}',${lit(p)},'${p.pool}');`;
  const reserve = n => sql(`select public.reserve_release_request('${id(n)}','${admin}',${lit(request)});`);
  const activate = (p = pool, namespace = ns, name = 'd1_activate_pool') => `select public.${name}('${namespace}','${p}',900);`;
  const snapshot = () => sql(`select jsonb_build_object('payments',(select coalesce(jsonb_agg(to_jsonb(p) order by operation_id), '[]') from public.donation_payments p),
    'allocations',(select coalesce(jsonb_agg(to_jsonb(a) order by request_id), '[]') from public.donation_allocations a),
    'requests',(select coalesce(jsonb_agg(to_jsonb(r) order by request_id), '[]') from public.release_requests r));`);
  const rejected = (source, error, role = 'service_role') => {
    const before = snapshot();
    const r = run('psql', [...args, '-c', `set role ${role}; ${source}`]);
    assert.equal(r.status, 1); assert.equal(r.stdout, 'SET\n'); assert.equal(r.stderr, `ERROR:  ${error}\n`);
    assert.equal(snapshot(), before);
  };
  const session = (source, command = false) => {
    const state = { file: command ? null : path.join(fixture, `session-${children.length}.fifo`), line: 0 };
    if (state.file) {
      const r = spawnSync('mkfifo', ['--mode=600', state.file], { env, encoding: 'utf8', timeout: 1000 });
      assert.ifError(r.error); assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, ''); assert.equal(r.stderr, '');
      const stat = fs.lstatSync(state.file); assert.ok(stat.isFIFO()); assert.equal(stat.mode & 0o777, 0o600);
    }
    // The trusted launcher ignores stdin and buffers output until psql exits.
    // Explicit -f input and psql's own \\o marker files are the live control path.
    const child = spawn(process.execPath, [launcher, 'psql', ...args, ...(command ? ['-c', source] : ['-f', state.file])],
      { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    state.done = new Promise(resolve => {
      child.on('error', e => { state.spawnError = e.message; });
      child.on('close', status => { state.result = { status, stdout, stderr }; resolve(state.result); });
    });
    state.diagnostics = () => JSON.stringify({ file: state.file, line: state.line, result: state.result ?? 'running; launcher output buffered until exit',
      spawnError: state.spawnError, writerError: state.writerError, stdout, stderr });
    children.push(state);
    if (state.file) {
      // Linux RDWR/NONBLOCK avoids an orphaned blocking open if psql fails early.
      // Closing this descriptor still delivers EOF to psql's separate read end.
      state.writer = fs.createWriteStream(state.file, { flags: fs.constants.O_RDWR | fs.constants.O_NONBLOCK });
      state.writerClosed = new Promise(resolve => state.writer.on('close', resolve));
      state.writer.on('error', e => { state.writerError = e.message; });
      state.send = (sql, end = false) => {
        const chunk = sql + '\n'; state.line += chunk.split('\n').length - 1;
        if (end) state.writer.end(chunk); else state.writer.write(chunk);
        return state.line; // psql -f reports the terminating statement's line.
      };
      state.send(source);
    }
    return state;
  };
  const waitFor = async (predicate, state) => {
    const until = Date.now() + 5000;
    while (!predicate() && Date.now() < until) {
      assert.ok(!state.result && !state.spawnError && !state.writerError, `session failed before readiness: ${state.diagnostics()}`);
      await new Promise(r => setTimeout(r, 20));
    }
    assert.ok(predicate(), `bounded session readiness: ${state.diagnostics()}`);
  };
  let cleanupPromise;
  const cleanup = () => cleanupPromise ||= (async () => {
    // EOF closes/rolls back held transactions; stop PG to release any remaining
    // blocked RPCs, then await the launchers (each waits for its owned psql child).
    for (const { writer } of children) if (writer && !writer.writableEnded && !writer.destroyed) writer.end();
    await Promise.all(children.map(c => c.writerClosed));
    if (started) {
      let alive = true;
      if (pid) try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; else throw e; }
      if (alive) ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']);
    }
    await Promise.all(children.map(c => c.done));
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    fs.rmSync(fixture, { recursive: true, force: true }); assert.equal(fs.existsSync(fixture), false);
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);
  })();
  const terminate = () => { cleanup().then(() => process.exit(143), e => { console.error(e); process.exit(1); }); };
  process.once('SIGTERM', terminate);
  try {
    ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']);
    started = true; pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    const apply = (name, source) => {
      const file = path.join(fixture, name); fs.writeFileSync(file, source); ok('psql', [...args, '-q', '-f', file]);
    };
    apply('fixture.sql', `create role anon; create role authenticated; create role service_role;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}'); insert into public.incidents values ('guard','community','${admin}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const version of ['014', '20261011060218']) apply(version + '.sql', retained.migrations.find(m => m.version === version).statements.join(';\n'));
    apply('015.sql', fs.readFileSync(path.join(repo, 'supabase/migrations/015_d1_testnet_custody.sql'), 'utf8'));
    reserve(1); const historical = json(allocate(1, payment(1, admin)));
    const historicalFundsRpc = `select to_jsonb(p) from public.donation_payments p where operation_id='1';`;
    const historicalFunds = sql(historicalFundsRpc);
    assert.deepEqual(json(allocate(1, payment(1, admin))), historical);
    const identityRpc = `select jsonb_agg(jsonb_build_array(oid,proargnames,pg_get_function_arguments(oid),proacl) order by oid)
      from pg_proc where oid in ('public.allocate_donation_to_release_request(uuid,text,jsonb,text)'::regprocedure,
      'public.d1_activate_pool(uuid,text,bigint)'::regprocedure,'public.d1_prepare(jsonb)'::regprocedure);`;
    const identity = sql(identityRpc, null);
    const migration = path.join(repo, 'supabase/migrations/023_d1_legacy_allocation_guard.sql');
    if (fs.existsSync(migration)) apply('023.sql', fs.readFileSync(migration, 'utf8'));
    assert.equal(sql(identityRpc, null), identity);
    const activationReceipt = json(activate()); reserve(2);
    rejected(allocate(2), 'd1_legacy_allocation_forbidden'); // Observed actual RED before implementation.
    assert.deepEqual(json(activate()), activationReceipt);
    rejected(activate(pool, id(20)), 'activation_conflict');
    assert.deepEqual(json(allocate(1, payment(1, admin))), historical);
    rejected(allocate(1, { ...payment(1, admin), amount: '3.0000000' }), 'donation_binding_conflict');
    reserve(3); assert.equal(json(allocate(3, payment(3, admin))).state, 'allocated');
    // Historical NEW allocations and replay remain legal at both stronger levels.
    for (const [n, isolation] of [[7, 'repeatable read'], [8, 'serializable']]) {
      reserve(n);
      const r = run('psql', [...args, '-c', `set role service_role; begin isolation level ${isolation}; ${allocate(n, payment(n, admin))} ${allocate(n, payment(n, admin))} commit;`]);
      assert.equal(r.status, 0); assert.equal(r.stderr, '');
      const replay = sql(allocate(n, payment(n, admin)));
      assert.equal(r.stdout, `SET\nBEGIN\n${replay}\n${replay}\nCOMMIT\n`);
      assert.equal(JSON.parse(replay).state, 'allocated');
    }
    // Established historical fence locks are compatible, not unconditional writes.
    reserve(11); reserve(12);
    const sharedMarker = path.join(fixture, 'shared-ready');
    const shared = session(`begin isolation level repeatable read; set role service_role;\n\\o ${sharedMarker}\n${allocate(11, payment(11, admin))}\n\\o`);
    await waitFor(() => fs.existsSync(sharedMarker) && fs.statSync(sharedMarker).size > 0, shared);
    const concurrent = run('psql', [...args, '-c', `set role service_role; begin isolation level repeatable read; set local statement_timeout='3s'; ${allocate(12, payment(12, admin))} commit;`]);
    assert.equal(concurrent.status, 0, concurrent.stderr); assert.equal(concurrent.stderr, '');
    assert.equal(concurrent.stdout, `SET\nBEGIN\nSET\n${sql(allocate(12, payment(12, admin)))}\nCOMMIT\n`);
    shared.send('commit;', true);
    assert.deepEqual(await shared.done, { status: 0, stdout: 'BEGIN\nSET\nCOMMIT\n', stderr: '' });
    assert.equal(json(allocate(11, payment(11, admin))).state, 'allocated');
    const input = { request_id: id(4), authorized_by: admin, payment: payment(4), request, confirmed_at: confirmed, ledger: 900,
      memo_hash: require('node:crypto').createHash('sha256').update('vaca.d1.donation.v1\nguard').digest('hex') };
    const prepare = `select public.d1_prepare(${lit(input)});`;
    const receipt = json(prepare); assert.equal(receipt.state, 'allocated'); assert.deepEqual(json(prepare), receipt);
    assert.deepEqual(json(allocate(4)), receipt.allocation);
    rejected(allocate(4, { ...payment(4), amount: '3.0000000' }), 'donation_binding_conflict');
    for (const role of ['anon', 'authenticated']) {
      rejected(allocate(2), 'permission denied for function allocate_donation_to_release_request', role);
      rejected(prepare, 'permission denied for function d1_prepare', role);
      rejected(activate(), 'permission denied for function d1_activate_pool', role);
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      rejected(allocate(2, payment(2), 'd1_allocate_donation_private'), 'permission denied for function d1_allocate_donation_private', role);
      rejected(activate(pool, ns, 'd1_activate_pool_private'), 'permission denied for function d1_activate_pool_private', role);
      rejected('select * from public.d1_legacy_pool_fences;', 'permission denied for table d1_legacy_pool_fences', role);
    }
    sql(`delete from public.admin_wallets where public_key = '${admin}';`, null);
    rejected(allocate(1, payment(1, admin)), 'unauthorized_admin_wallet');
    rejected(allocate(2), 'unauthorized_admin_wallet'); rejected(prepare, 'unauthorized_admin_wallet');
    sql(`insert into public.admin_wallets values ('${admin}');`, null);
    rejected(activate(admin, id(20)), 'historical_pool');
    // Hold the first successful RPC open; ensure the competitor is actually blocked
    // before committing. Neither ordering can commit both activation and allocation.
    for (const activationFirst of [true, false]) {
      const n = activationFirst ? 5 : 6, p = key(n); reserve(n);
      const raceActivation = activate(p, id(n + 20));
      const firstRpc = activationFirst ? raceActivation : allocate(n, payment(n, p));
      const marker = path.join(fixture, `ready-${n}`), before = snapshot();
      const first = session(`begin; set role service_role;\n\\o ${marker}\n${firstRpc}\n\\o`);
      await waitFor(() => fs.existsSync(marker) && fs.statSync(marker).size > 0, first);
      const second = session(`set application_name='guard-second'; set role service_role; ${activationFirst ? allocate(n, payment(n, p)) : raceActivation}`, true);
      await waitFor(() => sql(`select exists(select 1 from pg_stat_activity where application_name='guard-second' and wait_event_type='Lock');`, null) === 't', second);
      first.send('commit;', true);
      const a = await first.done, b = await second.done;
      assert.equal(a.status, 0); assert.equal(a.stderr, ''); assert.equal(a.stdout, 'BEGIN\nSET\nCOMMIT\n');
      assert.equal(b.status, 1); assert.equal(b.stdout, 'SET\nSET\n');
      assert.equal(b.stderr, `ERROR:  ${activationFirst ? 'd1_legacy_allocation_forbidden' : 'historical_pool'}\n`);
      if (activationFirst) assert.equal(snapshot(), before);
      else assert.equal(json(allocate(n, payment(n, p))).state, 'allocated');
    }
    // A pre-existing inactive fence makes a stale transaction lock a REAL updated
    // tuple, not merely consult d1_pools through an obsolete snapshot.
    for (const activationFirst of [true, false]) {
      const n = activationFirst ? 9 : 10, p = key(n); reserve(n);
      sql(`insert into public.d1_legacy_pool_fences(pool,activated) values ('${p}',false);`, null); // Isolated seed only.
      const marker = path.join(fixture, `stale-ready-${n}`);
      const stale = session(`begin isolation level repeatable read; set role service_role;\n\\o ${marker}\nselect count(*) from public.donation_payments;\n\\o`);
      await waitFor(() => fs.existsSync(marker) && fs.statSync(marker).size > 0, stale);
      const activationRpc = activate(p, id(n + 20));
      const first = json(activationFirst ? activationRpc : allocate(n, payment(n, p))), before = snapshot();
      const errorLine = stale.send(activationFirst ? allocate(n, payment(n, p)) : activationRpc, true);
      const r = await stale.done;
      assert.equal(r.status, 3); assert.equal(r.stdout, 'BEGIN\nSET\n');
      assert.equal(r.stderr, `psql:${stale.file}:${errorLine}: ERROR:  could not serialize access due to concurrent update\n`);
      assert.equal(snapshot(), before);
      if (activationFirst) assert.deepEqual(json(activationRpc), first);
      else { assert.deepEqual(json(allocate(n, payment(n, p))), first); rejected(activationRpc, 'historical_pool'); }
    }
    assert.deepEqual(json(allocate(1, payment(1, admin))), historical);
    assert.deepEqual(json(prepare), receipt); assert.equal(sql(historicalFundsRpc), historicalFunds);
    console.log('LEGACY_GUARD_REPLAY_AUTH_PREPARE_RACES_OK');
  } finally {
    process.removeListener('SIGTERM', terminate);
    await cleanup();
  }
});
