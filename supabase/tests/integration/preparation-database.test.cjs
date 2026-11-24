// Synthetic, owned PostgreSQL only; no ledger, signing or deployment evidence.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawnSync, spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { resolveFixtureRuntime } = require("./fixture-runtime.cjs");

const repo = path.resolve(__dirname, "../../..");
const toolRoot = "/home/danilo/.local/share/vaca-d1-toolchain";
const phase = process.env.D1_FIXTURE_PHASE ?? "full";
assert.ok(["full", "before-015", "before-023"].includes(phase), "Invalid D1_FIXTURE_PHASE");
assert.equal(process.platform, "linux", "This database suite requires the isolated Linux runner");
assert.equal(process.env.D1_TOOL_ROOT, toolRoot, "This database suite requires the pinned D1_TOOL_ROOT");
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime({
  env: { D1_TOOL_ROOT: toolRoot, TMPDIR: "/tmp" },
});

// StrKeys encode repeated synthetic public bytes and their CRC16-XModem, not seeds.
function key(n) {
  const bytes = [48, ...Array(32).fill(n)];
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 32768) ? 4129 : 0)) & 65535;
  }
  bytes.push(crc & 255, crc >> 8);
  const bits = bytes.map(b => b.toString(2).padStart(8, "0")).join("");
  return bits.match(/.{5}/g).map(b => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[parseInt(b, 2)]).join("");
}
const admin = key(0), pool = key(1), oldPool = key(2);
const incident = "fixture-incident-full-id";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lit = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const utc = seconds => new Date(seconds * 1000).toISOString().replace(".000Z", "Z");
const now = () => Math.floor(Date.now() / 1000);
const payment = (operation, account = pool, amount = "2.0000000") => ({
  transaction_hash: "a".repeat(64), operation_id: String(operation), donor: admin,
  pool: account, asset: { type: "native" }, amount,
});
const activate = (account = pool, namespace = id(100), name = "d1_activate_pool") =>
  `select public.${name}('${namespace}'::uuid,'${account}'::text,900::bigint);`;
const allocate = (n, paid, name = "allocate_donation_to_release_request") =>
  `select public.${name}('${id(n)}','${admin}',${lit(paid)},'${paid.pool}');`;
const prepare = value => `select public.d1_prepare(${lit(value)});`;
const rejectedResult = (error, stdout = "SET\n") => ({
  status: 1, stdout, stderr: `ERROR:  ${error}\n`,
});

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function run(tool, args) {
  const { status, stdout, stderr, signal, error } = spawnSync(process.execPath, [launcher, tool, ...args], {
    env, encoding: "utf8", timeout: 30000,
  });
  assert.ok(!error && !signal, `${tool}: ${error ?? signal}\n${stdout}\n${stderr}`);
  return { status, stdout, stderr };
}
function ok(result) {
  assert.deepEqual({ ...result, stdout: undefined }, { status: 0, stderr: "", stdout: undefined }, result.stdout);
  return result.stdout;
}

// Reject checks use the service-facing accounting relations and include capacity counters.
const accountingSql = `select jsonb_build_object(
  'requests', (select coalesce(jsonb_agg(r order by request_id), '[]') from public.release_requests r),
  'allocations', (select coalesce(jsonb_agg(a order by request_id), '[]') from public.donation_allocations a),
  'payments', (select coalesce(jsonb_agg(p order by transaction_hash, operation_id), '[]') from public.donation_payments p));`;

