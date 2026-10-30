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
        resolve({ code, stdout: stdout.trim().replace(/^SET\r?\n/, ""), stderr });
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
    // Test-only public observation RPC: no production table grants are weakened.
    apply("observe.sql", `
      create function public.fixture_snapshot() returns jsonb language plpgsql
      security definer set search_path = '' as $$
      declare result jsonb; intents jsonb := '[]'::jsonb;
      begin
        if pg_catalog.to_regclass('public.d1_issuance_intents') is not null then
          execute 'select coalesce(jsonb_agg(to_jsonb(t) order by request_id), ''[]''::jsonb)
                   from public.d1_issuance_intents t' into intents;
        end if;
        select pg_catalog.jsonb_build_object(
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
    sql(`select pg_sleep(greatest(0, extract(epoch from '${shortDeadline}'::timestamptz - clock_timestamp())));`);
    intentRejected(register(21), "deadline_expired");
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
