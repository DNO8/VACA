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
      fs.rmSync(fixture, { recursive: true });
      console.log("FIXTURE_REMOVED=true; FIXTURE=" + fixture);
    }
  }
});