function onlyOneAllocation(before, after, n, paid, alreadyReserved = false) {
  const { requests, allocations, payments } = JSON.parse(after);
  const reservation = requests.find(row => row.request_id === id(n));
  const allocation = allocations.find(row => row.request_id === id(n));
  const matchesPayment = row => row.operation_id === paid.operation_id && row.transaction_hash === paid.transaction_hash;
  const storedPayment = payments.find(matchesPayment);
  assert.equal(reservation.request.amount, "1.0000000");
  assert.equal(allocation.operation_id, paid.operation_id);
  assert.equal(allocation.transaction_hash, paid.transaction_hash);
  assert.equal(allocation.allocated_stroops, 10000000);
  assert.deepEqual(storedPayment.payment, paid);
  assert.equal(storedPayment.donation_stroops, Number(paid.amount.replace(".", "")));
  assert.equal(storedPayment.allocated_stroops, 10000000);
  assert.deepEqual({
    requests: alreadyReserved ? requests : requests.filter(row => row !== reservation),
    allocations: allocations.filter(row => row !== allocation),
    payments: payments.filter(row => !matchesPayment(row)),
  }, JSON.parse(before));
}

async function waitFor(predicate, session, description) {
  const until = performance.now() + 7000;
  while (performance.now() < until) {
    if (predicate()) return;
    assert.ok(!session.result, `${description}: ${JSON.stringify(session.result)}`);
    await delay(25); // Poll observed state, never assume lock acquisition from elapsed time.
  }
  assert.fail(`Timed out waiting for ${description}`);
}

