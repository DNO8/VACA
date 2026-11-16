'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { isolated, domain, remainderSnapshot, source, admin, actor, stranger, key, id, hash, text, lit, iso } = require('../fixtures/automatic-refund-admission.cjs');
const registry = 'public.d1_refund_service_scopes';
const waitingOn = (waiter, holder) => `select exists(select 1 from pg_stat_activity w join pg_stat_activity h
  on h.pid=any(pg_blocking_pids(w.pid)) where w.application_name='${waiter}' and h.application_name='${holder}');`;
const sleeping = name => `select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event='PgSleep');`;

test('full retained014/20261011060218 plus exact015–058 chain compiles with all admission pins', async t => {
  const db = await isolated(t);
  assert.equal(db.sql(`select count(*) from ${registry};`, null), '0', 'no migration enrolls a live actor');
});

test('055 service creates032 historical evidence, with no initial issuance grant and immutable manual replay', async t => {
  const db = await isolated(t), d = domain(db), f = d.seed(4, admin, { deferOutcome: true });
  const record = who => d.rpc('d1_record_issuance_outcome', 4, who, ',' + lit(f.observed));
  assert.equal(db.json(d.rpc('d1_load_issuance_outcome', 4)).outcome, null);
  d.reject(record(actor)); d.enroll(4);
  f.receipt = db.json(record(actor));
  assert.equal(f.receipt.authorized_by, actor); assert.equal(f.receipt.attempt_id, id(204));
  assert.deepEqual(f.receipt.observed_outcome, f.observed);
  assert.deepEqual(db.json(d.rpc('d1_load_issuance_outcome', 4, actor)).outcome, f.receipt);
  const before = d.state();
  assert.deepEqual(db.json(record(actor)), f.receipt); assert.deepEqual(db.json(record(admin)), f.receipt);
  d.reject(record(stranger));
  d.reject(d.rpc('d1_claim_submission_attempt', 4, actor, `,'${hash(1)}','${id(204)}'`));
  db.sql(`delete from ${registry} where actor='${actor}';`, null);
  d.reject(record(actor)); d.enroll(4);
  assert.deepEqual(db.json(record(actor)), f.receipt); assert.deepEqual(d.state(), before);
});

