// New local fixture: recovered 014/latest are dependencies, not a full bootstrap.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawnSync, spawn } = require("node:child_process");
const { createHash } = require("node:crypto");

const { resolveFixtureRuntime } = require("./fixture-runtime.cjs");
const repo = path.resolve(__dirname, "../../..");
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const scratch = new Set();
function record(output) {
  for (const match of output.matchAll(/SCRATCH=([^\r\n]+)/g)) scratch.add(match[1]);
}
function run(tool, args, expected = 0) {
  const r = spawnSync(process.execPath, [launcher, tool, ...args], {
    env,
    encoding: "utf8",
    timeout: 150000,
  });
  record(r.stderr || "");
  assert.equal(r.status, expected, `Local ${tool} failed: ${r.stderr}\n${r.stdout}`);
  return r.stdout.trim();
}
async function freePort() {
  const s = net.createServer();
  await new Promise((resolve, reject) => {
    s.once("error", reject);
    s.listen(0, "127.0.0.1", resolve);
  });
  const port = s.address().port;
  await new Promise((resolve) => s.close(resolve));
  return port;
}

test("local D1 preparation reuses allocation contracts and isolates historical funds", async () => {
  const fixture = fs.mkdtempSync(path.join(temp, "vaca-d1-pg-"));
  console.log("FIXTURE=" + fixture);
  const data = path.join(fixture, "data");
  let serverPid;
  const port = await freePort();
  const args = [
    "-X",
    "--no-password",
    ...connectionArgs,
    "-p",
    String(port),
    "-U",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
  ];
  function sql(source, role = true) {
    return run("psql", [...args, "-c", (role ? "set role service_role; " : "") + source]).replace(
      /^SET\r?\n/,
      "",
    );
  }
  function apply(name, source) {
    const file = path.join(fixture, name);
    fs.writeFileSync(file, source);
    run("psql", [...args, "-f", file]);
  }
  function rejected(source, expected) {
    const r = spawnSync(process.execPath, [
      launcher,
      "psql",
      ...args,
      "-c",
      "set role service_role; " + source,
    ], { env, encoding: "utf8", timeout: 150000 });
    record(r.stderr || "");
    assert.equal(r.status, 1, "Rejected RPC must exit 1");
    assert.match(r.stderr, new RegExp("ERROR:  " + expected + "(\\r?\\n|$)"));
    assert.equal(r.stdout.trim(), "SET", "Rejected RPC must return no receipt");
  }
  function concurrent(source) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        launcher,
        "psql",
        ...args,
        "--set", "VERBOSITY=terse",
        "-c",
        "set role service_role; " + source,
      ], { env });
      let stdout = "", stderr = "";
      child.stdout.on("data", (b) => {
        stdout += b;
      });
      child.stderr.on("data", (b) => {
        stderr += b;
      });
      child.once("error", reject);
      child.once("close", (code) => {
        record(stderr);
        resolve({ code, stdout: stdout.trim().replace(/^SET\r?\n/, ""), rawStdout: stdout, stderr });
      });
    });
  }
  const key = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  // Public test-only key; no seed is needed by SQL.
  const incident = "fixture-incident-full-id";
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const lit = (value) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
  try {
    run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
    run("pg_ctl", [
      "-D",
      data,
      "-l",
      path.join(fixture, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${port}`,
      "-w",
      "-t",
      "30",
      "start",
    ]);
    serverPid = Number(fs.readFileSync(path.join(data, "postmaster.pid"), "utf8").split(/\r?\n/)[0]);
    apply(
      "fixture.sql",
      `create role anon; create role authenticated; create role service_role;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${key}');
      insert into public.incidents values ('${incident}','vaquita','${key}');`,
    );
    const retained = JSON.parse(
      fs.readFileSync(path.join(repo, "recovery/supabase/2026-10-27/retained-migrations.json")),
    );
    for (const version of ["014", "20261011060218"]) {
      apply(
        version + ".sql",
        retained.migrations.find((m) => m.version === version).statements.join(";\n"),
      );
    }
    const confirmed = Math.floor(Date.now() / 1000) - 2;
    const deadline = new Date((confirmed + 300) * 1000).toISOString().replace(".000Z", "Z");
    const payment = {
      transaction_hash: "a".repeat(64),
      operation_id: "123",
      donor: key,
      pool: key,
      asset: { type: "native" },
      amount: "2.0000000",
    };
    const request = {
      version: 1,
      incident_id: incident,
      donor: key,
      beneficiary: key,
      asset: { type: "native" },
      amount: "1.0000000",
      deadline,
    };
    // Establish a historical fixture using only its public contracts.
    sql(`select public.reserve_release_request('${id(99)}','${key}',${lit(request)});`);
    const oldPool = "GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP";
    const oldPayment = { ...payment, pool: oldPool, transaction_hash: "f".repeat(64) };
    const historical = sql(
      `select public.allocate_donation_to_release_request('${id(99)}','${key}',${
        lit(oldPayment)
      },'${oldPool}');`,
    );
    const migration = path.join(repo, "supabase/migrations/015_d1_testnet_custody.sql");
    assert.ok(fs.existsSync(migration), "D1 migration must exist");
    apply("015.sql", fs.readFileSync(migration, "utf8"));
    sql(`select public.d1_activate_pool('${id(100)}','${key}',900);`);
    const input = {
      request_id: id(1),
      authorized_by: key,
      payment,
      request,
      confirmed_at: confirmed,
      ledger: 900,
      memo_hash: createHash("sha256").update("vaca.d1.donation.v1\n" + incident).digest("hex"),
    };
    const prepare = (value) => sql(`select public.d1_prepare(${lit(value)});`);
    const receipt = JSON.parse(prepare(input));
    assert.equal(receipt.state, "allocated");
    assert.equal(receipt.revision, 1);
    assert.equal(receipt.allocation.reservation.request.deadline, deadline);
    assert.deepEqual(JSON.parse(prepare(input)), receipt, "Exact replay returns immutable receipt");
    const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const before = digest(receipt);
    rejected(
      `select public.d1_prepare(${
        lit({ ...input, request: { ...request, amount: "0.5000000" } })
      });`,
      "idempotency_conflict",
    );
    rejected(
      `select public.d1_prepare(${
        lit({ ...input, request_id: id(2), memo_hash: "0".repeat(64) })
      });`,
      "payment_binding_mismatch",
    );
    rejected(
      `select public.d1_prepare(${lit({ ...input, request_id: id(2), ledger: 899 })});`,
      "payment_before_activation",
    );
    rejected(`select public.d1_activate_pool('${id(101)}','${oldPool}',900);`, "historical_pool");
    rejected(
      `select public.d1_prepare(${lit({ ...input, request_id: id(99) })});`,
      "historical_request",
    );
    rejected(
      `select public.d1_prepare(${lit({ ...input, request_id: id(2), authorized_by: oldPool })});`,
      "unauthorized_admin_wallet",
    );
    assert.equal(
      digest(JSON.parse(prepare(input))),
      before,
      "Rejected bindings cannot change stored receipt",
    );
    // Rejected over-allocation must roll back its new reservation AND counter.
    rejected(
      `select public.d1_prepare(${
        lit({ ...input, request_id: id(2), request: { ...request, amount: "1.0000001" } })
      });`,
      "donation_capacity_exceeded",
    );
    assert.equal(
      JSON.parse(prepare({ ...input, request_id: id(2) })).state,
      "allocated",
      "Entire remaining capacity is still available after rejection",
    );
    // Exactly 300 seconds after payment is expired even with a fresh request.
    const expired = Math.floor(Date.now() / 1000) - 300;
    const expiredInput = {
      ...input,
      request_id: id(3),
      confirmed_at: expired,
      payment: { ...payment, operation_id: "124" },
      request: {
        ...request,
        deadline: new Date((expired + 300) * 1000).toISOString().replace(".000Z", "Z"),
      },
    };
    rejected(`select public.d1_prepare(${lit(expiredInput)});`, "deadline_expired");
    assert.equal(
      JSON.parse(
        prepare({ ...input, request_id: id(3), payment: { ...payment, operation_id: "124" } }),
      ).state,
      "allocated",
      "Expired rejection must not reserve the UUID",
    );
    // Two processes race through public RPCs; only one can consume one unit.
    const raceInput = {
      ...input,
      payment: { ...payment, operation_id: "125", amount: "1.0000000" },
    };
    const raced = await Promise.all(
      [10, 11].map((n) =>
        concurrent(`select public.d1_prepare(${lit({ ...raceInput, request_id: id(n) })});`)
      ),
    );
    assert.deepEqual(raced.map((r) => r.code).sort(), [0, 1]);
    assert.match(raced.find((r) => r.code === 1).stderr, /ERROR:  donation_capacity_exceeded/);
    const replayInput = {
      ...input,
      request_id: id(12),
      payment: { ...payment, operation_id: "126" },
    };
    const replayed = await Promise.all(
      [1, 2].map(() => concurrent(`select public.d1_prepare(${lit(replayInput)});`)),
    );
    assert.deepEqual(replayed.map((r) => r.code), [0, 0]);
    assert.deepEqual(JSON.parse(replayed[0].stdout), JSON.parse(replayed[1].stdout));
    // Private routines and tables cannot be invoked or read through wallet roles.
    const denied = run("psql", [
      ...args,
      "-c",
      `set role authenticated; select public.d1_prepare(${lit(input)});`,
    ], 1);
    assert.equal(denied, "SET");
    const deniedTable = run("psql", [
      ...args,
      "-c",
      "set role service_role; select * from public.d1_preparations;",
    ], 1);
    assert.equal(deniedTable, "SET");
    // 016 is optional here so test-first runs reach the public RPC, not a missing-file check.
    const intentsMigration = path.join(repo, "supabase/migrations/016_d1_issuance_intents.sql");
    if (fs.existsSync(intentsMigration)) apply("016.sql", fs.readFileSync(intentsMigration, "utf8"));
    const sequencesMigration = path.join(repo, "supabase/migrations/017_d1_issuance_sequences.sql");
    if (fs.existsSync(sequencesMigration)) apply("017.sql", fs.readFileSync(sequencesMigration, "utf8"));
    const journalMigration = path.join(repo, "supabase/migrations/018_d1_unsigned_transactions.sql");
    if (fs.existsSync(journalMigration)) apply("018.sql", fs.readFileSync(journalMigration, "utf8"));
    // Test-only public observation RPC: no production table grants are weakened.
    apply("observe.sql", `
      create function public.fixture_snapshot() returns jsonb language plpgsql
      security definer set search_path = '' as $$
      declare result jsonb; intents jsonb := '[]'::jsonb; sequences jsonb := '[]'::jsonb; journal jsonb := '[]'::jsonb;
      begin
        if pg_catalog.to_regclass('public.d1_issuance_intents') is not null then
          execute 'select coalesce(jsonb_agg(to_jsonb(t) order by request_id), ''[]''::jsonb)
                   from public.d1_issuance_intents t' into intents;
        end if;
        if pg_catalog.to_regclass('public.d1_issuance_sequences') is not null then
          execute 'select coalesce(jsonb_agg(to_jsonb(t) order by request_id), ''[]''::jsonb)
                   from public.d1_issuance_sequences t' into sequences;
        end if;
        if pg_catalog.to_regclass('public.d1_unsigned_transactions') is not null then
          execute 'select coalesce(jsonb_agg(to_jsonb(t) order by request_id), ''[]''::jsonb)
                   from public.d1_unsigned_transactions t' into journal;
        end if;
        select pg_catalog.jsonb_build_object(
          'journal', journal, 'sequences', sequences,
          'reservations', (select jsonb_agg(to_jsonb(t) order by request_id) from public.release_requests t),
          'payments', (select jsonb_agg(to_jsonb(t) order by transaction_hash, operation_id) from public.donation_payments t),
          'allocations', (select jsonb_agg(to_jsonb(t) order by request_id) from public.donation_allocations t),
          'preparations', (select jsonb_agg(to_jsonb(t) order by request_id) from public.d1_preparations t),
          'pools', (select jsonb_agg(to_jsonb(t) order by namespace) from public.d1_pools t),
          'admins', (select jsonb_agg(to_jsonb(t) order by public_key) from public.admin_wallets t),
          'intents', intents) into result;
        return result;
      end; $$;
      revoke all on function public.fixture_snapshot() from public;
      grant execute on function public.fixture_snapshot() to service_role;`);
    const snapshot = () => JSON.parse(sql("select public.fixture_snapshot();"));
    const register = (n, admin = key) =>
      `select public.d1_register_issuance_intent('${id(n)}','${admin}');`;
    function intentRejected(source, message, role = "service_role") {
      const before = digest(snapshot());
      const r = spawnSync(process.execPath, [launcher, "psql", ...args,
        "--set", "VERBOSITY=terse", "-c", `set role ${role}; ` + source],
      { env, encoding: "utf8", timeout: 150000 });
      record(r.stderr || "");
      assert.equal(r.status, 1);
      assert.equal(r.stdout, "SET\n");
      assert.equal(r.stderr, `ERROR:  ${message}\n`);
      assert.equal(digest(snapshot()), before, "Rejected RPC preserves every row and capacity counter");
    }
    // Behavioral RED without 016: this call must return a receipt, not undefined_function.
    const economicBefore = snapshot();
    const intent = JSON.parse(sql(register(1)));
    assert.deepEqual(intent, {
      kind: "d1_issuance_request_intent", revision: 1, request_id: id(1),
      namespace: id(100), network: "TESTNET", pool: key,
      preparation_input: input, preparation: receipt,
    });
    const economicAfter = snapshot();
    assert.equal(economicAfter.intents.length, 1);
    assert.deepEqual(economicAfter.intents[0], { request_id: id(1), receipt: intent });
    delete economicBefore.intents;
    delete economicAfter.intents;
    assert.deepEqual(economicAfter, economicBefore, "Registration never allocates or changes capacity");
    assert.deepEqual(JSON.parse(sql(register(1))), intent);
    intentRejected(register(500), "d1_preparation_not_found");
    intentRejected(register(99), "d1_preparation_not_found");
    // A non-D1 reservation in the new pool is not adoptable either.
    sql(`select public.reserve_release_request('${id(98)}','${key}',${lit(request)});`);
    intentRejected(register(98), "d1_preparation_not_found");
    intentRejected(register(1, oldPool), "unauthorized_admin_wallet");
    intentRejected("select public.d1_register_issuance_intent(null,null);", "invalid_issuance_intent");
    sql(`delete from public.admin_wallets where public_key = '${key}';`, false);
    intentRejected(register(1), "unauthorized_admin_wallet");
    sql(`insert into public.admin_wallets values ('${key}');`, false);
    // Two requests share a short immutable cutoff; only one registers before it.
    const shortConfirmed = Number(sql("select floor(extract(epoch from clock_timestamp()))::bigint - 295;"));
    const shortDeadline = new Date((shortConfirmed + 300) * 1000).toISOString().replace(".000Z", "Z");
    for (const n of [20, 21]) {
      prepare({ ...input, request_id: id(n), confirmed_at: shortConfirmed,
        payment: { ...payment, operation_id: String(200 + n) },
        request: { ...request, deadline: shortDeadline } });
    }
    const shortIntent = JSON.parse(sql(register(20)));
    const reserve = (n, sequence = "0", admin = key) =>
      `select public.d1_reserve_issuance_sequence('${id(n)}','${admin}',${sequence === null ? "null" : "'" + sequence + "'"});`;
    // Behavioral RED without 017: reach the public RPC, not a missing-file assertion.
    const sequenceBefore = snapshot();
    const sequenceRace = await Promise.all([1, 2].map(() => concurrent(reserve(20))));
    assert.deepEqual(sequenceRace.map((r) => r.code), [0, 0], JSON.stringify(sequenceRace));
    assert.deepEqual(sequenceRace.map((r) => r.stderr), ["", ""]);
    assert.equal(sequenceRace[0].stdout, sequenceRace[1].stdout);
    const sequenceReceipt = JSON.parse(sequenceRace[0].stdout);
    assert.deepEqual(sequenceReceipt, {
      kind: "d1_issuance_sequence_reservation", revision: 1,
      request_id: id(20), namespace: id(100), network: "TESTNET", pool: key,
      observed_account_sequence: "0", transaction_sequence: "1", intent: shortIntent,
    });
    const sequenceAfter = snapshot();
    assert.equal(sequenceAfter.sequences.length, 1);
    assert.deepEqual(sequenceAfter.sequences[0], {
      namespace: id(100), request_id: id(20), receipt: sequenceReceipt,
    });
    delete sequenceBefore.sequences;
    delete sequenceAfter.sequences;
    assert.deepEqual(sequenceAfter, sequenceBefore, "Sequence ownership has no financial side effects");
    for (const invalid of [null, "", "00", "01", "-1", "+1", " 1", "1 ", "1.0", "1e1",
      "9223372036854775807", "9223372036854775808", "99999999999999999999"]) {
      intentRejected(reserve(20, invalid), "invalid_issuance_sequence");
    }
    intentRejected("select public.d1_reserve_issuance_sequence(null,null,'0');", "invalid_issuance_sequence");
    intentRejected(reserve(20, "1"), "issuance_sequence_conflict");
    intentRejected(reserve(500), "d1_preparation_not_found");
    intentRejected(reserve(99), "d1_preparation_not_found");
    intentRejected(reserve(98), "d1_preparation_not_found");
    intentRejected(reserve(2), "d1_issuance_intent_not_found");
    intentRejected(reserve(20, "0", oldPool), "unauthorized_admin_wallet");
    sql(`delete from public.admin_wallets where public_key = '${key}';`, false);
    intentRejected(reserve(20), "unauthorized_admin_wallet");
    sql(`insert into public.admin_wallets values ('${key}');`, false);
    intentRejected(reserve(1), "issuance_source_busy");
    sql(`select pg_sleep(greatest(0, extract(epoch from '${shortDeadline}'::timestamptz - clock_timestamp())));`);
    intentRejected(register(21), "deadline_expired");
    intentRejected(reserve(21), "d1_issuance_intent_not_found");
    const expiredSequenceBefore = digest(snapshot());
    assert.deepEqual(JSON.parse(sql(reserve(20))), sequenceReceipt, "Expired sequence replay is evidence only");
    assert.equal(digest(snapshot()), expiredSequenceBefore);
    intentRejected(reserve(1), "issuance_source_busy");
    // Expiry cannot turn a conflicting observation into a fresh reservation.
    intentRejected(reserve(20, "2"), "issuance_sequence_conflict");
    const expiredBefore = digest(snapshot());
    assert.deepEqual(JSON.parse(sql(register(20))), shortIntent, "Expired replay is immutable evidence only");
    assert.equal(digest(snapshot()), expiredBefore);
    const concurrentBefore = snapshot();
    const intentRace = await Promise.all([1, 2].map(() => concurrent(register(12))));
    assert.deepEqual(intentRace.map((r) => r.code), [0, 0]);
    assert.deepEqual(intentRace.map((r) => r.stderr), ["", ""]);
    assert.equal(intentRace[0].stdout, intentRace[1].stdout, "Concurrent receipts are byte-identical");
    const concurrentAfter = snapshot();
    assert.equal(concurrentAfter.intents.length, concurrentBefore.intents.length + 1);
    assert.equal(concurrentAfter.intents.filter((r) => r.request_id === id(12)).length, 1);
    delete concurrentBefore.intents;
    delete concurrentAfter.intents;
    assert.deepEqual(concurrentAfter, concurrentBefore);
    // A second stored pool has independent ownership; no caller-selected source exists.
    const secondPool = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV"; // Synthetic public bytes 0..01.
    sql(`select public.d1_activate_pool('${id(101)}','${secondPool}',900);`);
    const freshConfirmed = Number(sql("select floor(extract(epoch from clock_timestamp()))::bigint - 2;"));
    const freshRequest = { ...request,
      deadline: new Date((freshConfirmed + 300) * 1000).toISOString().replace(".000Z", "Z") };
    for (const n of [30, 31, 32]) {
      const cutoff = n === 32 ? freshConfirmed - 294 : freshConfirmed;
      prepare({ ...input, request_id: id(n), confirmed_at: cutoff,
        payment: { ...payment, pool: secondPool, operation_id: String(300 + n) },
        request: { ...freshRequest,
          deadline: new Date((cutoff + 300) * 1000).toISOString().replace(".000Z", "Z") } });
      sql(register(n));
    }
    // Hold the pool row past the deadline. Observe acquisition before starting RPC.
    const blocker = concurrent(`reset role; begin; set local application_name = 'd1_sequence_blocker';
      select namespace from public.d1_pools where namespace = '${id(101)}' for update;
      select pg_sleep(5); commit;`);
    let locked = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      locked = sql(`select exists(select 1 from pg_stat_activity where application_name = 'd1_sequence_blocker'
        and wait_event = 'PgSleep');`, false) === "t";
      if (locked) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(locked, true, "Blocker must own pool lock before reservation starts");
    assert.equal(sql(`select clock_timestamp() < to_timestamp(${freshConfirmed + 6});`), "t",
      "Reservation must begin before cutoff so only the lock wait exhausts its window");
    intentRejected(reserve(32), "deadline_expired");
    const blocked = await blocker;
    assert.equal(blocked.code, 0, blocked.stderr);
    assert.equal(blocked.stderr, "");
    const competingBefore = snapshot();
    const competing = await Promise.all([30, 31].map((n) =>
      concurrent(reserve(n, "9223372036854775806"))));
    assert.deepEqual(competing.map((r) => r.code).sort(), [0, 1]);
    const loser = competing.find((r) => r.code === 1);
    assert.equal(loser.rawStdout, "SET\n");
    assert.equal(loser.stderr, "ERROR:  issuance_source_busy\n");
    const winning = JSON.parse(competing.find((r) => r.code === 0).stdout);
    assert.equal(winning.pool, secondPool);
    assert.equal(winning.namespace, id(101));
    assert.equal(winning.observed_account_sequence, "9223372036854775806");
    assert.equal(winning.transaction_sequence, "9223372036854775807");
    const competingAfter = snapshot();
    assert.equal(competingAfter.sequences.length, 2);
    assert.equal(competingAfter.sequences.filter((r) => r.namespace === id(101)).length, 1);
    delete competingBefore.sequences;
    delete competingAfter.sequences;
    assert.deepEqual(competingAfter, competingBefore);
    // No API role can read or mutate sequence ownership, even service_role.
    for (const role of ["anon", "authenticated", "service_role"]) {
      if (role !== "service_role") intentRejected(reserve(20), "permission denied for function d1_reserve_issuance_sequence", role);
      for (const statement of [
        "select * from public.d1_issuance_sequences;",
        `insert into public.d1_issuance_sequences values ('${id(101)}','${id(501)}','{}');`,
        "update public.d1_issuance_sequences set receipt = '{}';",
        "delete from public.d1_issuance_sequences;",
        "truncate public.d1_issuance_sequences;",
      ]) intentRejected(statement, "permission denied for table d1_issuance_sequences", role);
    }
    assert.equal(sql(`select relrowsecurity from pg_class where oid = 'public.d1_issuance_sequences'::regclass;`), "t");
    assert.equal(sql(`select prosecdef and proconfig = array['search_path=""']
      from pg_proc where oid = 'public.d1_reserve_issuance_sequence(uuid,text,text)'::regprocedure;`), "t");
    console.log("SEQUENCE_CASES=canonical,bounds,admin,stored-intent,expiry,lock-wait,replay,exclusive,independent-pools,grants");
    // No API role can read or mutate intents directly, even service_role.
    for (const role of ["anon", "authenticated", "service_role"]) {
      if (role !== "service_role") intentRejected(register(1), "permission denied for function d1_register_issuance_intent", role);
      for (const statement of [
        "select * from public.d1_issuance_intents;",
        `insert into public.d1_issuance_intents values ('${id(501)}','{}');`,
        "update public.d1_issuance_intents set receipt = '{}';",
        "delete from public.d1_issuance_intents;",
        "truncate public.d1_issuance_intents;",
      ]) intentRejected(statement, "permission denied for table d1_issuance_intents", role);
    }
    // Catalog observations supplement the public behavior checks above.
    assert.equal(sql(`select relrowsecurity from pg_class where oid = 'public.d1_issuance_intents'::regclass;`), "t");
    assert.equal(sql(`select prosecdef and proconfig = array['search_path=""']
      from pg_proc where oid = 'public.d1_register_issuance_intent(uuid,text)'::regprocedure;`), "t");
    assert.deepEqual(JSON.parse(prepare(input)), receipt, "Preparation remains unchanged after intent registration");
    console.log("INTENT_CASES=missing,history,admin-replay,expiry,replay,immutable,concurrency,capacity,grants");
    const load = (n, admin = key) => `select public.d1_load_unsigned_transaction('${id(n)}','${admin}');`;
    // Fictional opaque bytes, deliberately NOT Stellar XDR or a matching transaction hash.
    const save = (n, bytes = "YWJj", hash = "b".repeat(64), admin = key) =>
      `select public.d1_save_unsigned_transaction('${id(n)}','${admin}',${bytes === null ? "null" : "'" + bytes + "'"},${hash === null ? "null" : "'" + hash + "'"});`;
    const journalBefore = digest(snapshot());
    // Actual public RPC RED when 018 is absent, not a fixture/file error.
    assert.deepEqual(JSON.parse(sql(load(2))), {
      kind: "d1_unsigned_transaction_lookup", revision: 1, request_id: id(2),
      namespace: id(100), network: "TESTNET", pool: key, reservation: null, transaction: null,
    });
    assert.equal(digest(snapshot()), journalBefore, "Lookup cannot create intent or reservation");
    const owned = JSON.parse(sql(load(20)));
    assert.deepEqual(owned.reservation, sequenceReceipt);
    assert.equal(owned.transaction, null);
    for (const n of [500, 99, 98]) {
      intentRejected(load(n), "d1_preparation_not_found");
      intentRejected(save(n), "d1_preparation_not_found");
    }
    intentRejected(save(2), "d1_issuance_sequence_not_found");
    intentRejected(save(20), "deadline_expired");
    intentRejected(load(20, oldPool), "unauthorized_admin_wallet");
    intentRejected("select public.d1_load_unsigned_transaction(null,null);", "invalid_unsigned_transaction");
    intentRejected("select public.d1_save_unsigned_transaction(null,null,null,null);", "invalid_unsigned_transaction");
    // Each new source has its own permanent 017 owner; never recycle older pools.
    async function journalRequest(n, seconds = 298) {
      // Public StrKey fixture encoding only (no keypair/secret or signing).
      const raw = Buffer.alloc(35);
      raw[0] = 48;
      raw[32] = n;
      let crc = 0;
      for (const byte of raw.subarray(0, 33)) {
        crc ^= byte << 8;
        for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 32768) ? 0x1021 : 0)) & 65535;
      }
      raw.writeUInt16LE(crc, 33);
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      let pool = "", buffer = 0, bits = 0;
      for (const byte of raw) {
        buffer = (buffer << 8) | byte;
        bits += 8;
        while (bits >= 5) { bits -= 5; pool += alphabet[(buffer >>> bits) & 31]; }
        buffer &= (1 << bits) - 1;
      }
      sql(`select public.d1_activate_pool('${id(n + 1000)}','${pool}',900);`);
      const now = Number(sql("select floor(extract(epoch from clock_timestamp()))::bigint;"));
      const confirmed_at = now - (300 - seconds);
      const deadline = new Date((confirmed_at + 300) * 1000).toISOString().replace(".000Z", "Z");
      prepare({ ...input, request_id: id(n), confirmed_at,
        payment: { ...payment, pool, operation_id: String(n) },
        request: { ...request, deadline } });
      sql(register(n));
      const reservation = JSON.parse(sql(reserve(n, "42")));
      return { pool, deadline, reservation };
    }
    const stored = await journalRequest(222);
    const economicJournalBefore = snapshot();
    const identical = await Promise.all([1, 2].map(() => concurrent(save(222))));
    assert.deepEqual(identical.map((r) => r.code), [0, 0], JSON.stringify(identical));
    assert.deepEqual(identical.map((r) => r.stderr), ["", ""]);
    assert.equal(identical[0].stdout, identical[1].stdout);
    for (const result of identical) assert.equal(result.rawStdout, "SET\n" + result.stdout + "\n");
    const saved = JSON.parse(identical[0].stdout);
    assert.deepEqual(saved, {
      kind: "d1_unsigned_transaction_journal", revision: 1, request_id: id(222),
      namespace: id(1222), network: "TESTNET", pool: stored.pool, deadline: stored.deadline,
      transaction_sequence: "43", reservation: stored.reservation,
      unsigned_xdr: "YWJj", transaction_hash: "b".repeat(64),
    });
    const economicJournalAfter = snapshot();
    assert.deepEqual(economicJournalAfter.journal, [{ request_id: id(222), receipt: saved }]);
    delete economicJournalBefore.journal;
    delete economicJournalAfter.journal;
    assert.deepEqual(economicJournalAfter, economicJournalBefore, "Save never allocates or releases");
    assert.deepEqual(JSON.parse(sql(load(222))).transaction, saved);
    assert.deepEqual(JSON.parse(sql(load(222))).reservation, stored.reservation);
    assert.deepEqual(JSON.parse(sql(save(222))), saved);
    intentRejected(save(222, "YWJk"), "unsigned_transaction_conflict");
    intentRejected(save(222, "YWJj", "c".repeat(64)), "unsigned_transaction_conflict");
    for (const bytes of [null, "", "A", "YQ", "YQ=", "YR==", "YWJ=", "YQ===", "YW-J", "YWJj\n", "A".repeat(65540)]) {
      intentRejected(save(222, bytes), "invalid_unsigned_transaction");
    }
    for (const hash of [null, "", "B".repeat(64), "b".repeat(63), "g".repeat(64), "b".repeat(65)]) {
      intentRejected(save(222, "YWJj", hash), "invalid_unsigned_transaction");
    }
    // Current membership, not the original preparing admin, controls both RPCs.
    sql(`insert into public.admin_wallets values ('${oldPool}');`, false);
    assert.deepEqual(JSON.parse(sql(save(222, "YWJj", "b".repeat(64), oldPool))), saved);
    assert.deepEqual(JSON.parse(sql(load(222, oldPool))).transaction, saved);
    sql(`delete from public.admin_wallets where public_key = '${key}';`, false);
    for (const n of [222, 20, 500]) intentRejected(load(n), "unauthorized_admin_wallet");
    intentRejected(save(222), "unauthorized_admin_wallet");
    sql(`insert into public.admin_wallets values ('${key}');`, false);
    const boundary = await journalRequest(223);
    const boundReceipt = JSON.parse(sql(save(223, "A".repeat(65536))));
    assert.equal(boundReceipt.unsigned_xdr, "A".repeat(65536), "Canonical encoder wrapping is not stored");
    assert.deepEqual(boundReceipt.reservation, boundary.reservation);
    await journalRequest(224);
    const raceBefore = snapshot();
    const conflict = await Promise.all(["YQ==", "Yg=="].map((bytes) => concurrent(save(224, bytes))));
    assert.deepEqual(conflict.map((r) => r.code).sort(), [0, 1]);
    const conflictLoser = conflict.find((r) => r.code === 1);
    assert.equal(conflictLoser.rawStdout, "SET\n");
    assert.equal(conflictLoser.stderr, "ERROR:  unsigned_transaction_conflict\n");
    const conflictWinner = JSON.parse(conflict.find((r) => r.code === 0).stdout);
    assert.deepEqual(JSON.parse(sql(load(224))).transaction, conflictWinner);
    const raceAfter = snapshot();
    assert.equal(raceAfter.journal.length, raceBefore.journal.length + 1);
    assert.equal(raceAfter.journal.filter((r) => r.request_id === id(224)).length, 1);
    delete raceBefore.journal;
    delete raceAfter.journal;
    assert.deepEqual(raceAfter, raceBefore);
    const cutoff = await journalRequest(225, 4);
    const cutoffSaved = JSON.parse(sql(save(225)));
    const wait = await journalRequest(226, 4);
    const journalBlocker = concurrent(`reset role; begin; set local application_name = 'd1_journal_blocker';
      select namespace from public.d1_pools where namespace = '${id(1226)}' for update;
      select pg_sleep(5); commit;`);
    let journalLocked = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      journalLocked = sql(`select exists(select 1 from pg_stat_activity where application_name = 'd1_journal_blocker'
        and wait_event = 'PgSleep');`, false) === "t";
      if (journalLocked) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(journalLocked, true);
    assert.equal(sql(`select clock_timestamp() < '${wait.deadline}'::timestamptz;`), "t");
    intentRejected(save(226), "deadline_expired");
    const journalBlocked = await journalBlocker;
    assert.equal(journalBlocked.code, 0, journalBlocked.stderr);
    assert.equal(journalBlocked.stderr, "");
    assert.equal(sql(`select clock_timestamp() >= '${cutoff.deadline}'::timestamptz;`), "t");
    const replayBefore = digest(snapshot());
    assert.deepEqual(JSON.parse(sql(save(225))), cutoffSaved, "Expired replay returns exact evidence");
    assert.deepEqual(JSON.parse(sql(load(225))).transaction, cutoffSaved);
    assert.deepEqual(JSON.parse(sql(load(226))).reservation, wait.reservation);
    assert.equal(JSON.parse(sql(load(226))).transaction, null);
    assert.equal(digest(snapshot()), replayBefore);
    intentRejected(save(225, "YQ=="), "unsigned_transaction_conflict");
    intentRejected(save(225, "YWJj", "c".repeat(64)), "unsigned_transaction_conflict");
    sql(`delete from public.admin_wallets where public_key = '${key}';`, false);
    intentRejected(load(225), "unauthorized_admin_wallet");
    intentRejected(save(225), "unauthorized_admin_wallet");
    sql(`insert into public.admin_wallets values ('${key}');`, false);
    for (const role of ["anon", "authenticated", "service_role"]) {
      if (role !== "service_role") {
        intentRejected(load(222), "permission denied for function d1_load_unsigned_transaction", role);
        intentRejected(save(222), "permission denied for function d1_save_unsigned_transaction", role);
      }
      for (const statement of ["select * from public.d1_unsigned_transactions;",
        `insert into public.d1_unsigned_transactions values ('${id(501)}','{}');`,
        "update public.d1_unsigned_transactions set receipt = '{}';",
        "delete from public.d1_unsigned_transactions;", "truncate public.d1_unsigned_transactions;"]) {
        intentRejected(statement, "permission denied for table d1_unsigned_transactions", role);
      }
    }
    assert.equal(sql(`select relrowsecurity from pg_class where oid = 'public.d1_unsigned_transactions'::regclass;`), "t");
    for (const signature of ["d1_load_unsigned_transaction(uuid,text)", "d1_save_unsigned_transaction(uuid,text,text,text)"]) {
      assert.equal(sql(`select prosecdef and proconfig = array['search_path=""'] from pg_proc
        where oid = 'public.${signature}'::regprocedure;`), "t");
    }
    console.log("JOURNAL_CASES=lookup,opaque,canonical,bounds,admin,reservation,expiry,lock-wait,replay,conflict,concurrency,grants,capacity");
    assert.equal(
      sql(
        `select public.allocate_donation_to_release_request('${id(99)}','${key}',${
          lit(oldPayment)
        },'${oldPool}');`,
      ),
      historical,
    );
  } finally {
    if (fs.existsSync(path.join(data, "postmaster.pid"))) {
      run("pg_ctl", ["-D", data, "-m", "fast", "-w", "-t", "30", "stop"]);
    }
    if (fs.existsSync(path.join(data, "PG_VERSION"))) {
      run("pg_ctl", ["-D", data, "status"], 3);
      console.log("PG_STOPPED=true; STATUS=3; FIXTURE=" + fixture);
    }
    console.log("LAUNCHER_SCRATCH=" + JSON.stringify([...scratch]));
    if (process.platform === "linux") {
      assert.ok(!fs.existsSync(path.join(data, "postmaster.pid")), "Owned server must be stopped");
      if (serverPid) {
        assert.throws(() => process.kill(serverPid, 0), { code: "ESRCH" }, "Owned server PID must be gone");
        console.log("PG_PID_GONE=true; PID=" + serverPid);
      }
      fs.rmSync(fixture, { recursive: true });
      console.log("FIXTURE_REMOVED=true; FIXTURE=" + fixture);
    }
  }
});
