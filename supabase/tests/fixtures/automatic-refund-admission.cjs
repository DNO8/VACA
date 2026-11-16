'use strict';
// Disposable SQL-only fixtures derived from beneficiary-claim-membership and
// refund-lane-fence. Opaque XDR is NOT SDK, chain, signing or settlement proof.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { resolveFixtureRuntime } = require('../integration/fixture-runtime.cjs');
const repo = path.resolve(__dirname, '../../..');
const migrations = [
  '015_d1_testnet_custody.sql',
  '016_d1_issuance_intents.sql',
  '017_d1_issuance_sequences.sql',
  '018_d1_unsigned_transactions.sql',
  '019_d1_discovery.sql',
  '020_d1_discovery_queries.sql',
  '021_d1_discovery_state.sql',
  '022_d1_operating_credit_observations.sql',
  '023_d1_legacy_allocation_guard.sql',
  '024_d1_transaction_history.sql',
  '025_d1_transaction_queries.sql',
  '026_d1_operating_credit_queries.sql',
  '027_d1_issuance_fee_commitments.sql',
  '028_d1_initial_financial_observations.sql',
  '029_d1_fresh_initial_financial_observations.sql',
  '030_d1_signed_transactions.sql',
  '031_d1_submission_attempts.sql',
  '032_d1_issuance_outcomes.sql',
  '033_d1_issuance_sequence_ownership.sql',
  '034_d1_refund_candidates.sql',
  '035_d1_refund_financial_observations.sql',
  '036_d1_refund_signing_journal.sql',
  '037_d1_refund_submission_attempts.sql',
  '038_d1_refund_outcomes.sql',
  '039_d1_beneficiary_claims.sql',
  '040_d1_refund_lane_fence.sql',
  '041_d1_remainder_candidates.sql',
  '042_d1_remainder_financial_membership.sql',
  '043_d1_remainder_financial_money.sql',
  '044_d1_remainder_financial_observations.sql',
  '045_d1_remainder_signing_journal.sql',
  '046_d1_remainder_submission_attempts.sql',
  '047_d1_remainder_outcomes.sql',
  '048_d1_issuance_mutation_authorization.sql',
  '049_d1_refund_service_scope.sql',
  '050_d1_discovery_service_admission.sql',
  '051_d1_request_service_admission.sql',
  '052_d1_active_owner_service_admission.sql',
  '053_d1_refund_candidate_read_service_admission.sql',
  '054_d1_donor_payment_snapshot.sql',
  '055_d1_refund_execution_service_admission.sql',
  '056_d1_due_refund_originals.sql',
  '057_d1_beneficiary_claim_service_admission.sql',
  '058_d1_remainder_execution_service_admission.sql',
];
const admin = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const beneficiary = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = n => n.toString(16).padStart(64, '0');
const text = v => v == null ? 'null' : "'" + String(v).replaceAll("'", "''") + "'";
const lit = v => text(JSON.stringify(v)) + '::jsonb';
const iso = at => new Date(at * 1000).toISOString().replace('.000Z', 'Z');
function key(n) {
  const bytes = [48, ...Array(32).fill(n)]; let crc = 0;
  for (const b of bytes) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 32768) ? 4129 : 0)) & 65535; }
  bytes.push(crc & 255, crc >> 8);
  const bits = bytes.map(b => b.toString(2).padStart(8, '0')).join('');
  let result = ''; for (let i = 0; i < bits.length; i += 5) result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i, i + 5), 2)];
  return result;
}
const actor = key(98), stranger = key(99);
const source = number => fs.readFileSync(path.join(repo, 'supabase/migrations', migrations[number - 15]), 'utf8');