test('055/057/058 public service boundaries, manual replay, v1/v2 exclusion and competing acquisition', async t => {
  const db = await isolated(t), d = domain(db), { rpc, reject } = d;
  const f1 = d.seed(1), f2 = d.seed(2), f3 = d.seed(3);
  for (const n of [1, 2, 3]) d.enroll(n);
  const acquisitions = new Map([f1, f2, f3].map(f => [f.n, d.acquisition(f)]));
  const beneficiaryWrite = (n, who) => rpc('d1_record_beneficiary_claim', n, who, ',' + lit(acquisitions.get(n)));
  const v1 = (n, who = actor, digest = hash(4000 + n)) => rpc('d1_record_refund_candidate', n, who, `,'AQID','${digest}'`);
  const v2 = (n, who = actor) => rpc('d1_record_remainder_candidate', n, who,
    `,'AQID','${hash(5000 + n)}','3','${f3.end + 300}','${db.json(rpc('d1_list_beneficiary_claim_set', 100 + n)).set_hash}'`);

  await t.test('non-enrolled and wrong-pool actors cannot independently write or replay any automatic journal', () => {
    d.enroll(1, stranger, key(2)); // configuration deliberately mismatches authoritative pool
    const writers = who => [
      v1(1, who), beneficiaryWrite(1, who), v2(1, who),
      rpc('d1_record_issuance_outcome', 1, who, ',' + lit(f1.observed)),
      rpc('d1_record_refund_financial_observation', 1, who, ",'{}'::jsonb"),
      rpc('d1_claim_refund_signing', 1, who, `,'${hash(1)}','${id(801)}'`),
      rpc('d1_record_signed_refund_transaction', 1, who, `,'${id(801)}','AQID','${hash(4001)}'`),
      rpc('d1_claim_refund_submission_attempt', 1, who, `,'${hash(1)}','${id(901)}'`),
      rpc('d1_record_refund_outcome', 1, who, ",'{}'::jsonb,'{}'::jsonb"),
      rpc('d1_record_remainder_financial_observation', 1, who, ",'{}'::jsonb"),
      rpc('d1_claim_remainder_signing', 1, who, `,'${hash(1)}','${id(802)}'`),
      rpc('d1_record_signed_remainder', 1, who, `,'${id(802)}','${hash(1)}','AQID','${hash(2)}'`),
      rpc('d1_claim_remainder_submission_attempt', 1, who, `,'${hash(1)}','${id(902)}'`),
      rpc('d1_record_remainder_outcome', 1, who, ",'{}'::jsonb,'{}'::jsonb"),
    ];
    for (const who of [key(97), stranger]) for (const q of writers(who)) reject(q);
    db.sql(`delete from ${registry} where actor='${stranger}';`, null);
  });

  await t.test('enrollment admits historical evidence, never initial issuance authority', () => {
    const before = d.state();
    assert.deepEqual(db.json(rpc('d1_record_issuance_outcome', 1, actor, ',' + lit(f1.observed))), f1.receipt);
    for (const q of [rpc('d1_register_issuance_intent', 1, actor),
      rpc('d1_reserve_issuance_sequence', 1, actor, ",'2'"),
      rpc('d1_save_unsigned_transaction', 1, actor, `,'AAAA','${hash(1001)}'`),
      rpc('d1_record_issuance_fee_commitment', 1, actor, ",'100','300'"),
      rpc('d1_record_initial_financial_observation', 1, actor, ",'{}'::jsonb"),
      rpc('d1_record_fresh_initial_financial_observation', 1, actor, ",'{}'::jsonb"),
      rpc('d1_record_signed_transaction', 1, actor, `,'${hash(1)}','AQID'`),
      rpc('d1_claim_submission_attempt', 1, actor, `,'${hash(1)}','${id(201)}'`),
      `select public.d1_prepare(${lit({ ...f1.input, authorized_by: actor })});`]) reject(q);
    assert.deepEqual(d.state(), before);
    for (const role of ['anon', 'authenticated']) {
      reject(v1(1), 'permission denied for function d1_record_refund_candidate', '42501', role);
      reject(beneficiaryWrite(1, actor), 'permission denied for function d1_record_beneficiary_claim', '42501', role);
      reject(v2(1), 'permission denied for function d1_record_remainder_candidate', '42501', role);
    }
  });

  await t.test('057 service creation and manual exact replay retain beneficiary actor and counts', () => {
    for (const n of [1, 2, 3]) {
      const who = n === 2 ? admin : actor;
      const saved = db.json(beneficiaryWrite(n, who));
      assert.equal(saved.authorized_by, who);
      const before = d.state();
      assert.deepEqual(db.json(beneficiaryWrite(n, admin)), saved);
      assert.deepEqual(db.json(beneficiaryWrite(n, actor)), saved);
      assert.equal(db.json(rpc('d1_list_beneficiary_claim_set', 100 + n, actor)).count, 1);
      assert.deepEqual(d.state(), before);
      reject(beneficiaryWrite(n, stranger));
    }
  });
  // Real original clock, no backdating mutation, no retry of failed financial setup.
  db.sql(`select pg_sleep(greatest(0,${f3.end}-extract(epoch from clock_timestamp())+0.01));`);
  await t.test('055 full-gross and058 remainder acquire opposite permanent fences; manual replay stays exact', () => {
    const first = db.json(v1(1));
    const second = db.json(v2(2));
    assert.equal(first.authorized_by, actor); assert.equal(second.authorized_by, actor);
    assert.equal(db.json(rpc('d1_load_refund_lane_fence', 1, actor)).fence.lane, 'full_gross_v1');
    assert.equal(db.json(rpc('d1_load_refund_lane_fence', 2, actor)).fence.lane, 'verified_remainder_v2');
    const before = d.state();
    assert.deepEqual(db.json(v1(1, admin)), first); assert.deepEqual(db.json(v2(2, admin)), second);
    assert.deepEqual(d.state(), before);
    reject(v2(1), 'refund_lane_fence_conflict', '23505');
    reject(v1(2), 'refund_lane_fence_conflict', '23505');
    reject(v1(1, actor, hash(999)), 'refund_candidate_conflict', '23505');
    for (const q of [v1(1, stranger), v2(2, stranger), beneficiaryWrite(1, stranger)]) reject(q);
    db.sql(`delete from ${registry} where actor='${actor}' and namespace='${id(101)}';`, null);
    reject(v1(1)); reject(beneficiaryWrite(1, actor)); d.enroll(1);
  });

  await t.test('actual competing v2/v1 acquisitions serialize and only the first committed lane survives', async () => {
    const q = v2(3);
    const first = db.asyncSQL(`set application_name='auto_lane_first';begin;set role service_role;${q}select pg_sleep(2);commit;`);
    await db.observe(sleeping('auto_lane_first'));
    const other = db.asyncSQL(`set application_name='auto_lane_other';set role service_role;${v1(3)}`);
    await db.observe(waitingOn('auto_lane_other', 'auto_lane_first'));
    const winner = await first;
    assert.equal(winner.status, 0); assert.equal(winner.stderr, '');
    assert.deepEqual(await other, { status: 1, stdout: 'SET\nSET\n', stderr: 'ERROR:  refund_lane_fence_conflict\n' });
    const receipt = db.json(rpc('d1_load_refund_lane_fence', 3, actor)).fence;
    assert.equal(receipt.lane, 'verified_remainder_v2'); assert.equal(receipt.candidate_hash, hash(5003));
    assert.equal(db.json(rpc('d1_load_refund_candidate', 3, actor)).candidate, null);
    const before = d.state(); reject(v1(3), 'refund_lane_fence_conflict', '23505'); assert.deepEqual(d.state(), before);
  });
});