test("local D1 preparation and legacy allocation fence", async t => {
  const port = await freePort();
  const fixture = fs.mkdtempSync(path.join(temp, "vaca-d1-pg-"));
  const data = path.join(fixture, "data");
  const pidFile = path.join(data, "postmaster.pid");
  const log = path.join(fixture, "postgres.log");
  const args = [...connectionArgs, "-p", String(port), "-U", "postgres",
    "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse", "-At"];
  const psql = source => run("psql", [...args, "-c", source]);
  const sql = (source, role = "service_role") => {
    const stdout = ok(psql((role ? `set role ${role}; ` : "") + source));
    if (role) assert.ok(stdout.startsWith("SET\n"), stdout);
    return (role ? stdout.slice(4) : stdout).trimEnd();
  };
  const apply = relative => assert.equal(ok(run("psql", [...args, "-q", "-f", path.join(repo, relative)])), "");
  const snapshot = () => sql(accountingSql);
  const rejected = (source, error, role = "service_role") => {
    const before = snapshot();
    const result = psql(`set role ${role}; ${source}`);
    assert.deepEqual({ ...result, unchanged: snapshot() === before }, { ...rejectedResult(error), unchanged: true });
  };
  const sessions = [];
  const session = source => {
    const state = {};
    const child = spawn(process.execPath, [launcher, "psql", ...args, "-c", source], { env });
    let stdout = "", stderr = "";
    child.stdout.on("data", b => stdout += b);
    child.stderr.on("data", b => stderr += b);
    child.once("error", err => stderr += `launcher error: ${err.message}`);
    state.done = new Promise(resolve => child.once("close", (status, signal) => {
      if (signal) stderr += `launcher signal: ${signal}`;
      state.result = { status, stdout, stderr };
      resolve(state.result);
    }));
    sessions.push(state);
    return state;
  };
  async function contend(label, firstRpc, secondRpc) {
    // The launcher buffers stdio. The first RPC runs in an explicit transaction
    // and holds its locks while an owner-only SQL barrier waits for a release row.
    const first = session(`set application_name='${label}-first';
      begin; set role service_role; ${firstRpc} reset role;
      do $barrier$ begin
        while not exists (select 1 from fixture_control.releases where name = '${label}') loop
          perform pg_sleep(0.025);
        end loop;
      end $barrier$; commit;`);
    await waitFor(() => sql(`select exists (select 1 from pg_stat_activity
      where application_name='${label}-first' and wait_event='PgSleep');`, null) === "t", first, `${label} holder`);
    const second = session(`set application_name='${label}-second'; set role service_role; ${secondRpc}`);
    await waitFor(() => sql(`select exists (select 1 from pg_stat_activity a, pg_stat_activity b
      where a.application_name='${label}-second' and b.application_name='${label}-first'
        and b.pid = any(pg_blocking_pids(a.pid)));`, null) === "t", second, `${label} blocked RPC`);
    assert.equal(sql(`insert into fixture_control.releases values ('${label}');`, null), "INSERT 0 1");
    const [held, competed] = await Promise.all([first.done, second.done]);
    const line = held.stdout.split("\n")[3];
    assert.deepEqual(held, { status: 0, stderr: "", stdout: `SET\nBEGIN\nSET\n${line}\nRESET\nDO\nCOMMIT\n` });
    return { line, competed };
  }

  let pid, cleanupPromise;
  const cleanup = () => cleanupPromise ??= (async () => {
    try {
      if (fs.existsSync(pidFile)) {
        pid ??= Number(fs.readFileSync(pidFile, "utf8").split("\n")[0]);
        ok(run("pg_ctl", ["-D", data, "-m", "fast", "-w", "-t", "10", "stop"]));
      }
    } finally {
      const initialized = fs.existsSync(path.join(data, "PG_VERSION"));
      if (initialized) {
        const status = run("pg_ctl", ["-D", data, "status"]);
        assert.deepEqual(status, { status: 3, stderr: "", stdout: "pg_ctl: no server running\n" });
      }
      await Promise.all(sessions.map(s => s.done));
      assert.ok(!fs.existsSync(pidFile), `Postmaster PID file still present: ${pidFile}`);
      if (pid) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
      fs.rmSync(fixture, { recursive: true });
      assert.ok(!fs.existsSync(fixture));
      console.log(`PG_STATUS=${initialized ? 3 : "not initialized"}; PID_GONE=${pid ?? "not started"}; FIXTURE_REMOVED=${fixture}`);
    }
  })();
  const terminate = () => {
    cleanup().then(() => process.exit(143), error => { console.error(error); process.exit(1); });
  };
  process.once("SIGTERM", terminate);
  try {
    ok(run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--locale=C"]));
    try {
      ok(run("pg_ctl", ["-D", data, "-l", log, "-o", `-p ${port}`, "-w", "-t", "10", "start"]));
    } catch (error) {
      if (fs.existsSync(log)) t.diagnostic(fs.readFileSync(log, "utf8"));
      throw error;
    }
    pid = Number(fs.readFileSync(pidFile, "utf8").split("\n")[0]);
    assert.ok(Number.isSafeInteger(pid) && pid > 1);
    assert.equal(sql(`select current_user, inet_server_addr(), current_setting('data_directory'),
      current_setting('unix_socket_directories'), current_setting('ssl'), current_setting('jit');`, null),
      `postgres|127.0.0.1|${data}||off|off`);
    assert.equal(sql("alter database postgres set statement_timeout = '15s';", null), "ALTER DATABASE");
    // Model Supabase's service role bypass of RLS without granting any table access.
    ok(psql(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}');
      insert into public.incidents values ('${incident}','vaquita','${admin}');
      create schema fixture_control; create table fixture_control.releases(name text primary key);`));
    apply("supabase/tests/fixtures/retained-014.sql");
    apply("supabase/tests/fixtures/retained-20261011060218.sql");
    const confirmed = now() - 2;
    const request = { version: 1, incident_id: incident, donor: admin, beneficiary: admin,
      asset: { type: "native" }, amount: "1.0000000", deadline: utc(confirmed + 300) };
    const reserve = n => sql(`select public.reserve_release_request('${id(n)}','${admin}',${lit(request)});`);
    const input = { request_id: id(1), authorized_by: admin, payment: payment(123), request,
      confirmed_at: confirmed, ledger: 900,
      memo_hash: createHash("sha256").update(`vaca.d1.donation.v1\n${incident}`).digest("hex") };
    const next = (n, fields = {}) => ({ ...input, request_id: id(n), ...fields });
    const oldPayment = payment(199, oldPool);
    reserve(99);
    const historical = sql(allocate(99, oldPayment));
    assert.equal(JSON.parse(historical).state, "allocated");
    const historyOnly = snapshot();
    assert.equal(JSON.parse(historyOnly).payments[0].allocated_stroops, 10000000);

    if (phase !== "before-015") apply("supabase/migrations/015_d1_testnet_custody.sql");
    let activation;
    await t.test("015 activates the pool at the configured first ledger", () => {
      activation = sql(activate());
      assert.deepEqual(JSON.parse(activation), { namespace: id(100), pool, first_ledger: 900 });
      assert.equal(snapshot(), historyOnly);
    });
    if (phase === "before-015") return;

    // Apply 023 with both an activated pool and historical allocation already present.
    if (phase !== "before-023") apply("supabase/migrations/023_d1_legacy_allocation_guard.sql");
    await t.test("023 denies a fresh legacy allocation into the activated pool without mutation", () => {
      reserve(80);
      rejected(allocate(80, payment(180)), "d1_legacy_allocation_forbidden");
    });
    if (phase === "before-023") return;

    await t.test("015 binds payment, activation, current admin and deadline before reserving", () => {
      const memoMismatch = { memo_hash: "0".repeat(64) };
      const badDeadline = { request: { ...request, deadline: utc(confirmed + 301) } };
      for (const mismatch of [memoMismatch, badDeadline]) {
        rejected(prepare(next(2, mismatch)), "payment_binding_mismatch");
      }
      rejected(prepare(next(2, { ledger: 899 })), "payment_before_activation");
      rejected(prepare(next(2, { confirmed_at: now() + 60 })), "payment_before_activation");
      rejected(prepare(next(2, { payment: payment(123, oldPool) })), "pool_not_activated");
      rejected(activate(oldPool, id(101)), "historical_pool");
      rejected(activate(pool, id(101)), "activation_conflict");
      rejected(prepare(next(99)), "historical_request");
      rejected(prepare(next(2, { payment: { ...oldPayment, pool } })), "historical_payment");
      rejected(prepare(next(2, { authorized_by: oldPool })), "unauthorized_admin_wallet");
      const expired = now() - 300;
      rejected(prepare(next(3, { confirmed_at: expired, payment: payment(124),
        request: { ...request, deadline: utc(expired + 300) } })), "deadline_expired");
      assert.equal(JSON.parse(sql(prepare(next(3, { payment: payment(124) })))).state, "allocated");
    });

    let receipt;
    await t.test("015 uses the private allocator, replays receipts and rolls back failed capacity", () => {
      const before = snapshot();
      receipt = sql(prepare(input)); // First ledger (900) is inclusive.
      const parsed = JSON.parse(receipt);
      assert.equal(parsed.state, "allocated");
      assert.equal(parsed.revision, 1);
      assert.equal(parsed.request_id, id(1));
      assert.deepEqual(parsed.allocation.reservation.request, request);
      assert.deepEqual(parsed.allocation.payment, input.payment);
      onlyOneAllocation(before, snapshot(), 1, input.payment);
      const after = snapshot();
      assert.equal(sql(prepare(input)), receipt);
      assert.deepEqual(JSON.parse(sql(allocate(1, input.payment))), parsed.allocation);
      assert.equal(snapshot(), after);
      rejected(prepare(next(1, { request: { ...request, amount: "0.5000000" } })), "idempotency_conflict");
      rejected(prepare(next(2, { request: { ...request, amount: "1.0000001" } })), "donation_capacity_exceeded");
      assert.equal(JSON.parse(sql(prepare(next(2)))).state, "allocated");
      const complete = JSON.parse(snapshot()).payments.find(row => row.operation_id === "123");
      assert.equal(complete.allocated_stroops, 20000000);
    });

    await t.test("015 serializes contended capacity and identical receipts", async () => {
      const capped = payment(125, pool, "1.0000000"), identical = payment(126);
      const beforeCapacity = snapshot();
      const capacity = await contend("capacity", prepare(next(10, { payment: capped })), prepare(next(11, { payment: capped })));
      assert.equal(JSON.parse(capacity.line).request_id, id(10));
      assert.deepEqual(capacity.competed, rejectedResult("donation_capacity_exceeded", "SET\nSET\n"));
      onlyOneAllocation(beforeCapacity, snapshot(), 10, capped);
      const beforeReplay = snapshot();
      const same = prepare(next(12, { payment: identical }));
      const replay = await contend("identical", same, same);
      assert.equal(JSON.parse(replay.line).request_id, id(12));
      assert.deepEqual(replay.competed, { status: 0, stdout: `SET\nSET\n${replay.line}\n`, stderr: "" });
      onlyOneAllocation(beforeReplay, snapshot(), 12, identical);
    });

    await t.test("023 retains legacy replay and enforces current-admin and private ACLs", () => {
      const before = snapshot();
      assert.equal(sql(activate()), activation);
      assert.equal(sql(allocate(99, oldPayment)), historical);
      assert.equal(snapshot(), before);
      rejected(allocate(99, { ...oldPayment, amount: "3.0000000" }), "donation_binding_conflict");
      reserve(98);
      assert.equal(JSON.parse(sql(allocate(98, payment(198, oldPool)))).state, "allocated");
      for (const role of ["anon", "authenticated"]) {
        rejected(prepare(input), "permission denied for function d1_prepare", role);
        rejected(activate(), "permission denied for function d1_activate_pool", role);
        rejected(allocate(99, oldPayment), "permission denied for function allocate_donation_to_release_request", role);
      }
      for (const role of ["anon", "authenticated", "service_role"]) {
        rejected(allocate(80, payment(180), "d1_allocate_donation_private"), "permission denied for function d1_allocate_donation_private", role);
        rejected(activate(pool, id(100), "d1_activate_pool_private"), "permission denied for function d1_activate_pool_private", role);
        for (const table of ["d1_preparations", "d1_pools", "d1_legacy_pool_fences"]) {
          rejected(`select * from public.${table};`, `permission denied for table ${table}`, role);
        }
      }
      assert.equal(sql(`delete from public.admin_wallets where public_key='${admin}';`, null), "DELETE 1");
      rejected(prepare(input), "unauthorized_admin_wallet");
      rejected(allocate(99, oldPayment), "unauthorized_admin_wallet");
      assert.equal(sql(`insert into public.admin_wallets values ('${admin}');`, null), "INSERT 0 1");
      assert.equal(sql(prepare(input)), receipt);
    });

    await t.test("023 prevents activation and legacy allocation committing in either order", async () => {
      for (const activationFirst of [true, false]) {
        const n = activationFirst ? 91 : 92, account = key(n), paid = payment(n, account);
        reserve(n);
        const before = snapshot();
        const activationRpc = activate(account, id(n + 20)), allocationRpc = allocate(n, paid);
        const race = await contend(`guard-${n}`, activationFirst ? activationRpc : allocationRpc,
          activationFirst ? allocationRpc : activationRpc);
        assert.deepEqual(race.competed, rejectedResult(
          activationFirst ? "d1_legacy_allocation_forbidden" : "historical_pool", "SET\nSET\n"));
        const after = snapshot();
        if (activationFirst) {
          assert.equal(after, before);
          assert.equal(sql(activationRpc), race.line);
        } else {
          // The legacy reservation existed before this race. Only its allocation/payment can be new.
          onlyOneAllocation(before, after, n, paid, true);
          assert.equal(sql(allocationRpc), race.line);
          rejected(activationRpc, "historical_pool");
        }
        assert.equal(snapshot(), after);
      }
      assert.equal(sql(allocate(99, oldPayment)), historical);
      assert.equal(sql(prepare(input)), receipt);
    });
  } finally {
    process.removeListener("SIGTERM", terminate);
    await cleanup();
  }
});
