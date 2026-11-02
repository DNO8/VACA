// SQL fixtures intentionally contain NON-SDK bytes; these tests prove storage, not XDR approval.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawnSync, spawn } = require('node:child_process');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const repo = path.resolve(__dirname, '../../..');
const pool = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const admin = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const ns = '00000000-0000-4000-8000-000000000001', ns2 = '00000000-0000-4000-8000-000000000002';
const lit = v => "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
test('private atomic transaction history and independent empty-anchor coverage', async () => {
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-d1-transactions-')), data = path.join(fixture, 'data');
  let pid, started = false;
  const run = (tool, a) => spawnSync(process.execPath, [launcher, tool, ...a], { env, encoding: 'utf8', timeout: 10000 });
  const ok = (tool, a) => { const r = run(tool, a); assert.ifError(r.error); assert.equal(r.status, 0, r.stderr + r.stdout); assert.equal(r.stderr, ''); return r.stdout.trim(); };
  const args = ['-X', '--no-password', ...connectionArgs, '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '-At'];
  const sql = (s, role = 'service_role') => ok('psql', [...args, '-c', (role ? `set role ${role}; ` : '') + s]).replace(/^SET\r?\n/, '');
  const json = s => JSON.parse(sql(s));
  const load = (namespace = ns, who = pool) => `select public.d1_load_transaction_history_state('${namespace}','${who}');`;
  const list = (after = '0', limit = '100', namespace = ns) => `select public.d1_list_transaction_records('${namespace}','${pool}','${after.replaceAll("'", "''")}',${limit});`;
  const save = (p, who = pool, namespace = ns) => `select public.d1_record_transaction_page('${namespace}','${who}',${lit(p)});`;
  const page = (records = [], from = '0', ledger = 900) => ({ revision: 1, from_cursor: from,
    to_cursor: records.at(-1)?.pagingToken || from, through_ledger: ledger, ledger_hash: (ledger === 900 ? 'b' : 'c').repeat(64), closed_at: ledger + 100, records });
  const record = (i, outcome = 'success') => {
    const token = String((900n << 32n) + BigInt(i) * 4096n), hash = i.toString(16).padStart(64, '0');
    return { network: 'TESTNET', transactionHash: hash, source: pool, sequence: String(i), feePayer: pool,
      feeChargedStroops: '100', feeBidStroops: '200', outcome, ledger: 900, ledgerHash: 'b'.repeat(64), closedAt: 1000,
      pagingToken: token, envelopeXdr: 'Tk9OLVNESw==', resultXdr: 'Tk9OLVNESw==', operationTypes: [1], poolOperationSourceIndices: [0],
      raw: { transaction: { hash, paging_token: token, ledger: 900, created_at: '1970-01-01T00:16:40Z', source_account: pool,
        source_account_sequence: String(i), fee_account: pool, fee_charged: '100', max_fee: '200', successful: outcome === 'success',
        envelope_xdr: 'Tk9OLVNESw==', result_xdr: 'Tk9OLVNESw==', operation_count: 1 },
        ledger: { sequence: 900, hash: 'b'.repeat(64), closed_at: '1970-01-01T00:16:40Z' } },
      context: { pool, firstLedger: 900, anchor: { sequence: 900, hash: 'b'.repeat(64), closedAt: 1000 } } };
  };
  const cleanup = () => {
    const pidFile = path.join(data, 'postmaster.pid');
    if (!pid && fs.existsSync(pidFile)) pid = Number(fs.readFileSync(pidFile, 'utf8').split('\n')[0]);
    if (started || fs.existsSync(pidFile)) { ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']); started = false; }
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    fs.rmSync(fixture, { recursive: true, force: true });
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED_${fixture}`);
  };
  const terminate = () => { cleanup(); process.exit(143); }; process.once('SIGTERM', terminate);
  try {
    ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']); started = true;
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    const apply = (name, source) => { const file = path.join(fixture, name); fs.writeFileSync(file, source); ok('psql', [...args, '-q', '-f', file]); };
    apply('fixture.sql', `create role anon; create role authenticated; create role service_role;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${pool}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const v of ['014', '20261011060218']) apply(v + '.sql', retained.migrations.find(m => m.version === v).statements.join(';\n'));
    for (const name of ['015_d1_testnet_custody.sql', '019_d1_discovery.sql', '021_d1_discovery_state.sql', '024_d1_transaction_history.sql', '025_d1_transaction_queries.sql']) {
      const file = path.join(repo, 'supabase/migrations', name); if (fs.existsSync(file)) apply(name, fs.readFileSync(file, 'utf8'));
    }
    sql(`select public.d1_activate_pool('${ns}','${pool}',900); select public.d1_activate_pool('${ns2}','${admin}',900);`);
    const initial = json(load()); // Actual public missing-RPC RED, before implementation.
    assert.equal(initial.coverage_complete, false); assert.equal(initial.checkpoint, null);
    assert.equal(initial.page_count, 0); assert.equal(initial.record_count, 0);
    const income = p => `select public.d1_record_discovery_page('${ns}','${pool}',${lit(p)});`;
    const facts = () => sql(`select coalesce(jsonb_agg(record order by paging_token::numeric),'[]') from public.d1_transaction_records;`, null);
    const snapshot = () => sql(`select jsonb_build_object('records',(select jsonb_agg(t order by namespace,paging_token::numeric) from public.d1_transaction_records t),
      'pages',(select jsonb_agg(t order by namespace,through_ledger,from_cursor::numeric) from public.d1_transaction_pages t),
      'checkpoints',(select jsonb_agg(t order by namespace) from public.d1_transaction_checkpoints t));`, null);
    const rejected = (source, error, role = 'service_role') => {
      const before = json(load()), stored = snapshot(); const r = run('psql', [...args, '-c', `set role ${role}; ${source}`]);
      assert.ifError(r.error); assert.equal(r.status, 1); assert.equal(r.stdout, 'SET\n'); assert.equal(r.stderr, `ERROR:  ${error}\n`);
      assert.deepEqual(json(load()), before); assert.equal(snapshot(), stored);
    };
    const a = record(2), b = record(10, 'failed'), first = page([a, b]);
    rejected(save(first), 'transaction_history_conflict');
    const incomeReceipt = json(income(page()));
    const duplicateHash = structuredClone(first); duplicateHash.records[1].transactionHash = a.transactionHash;
    duplicateHash.records[1].raw.transaction.hash = a.transactionHash;
    rejected(save(duplicateHash), 'transaction_history_conflict'); // Roll back the first inserted record too.
    const receipt = json(save(first));
    assert.deepEqual(receipt.page, first); assert.equal(receipt.authorized_by, pool);
    assert.deepEqual(receipt.checkpoint, { cursor: b.pagingToken, through_ledger: 900, ledger_hash: first.ledger_hash, closed_at: 1000 });
    assert.deepEqual(receipt, { kind: 'd1_transaction_page', revision: 1, namespace: ns, network: 'TESTNET', pool,
      first_ledger: 900, authorized_by: pool, page: first, checkpoint: receipt.checkpoint, page_count: 1, record_count: 2, page_record_count: 2 });
    assert.equal(json(load()).coverage_complete, false); assert.deepEqual(JSON.parse(facts()), [a, b]);
    assert.deepEqual(json(list('0', '1')), { kind: 'd1_transaction_records', revision: 1, namespace: ns, network: 'TESTNET', pool,
      from_cursor: '0', next_cursor: a.pagingToken, records: [a], has_more: true, history_state: json(load()) }); // New public query RED before025.
    assert.deepEqual(json(list(a.pagingToken, '1')).records, [b]);
    assert.deepEqual(json(`select public.d1_list_transaction_records('${ns}','${pool}');`).records, [a, b]);
    const tail = json(list(b.pagingToken)); assert.deepEqual(tail.records, []); assert.equal(tail.next_cursor, b.pagingToken); assert.equal(tail.has_more, false);
    assert.deepEqual(json(list('0', '100', ns2)).records, []);
    for (const after of ['01', '-1', '1', '4097', '18446744073709551616']) rejected(list(after), 'invalid_transaction_query');
    for (const limit of ['0', '101', 'null']) rejected(list('0', limit), 'invalid_transaction_query');
    assert.deepEqual(json(list('18446744073709547520')).records, []);
    assert.equal(json(load(ns2)).record_count, 0); assert.equal(json(load(ns2)).coverage_complete, false);
    const overlap = record(11); overlap.transactionHash = a.transactionHash; overlap.raw.transaction.hash = a.transactionHash;
    rejected(save(page([overlap], b.pagingToken)), 'transaction_history_conflict');
    const empty = page([], b.pagingToken); json(save(empty)); assert.equal(json(load()).coverage_complete, true);
    assert.deepEqual(json(save(first)), receipt); assert.equal(json(load()).page_count, 2);
    const fresh = page([structuredClone(a), structuredClone(b)], '0', 901);
    for (const r of fresh.records) r.context.anchor = { sequence: 901, hash: 'c'.repeat(64), closedAt: 1001 };
    for (const mutate of [p => p.extra = true, p => p.from_cursor = '01', p => p.from_cursor = '18446744073709551616',
      p => p.from_cursor = '4097', p => p.records.reverse(), p => p.to_cursor = '0', p => p.records[0].feeChargedStroops = '01',
      p => p.records[0].feeChargedStroops = '9223372036854775808', p => p.records[0].feePayer = admin,
      p => p.records[0].context.pool = admin, p => p.records[0].context.firstLedger = 899,
      p => p.records[0].context.anchor.hash = 'e'.repeat(64), p => p.records[0].raw.transaction.hash = 'e'.repeat(64),
      p => p.records[0].outcome = 'unknown', p => p.records[0].pagingToken = '1', p => p.records[0].ledger = 899,
      p => p.records[0].sequence = '0', p => p.records[0].ledgerHash = 'A'.repeat(64),
      p => p.records[0].raw.transaction.successful = false, p => p.records[0].feeChargedStroops = '201',
      p => p.records[0].poolOperationSourceIndices = [0, 0], p => p.records[0].operationTypes = ['1'],
      p => p.records[0].envelopeXdr = 'not base64', p => p.records[0].raw.ledger.hash = 'c'.repeat(64),
      p => p.through_ledger = 4294967296, p => p.closed_at = 253402300800]) {
      const bad = structuredClone(fresh); mutate(bad); rejected(save(bad), 'invalid_transaction_page');
    }
    rejected(`select public.d1_record_transaction_page('${ns}','${pool}',jsonb_set(${lit(fresh)},'{records}',
      (select jsonb_agg(${lit(a)}) from generate_series(1,101))));`, 'invalid_transaction_page'); // Same boundary, built SQL-side to avoid Linux argv limits.
    for (const bytes of [140000, 1048577]) {
      const large = `select public.d1_record_transaction_page('${ns}','${pool}',jsonb_set(${lit(fresh)},'{records,0,raw,transaction,padding}',to_jsonb(repeat('x',${bytes}))));`;
      rejected(large, 'invalid_transaction_page'); // Serialized bytes, even highly compressible; no large argv.
    }
    const changed = structuredClone(first); changed.records[0].raw.transaction.extra = true;
    rejected(save(changed), 'transaction_history_conflict');
    rejected(save(page([record(11)], '0')), 'transaction_history_conflict');
    for (const role of ['anon', 'authenticated']) {
      rejected(load(), 'permission denied for function d1_load_transaction_history_state', role);
      rejected(list(), 'permission denied for function d1_list_transaction_records', role);
      rejected(save(first), 'permission denied for function d1_record_transaction_page', role);
    }
    for (const role of ['anon', 'authenticated', 'service_role']) for (const table of ['checkpoints', 'pages', 'records']) {
      rejected(`select * from public.d1_transaction_${table};`, `permission denied for table d1_transaction_${table}`, role);
    }
    assert.equal(sql("select bool_and(relrowsecurity) from pg_class where oid in ('public.d1_transaction_checkpoints'::regclass,'public.d1_transaction_pages'::regclass,'public.d1_transaction_records'::regclass);", null), 't');
    json(income(page([], '0', 901))); assert.equal(json(load()).coverage_complete, false);
    const advance = page([], b.pagingToken, 901); json(save(advance)); assert.equal(json(load()).coverage_complete, true);
    sql(`insert into public.admin_wallets values ('${admin}');`, null);
    assert.deepEqual(json(save(first, admin)), receipt); assert.equal(json(load()).checkpoint.through_ledger, 901);
    sql(`delete from public.admin_wallets where public_key = '${pool}';`, null);
    const denied = run('psql', [...args, '-c', `set role service_role; ${save(first)}`]);
    assert.equal(denied.status, 1); assert.equal(denied.stdout, 'SET\n'); assert.equal(denied.stderr, 'ERROR:  unauthorized_admin_wallet\n');
    const deniedQuery = run('psql', [...args, '-c', `set role service_role; ${list()}`]);
    assert.equal(deniedQuery.status, 1); assert.equal(deniedQuery.stdout, 'SET\n'); assert.equal(deniedQuery.stderr, 'ERROR:  unauthorized_admin_wallet\n');
    sql(`insert into public.admin_wallets values ('${pool}');`, null);
    assert.deepEqual(json(income(page())), incomeReceipt); // Preserve one old-history receipt assertion.
    json(`select public.d1_record_discovery_page('${ns2}','${pool}',${lit(page())});`);
    json(save(page(), pool, ns2)); assert.equal(json(load(ns2)).coverage_complete, true);
    assert.equal(json(load()).checkpoint.through_ledger, 901); // Namespace-specific markers/counters.
    json(income(page([], '0', 902))); // Fresh identity: an already-saved empty page is immutable too.
    const candidate = i => { const r = record(i); r.context.anchor = { sequence: 902, hash: 'c'.repeat(64), closedAt: 1002 }; return page([r], b.pagingToken, 902); };
    const concurrent = s => new Promise(resolve => { const child = spawn(process.execPath, [launcher, 'psql', ...args, '-c', `set role service_role; ${s}`], { env });
      let stdout = '', stderr = ''; child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
      child.on('close', status => resolve({ status, stdout, stderr })); child.on('error', e => resolve({ status: -1, stderr: String(e) })); });
    const results = await Promise.all([concurrent(save(candidate(11))), concurrent(save(candidate(12)))]);
    assert.deepEqual(results.map(r => r.status).sort(), [0, 1]);
    const loser = results.find(r => r.status === 1); assert.equal(loser.stdout, 'SET\n'); assert.equal(loser.stderr, 'ERROR:  transaction_history_conflict\n');
    assert.equal(json(load()).record_count, 3); assert.equal(json(load()).page_count, 4);
    assert.equal(json(load()).coverage_complete, false); assert.equal(JSON.parse(facts()).length, 3);
    assert.deepEqual(json(save(first)), receipt);
    // Cross the decimal-width boundary so lexical ordering would put the new TX first.
    const highLedger = 2500000000, high = record(20), highTime = highLedger + 100;
    json(income(page([], '0', highLedger)));
    const from = json(load()).checkpoint.cursor;
    Object.assign(high, { ledger: highLedger, ledgerHash: 'c'.repeat(64), closedAt: highTime, pagingToken: String((BigInt(highLedger) << 32n) + 4096n) });
    high.context.anchor = { sequence: highLedger, hash: high.ledgerHash, closedAt: highTime };
    Object.assign(high.raw.ledger, { sequence: highLedger, hash: high.ledgerHash, closed_at: new Date(highTime * 1000).toISOString().replace('.000Z', 'Z') });
    Object.assign(high.raw.transaction, { ledger: highLedger, paging_token: high.pagingToken, created_at: high.raw.ledger.closed_at });
    json(save(page([high], from, highLedger)));
    const all = json(list()); assert.deepEqual(all.records, JSON.parse(facts())); assert.equal(all.records.length, 4);
    assert.equal(all.records[0].pagingToken, a.pagingToken); assert.equal(all.records.at(-1).pagingToken, high.pagingToken);
    assert.equal(all.has_more, false); assert.equal(all.next_cursor, high.pagingToken); assert.deepEqual(all.history_state, json(load()));
    const head = json(list('0', '2')); assert.deepEqual(head.records, [a, b]); assert.equal(head.has_more, true);
    assert.equal(json(list(head.next_cursor, '2')).records.at(-1).pagingToken, high.pagingToken);
    assert.deepEqual(json(save(first)), receipt); assert.equal(json(load()).checkpoint.through_ledger, highLedger);
    console.log('TRANSACTION_HISTORY_ATOMIC_REPLAY_COVERAGE_RACE_OK');
    console.log('TRANSACTION_QUERY_NUMERIC_PAGINATION_AUTHORIZATION_OK');
  } finally { process.removeListener('SIGTERM', terminate); cleanup(); }
});