test('055 financial evidence, competing one-shot signing/submission and revoked replay use real public journals', async t => {
  const db = await isolated(t), d = domain(db), n = 1, f = d.seed(n);
  d.enroll(n);
  db.sql(`select pg_sleep(greatest(0,${f.end}-extract(epoch from clock_timestamp())+0.01));`);
  const candidate = db.json(d.rpc('d1_record_refund_candidate', n, actor, `,'AQID','${hash(4001)}'`));
  const at = d.clock(), anchor = { sequence: 904, hash: hash(904), closedAt: at };
  db.sql(d.rpc('d1_record_discovery_page', 101, actor, ',' + lit(d.page(at, 904, '0'))));
  db.sql(d.rpc('d1_record_transaction_page', 101, actor, ',' + lit(d.page(at, 904, f.issued.pagingToken))));
  const held = db.json(`select jsonb_build_object('activeOwner',${d.call('d1_load_active_issuance_sequence', 101)},
    'commitment',${d.call('d1_load_issuance_fee_commitments', 1)}->'commitment');`);
  const history = db.json(d.rpc('d1_load_transaction_history_state', 101));
  // Exact opaque SQL financial shape already exercised by refund-lane-fence.
  // This is SQL membership/arithmetic evidence, never an SDK spending permit.
  const donation = { operationId: '1', transactionHash: hash(1), donor: admin, asset: { type: 'native' },
    confirmedAt: f.input.confirmed_at, amountStroops: '20000000', issuedStroops: '10000000', unissuedStroops: '10000000' };
  const snapshot = { kind: 'd1_refund_financial_snapshot', revision: 1, requestId: id(1), namespace: id(101), network: 'TESTNET', pool: key(1),
    observedAt: at, expiresAt: at + 30, funding: { kind: 'd1_saved_refund_funding_observation', revision: 1, observedAt: at,
      creationObservation: { observedAt: at, observation: { observedAt: at, candidate, claimableBalance: {},
        account: { anchor, pool: key(1), networkPassphrase: 'Test SDF Network ; September 2015', sequence: '3', baseFee: '100', baseReserve: '1',
          account: { subentry_count: 0, num_sponsoring: 0, num_sponsored: 0 } },
        accounting: { held, accounting: { donations: [donation], unmatchedActivity: [], original: { observedOperatingCreditStroops: '1000' } },
          confirmedPoolFeesSpentStroops: '100' }, history: { state: history, confirmedPoolFeesSpentStroops: '100' } } },
      otherUnissuedRefundOperationIds: [], otherUnissuedRefundFeeStroops: '0', principal: { physicalOperatingCap: '900' },
      budget: { minimumTransactionFee: '200', protectedSelectedExcess: '100', requiredOperating: '302', teamCap: '900',
        availableOperating: '900', remainingOperating: '598' } } };
  const financialSQL = who => d.rpc('d1_record_refund_financial_observation', 1, who, ',' + lit(snapshot));
  const financial = db.json(financialSQL(actor)); f.financialHashes = [financial.snapshot_hash];
  assert.equal(financial.authorized_by, actor);
  assert.deepEqual(db.json(financialSQL(admin)), financial);
  const signing = (who, nonce = id(801)) => d.rpc('d1_claim_refund_signing', 1, who, `,'${financial.snapshot_hash}','${nonce}'`);
  const first = db.asyncSQL(`set application_name='sign_first';begin;set role service_role;${signing(actor)}select pg_sleep(2);commit;`);
  await db.observe(sleeping('sign_first'));
  const second = db.asyncSQL(`set application_name='sign_other';set role service_role;${signing(admin, id(802))}`);
  await db.observe(waitingOn('sign_other', 'sign_first'));
  const a = await first, b = await second;
  assert.equal(a.status, 0); assert.equal(a.stderr, ''); assert.equal(b.status, 0); assert.equal(b.stderr, '');
  const firstClaim = JSON.parse(a.stdout.split('\n')[3]), secondClaim = JSON.parse(b.stdout.split('\n')[2]);
  assert.equal(firstClaim.invoked, true); assert.equal(secondClaim.invoked, false);
  assert.deepEqual(firstClaim.claim, secondClaim.claim); assert.equal(firstClaim.claim.authorized_by, actor);
  const signedSQL = who => d.rpc('d1_record_signed_refund_transaction', 1, who, `,'${id(801)}','BAUG','${hash(4001)}'`);
  const signed = db.json(signedSQL(actor)); assert.equal(signed.authorized_by, actor);
  assert.deepEqual(db.json(signedSQL(admin)), signed);
  const submission = (who, nonce = id(901)) => d.rpc('d1_claim_refund_submission_attempt', 1, who, `,'${financial.snapshot_hash}','${nonce}'`);
  const sendFirst = db.asyncSQL(`set application_name='send_first';begin;set role service_role;${submission(actor)}select pg_sleep(2);commit;`);
  await db.observe(sleeping('send_first'));
  const sendOther = db.asyncSQL(`set application_name='send_other';set role service_role;${submission(admin, id(902))}`);
  await db.observe(waitingOn('send_other', 'send_first'));
  const c = await sendFirst, e = await sendOther;
  assert.equal(c.status, 0); assert.equal(c.stderr, ''); assert.equal(e.status, 0); assert.equal(e.stderr, '');
  const firstSend = JSON.parse(c.stdout.split('\n')[3]), secondSend = JSON.parse(e.stdout.split('\n')[2]);
  assert.equal(firstSend.claimed, true); assert.equal(secondSend.claimed, false); assert.deepEqual(firstSend.attempt, secondSend.attempt);
  const before = d.state();
  assert.equal(db.json(signing(actor)).invoked, false); assert.equal(db.json(submission(actor)).claimed, false);
  assert.deepEqual(d.state(), before);
  db.sql(`delete from ${registry} where actor='${actor}';`, null);
  for (const q of [financialSQL(actor), signing(actor), signedSQL(actor), submission(actor)]) d.reject(q);
  d.enroll(1);
  assert.equal(db.json(signing(actor)).invoked, false); assert.equal(db.json(submission(actor)).claimed, false);
  assert.deepEqual(d.state(), before);
  //038 creates a real saved inclusion receipt, not merely an absent lookup or
  // authorization rejection. No new signing/financial authority is inferred.
  const includedAt = d.clock(), included = d.observation(1, includedAt, 905, candidate.transaction_hash, key(1), '4', 15);
  included.envelopeXdr = included.raw.transaction.envelope_xdr = signed.signed_xdr;
  included.operationTypes = [15, 1]; included.poolOperationSourceIndices = [0, 1];
  included.raw.transaction.operation_count = 2;
  included.feeBidStroops = included.raw.transaction.max_fee = '200';
  d.discovery(1, includedAt, 905, [], actor);
  db.sql(d.rpc('d1_record_transaction_page', 101, actor, ',' + lit(d.page(includedAt, 905, f.issued.pagingToken, [included]))));
  db.sql(d.rpc('d1_record_transaction_page', 101, actor, ',' + lit(d.page(includedAt, 905, included.pagingToken))));
  const complete = db.json(d.rpc('d1_load_transaction_history_state', 101, actor));
  const observed = { kind: 'd1_refund_outcome', revision: 1, observation: included,
    originalPayment: { donor: admin, asset: { type: 'native' }, grossAmount: '2.0000000', confirmedAt: iso(f.input.confirmed_at) },
    outcome: 'success', donorRefundedAmount: '2.0000000', claimedBalanceId: f.observed.claimableBalanceId };
  const outcomeSQL = who => d.rpc('d1_record_refund_outcome', 1, who, ',' + lit(observed) + ',' + lit(complete));
  assert.equal(db.json(d.rpc('d1_load_refund_outcome', 1, actor)).outcome, null);
  d.reject(outcomeSQL(stranger));
  const outcome = db.json(outcomeSQL(actor));
  assert.equal(outcome.authorized_by, actor); assert.equal(outcome.attempt_id, firstSend.attempt.attempt_id);
  assert.deepEqual(outcome.observed_outcome, observed); assert.deepEqual(outcome.history_state, complete);
  assert.deepEqual(db.json(d.rpc('d1_load_refund_outcome', 1, actor)).outcome, outcome);
  const finalState = d.state();
  assert.deepEqual(db.json(outcomeSQL(actor)), outcome); assert.deepEqual(db.json(outcomeSQL(admin)), outcome);
  d.reject(outcomeSQL(stranger));
  db.sql(`delete from ${registry} where actor='${actor}';`, null); d.reject(outcomeSQL(actor)); d.enroll(1);
  assert.deepEqual(db.json(outcomeSQL(actor)), outcome); assert.deepEqual(d.state(), finalState);
});