async function isolated(t, through = 58) {
  const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
  assert.equal(process.platform, 'linux'); assert.deepEqual(env, {}); assert.deepEqual(connectionArgs, []);
  assert.equal(fs.realpathSync(temp), path.join(repo, '.tooling/d1-backend/tmp'));
  assert.equal(fs.realpathSync(path.dirname(launcher)), path.join(repo, '.tooling/d1-backend'));
  assert.equal(migrations.length, 44); assert.equal(new Set(migrations).size, 44);
  assert.deepEqual(migrations.map(n => Number(n.slice(0, 3))), Array.from({ length: 44 }, (_, i) => i + 15));
  assert.deepEqual(fs.readdirSync(path.join(repo, 'supabase/migrations')).sort(), [...migrations].sort());
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const root = fs.mkdtempSync(path.join(temp, 'vaca-automatic-admission-')), data = path.join(root, 'data');
  const args = ['-X', '--no-password', '-p', String(port), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
  let pid, closed = false;
  const pending = new Set();
  const run = (tool, parameters) => {
    const r = spawnSync(process.execPath, [launcher, tool, ...parameters], { env, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
    assert.ifError(r.error);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const ok = (tool, parameters) => {
    const r = run(tool, parameters); assert.equal(r.status, 0, JSON.stringify(r)); assert.equal(r.stderr, ''); return r.stdout;
  };
  const raw = (q, verbosity = 'terse') => run('psql', [...args, '--set', `VERBOSITY=${verbosity}`, '-c', q]);
  const sql = (q, role = 'service_role') => ok('psql', [...args, '--set', 'VERBOSITY=terse', '-c', (role ? `set role ${role}; ` : '') + q]).replace(/^SET\n/, '').trim();
  const json = (q, role) => JSON.parse(sql(q, role));
  const apply = (name, content) => {
    const file = path.join(root, name); fs.writeFileSync(file, content);
    ok('psql', [...args, '--set', 'VERBOSITY=terse', '-q', '-f', file]);
  };
  const asyncSQL = q => {
    const child = spawn(process.execPath, [launcher, 'psql', ...args, '--set', 'VERBOSITY=terse', '-c', q], { env });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    const promise = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', status => resolve({ status, stdout, stderr }));
    });
    pending.add(promise); promise.finally(() => pending.delete(promise)); return promise;
  };
  const observe = async q => {
    const end = Date.now() + 4000;
    do { if (sql(q, null) === 't') return; await new Promise(resolve => setTimeout(resolve, 20)); } while (Date.now() < end);
    assert.fail('expected actual PostgreSQL lock wait was not observed');
  };
  const cleanup = async () => {
    if (closed) return;
    if (fs.existsSync(path.join(data, 'postmaster.pid'))) {
      pid ||= Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
      ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']);
    }
    await Promise.allSettled([...pending]);
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    fs.rmSync(root, { recursive: true, force: true }); closed = true;
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED ${root}`);
  };
  const terminate = () => cleanup().then(() => process.exit(143), e => { console.error(e); process.exit(1); });
  process.once('SIGTERM', terminate);
  t.after(async () => { try { await cleanup(); } finally { process.removeListener('SIGTERM', terminate); } });
  ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
  ok('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']);
  pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
  apply('prerequisites.sql', `create role anon; create role authenticated; create role service_role;
    create table public.admin_wallets(public_key text primary key);
    create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
    insert into public.admin_wallets values ('${admin}'),('${beneficiary}');
    insert into public.incidents values ('membership','vaquita','${beneficiary}');`);
  const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
  for (const v of ['014', '20261011060218']) {
    const matches = retained.migrations.filter(m => m.version === v); assert.equal(matches.length, 1);
    apply(v + '.sql', matches[0].statements.join(';\n'));
  }
  for (let n = 15; n <= through; n++) { console.log(`APPLY ${migrations[n - 15]}`); apply(migrations[n - 15], source(n)); }
  const catalog = () => json(`select jsonb_object_agg(p.oid::regprocedure::text,to_jsonb(p)||
    jsonb_build_object('comment',obj_description(p.oid,'pg_proc'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';`, null);
  return { sql, json, raw, apply, asyncSQL, observe, catalog, cleanup };
}
// Reuse the existing public constructor sequence, never insert journal rows.
function domain(db) {
  const { sql, json } = db, seeds = new Map();
  const call = (name, n, a = admin, tail = '') => `public.${name}('${id(n)}','${a}'${tail})`;
  const rpc = (name, n, a = admin, tail = '') => `select ${call(name, n, a, tail)};`;
  const clock = () => Number(sql('select floor(extract(epoch from clock_timestamp()));'));
  const page = (at, ledger, from, records = []) => ({ revision: 1, from_cursor: from,
    to_cursor: records.at(-1)?.pagingToken || from, through_ledger: ledger, ledger_hash: hash(ledger), closed_at: at, records });
  const observation = (n, at, ledger, transactionHash, source, sequence, type) => {
    const pagingToken = String((BigInt(ledger) << 32n) + 4096n);
    const transaction = { hash: transactionHash, paging_token: pagingToken, ledger, created_at: iso(at),
      source_account: source, source_account_sequence: sequence, fee_account: source, fee_charged: '100', max_fee: '100',
      successful: true, operation_count: 1, envelope_xdr: 'AQID', result_xdr: 'AAAA' };
    return { network: 'TESTNET', transactionHash, source, sequence, feePayer: source, feeChargedStroops: '100', feeBidStroops: '100',
      outcome: 'success', ledger, ledgerHash: hash(ledger), closedAt: at, pagingToken, envelopeXdr: 'AQID', resultXdr: 'AAAA',
      operationTypes: [type], poolOperationSourceIndices: source === key(n) ? [0] : [],
      raw: { transaction, ledger: { sequence: ledger, hash: hash(ledger), closed_at: iso(at) } },
      context: { pool: key(n), firstLedger: 900, anchor: { sequence: ledger, hash: hash(ledger), closedAt: at } } };
  };
  const prepare = (n, poolNumber = n, confirmed = clock(), operationId = String(n)) => {
    const input = { request_id: id(n), authorized_by: admin, confirmed_at: confirmed, ledger: 900,
      memo_hash: createHash('sha256').update('vaca.d1.donation.v1\nmembership').digest('hex'),
      payment: { transaction_hash: hash(n), operation_id: operationId, donor: admin, pool: key(poolNumber), amount: '2.0000000', asset: { type: 'native' } },
      request: { version: 1, incident_id: 'membership', donor: admin, beneficiary, amount: '1.0000000', asset: { type: 'native' }, deadline: iso(confirmed + 300) } };
    sql(`select public.d1_activate_pool('${id(100 + poolNumber)}','${key(poolNumber)}',900); select public.d1_prepare(${lit(input)});`);
    return input;
  };
  // Canonical normalized019 shapes, as in operating-credit-journal and discovery.ts.
  // Raw bytes remain opaque SQL fixtures; no SDK/provider truth is asserted.
  const discovered = (tx, classification) => {
    const operationId = String(BigInt(tx.pagingToken) + 1n), sdk_type = tx.operationTypes[0];
    const raw = { id: operationId, paging_token: operationId, transaction_hash: tx.transactionHash,
      transaction_successful: true, source_account: tx.source, created_at: iso(tx.closedAt), type_i: sdk_type,
      ...(sdk_type === 0 ? { type: 'create_account', funder: tx.source, account: tx.context.pool, starting_balance: '1.0000000' } :
        sdk_type === 1 ? { type: 'payment', from: tx.source, to: tx.context.pool, amount: '2.0000000', asset_type: 'native' } :
          { type: 'create_claimable_balance' }) };
    return { paging_token: operationId, operation_id: operationId, transaction_hash: tx.transactionHash, ledger: tx.ledger,
      operation: { ...classification, sdk_type, source: tx.source, confirmed_at: tx.closedAt,
        memo: tx.raw.transaction.memo_type === 'text' ? { type: 'text', value: tx.raw.transaction.memo } : { type: 'none', value: null },
        raw: { operation: raw, transaction: tx.raw.transaction } } };
  };
  const discovery = (n, at, ledger, records, who = admin) => {
    const current = json(rpc('d1_load_discovery_checkpoint', 100 + n, who)).checkpoint;
    const from = current?.cursor || '0', to = records.at(-1)?.paging_token || from;
    sql(rpc('d1_record_discovery_page', 100 + n, who, ',' + lit({ ...page(at, ledger, from), to_cursor: to, records })));
    if (records.length) sql(rpc('d1_record_discovery_page', 100 + n, who, ',' + lit(page(at, ledger, to))));
  };
  const seed = (n, outcomeActor = admin, { rich = false, deferOutcome = false } = {}) => {
    const at = clock(), confirmed = at - 285, end = confirmed + 300, pool = key(n);
    const paymentToken = String((900n << 32n) + (rich ? 8192n : 4096n));
    const input = prepare(n, n, confirmed, rich ? String(BigInt(paymentToken) + 1n) : String(n));
    const anchor = { sequence: 901, hash: hash(901), closedAt: at };
    const donation = { donor: admin, asset: { type: 'native' }, amountStroops: '20000000', operationId: input.payment.operation_id, transactionHash: hash(n), confirmedAt: confirmed };
    const payment = observation(n, confirmed, 900, hash(n), admin, '1', 1);
    payment.pagingToken = payment.raw.transaction.paging_token = paymentToken;
    // Earlier payment inclusion, observed under the current901 anchor. A900
    // page cannot have both confirmed and current closedAt (024 enforces this).
    payment.context.anchor = anchor;
    let creation, credit, initialRecords = [payment];
    if (rich) {
      creation = observation(n, confirmed, 900, hash(6000 + n), beneficiary, '1', 0);
      creation.context.anchor = anchor;
      Object.assign(creation.raw.transaction, { memo_type: 'text', memo: 'D1OPS' });
      const created = discovered(creation, { kind: 'account_created', pool, funder: beneficiary, starting_balance: '1.0000000' });
      discovery(n, at, 901, [created, discovered(payment, { kind: 'incoming_payment', pool, donor: admin, asset: { type: 'native' }, amount: '2.0000000' })]);
      credit = json(rpc('d1_record_operating_credit', 100 + n, admin, ',' + lit({ namespace: id(100 + n), network: 'TESTNET', pool,
        funder: beneficiary, operationId: created.operation_id, transactionHash: creation.transactionHash, ledger: 900,
        amountStroops: '10000000', anchor, record: created })));
      initialRecords = [creation, payment];
    }
    const snapshot = { kind: 'd1_initial_financial_snapshot', revision: 1, namespace: id(100 + n), network: 'TESTNET', pool, requestId: id(n),
      anchor, observedAt: at, expiresAt: end, creation: { kind: 'opaque_fixture_NOT_SDK_proof' }, originalDonation: donation,
      account: { pool, networkPassphrase: 'Test SDF Network ; September 2015', anchor, sequence: '2', baseFee: '100' },
      obligations: { donations: [donation] }, unissuedRefundOperationIds: [input.payment.operation_id], unissuedRefundFeeStroops: '100',
      budget: { otherFutureFees: '100', transactionFee: '100', newFutureRefundFee: '300' } };
    sql(`begin; select ${call('d1_register_issuance_intent', n)};
      select ${call('d1_reserve_issuance_sequence', n, admin, ",'2'")};
      select ${call('d1_save_unsigned_transaction', n, admin, `,'AAAA','${hash(1000 + n)}'`)};
      select ${call('d1_record_issuance_fee_commitment', n, admin, ",'100','300'")};
      ${rich ? '' : `select ${call('d1_record_discovery_page', 100 + n, admin, ',' + lit(page(at, 901, '0')))};`}
      select ${call('d1_record_transaction_page', 100 + n, admin, ',' + lit(page(at, 901, '0', initialRecords)))};
      select ${call('d1_record_transaction_page', 100 + n, admin, ',' + lit(page(at, 901, payment.pagingToken)))};
      do $seed$ declare s jsonb; f jsonb; begin
        s := ${lit(snapshot)} || jsonb_build_object('commitment',${call('d1_load_issuance_fee_commitments', n)}->'commitment',
          'historyState',${call('d1_load_transaction_history_state', 100 + n)},'creditState',${call('d1_load_operating_credit_state', 100 + n)});
        f := public.d1_record_initial_financial_observation('${id(n)}','${admin}',s);
        perform public.d1_record_signed_transaction('${id(n)}','${admin}',f->>'snapshot_hash','AQID');
        perform public.d1_claim_submission_attempt('${id(n)}','${admin}',f->>'snapshot_hash','${id(200 + n)}');
        if clock_timestamp() >= '${iso(end)}'::timestamptz then raise exception 'fixture_missed_original_deadline'; end if;
      end $seed$; commit;`);
    const issued = observation(n, at, 902, hash(1000 + n), pool, '3', 14);
    if (rich) discovery(n, at, 902, [discovered(issued, { kind: 'quarantined', reason: 'unsupported_operation' })]);
    else sql(rpc('d1_record_discovery_page', 100 + n, admin, ',' + lit(page(at, 902, '0'))));
    sql(rpc('d1_record_transaction_page', 100 + n, admin, ',' + lit(page(at, 902, payment.pagingToken, [issued]))));
    const observed = { kind: 'd1_initial_issuance_outcome', revision: 1, observation: issued,
      outcome: 'success', claimableBalanceId: '00000000' + hash(2000 + n) };
    const receipt = deferOutcome ? null : json(rpc('d1_record_issuance_outcome', n, outcomeActor, ',' + lit(observed)));
    if (rich) discovery(n, at, 903, []);
    else sql(rpc('d1_record_discovery_page', 100 + n, admin, ',' + lit(page(at, 903, '0'))));
    sql(rpc('d1_record_transaction_page', 100 + n, admin, ',' + lit(page(at, 903, issued.pagingToken))));
    const f = { n, at, end, input, payment, issued, observed, receipt, creation, credit }; seeds.set(n, f); return f;
  };
  const acquisition = f => {
    const n = f.n, historyState = json(rpc('d1_load_transaction_history_state', 100 + n));
    const r = observation(n, f.at, 903, hash(3000 + n), beneficiary, '5', 15);
    const original = { requestId: id(n), attemptId: id(200 + n), outcomeHash: f.receipt.outcome_hash, authorizedBy: f.receipt.authorized_by,
      donor: admin, beneficiary, asset: { type: 'native' }, amountStroops: '10000000', operationId: f.input.payment.operation_id, paymentTransactionHash: hash(n),
      deadline: f.input.request.deadline, issuanceTransactionHash: f.issued.transactionHash,
      claimableBalanceId: f.observed.claimableBalanceId, feeChargedStroops: '100', sequence: '3' };
    return { kind: 'd1_beneficiary_claim_acquisition', revision: 1, positiveAcquisition: 'pinned_testnet_horizon_beneficiary_transactions',
      provenance: 'authenticated_saved_original_and_supplied_raw_inclusion', historyState,
      claim: { kind: 'd1_positive_beneficiary_claim', revision: 1, requestId: id(n), namespace: id(100 + n), network: 'TESTNET', pool: key(n),
        original, claimedPrincipalStroops: '10000000', asset: { type: 'native' }, originalGrossStroops: '20000000', grossLessThisClaimStroops: '10000000',
        claimOperationIndex: 0, feePayer: beneficiary, feeChargedStroops: '100', observation: r },
      acquisition: { kind: 'd1_pinned_beneficiary_acquisition', version: 1, origin: 'https://horizon-testnet.stellar.org', network: 'TESTNET',
        namespace: id(100 + n), beneficiary, pool: key(n), requestId: id(n), firstLedger: 900, anchor: r.context.anchor,
        claimableBalanceId: original.claimableBalanceId, transactionHash: r.transactionHash, operationIndex: 0, pages: 1, records: 1,
        evidence: { raw: { ...r.raw, context: r.context }, parsed: r }, executionAuthority: false, settlementAuthority: false } };
  };
  const enroll = (n, who = actor, pool = key(n)) => sql(`insert into public.d1_refund_service_scopes values ('${who}','${id(100 + n)}','${pool}');`, null);
  const state = () => json(`select jsonb_build_array(${[...seeds].map(([n, f]) => `jsonb_build_object(
    'preparation',public.d1_prepare(${lit(f.input)}),'unsigned',${call('d1_load_unsigned_transaction', n)},
    'initial',${call('d1_load_issuance_outcome', n)},'owner',${call('d1_load_active_issuance_sequence', 100 + n)},
    'history',${call('d1_load_transaction_history_state', 100 + n)},'records',${call('d1_list_transaction_records', 100 + n)},
    'credit',${call('d1_load_operating_credit_state', 100 + n)},'fees',${call('d1_load_issuance_fee_commitments', n)},
    'beneficiary',${call('d1_list_beneficiary_claim_set', 100 + n)},
    'financial',jsonb_build_array(${(f.financialHashes || []).map(h => call('d1_load_refund_financial_observation', n, admin, `,'${h}'`)).join(',')}),
    'remainderFinancial',jsonb_build_array(${(f.remainderHashes || []).map(h => call('d1_load_remainder_financial_observation', n, admin, `,'${h}'`)).join(',')}),
    'v1',${call('d1_load_refund_signing_journal', n)},
    'v1attempt',${call('d1_load_refund_submission_attempt', n)},'v1outcome',${call('d1_load_refund_outcome', n)},
    'v2',${call('d1_load_remainder_signing_journal', n)},'v2attempt',${call('d1_load_remainder_submission_attempt', n)},
    'v2outcome',${call('d1_load_remainder_outcome', n)},'fence',${call('d1_load_refund_lane_fence', n)})`).join(',')});`);
  const reject = (q, message = 'unauthorized_admin_wallet', code = '42501', role = 'service_role') => {
    const before = state();
    for (const [verbosity, expected] of [['terse', message], ['sqlstate', code]]) {
      assert.deepEqual(db.raw(`set role ${role}; ${q}`, verbosity), { status: 1, stdout: 'SET\n', stderr: `ERROR:  ${expected}\n` });
    }
    assert.deepEqual(state(), before, 'rejection preserves public receipts, counts and ownership');
  };
  return { call, rpc, clock, page, prepare, seed, acquisition, enroll, state, reject, seeds, observation, discovery };
}
// SQL-only full042/043 observation: every membership is captured through its
// public reader; no private helper calls, pre-approved DTOs or journal injection.
// Monetary projections below are checked independently by043 against019/024/022.
function remainderSnapshot(db, d, f, candidate) {
  const n = f.n, namespace = id(100 + n), requestId = id(n), pool = key(n), membership = [];
  const capture = (name, args) => {
    const values = Object.values(args).map(v => typeof v === 'number' ? String(v) : text(v)).join(',');
    const data = db.json(`select public.${name}(${values});`);
    membership.push({ name, args, data }); return data;
  };
  const request = { p_request_id: requestId, p_authorized_by: actor }, scope = { p_namespace: namespace, p_authorized_by: actor };
  const reads = {};
  for (const name of ['d1_load_issuance_outcome', 'd1_load_submission_attempt', 'd1_load_signed_transaction',
    'd1_load_unsigned_transaction', 'd1_load_issuance_fee_commitments', 'd1_load_beneficiary_claim',
    'd1_load_refund_outcome', 'd1_load_refund_candidate', 'd1_load_refund_submission_attempt']) reads[name] = capture(name, request);
  for (const name of ['d1_load_active_issuance_sequence', 'd1_load_transaction_history_state', 'd1_load_discovery_state',
    'd1_load_operating_credit_state', 'd1_list_beneficiary_claim_set']) reads[name] = capture(name, scope);
  const records = capture('d1_list_transaction_records', { ...scope, p_after: '0', p_limit: 100 }).records;
  const receipts = capture('d1_list_operating_credits', { ...scope, p_after: '0', p_limit: 100 }).receipts;
  for (const receipt of receipts) capture('d1_load_operating_credit', { ...scope, p_operation_id: receipt.observation.operationId });
  for (const digest of new Set([reads.d1_load_signed_transaction.transaction.snapshot_hash, reads.d1_load_submission_attempt.attempt.snapshot_hash]))
    capture('d1_load_initial_financial_observation', { ...request, p_snapshot_hash: digest });
  const history = reads.d1_load_transaction_history_state, cp = history.checkpoint;
  const anchor = { sequence: cp.through_ledger, hash: cp.ledger_hash, closedAt: cp.closed_at };
  const encumbrance = reads.d1_load_beneficiary_claim.claim.acquisition.claim.original;
  const donation = { donor: admin, asset: { type: 'native' }, amountStroops: '20000000',
    operationId: f.input.payment.operation_id, transactionHash: hash(n), confirmedAt: f.input.confirmed_at };
  const unmatched = [], unexplained = [{ transactionHash: f.issued.transactionHash, operationIndex: 0, reason: 'unexplained_pool_operation' }];
  const original = { nativeDonorLiabilityStroops: '20000000', issuedDonorLiabilities: [], donations: [donation],
    observedOperatingCreditStroops: '10000000', operatingOperationIds: [f.credit.observation.operationId], unexplainedActivity: unexplained };
  const accounting = { context: { kind: 'd1_issuance_accounting_context', revision: 1,
    accounting: { kind: 'd1_issuance_encumbrances', revision: 1, original,
      donations: [{ ...donation, issuedStroops: '10000000', unissuedStroops: '10000000' }],
      encumbrances: [encumbrance], failedIssuances: [], unmatchedActivity: unmatched },
    included: { feeChargedStroops: '100', sequence: '3', claimableBalanceId: f.observed.claimableBalanceId },
    confirmedPoolFeesSpentStroops: '100', held: { commitment: reads.d1_load_issuance_fee_commitments.commitment,
      activeOwner: reads.d1_load_active_issuance_sequence } }, history: { state: history, records, confirmedPoolFeesSpentStroops: '100' } };
  const selected = { ...donation, verifiedBeneficiaryPrincipalStroops: '10000000', verifiedSuccessfulDonorRefundStroops: '0',
    observedReturnedPrincipalStroops: null, remainingProtectedPrincipalStroops: '10000000', returnUnresolved: true,
    positivelyClaimedBalanceIds: [f.observed.claimableBalanceId] };
  const observedAt = d.clock();
  const funding = { kind: 'd1_current_remainder_funding_observation', revision: 1, executionAuthority: false, settlementAuthority: false,
    scope: { namespace, pool, requestId, authenticatedAdmin: actor }, startedAt: observedAt, observedAt, expiresAt: cp.closed_at + 30,
    maximumAgeSeconds: 30, futureToleranceSeconds: 2, accounting, claimSet: reads.d1_list_beneficiary_claim_set,
    credits: { state: reads.d1_load_operating_credit_state, receipts, observedCreditStroops: '10000000' },
    creation: { kind: 'd1_pool_creation_evidence', revision: 1, namespace, network: 'TESTNET', pool, firstLedger: 900, anchor,
      creation: { transactionHash: f.creation.transactionHash, operationId: f.credit.observation.operationId, operationIndex: 0,
        ledger: 900, closedAt: f.creation.closedAt, funder: beneficiary, startingBalanceStroops: '10000000' } },
    account: { pool, networkPassphrase: 'Test SDF Network ; September 2015', anchor, baseFee: '100', baseReserve: '1', sequence: '3',
      lastModifiedLedger: 902, native: { balance: '19999900', sellingLiabilities: '0' }, issuedBalances: [],
      account: { subentry_count: 0, num_sponsoring: 0, num_sponsored: 0 } },
    originals: { namespace, pool, firstLedger: 900, anchor, transactions: records, operatingCredits: receipts,
      issuances: [{ unsignedJournal: reads.d1_load_unsigned_transaction.transaction, outcomeReceipt: reads.d1_load_issuance_outcome.outcome }] },
    cumulative: { kind: 'd1_cumulative_remainders', revision: 1, executionAuthority: false, settlementAuthority: false,
      donations: [selected], unmatchedActivity: unmatched }, selected, otherRefundOperationIds: [], otherHeldFees: '0',
    operating: { currentMinimum: '2', otherFutureFees: '200', newClaimantReserve: '0', transactionFee: '100', newFutureRefundFee: '0',
      requiredOperating: '302', teamCap: '9999900', physicalCap: '9999900', availableOperating: '9999900', remainingOperating: '9999598' },
    budget: { minimumTransactionFee: '100', protectedSelectedExcess: '200', requiredOperating: '302', teamCap: '9999900',
      availableOperating: '9999900', remainingOperating: '9999598' }, membership };
  return { kind: 'd1_remainder_financial_snapshot', revision: 2, requestId, namespace, network: 'TESTNET', pool,
    observedAt, expiresAt: funding.expiresAt, candidate, funding };
}
module.exports = { isolated, domain, remainderSnapshot, migrations, source, admin, beneficiary, actor, stranger, key, id, hash, text, lit, iso };
