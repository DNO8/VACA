// SQL membership only. Opaque XDR below is NOT SDK, consensus, current availability,
// settlement or spending proof. T2b owns positive SDK verification.
// Default: legacy015-038 + optional039. D1_CURRENT_ADMISSIONS=1 also applies048-054.
// Reader service membership must never become permission for admin writer replay.
// Deliberately excludes parallel040 and all041-047; no synthetic public v2 route.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const repo = path.resolve(__dirname, '../../..');
const currentAdmissions = process.env.D1_CURRENT_ADMISSIONS === '1';
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

test('beneficiary claim SQL membership binds original evidence and preserves public history', async () => {
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-beneficiary-membership-'));
  const data = path.join(fixture, 'data'), seeded = [];
  const args = ['-X', '--no-password', ...connectionArgs, '-p', String(port), '-U', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '-At'];
  let started = false, pid, cleanupPromise;
  const run = (tool, a) => {
    const r = spawnSync(process.execPath, [launcher, tool, ...a], { env, encoding: 'utf8', timeout: 10000 });
    assert.ifError(r.error); return r;
  };
  const ok = (tool, a) => {
    const r = run(tool, a); assert.equal(r.status, 0, JSON.stringify(r)); assert.equal(r.stderr, ''); return r.stdout;
  };
  const sql = q => ok('psql', [...args, '-c', `set role service_role; ${q}`]).replace(/^SET\r?\n/, '').trim();
  const json = q => JSON.parse(sql(q));
  const call = (name, n, actor = admin) => `public.${name}('${id(n)}',${text(actor)})`;
  const load = n => `select ${call('d1_load_beneficiary_claim', n)};`;
  const record = (n, acquisition, actor = admin) =>
    `select public.d1_record_beneficiary_claim('${id(n)}',${text(actor)},${lit(acquisition)});`;
  const list = n => `select ${call('d1_list_beneficiary_claim_set', 100 + n)};`;
  const history = n => json(`select ${call('d1_load_transaction_history_state', 100 + n)};`);
  const oldState = () => json(`select jsonb_build_array(${seeded.map(n => `jsonb_build_object(
    'unsigned',${call('d1_load_unsigned_transaction', n)},'signed',${call('d1_load_signed_transaction', n)},
    'attempt',${call('d1_load_submission_attempt', n)},'outcome',${call('d1_load_issuance_outcome', n)},
    'fees',${call('d1_load_issuance_fee_commitments', n)},'initial_owner',${call('d1_load_active_issuance_sequence', 100 + n)},
    'refund',${call('d1_load_refund_candidate', n)},'history',${call('d1_load_transaction_history_state', 100 + n)},
    'records',${call('d1_list_transaction_records', 100 + n)},'credits',${call('d1_load_operating_credit_state', 100 + n)})`).join(',')});`);
  const state = () => ({ old: oldState(), membership: json(`select jsonb_build_array(${seeded.map(n =>
    `jsonb_build_object('lookup',${call('d1_load_beneficiary_claim', n)},'set',${call('d1_list_beneficiary_claim_set', 100 + n)})`).join(',')});`) });
  // Exact native psql status/stdout/stderr; ON_ERROR_STOP off exits0 at EOF even
  // for SQL errors. SQLSTATE, error text and public-state equality prove rejection.
  const rejected = (q, code, message, role = 'service_role') => {
    const before = state(), file = path.join(fixture, 'rejection.sql');
    fs.writeFileSync(file, `\\set ON_ERROR_STOP off\nset role ${role};\n${q}\n\\echo SQLSTATE=:LAST_ERROR_SQLSTATE\n`);
    const r = run('psql', [...args, '-f', file]);
    assert.equal(r.status, 0, JSON.stringify(r));
    assert.equal(r.stdout, `SET\nSQLSTATE=${code}\n`);
    assert.equal(r.stderr, `psql:${file}:${2 + q.split('\n').length}: ERROR:  ${message}\n`);
    assert.deepEqual(state(), before, 'rejection must preserve receipts, owners, records and public counters');
  };
  const successful = (q, expected) => {
    const canonical = sql(`select ${lit(expected)}::text;`);
    const r = run('psql', [...args, '-c', `set role service_role; ${q}`]);
    assert.equal(r.status, 0, JSON.stringify(r)); assert.equal(r.stderr, '');
    assert.equal(r.stdout, `SET\n${canonical}\n`); return expected;
  };
  const cleanup = () => cleanupPromise ||= (async () => {
    const pidfile = path.join(data, 'postmaster.pid');
    if (!pid && fs.existsSync(pidfile)) pid = Number(fs.readFileSync(pidfile, 'utf8').split('\n')[0]);
    if (started || fs.existsSync(pidfile)) {
      ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']); started = false;
    }
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    // Only this test's owned disposable resources, never source/historical files.
    fs.rmSync(fixture, { recursive: true, force: true }); assert.equal(fs.existsSync(fixture), false);
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);
  })();
  const terminate = () => cleanup().then(() => process.exit(143), e => { console.error(e); process.exit(1); });
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
      insert into public.admin_wallets values ('${admin}'),('${beneficiary}');
      insert into public.incidents values ('membership','vaquita','${beneficiary}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const v of ['014', '20261011060218']) apply(v + '.sql', retained.migrations.find(m => m.version === v).statements.join(';\n'));
    for (const name of fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(n => /^0(1[5-9]|2[0-9]|3[0-8])_/.test(n)).sort()) {
      apply(name, fs.readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8'));
    }
    const migration = path.join(repo, 'supabase/migrations/039_d1_beneficiary_claims.sql');
    if (fs.existsSync(migration)) apply(path.basename(migration), fs.readFileSync(migration, 'utf8'));
    if (currentAdmissions) {
      const overlays = fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(n => /^0(4[89]|5[0-4])_/.test(n)).sort();
      assert.equal(overlays.length, 7, 'all current048-054 admission migrations must be exercised');
      for (const name of overlays) apply(name, fs.readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8'));
    }

    const observation = (n, at, ledger, transactionHash, source, sequence, type, failed = false) => {
      const ledgerHash = hash(ledger), pagingToken = String((BigInt(ledger) << 32n) + 4096n);
      const transaction = { hash: transactionHash, paging_token: pagingToken, ledger, created_at: iso(at),
        source_account: source, source_account_sequence: sequence, fee_account: source, fee_charged: '100', max_fee: '100',
        successful: !failed, operation_count: 1, envelope_xdr: 'AQID', result_xdr: 'AAAA' };
      return { network: 'TESTNET', transactionHash, source, sequence, feePayer: source, feeChargedStroops: '100', feeBidStroops: '100',
        outcome: failed ? 'failed' : 'success', ledger, ledgerHash, closedAt: at, pagingToken, envelopeXdr: 'AQID', resultXdr: 'AAAA',
        operationTypes: [type], poolOperationSourceIndices: source === key(n) ? [0] : [],
        raw: { transaction, ledger: { sequence: ledger, hash: ledgerHash, closed_at: iso(at) } },
        context: { pool: key(n), firstLedger: 900, anchor: { sequence: ledger, hash: ledgerHash, closedAt: at } } };
    };
    const page = (at, ledger, from, records = []) => ({ revision: 1, from_cursor: from,
      to_cursor: records.at(-1)?.pagingToken || from, through_ledger: ledger, ledger_hash: hash(ledger), closed_at: at, records });
    const writePage = (n, p) => json(`select public.d1_record_transaction_page('${id(100 + n)}','${admin}',${lit(p)});`);
    const discover = (n, at, ledger) => sql(`select public.d1_record_discovery_page('${id(100 + n)}','${admin}',${lit(page(at, ledger, '0'))});`);
    const seed = (n, { incoming = true, outcome = true, failed = false } = {}) => {
      const at = Number(sql('select floor(extract(epoch from clock_timestamp()));'));
      const pool = key(n), deadline = iso(at + 300);
      const input = { request_id: id(n), authorized_by: admin, confirmed_at: at, ledger: 900,
        memo_hash: createHash('sha256').update('vaca.d1.donation.v1\nmembership').digest('hex'),
        payment: { transaction_hash: hash(n), operation_id: String(n), donor: admin, pool, amount: '2.0000000', asset: { type: 'native' } },
        request: { version: 1, incident_id: 'membership', donor: admin, beneficiary, amount: '1.0000000', asset: { type: 'native' }, deadline } };
      sql(`select public.d1_activate_pool('${id(100 + n)}','${pool}',900); select public.d1_prepare(${lit(input)});
        select ${call('d1_register_issuance_intent', n)}; select public.d1_reserve_issuance_sequence('${id(n)}','${admin}','2');
        select public.d1_save_unsigned_transaction('${id(n)}','${admin}','AAAA','${hash(1000 + n)}');
        select public.d1_record_issuance_fee_commitment('${id(n)}','${admin}','100','300');`);
      discover(n, at, 900);
      const payment = observation(n, at, 900, hash(n), admin, '1', 1);
      let cursor = '0';
      if (incoming) { writePage(n, page(at, 900, cursor, [payment])); cursor = payment.pagingToken; }
      writePage(n, page(at, 900, cursor));
      const anchor = { sequence: 900, hash: hash(900), closedAt: at };
      const donation = { donor: admin, asset: { type: 'native' }, amountStroops: '20000000', operationId: String(n), transactionHash: hash(n), confirmedAt: at };
      const snapshot = { kind: 'd1_initial_financial_snapshot', revision: 1, namespace: id(100 + n), network: 'TESTNET', pool, requestId: id(n),
        anchor, observedAt: at, expiresAt: at + 30, creation: { kind: 'opaque_fixture_NOT_SDK_proof' }, originalDonation: donation,
        account: { pool, networkPassphrase: 'Test SDF Network ; September 2015', anchor, sequence: '2', baseFee: '100' },
        obligations: { donations: [donation] }, unissuedRefundOperationIds: [String(n)], unissuedRefundFeeStroops: '100',
        budget: { otherFutureFees: '100', transactionFee: '100', newFutureRefundFee: '300' } };
      // Reuse public membership constructors; no private journal/owner insertion.
      sql(`do $seed$ declare s jsonb; f jsonb; begin
        s := ${lit(snapshot)} || jsonb_build_object('commitment',${call('d1_load_issuance_fee_commitments', n)}->'commitment',
          'historyState',${call('d1_load_transaction_history_state', 100 + n)},'creditState',${call('d1_load_operating_credit_state', 100 + n)});
        f := public.d1_record_initial_financial_observation('${id(n)}','${admin}',s);
        perform public.d1_record_signed_transaction('${id(n)}','${admin}',f->>'snapshot_hash','AQID');
        perform public.d1_claim_submission_attempt('${id(n)}','${admin}',f->>'snapshot_hash','${id(200 + n)}');
      end $seed$;`);
      const issued = observation(n, at, 901, hash(1000 + n), pool, '3', 14, failed);
      discover(n, at, 901); writePage(n, page(at, 901, cursor, [issued]));
      const observed = { kind: 'd1_initial_issuance_outcome', revision: 1, observation: issued,
        outcome: issued.outcome, claimableBalanceId: failed ? null : '00000000' + hash(2000 + n) };
      const receipt = outcome ? json(`select public.d1_record_issuance_outcome('${id(n)}','${admin}',${lit(observed)});`) : null;
      // Final terminal page makes coverage explicit; an absent beneficiary tx is
      // NOT proof of a claim.039 accepts supplied positive evidence, not absence.
      discover(n, at, 902);
      const terminal = page(at, 902, issued.pagingToken), terminalReceipt = writePage(n, terminal);
      seeded.push(n);
      return { n, at, input, payment, issued, observed, receipt, terminal, terminalReceipt, incoming };
    };
    const empty = n => ({ kind: 'd1_beneficiary_claim_lookup', revision: 1, request_id: id(n),
      namespace: id(100 + n), network: 'TESTNET', pool: key(n), claim: null });
    const first = seed(1);
    assert.equal(history(1).coverage_complete, true);
    assert.equal(history(1).record_count, 2);
    // Intended RED is actual PUBLIC039 lookup missing (42883), after valid domain
    // setup including original transaction, initial attempt/outcome and history.
    const initial = run('psql', [...args, '--set', 'VERBOSITY=sqlstate', '-c', `set role service_role; ${load(1)}`]);
    assert.equal(initial.status, 0, `PUBLIC039_LOOKUP: ${JSON.stringify(initial)}`);
    assert.equal(initial.stderr, ''); assert.deepEqual(JSON.parse(initial.stdout.replace(/^SET\r?\n/, '')), empty(1));

    const acquisition = f => {
      const n = f.n, h = history(n), r = observation(n, f.at, 902, hash(3000 + n), beneficiary, '5', 15);
      const o = { requestId: id(n), attemptId: id(200 + n), outcomeHash: f.receipt?.outcome_hash || hash(9999), authorizedBy: admin,
        donor: admin, beneficiary, asset: { type: 'native' }, amountStroops: '10000000', operationId: String(n), paymentTransactionHash: hash(n),
        deadline: f.input.request.deadline, issuanceTransactionHash: f.issued.transactionHash,
        claimableBalanceId: f.observed.claimableBalanceId || '00000000' + hash(2000 + n), feeChargedStroops: '100', sequence: '3' };
      return { kind: 'd1_beneficiary_claim_acquisition', revision: 1, positiveAcquisition: 'pinned_testnet_horizon_beneficiary_transactions',
        provenance: 'authenticated_saved_original_and_supplied_raw_inclusion', historyState: h,
        claim: { kind: 'd1_positive_beneficiary_claim', revision: 1, requestId: id(n), namespace: id(100 + n), network: 'TESTNET', pool: key(n),
          original: o, claimedPrincipalStroops: '10000000', asset: { type: 'native' }, originalGrossStroops: '20000000', grossLessThisClaimStroops: '10000000',
          claimOperationIndex: 0, feePayer: beneficiary, feeChargedStroops: '100', observation: r },
        acquisition: { kind: 'd1_pinned_beneficiary_acquisition', version: 1, origin: 'https://horizon-testnet.stellar.org', network: 'TESTNET',
          namespace: id(100 + n), beneficiary, pool: key(n), requestId: id(n), firstLedger: 900, anchor: r.context.anchor,
          claimableBalanceId: o.claimableBalanceId, transactionHash: r.transactionHash, operationIndex: 0, pages: 1, records: 1,
          evidence: { raw: { ...r.raw, context: r.context }, parsed: r }, executionAuthority: false, settlementAuthority: false } };
    };
    const good = acquisition(first), serviceActor = key(98);
    if (currentAdmissions) {
      // Trusted fixture-owner CONFIGURATION, not domain history or an enrollment API.
      // Prove the real reader admits this actor before testing independent writer denial.
      ok('psql', [...args, '-c', `insert into public.d1_refund_service_scopes(actor,namespace,pool)
        values ('${serviceActor}','${id(101)}','${key(1)}');`]);
      assert.deepEqual(json(`select ${call('d1_load_beneficiary_claim', 1, serviceActor)};`), empty(1));
      rejected(record(1, good, serviceActor), '42501', 'unauthorized_admin_wallet');
    }
    rejected(record(1, null), '22023', 'invalid_beneficiary_claim');
    const malformed = structuredClone(good); delete malformed.acquisition.evidence;
    rejected(record(1, malformed), '22023', 'invalid_beneficiary_claim');
    // Bounded named binding boundaries, all BEFORE first insert so validation is
    // exercised rather than accidentally testing only the exact-replay guard.
    const contradictions = [
      ['original request', a => { a.claim.original.requestId = id(99); }],
      ['original CB', a => { a.acquisition.claimableBalanceId = '00000000' + hash(99); }],
      ['beneficiary', a => { a.acquisition.beneficiary = admin; }],
      ['transaction', a => { a.acquisition.transactionHash = hash(99); }],
      ['original outcome', a => { a.claim.original.outcomeHash = hash(99); }],
      ['donor', a => { a.claim.original.donor = beneficiary; }],
      ['original deadline', a => { a.claim.original.deadline = iso(first.at + 301); }],
      ['principal/remainder', a => { a.claim.grossLessThisClaimStroops = '20000000'; }],
      ['claim operation', a => { a.acquisition.operationIndex = 1; a.claim.claimOperationIndex = 1; }],
      ['history membership', a => { a.historyState.record_count++; }],
      ['raw inclusion', a => { a.acquisition.evidence.raw.transaction.successful = false; }],
    ];
    for (const [label, change] of contradictions) {
      const bad = structuredClone(good); change(bad);
      rejected(record(1, bad), '23505', 'beneficiary_claim_conflict');
      assert.deepEqual(json(load(1)), empty(1), label);
    }
    const missingPayment = seed(2, { incoming: false });
    rejected(record(2, acquisition(missingPayment)), '23505', 'beneficiary_claim_conflict');
    const missingOutcome = seed(3, { outcome: false });
    rejected(record(3, acquisition(missingOutcome)), '23505', 'beneficiary_claim_conflict');
    const failedOutcome = seed(4, { failed: true });
    rejected(record(4, acquisition(failedOutcome)), '23505', 'beneficiary_claim_conflict');

    const before = oldState();
    const expected = { kind: 'd1_beneficiary_claim_journal', revision: 1, request_id: id(1), namespace: id(101), network: 'TESTNET',
      pool: key(1), authorized_by: admin, acquisition: good,
      acquisition_hash: sql(`select encode(sha256(convert_to(${lit(good)}::text,'UTF8')),'hex');`) };
    successful(record(1, good), expected);
    successful(load(1), { ...empty(1), claim: expected });
    const dataset = { namespace: id(101), network: 'TESTNET', pool: key(1), history_state: good.historyState, count: 1, receipts: [expected] };
    successful(list(1), { ...dataset, kind: 'd1_beneficiary_claim_set', revision: 1,
      set_hash: sql(`select encode(sha256(convert_to(${lit(dataset)}::text,'UTF8')),'hex');`) });
    assert.deepEqual(oldState(), before, 'claim membership cannot settle, retire owners or alter original/history counters');
    const saved = state();
    if (currentAdmissions) {
      assert.deepEqual(json(`select ${call('d1_load_beneficiary_claim', 1, serviceActor)};`), { ...empty(1), claim: expected });
      rejected(record(1, good, serviceActor), '42501', 'unauthorized_admin_wallet');
    }
    successful(record(1, good, beneficiary), expected); assert.deepEqual(state(), saved, 'replay retains original actor/blob');
    const different = structuredClone(good); different.acquisition.records = 2;
    rejected(record(1, different), '23505', 'beneficiary_claim_conflict');
    for (const role of ['anon', 'authenticated']) {
      rejected(load(1), '42501', 'permission denied for function d1_load_beneficiary_claim', role);
      rejected(record(1, good), '42501', 'permission denied for function d1_record_beneficiary_claim', role);
      rejected(list(1), '42501', 'permission denied for function d1_list_beneficiary_claim_set', role);
    }
    rejected(record(1, good, key(99)), '42501', 'unauthorized_admin_wallet');
    // PRESERVE:024 page replay is immutable,025 public enumeration still exposes
    // ONLY the two retained pool transactions, not the supplied beneficiary blob.
    successful(`select public.d1_record_transaction_page('${id(101)}','${admin}',${lit(first.terminal)});`, first.terminalReceipt);
    const records = json(`select ${call('d1_list_transaction_records', 101)};`);
    assert.deepEqual(records.records, [first.payment, first.issued]); assert.equal(records.has_more, false);
    assert.deepEqual(records.history_state, good.historyState); assert.deepEqual(state(), saved);
    console.log('BENEFICIARY_CLAIM_LEGACY_SQL_MEMBERSHIP_REPLAY_REJECTION_HISTORY_OK');
  } finally { process.removeListener('SIGTERM', terminate); await cleanup(); }
});