test('058 public v2 candidate→financial→signing→submission→outcome with captured memberships and revoked replay', async t => {
  const db = await isolated(t), d = domain(db), n = 7;
  t.diagnostic('v2 public original/creation-credit seed');
  const f = d.seed(n, admin, { rich: true }); d.enroll(n);
  const acquisition = d.acquisition(f);
  db.json(d.rpc('d1_record_beneficiary_claim', n, actor, ',' + lit(acquisition)));
  db.sql(`select pg_sleep(greatest(0,${f.end}-extract(epoch from clock_timestamp())+0.01));`);
  const at = d.clock();
  d.discovery(n, at, 904, [], actor);
  db.sql(d.rpc('d1_record_transaction_page', 107, actor, ',' + lit(d.page(at, 904, f.issued.pagingToken))));
  const claims = db.json(d.rpc('d1_list_beneficiary_claim_set', 107, actor));
  const candidateSQL = who => d.rpc('d1_record_remainder_candidate', n, who, `,'AQID','${hash(5007)}','3','${at + 300}','${claims.set_hash}'`);
  d.reject(candidateSQL(stranger));
  const candidate = db.json(candidateSQL(actor)); assert.equal(candidate.authorized_by, actor);
  assert.deepEqual(db.json(candidateSQL(admin)), candidate);
  t.diagnostic('v2 capture public memberships and create044 financial evidence');
  const snapshot = remainderSnapshot(db, d, f, candidate);
  const financialSQL = who => d.rpc('d1_record_remainder_financial_observation', n, who, ',' + lit(snapshot));
  const digest = db.sql(`select encode(sha256(convert_to(${lit(snapshot)}::text,'UTF8')),'hex');`);
  f.remainderHashes = [digest];
  assert.equal(db.json(d.rpc('d1_load_remainder_financial_observation', n, actor, `,'${digest}'`)).observation, null);
  d.reject(financialSQL(stranger));
  const financial = db.json(financialSQL(actor));
  assert.equal(financial.authorized_by, actor); assert.equal(financial.snapshot_hash, digest);
  assert.deepEqual(financial.snapshot, snapshot);
  let before = d.state(); assert.deepEqual(db.json(financialSQL(actor)), financial); assert.deepEqual(d.state(), before);
  const signingSQL = who => d.rpc('d1_claim_remainder_signing', n, who, `,'${digest}','${id(807)}'`);
  const envelope = createHash('sha256').update(Buffer.from('BAUG', 'base64')).digest('hex');
  const signedSQL = who => d.rpc('d1_record_signed_remainder', n, who, `,'${id(807)}','${digest}','BAUG','${envelope}'`);
  const submissionSQL = who => d.rpc('d1_claim_remainder_submission_attempt', n, who, `,'${digest}','${id(907)}'`);
  t.diagnostic('v2 create045/046 one-shot journals with genuine044 evidence');
  for (const q of [signingSQL(stranger), signedSQL(stranger), submissionSQL(stranger)]) d.reject(q);
  const signing = db.json(signingSQL(actor)); assert.equal(signing.invoked, true); assert.equal(signing.claim.authorized_by, actor);
  const signed = db.json(signedSQL(actor)); assert.equal(signed.envelope_sha256, envelope); assert.equal(signed.authorized_by, actor);
  const submission = db.json(submissionSQL(actor)); assert.equal(submission.claimed, true); assert.equal(submission.attempt.authorized_by, actor);
  before = d.state();
  assert.equal(db.json(signingSQL(actor)).invoked, false); assert.deepEqual(db.json(signedSQL(actor)), signed);
  assert.deepEqual(db.json(submissionSQL(actor)), { ...submission, claimed: false });
  assert.equal(db.json(signingSQL(admin)).invoked, false);
  assert.deepEqual(db.json(submissionSQL(admin)), { ...submission, claimed: false });
  assert.deepEqual(db.json(d.rpc('d1_load_remainder_financial_observation', n, admin, `,'${digest}'`)).observation, financial);
  assert.deepEqual(d.state(), before);
  db.sql(`delete from ${registry} where actor='${actor}';`, null);
  for (const q of [candidateSQL(actor), financialSQL(actor), signingSQL(actor), signedSQL(actor), submissionSQL(actor)]) d.reject(q);
  d.enroll(n); assert.deepEqual(d.state(), before);
  t.diagnostic('v2 save905 inclusion/complete history and create047 outcome');
  const includedAt = d.clock(), included = d.observation(n, includedAt, 905, candidate.transaction_hash, key(n), '4', 1);
  included.envelopeXdr = included.raw.transaction.envelope_xdr = signed.signed_xdr;
  d.discovery(n, includedAt, 905, [], actor);
  db.sql(d.rpc('d1_record_transaction_page', 107, actor, ',' + lit(d.page(includedAt, 905, f.issued.pagingToken, [included]))));
  db.sql(d.rpc('d1_record_transaction_page', 107, actor, ',' + lit(d.page(includedAt, 905, included.pagingToken))));
  const history = db.json(d.rpc('d1_load_transaction_history_state', 107, actor));
  const originalPayment = { donor: admin, asset: { type: 'native' }, grossAmount: '2.0000000', confirmedAt: iso(f.input.confirmed_at),
    requestId: id(n), operationId: f.input.payment.operation_id, paymentTransactionHash: hash(n),
    issuanceTransactionHash: f.issued.transactionHash, outcomeHash: f.receipt.outcome_hash, claimableBalanceId: f.observed.claimableBalanceId,
    sequence: '3', namespace: id(107), network: 'TESTNET', pool: key(n) };
  const observed = { kind: 'd1_remainder_outcome', revision: 2, candidate, originalPayment, observation: included,
    transactionHash: candidate.transaction_hash, envelopeSha256: envelope, operationIndex: 0, outcome: 'success',
    donorRefundedPrincipalStroops: '10000000', feePayer: key(n), feeChargedStroops: '100' };
  const outcomeSQL = who => d.rpc('d1_record_remainder_outcome', n, who, ',' + lit(observed) + ',' + lit(history));
  assert.equal(db.json(d.rpc('d1_load_remainder_outcome', n, actor)).outcome, null);
  d.reject(outcomeSQL(stranger));
  const outcome = db.json(outcomeSQL(actor));
  assert.equal(outcome.authorized_by, actor); assert.equal(outcome.attempt_id, submission.attempt.attempt_id);
  assert.deepEqual(outcome.observed_outcome, observed); assert.deepEqual(outcome.history_state, history);
  assert.deepEqual(db.json(d.rpc('d1_load_remainder_outcome', n, actor)).outcome, outcome);
  before = d.state();
  assert.deepEqual(db.json(outcomeSQL(actor)), outcome); assert.deepEqual(db.json(outcomeSQL(admin)), outcome);
  for (const q of [candidateSQL(stranger), financialSQL(stranger), signingSQL(stranger), signedSQL(stranger), submissionSQL(stranger), outcomeSQL(stranger)]) d.reject(q);
  // No renewal: financial evidence is now historical after the head advanced.
  d.reject(financialSQL(actor), 'remainder_membership_conflict', '23505');
  db.sql(`delete from ${registry} where actor='${actor}';`, null);
  for (const q of [outcomeSQL(actor), signingSQL(actor), submissionSQL(actor)]) d.reject(q);
  d.enroll(n); assert.deepEqual(db.json(outcomeSQL(actor)), outcome); assert.deepEqual(d.state(), before);
});

