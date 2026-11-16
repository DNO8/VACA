// Owned local PostgreSQL and opaque SQL fixtures only: NOT SDK, chain or send authority.
// Default:015–038 + optional040; D1_CURRENT_ADMISSIONS=1 also exercises048–054.
// Public verified-remainder contention remains dependent on041.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const repo = path.resolve(__dirname, '../../..');
const currentAdmissions = process.env.D1_CURRENT_ADMISSIONS === '1';
const admin = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const other = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const text = v => v == null ? 'null' : "'" + String(v).replaceAll("'", "''") + "'";
const lit = v => text(JSON.stringify(v)) + '::jsonb';
function key(n) {
  const bytes = [48, ...Array(32).fill(n)];
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 32768) ? 4129 : 0)) & 65535;
  }
  bytes.push(crc & 255, crc >> 8);
  const bits = bytes.map(b => b.toString(2).padStart(8, '0')).join('');
  let result = '';
  for (let i = 0; i < bits.length; i += 5) result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i, i + 5), 2)];
  return result;
}

test('permanent refund fence backfills and preserves public legacy journals without exposing acquisition', async () => {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const fixture = fs.mkdtempSync(path.join(temp, 'vaca-refund-fence-'));
  const data = path.join(fixture, 'data');
  const transcript = [], inputs = new Map(), financialHashes = new Map();
  let pid, started = false, cleaned = false, stage = 'fixture prerequisites015–038';
  const args = ['-X', '--no-password', ...connectionArgs, '-p', String(port), '-U', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=terse', '-At'];
  const run = (tool, parameters) => {
    const r = spawnSync(process.execPath, [launcher, tool, ...parameters], { env, encoding: 'utf8', timeout: 10000 });
    transcript.push({ stage, tool, parameters, status: r.status, signal: r.signal,
      stdout: r.stdout, stderr: r.stderr, error: r.error?.message });
    assert.ifError(r.error);
    return r;
  };
  const ok = (tool, parameters) => {
    const r = run(tool, parameters);
    assert.equal(r.status, 0, JSON.stringify({ stage, status: r.status, stdout: r.stdout, stderr: r.stderr }));
    assert.equal(r.stderr, '');
    return r.stdout.trim();
  };
  const sql = (q, role = 'service_role') => ok('psql', [...args, '-c', (role ? `set role ${role}; ` : '') + q]).replace(/^SET\r?\n/, '');
  const json = q => JSON.parse(sql(q));
  const clock = () => Number(sql('select extract(epoch from clock_timestamp());'));
  const call = (name, n, actor = admin) => `public.${name}('${id(n)}',${text(actor)})`;
  const load = (n, actor = admin) => `select ${call('d1_load_refund_lane_fence', n, actor)};`;
  const record = (n, bytes = 'AQID', hash = 'c'.repeat(64), actor = admin) =>
    `select public.d1_record_refund_candidate('${id(n)}',${text(actor)},${text(bytes)},${text(hash)});`;
  const apply = (name, source) => {
    const file = path.join(fixture, name);
    fs.writeFileSync(file, source);
    ok('psql', [...args, '-q', '-f', file]);
  };
  // All domain observations (including discovery/history counters and owners)
  // go through the existing public interfaces, never private journal SELECTs.
  const initialState = () => json(`select jsonb_build_array(${[...inputs].map(([n, input]) => `jsonb_build_object(
    'preparation',public.d1_prepare(${lit(input)}),'intent',${call('d1_register_issuance_intent', n)},
    'unsigned',${call('d1_load_unsigned_transaction', n)},'fees',${call('d1_load_issuance_fee_commitments', n)},
    'signed',${call('d1_load_signed_transaction', n)},'attempt',${call('d1_load_submission_attempt', n)},
    'outcome',${call('d1_load_issuance_outcome', n)},'owner',${call('d1_load_active_issuance_sequence', 100 + n)},
    'history',${call('d1_load_transaction_history_state', 100 + n)},'credits',${call('d1_load_operating_credit_state', 100 + n)})`).join(',')});`);
  const state = () => ({ initial: initialState(), refund: json(`select jsonb_build_array(${[...inputs.keys()].map(n => `jsonb_build_object(
    'candidate',${call('d1_load_refund_candidate', n)},'signing',${call('d1_load_refund_signing_journal', n)},
    'submission',${call('d1_load_refund_submission_attempt', n)},'fence',${call('d1_load_refund_lane_fence', n)},
    'financial',jsonb_build_array(${(financialHashes.get(n) || []).map(hash =>
      `public.d1_load_refund_financial_observation('${id(n)}','${admin}','${hash}')`).join(',')}))`).join(',')});`) });
  const rejected = (q, code, message, role = 'service_role') => {
    const before = state(), file = path.join(fixture, 'rejection.sql');
    fs.writeFileSync(file, `\\set ON_ERROR_STOP off\nset role ${role};\n${q}\n\\echo SQLSTATE=:LAST_ERROR_SQLSTATE\n`);
    const r = run('psql', [...args, '-f', file]);
    // psql17 normal EOF exits0 with ON_ERROR_STOP off; exact server error and
    // SQLSTATE prove rejection, not an invented client exit1.
    assert.equal(r.status, 0, JSON.stringify(r));
    assert.equal(r.stdout, `SET\nSQLSTATE=${code}\n`);
    assert.equal(r.stderr, `psql:${file}:${2 + q.split('\n').length}: ERROR:  ${message}\n`);
    assert.deepEqual(state(), before, 'rejection must preserve public receipts, owners and counters');
  };
  const cleanup = () => {
    if (cleaned) return;
    const file = path.join(data, 'postmaster.pid');
    if (!pid && fs.existsSync(file)) pid = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
    if (started || fs.existsSync(file)) {
      ok('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '5', 'stop']);
      started = false;
    }
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    // Only this test's mkdtemp resource is removed, never source or history.
    fs.rmSync(fixture, { recursive: true, force: true });
    assert.equal(fs.existsSync(fixture), false);
    cleaned = true;
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);
  };
  const evidence = () => {
    for (const command of transcript) console.log('REFUND_FENCE_COMMAND ' + JSON.stringify(command));
  };
  const terminate = () => {
    try { cleanup(); } catch (error) { console.error(error); }
    finally { evidence(); process.exit(143); }
  };
  process.once('SIGTERM', terminate);
  try {
    ok('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    ok('pg_ctl', ['-D', data, '-l', path.join(fixture, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '5', 'start']);
    started = true;
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    apply('fixture.sql', `create role anon; create role authenticated; create role service_role;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}'),('${other}');
      insert into public.incidents values ('refund','vaquita','${admin}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo, 'recovery/supabase/2026-10-27/retained-migrations.json'), 'utf8'));
    for (const version of ['014', '20261011060218']) {
      apply(version + '.sql', retained.migrations.find(m => m.version === version).statements.join(';\n'));
    }
    for (const name of fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(n => /^0(1[5-9]|2[0-9]|3[0-8])_/.test(n)).sort()) {
      apply(name, fs.readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8'));
    }
    // Same public fixture chain as refund-candidates.test.cjs. Every initial
    // write must finish before the original confirmation+300 deadline, no retry.
    const seed = n => {
      const at = Math.floor(clock()), confirmed = at - 292, end = confirmed + 300, pool = key(n);
      const deadline = new Date(end * 1000).toISOString().replace('.000Z', 'Z');
      const input = { request_id: id(n), authorized_by: admin, confirmed_at: confirmed, ledger: 900,
        memo_hash: createHash('sha256').update('vaca.d1.donation.v1\nrefund').digest('hex'),
        payment: { transaction_hash: n.toString(16).padStart(64, '0'), operation_id: String(n), donor: admin, pool,
          amount: '2.0000000', asset: { type: 'native' } },
        request: { version: 1, incident_id: 'refund', donor: admin, beneficiary: admin, amount: '1.0000000', asset: { type: 'native' }, deadline } };
      const anchor = { sequence: 900, hash: '9'.repeat(64), closedAt: at };
      const page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: 900, ledger_hash: anchor.hash, closed_at: at, records: [] };
      const donation = { donor: admin, asset: { type: 'native' }, amountStroops: '20000000', operationId: String(n),
        transactionHash: input.payment.transaction_hash, confirmedAt: confirmed };
      const snapshot = { kind: 'd1_initial_financial_snapshot', revision: 1, namespace: id(100 + n), network: 'TESTNET', pool, requestId: id(n), anchor,
        observedAt: at, expiresAt: end, creation: { kind: 'opaque_fixture_NOT_SDK_proof' }, originalDonation: donation,
        account: { pool, networkPassphrase: 'Test SDF Network ; September 2015', anchor, sequence: '2', baseFee: '100' },
        obligations: { donations: [donation] }, unissuedRefundOperationIds: [String(n)], unissuedRefundFeeStroops: '100',
        budget: { otherFutureFees: '100', transactionFee: '100', newFutureRefundFee: '300' } };
      sql(`begin; select public.d1_activate_pool('${id(100 + n)}','${pool}',900); select public.d1_prepare(${lit(input)});
        select ${call('d1_register_issuance_intent', n)}; select public.d1_reserve_issuance_sequence('${id(n)}','${admin}','2');
        select public.d1_save_unsigned_transaction('${id(n)}','${admin}','AAAA','${'a'.repeat(64)}');
        select public.d1_record_issuance_fee_commitment('${id(n)}','${admin}','100','300');
        select public.d1_record_discovery_page('${id(100 + n)}','${admin}',${lit(page)});
        select public.d1_record_transaction_page('${id(100 + n)}','${admin}',${lit(page)});
        do $seed$ declare s jsonb; f jsonb; begin
          s := ${lit(snapshot)} || jsonb_build_object('commitment',public.d1_load_issuance_fee_commitments('${id(n)}','${admin}')->'commitment',
            'historyState',public.d1_load_transaction_history_state('${id(100 + n)}','${admin}'),
            'creditState',public.d1_load_operating_credit_state('${id(100 + n)}','${admin}'));
          f := public.d1_record_initial_financial_observation('${id(n)}','${admin}',s);
          perform public.d1_record_signed_transaction('${id(n)}','${admin}',f->>'snapshot_hash','AQID');
          perform public.d1_claim_submission_attempt('${id(n)}','${admin}',f->>'snapshot_hash','${randomUUID()}');
          if clock_timestamp() >= '${deadline}'::timestamptz then raise exception 'fixture_missed_original_deadline'; end if;
        end $seed$; commit;`);
      inputs.set(n, input);
      assert.ok(clock() < end, 'fixture initial public chain missed deadline; never backdate/retry');
      return { end, deadline };
    };
    const token = String((901n << 32n) + 4096n);
    const outcome = n => {
      const at = Math.floor(clock()), pool = key(n), time = new Date(at * 1000).toISOString().replace('.000Z', 'Z');
      const transaction = { hash: 'a'.repeat(64), paging_token: token, ledger: 901, created_at: time, source_account: pool,
        source_account_sequence: '3', fee_account: pool, fee_charged: '100', max_fee: '100', successful: true,
        operation_count: 1, envelope_xdr: 'AQID', result_xdr: 'AAAA' };
      const observation = { network: 'TESTNET', transactionHash: transaction.hash, source: pool, sequence: '3', feePayer: pool,
        feeChargedStroops: '100', feeBidStroops: '100', outcome: 'success', ledger: 901, ledgerHash: 'b'.repeat(64), closedAt: at,
        pagingToken: token, envelopeXdr: 'AQID', resultXdr: 'AAAA', operationTypes: [14], poolOperationSourceIndices: [0],
        raw: { transaction, ledger: { sequence: 901, hash: 'b'.repeat(64), closed_at: time } },
        context: { pool, firstLedger: 900, anchor: { sequence: 901, hash: 'b'.repeat(64), closedAt: at } } };
      const page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: 901, ledger_hash: observation.ledgerHash, closed_at: at, records: [] };
      const results = sql(`select public.d1_record_discovery_page('${id(100 + n)}','${admin}',${lit(page)});
        select public.d1_record_transaction_page('${id(100 + n)}','${admin}',${lit({ ...page, to_cursor: token, records: [observation] })});
        select public.d1_record_issuance_outcome('${id(n)}','${admin}',${lit({ kind: 'd1_initial_issuance_outcome', revision: 1,
          observation, outcome: 'success', claimableBalanceId: '00000000' + '1'.repeat(64) })});`);
      return JSON.parse(results.split('\n').at(-1));
    };
    const waitDeadline = end => sql(`select pg_sleep(greatest(0, ${end}-extract(epoch from clock_timestamp()) + 0.01));`);
    const expectedFence = (n, actor = admin) => ({ kind: 'd1_refund_lane_fence', revision: 1, namespace: id(100 + n),
      request_id: id(n), network: 'TESTNET', pool: key(n), authorized_by: actor, lane: 'full_gross_v1', candidate_hash: 'c'.repeat(64) });
    const lookup = (n, fence) => ({ kind: 'd1_refund_lane_fence_lookup', revision: 1, request_id: id(n),
      namespace: id(100 + n), network: 'TESTNET', pool: key(n), fence });

    const first = seed(1), firstOutcome = outcome(1);
    waitDeadline(first.end);
    const historical = json(record(1)); // Real pre040 candidate, not a private backfill injection.
    assert.deepEqual(historical, { kind: 'd1_refund_candidate', revision: 1, request_id: id(1), namespace: id(101), network: 'TESTNET',
      pool: key(1), authorized_by: admin, initial_transaction_hash: 'a'.repeat(64), initial_outcome_hash: firstOutcome.outcome_hash,
      source_sequence: '3', transaction_sequence: '4', deadline: first.deadline, unsigned_xdr: 'AQID', transaction_hash: 'c'.repeat(64) });
    const beforeMigration = initialState();
    const migration = path.join(repo, 'supabase/migrations/040_d1_refund_lane_fence.sql');
    stage = 'optional040 installation';
    if (fs.existsSync(migration)) apply(path.basename(migration), fs.readFileSync(migration, 'utf8'));
    if (currentAdmissions) {
      const overlays = fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(n => /^0(4[89]|5[0-4])_/.test(n)).sort();
      assert.equal(overlays.length, 7, 'all current048–054 admission migrations must be exercised');
      for (const name of overlays) apply(name, fs.readFileSync(path.join(repo, 'supabase/migrations', name), 'utf8'));
    }
    stage = 'behavior: first public040 lookup (intended missing-function42883 RED)';
    const firstLookup = run('psql', [...args, '--set', 'VERBOSITY=sqlstate', '-c', `set role service_role; ${load(1)}`]);
    assert.equal(firstLookup.status, 0, JSON.stringify({ stage, status: firstLookup.status, stdout: firstLookup.stdout, stderr: firstLookup.stderr }));
    assert.equal(firstLookup.stderr, '');
    assert.deepEqual(JSON.parse(firstLookup.stdout.replace(/^SET\r?\n/, '')), lookup(1, expectedFence(1)));
    assert.deepEqual(initialState(), beforeMigration);
    assert.deepEqual(json(`select ${call('d1_load_refund_candidate', 1)};`).candidate, historical);
    assert.deepEqual(json(record(1, 'AQID', 'c'.repeat(64), other)), historical);
    assert.deepEqual(json(load(1, other)), lookup(1, expectedFence(1)), 'backfill/replay must retain original actor');

    stage = 'behavior: new candidate and legacy preservation';
    const second = seed(2), secondOutcome = outcome(2);
    assert.deepEqual(json(load(2)), lookup(2, null));
    if (currentAdmissions) {
      const serviceActor = key(98);
      // Fixture-owner configuration only: no public self-enrollment or history injection.
      ok('psql', [...args, '-c', `insert into public.d1_refund_service_scopes(actor,namespace,pool)
        values ('${serviceActor}','${id(101)}','${key(1)}'),('${serviceActor}','${id(102)}','${key(2)}');`]);
      assert.deepEqual(json(load(1, serviceActor)), lookup(1, expectedFence(1)));
      assert.deepEqual(json(load(2, serviceActor)), lookup(2, null));
      rejected(record(1, 'AQID', 'c'.repeat(64), serviceActor), '42501', 'unauthorized_admin_wallet');
      rejected(record(2, 'AQID', 'c'.repeat(64), serviceActor), '42501', 'unauthorized_admin_wallet');
    }
    waitDeadline(second.end);
    const beforeNew = initialState(), created = json(record(2));
    assert.deepEqual(created, { ...historical, request_id: id(2), namespace: id(102), pool: key(2),
      initial_outcome_hash: secondOutcome.outcome_hash, deadline: second.deadline });
    assert.deepEqual(initialState(), beforeNew);
    assert.deepEqual(json(load(2)), lookup(2, expectedFence(2)));
    assert.deepEqual(json(load(1)), lookup(1, expectedFence(1)), 'a different namespace cannot replace the original fence');
    assert.deepEqual(json(`select ${call('d1_load_refund_candidate', 2)};`), { kind: 'd1_refund_candidate_lookup', revision: 1,
      request_id: id(2), namespace: id(102), network: 'TESTNET', pool: key(2), candidate: created, active_request_id: id(2) });

    // Exercise all four actual legacy insertion paths, using public035–037
    // evidence only. These opaque SQL bytes never invoke a signer or a network.
    stage = 'behavior: signing/signed/submission trigger preservation';
    const at = Math.floor(clock()), anchor = { sequence: 902, hash: 'd'.repeat(64), closedAt: at };
    const page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: 902, ledger_hash: anchor.hash, closed_at: at, records: [] };
    sql(`select public.d1_record_discovery_page('${id(102)}','${admin}',${lit(page)});
      select public.d1_record_transaction_page('${id(102)}','${admin}',${lit({ ...page, from_cursor: token, to_cursor: token })});`);
    const input = inputs.get(2);
    const held = json(`select jsonb_build_object('activeOwner',${call('d1_load_active_issuance_sequence', 102)},
      'commitment',${call('d1_load_issuance_fee_commitments', 2)}->'commitment');`);
    const history = json(`select ${call('d1_load_transaction_history_state', 102)};`);
    const donation = { operationId: '2', transactionHash: input.payment.transaction_hash, donor: admin, asset: { type: 'native' },
      confirmedAt: input.confirmed_at, amountStroops: '20000000', issuedStroops: '10000000', unissuedStroops: '10000000' };
    const snapshot = { kind: 'd1_refund_financial_snapshot', revision: 1, requestId: id(2), namespace: id(102), network: 'TESTNET', pool: key(2),
      observedAt: at, expiresAt: at + 30, funding: { kind: 'd1_saved_refund_funding_observation', revision: 1, observedAt: at,
        creationObservation: { observedAt: at, observation: { observedAt: at, candidate: created, claimableBalance: {},
          account: { anchor, pool: key(2), networkPassphrase: 'Test SDF Network ; September 2015', sequence: '3', baseFee: '100', baseReserve: '1',
            account: { subentry_count: 0, num_sponsoring: 0, num_sponsored: 0 } },
          accounting: { held, accounting: { donations: [donation], unmatchedActivity: [], original: { observedOperatingCreditStroops: '1000' } },
            confirmedPoolFeesSpentStroops: '100' }, history: { state: history, confirmedPoolFeesSpentStroops: '100' } } },
        otherUnissuedRefundOperationIds: [], otherUnissuedRefundFeeStroops: '0', principal: { physicalOperatingCap: '900' },
        budget: { minimumTransactionFee: '200', protectedSelectedExcess: '100', requiredOperating: '302', teamCap: '900',
          availableOperating: '900', remainingOperating: '598' } } };
    const financial = json(`select public.d1_record_refund_financial_observation('${id(2)}','${admin}',${lit(snapshot)});`);
    financialHashes.set(2, [financial.snapshot_hash]);
    const nonce = id(202), attemptId = id(302), hash = financial.snapshot_hash;
    const claimSQL = `select public.d1_claim_refund_signing('${id(2)}','${admin}','${hash}','${nonce}');`;
    const signedSQL = `select public.d1_record_signed_refund_transaction('${id(2)}','${admin}','${nonce}','BAUG','${'c'.repeat(64)}');`;
    const submissionSQL = `select public.d1_claim_refund_submission_attempt('${id(2)}','${other}','${hash}','${attemptId}');`;
    const claimed = json(claimSQL);
    assert.equal(claimed.invoked, true);
    assert.deepEqual(claimed.candidate, created);
    assert.deepEqual(json(load(2)), lookup(2, expectedFence(2)));
    const signed = json(signedSQL);
    assert.equal(signed.signing_nonce, nonce);
    assert.equal(signed.signed_xdr, 'BAUG');
    assert.equal(signed.transaction_hash, created.transaction_hash);
    assert.deepEqual(json(load(2)), lookup(2, expectedFence(2)));
    const submission = json(submissionSQL);
    assert.equal(submission.claimed, true);
    assert.equal(submission.attempt.authorized_by, other);
    assert.equal(submission.attempt.attempt_id, attemptId);
    assert.equal(submission.attempt.transaction_hash, created.transaction_hash);
    assert.deepEqual(json(load(2)), lookup(2, expectedFence(2)), 'submission actor must not relabel durable owner');
    const beforeReplay = state();
    assert.deepEqual(json(record(2, 'AQID', 'c'.repeat(64), other)), created);
    assert.deepEqual(json(claimSQL).claim, claimed.claim);
    assert.equal(json(claimSQL).invoked, false);
    assert.deepEqual(json(signedSQL), signed);
    assert.deepEqual(json(submissionSQL), { ...submission, claimed: false });
    assert.deepEqual(state(), beforeReplay, 'exact replays create no new permission/counter/owner');

    stage = 'behavior: rejected changes and API permissions';
    rejected(record(2, 'BAUG'), '23505', 'refund_candidate_conflict');
    rejected(record(2, 'AQID', 'e'.repeat(64)), '23505', 'refund_candidate_conflict');
    rejected(`select public.d1_record_signed_refund_transaction('${id(2)}','${admin}','${nonce}','AAAA','${'c'.repeat(64)}');`,
      '23505', 'signed_refund_transaction_conflict');
    rejected(load(1, key(9)), '42501', 'unauthorized_admin_wallet');
    for (const role of ['anon', 'authenticated']) {
      rejected(load(1), '42501', 'permission denied for function d1_load_refund_lane_fence', role);
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const q of ['select * from public.d1_refund_lane_fences;', 'insert into public.d1_refund_lane_fences default values;',
        'update public.d1_refund_lane_fences set lane=lane;', 'delete from public.d1_refund_lane_fences;', 'truncate public.d1_refund_lane_fences;']) {
        rejected(q, '42501', 'permission denied for table d1_refund_lane_fences', role);
      }
      for (const lane of ['full_gross_v1', 'verified_remainder_v2']) {
        rejected(`select public.d1_acquire_refund_lane_fence_private('${id(102)}','${id(2)}','${admin}','${'c'.repeat(64)}','${lane}');`,
          '42501', 'permission denied for function d1_acquire_refund_lane_fence_private', role);
      }
      rejected(`select public.d1_acquire_verified_remainder_fence_private('${id(102)}','${id(2)}','${admin}','${'c'.repeat(64)}');`,
        '42501', 'permission denied for function d1_acquire_verified_remainder_fence_private', role);
    }
    assert.deepEqual(json(load(1)), lookup(1, expectedFence(1)));
    assert.deepEqual(json(load(2)), lookup(2, expectedFence(2)));
    // No public retirement/reassignment API exists in015–038. Do not inject
    // ambiguous historical rows, manufacture another lane, or claim v2 races.
    console.log('REFUND_FENCE_PUBLIC_BACKFILL_LEGACY_REPLAY_PERMISSION_OK');
  } catch (error) {
    console.error(`REFUND_FENCE_FAILURE_STAGE ${stage}`);
    throw error;
  } finally {
    process.removeListener('SIGTERM', terminate);
    try { cleanup(); } finally { evidence(); }
  }
});