test('056 bounds originals before due filtering, continues empty pages and enforces enrollment/cursor bounds', async t => {
  const db = await isolated(t), d = domain(db);
  const at = d.clock();
  const inputs = [d.prepare(10, 10, at), d.prepare(11, 10, at - 285), d.prepare(12, 10, at)];
  const saved = () => db.json(`select jsonb_build_array(${inputs.map(input => `public.d1_prepare(${lit(input)})`).join(',')});`);
  const page = (after = null, limit = 1, who = actor, pool = key(10)) =>
    `select public.d1_list_due_refund_originals('${id(110)}','${pool}','${who}',${text(after)},${limit === null ? 'null' : limit});`;
  const reject = (q, message, code = '42501', role = 'service_role', position = '') => {
    const before = saved();
    for (const [v, e] of [['terse', message], ['sqlstate', code]]) assert.deepEqual(db.raw(`set role ${role};${q}`, v),
      { status: 1, stdout: 'SET\n', stderr: `ERROR:  ${e}${v === 'terse' ? position : ''}\n` });
    assert.deepEqual(saved(), before);
  };
  reject(page(), 'unauthorized_admin_wallet');
  reject(page(null, 1, admin), 'unauthorized_admin_wallet', '42501'); // no admin bypass
  d.enroll(10);
  db.sql(`select pg_sleep(greatest(0,${at + 15}-extract(epoch from clock_timestamp())+0.01));`);
  const before = saved();
  const first = db.json(page());
  assert.deepEqual(first.requestIds, []); assert.equal(first.nextAfterRequestId, id(10));
  assert.equal(first.kind, 'd1_due_refund_originals'); assert.equal(first.revision, 1);
  assert.equal(first.namespace, id(110)); assert.equal(first.pool, key(10)); assert.equal(first.network, 'TESTNET');
  assert.ok(Number.isFinite(Date.parse(first.dbObservedAt)));
  const second = db.json(page(first.nextAfterRequestId));
  assert.deepEqual(second.requestIds, [id(11)]); assert.equal(second.nextAfterRequestId, id(11));
  const third = db.json(page(second.nextAfterRequestId));
  assert.deepEqual(third.requestIds, []); assert.equal(third.nextAfterRequestId, null);
  assert.deepEqual(db.json(page(id(12))).requestIds, []);
  assert.deepEqual(db.json(page('ffffffff-ffff-ffff-ffff-ffffffffffff')).requestIds, []);
  assert.deepEqual(db.json(page(null, 50)).requestIds, [id(11)]);
  assert.deepEqual(saved(), before);
  for (const limit of [null, 0, -1, 51]) reject(page(null, limit), 'invalid_due_refund_page', '22023');
  reject(page('not-a-uuid'), 'invalid input syntax for type uuid: "not-a-uuid"', '22P02', 'service_role', ' at character 223');
  reject(page(null, 1, actor, key(11)), 'unauthorized_admin_wallet');
  for (const role of ['anon', 'authenticated']) reject(page(), 'permission denied for function d1_list_due_refund_originals', '42501', role);
  db.sql(`delete from ${registry};`, null); reject(page(), 'unauthorized_admin_wallet');
});

test('current049 membership locks cover058 admission, committed revocation and post-wait pool binding', async t => {
  const db = await isolated(t), d = domain(db);
  d.seed(1); d.enroll(1);
  const q = d.rpc('d1_load_remainder_candidate', 1, actor);
  const before = d.state(), expected = db.sql(q);
  const admitted = db.asyncSQL(`set application_name='auto_admitted';begin;set role service_role;${q}select pg_sleep(2);commit;`);
  await db.observe(sleeping('auto_admitted'));
  const revoker = db.asyncSQL(`set application_name='auto_revoker';delete from ${registry} where actor='${actor}';`);
  await db.observe(waitingOn('auto_revoker', 'auto_admitted'));
  assert.deepEqual(await admitted, { status: 0, stdout: `SET\nBEGIN\nSET\n${expected}\n\nCOMMIT\n`, stderr: '' });
  assert.deepEqual(await revoker, { status: 0, stdout: 'SET\nDELETE 1\n', stderr: '' });
  d.reject(q); d.enroll(1);
  for (const [change, restore, result] of [
    [`delete from ${registry} where actor='${actor}';`, () => d.enroll(1), 'DELETE 1'],
    [`update public.d1_pools set pool='${key(97)}' where namespace='${id(101)}';`,
      () => db.sql(`update public.d1_pools set pool='${key(1)}' where namespace='${id(101)}';`, null), 'UPDATE 1'],
  ]) {
    try {
      const holder = db.asyncSQL(`set application_name='auto_change';begin;${change}select pg_sleep(2);commit;`);
      await db.observe(sleeping('auto_change'));
      const waiter = db.asyncSQL(`set application_name='auto_wait';set role service_role;${q}`);
      await db.observe(waitingOn('auto_wait', 'auto_change'));
      assert.deepEqual(await holder, { status: 0, stdout: `SET\nBEGIN\n${result}\n\nCOMMIT\n`, stderr: '' });
      assert.deepEqual(await waiter, { status: 1, stdout: 'SET\nSET\n', stderr: 'ERROR:  unauthorized_admin_wallet\n' });
    } finally { restore(); }
    assert.deepEqual(d.state(), before);
  }
});

for (const [number, signature, message] of [
  [55, 'public.d1_record_refund_outcome(uuid,text,jsonb,jsonb)', 'unexpected_d1_refund_execution_service_definition'],
  [57, 'public.d1_record_beneficiary_claim(uuid,text,jsonb)', 'unexpected_d1_beneficiary_service_definition'],
  [58, 'public.d1_record_remainder_outcome(uuid,text,jsonb,jsonb)', 'unexpected_d1_remainder_service_definition'],
]) test(`${number} rejects body/ACL/metadata drift atomically on a fresh exact predecessor chain`, async t => {
  const db = await isolated(t, number - 1), d = domain(db); d.seed(1);
  const definition = db.json(`select jsonb_build_object('definition',pg_get_functiondef(oid),'body',prosrc)
    from pg_proc where oid=${text(signature)}::regprocedure;`, null);
  const original = db.catalog(), before = d.state();
  const attempt = () => {
    const catalog = db.catalog();
    for (const [v, e] of [['terse', message], ['sqlstate', 'P0001']]) assert.deepEqual(db.raw(source(number), v),
      { status: 1, stdout: 'BEGIN\n', stderr: `ERROR:  ${e}\n` });
    assert.deepEqual(db.catalog(), catalog, 'failed migration must leave every function and ACL unchanged');
    assert.deepEqual(d.state(), before);
  };
  for (const mutate of [
    () => db.sql(definition.definition.replace(definition.body, () => definition.body + '\n-- isolated drift probe\n'), null),
    () => db.sql(`grant execute on function ${signature} to anon;`, null),
    () => db.sql(`alter function ${signature} security invoker;`, null),
  ]) {
    mutate(); attempt();
    db.sql(definition.definition, null);
    db.sql(`revoke execute on function ${signature} from anon;`, null);
    assert.deepEqual(db.catalog(), original);
  }
  db.apply(`${number}.sql`, source(number));
  assert.deepEqual(d.state(), before);
  attempt(); // reapplication is drift, not an idempotent privilege refresh
});
