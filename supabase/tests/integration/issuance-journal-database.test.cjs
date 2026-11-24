// Synthetic local 016/017/018 receipts only; no XDR semantics, signing or ledger access.
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
const phase = process.env.D1_JOURNAL_PHASE ?? "full";
assert.ok(["full", "before-016", "before-017", "before-018"].includes(phase), "Invalid D1_JOURNAL_PHASE");
assert.equal(process.platform, "linux");
assert.equal(process.env.D1_TOOL_ROOT, toolRoot);
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime({ env: { D1_TOOL_ROOT: toolRoot, TMPDIR: "/tmp" } });

// Encode repeated synthetic public bytes, not a keypair or seed.
function key(n) {
  const bytes = [48, ...Array(32).fill(n)];
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 32768) ? 4129 : 0)) & 65535;
  }
  bytes.push(crc & 255, crc >> 8);
  const bits = bytes.map(b => b.toString(2).padStart(8, "0")).join("");
  return bits.match(/.{5}/g).map(b => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[parseInt(b, 2)]).join("");
}
const admin = key(0), pool = key(1), oldPool = key(2), observer = key(3);
const incident = "issuance-journal-fixture";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const text = value => value == null ? "null" : "'" + String(value).replaceAll("'", "''") + "'";
const lit = value => text(JSON.stringify(value)) + "::jsonb";
const utc = seconds => new Date(seconds * 1000).toISOString().replace(".000Z", "Z");
const prepare = input => `public.d1_prepare(${lit(input)})`;
const register = (n, actor = admin) => `public.d1_register_issuance_intent('${id(n)}','${actor}')`;
const reserve = (n, observed = "0", actor = admin) => `public.d1_reserve_issuance_sequence('${id(n)}','${actor}',${text(observed)})`;
const load = (n, actor = admin) => `public.d1_load_unsigned_transaction('${id(n)}','${actor}')`;
// These are opaque fixture bytes, not a Stellar envelope or a matching hash.
const hash = "b".repeat(64);
const save = (n, bytes = "YWJj", digest = hash, actor = admin) =>
  `public.d1_save_unsigned_transaction('${id(n)}','${actor}',${text(bytes)},${text(digest)})`;
const select = expression => `select ${expression};`;
const errorResult = (message, stdout = "SET\n") => ({ status: 1, stdout, stderr: `ERROR:  ${message}\n` });

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

test("local issuance intent, sequence reservation and opaque unsigned journal", async () => {
  const port = await freePort();
  const fixture = fs.mkdtempSync(path.join(temp, "vaca-d1-journal-"));
  const data = path.join(fixture, "data"), pidFile = path.join(data, "postmaster.pid");
  const args = [...connectionArgs, "-p", String(port), "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse", "-At"];
  const run = (tool, argv) => {
    const { status, stdout, stderr, signal, error } = spawnSync(process.execPath, [launcher, tool, ...argv], {
      env, encoding: "utf8", timeout: 30000,
    });
    assert.ok(!error && !signal, `${tool}: ${error ?? signal}\n${stdout}\n${stderr}`);
    return { status, stdout, stderr };
  };
  const ok = ({ status, stdout, stderr }) => {
    assert.equal(status, 0, stderr + stdout);
    assert.equal(stderr, "");
    return stdout;
  };
  const psql = source => run("psql", [...args, "-c", source]);
  const sql = (source, role = "service_role") => {
    const result = ok(psql((role ? `set role ${role}; ` : "") + source));
    if (role) assert.ok(result.startsWith("SET\n"), result);
    return (role ? result.slice(4) : result).trimEnd();
  };
  const rpc = expression => JSON.parse(sql(select(expression)));
  const apply = file => assert.equal(ok(run("psql", [...args, "-q", "-f", path.join(repo, file)])), "");
  const clock = () => Number(sql("select floor(extract(epoch from clock_timestamp()))::bigint;", null));
  const prepared = new Set(), registered = new Set(), sessions = [];
  let journalReady = false, pid, cleanupPromise;
  // Read stored receipts through the service RPCs and compare retained accounting counters.
  const observe = (ids, get) => `jsonb_build_object(${[...ids].flatMap(n => [text(n), get(n, observer)]).join(",")})`;
  const snapshot = () => rpc(`jsonb_build_object(
    'requests', (select jsonb_agg(r order by request_id) from public.release_requests r),
    'payments', (select jsonb_agg(p order by transaction_hash, operation_id) from public.donation_payments p),
    'allocations', (select jsonb_agg(a order by request_id) from public.donation_allocations a),
    'intents', ${observe(registered, register)},
    'unsigned', ${journalReady ? observe(prepared, load) : "'{}'::jsonb"})`);
  const rejectedSql = (source, message, role = "service_role") => {
    const before = snapshot();
    assert.deepEqual(psql(`set role ${role}; ${source}`), errorResult(message));
    assert.deepEqual(snapshot(), before, "Rejection changes neither receipts nor allocated capacity");
  };
  const rejected = (expression, message, role) => rejectedSql(select(expression), message, role);
  const inspectAcl = (table, signatures) => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      if (role !== "service_role") for (const [signature, expression] of signatures) {
        rejected(expression, `permission denied for function ${signature.split("(")[0]}`, role);
      }
      for (const source of [`select * from public.${table};`, `insert into public.${table} default values;`,
        `update public.${table} set receipt = '{}';`, `delete from public.${table};`, `truncate public.${table};`]) {
        rejectedSql(source, `permission denied for table ${table}`, role);
      }
    }
    assert.equal(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass;`, null), "t");
    for (const [signature] of signatures) assert.equal(sql(`select prosecdef and proconfig=array['search_path=""']
      from pg_proc where oid='public.${signature}'::regprocedure;`, null), "t");
  };
  function session(source) {
    const child = spawn(process.execPath, [launcher, "psql", ...args, "-c", source], { env });
    const state = {};
    let stdout = "", stderr = "";
    child.stdout.on("data", b => stdout += b);
    child.stderr.on("data", b => stderr += b);
    child.once("error", error => stderr += error.message);
    state.done = new Promise(resolve => child.once("close", (status, signal) => {
      state.result = { status, stdout, stderr: signal ? stderr + signal : stderr };
      resolve(state.result);
    }));
    sessions.push(state);
    return state;
  }
  async function waitFor(source, client, label) {
    const limit = performance.now() + 7000;
    while (performance.now() < limit) {
      if (sql(source, null) === "t") return;
      assert.ok(!client.result, `${label} exited early: ${JSON.stringify(client.result)}`);
      await delay(25);
    }
    assert.fail(`Timed out observing ${label}`);
  }
  async function contend(label, first, second, cutoff) {
    const holder = session(`set application_name='${label}-holder'; begin; set role service_role; ${select(first)} reset role;
      do $barrier$ begin while not exists (select 1 from fixture_control.releases where name='${label}') loop
        perform pg_sleep(0.025); end loop; end $barrier$; commit;`);
    await waitFor(`select exists(select 1 from pg_stat_activity where application_name='${label}-holder' and wait_event='PgSleep');`, holder, label);
    const waiter = session(`set application_name='${label}-waiter'; set role service_role; ${select(second)}`);
    await waitFor(`select exists(select 1 from pg_stat_activity a, pg_stat_activity b
      where a.application_name='${label}-waiter' and b.application_name='${label}-holder'
        and b.pid=any(pg_blocking_pids(a.pid)));`, waiter, `${label} blocked RPC`);
    if (cutoff) {
      assert.equal(sql(`select clock_timestamp() < '${cutoff}'::timestamptz;`, null), "t", "RPC was observed blocked before expiry");
      const deadline = session(`select pg_sleep(greatest(0, extract(epoch from '${cutoff}'::timestamptz - clock_timestamp()) + 0.01));`);
      assert.equal(ok(await deadline.done), "\n");
    }
    assert.equal(sql(`insert into fixture_control.releases values ('${label}');`, null), "INSERT 0 1");
    const [held, competed] = await Promise.all([holder.done, waiter.done]);
    const receipt = held.stdout.split("\n")[3];
    assert.deepEqual(held, { status: 0, stdout: `SET\nBEGIN\nSET\n${receipt}\nRESET\nDO\nCOMMIT\n`, stderr: "" });
    return { receipt, competed };
  }
  const identical = ({ receipt, competed }) => {
    assert.deepEqual(competed, { status: 0, stdout: `SET\nSET\n${receipt}\n`, stderr: "" });
    return JSON.parse(receipt);
  };
  const cleanup = () => cleanupPromise ??= (async () => {
    if (fs.existsSync(pidFile)) {
      pid ??= Number(fs.readFileSync(pidFile, "utf8").split("\n")[0]);
      ok(run("pg_ctl", ["-D", data, "-m", "fast", "-w", "-t", "5", "stop"]));
    }
    await Promise.all(sessions.map(s => s.done));
    const initialized = fs.existsSync(path.join(data, "PG_VERSION"));
    if (initialized) assert.deepEqual(run("pg_ctl", ["-D", data, "status"]), { status: 3, stdout: "pg_ctl: no server running\n", stderr: "" });
    assert.ok(!fs.existsSync(pidFile));
    if (pid) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    fs.rmSync(fixture, { recursive: true });
    assert.ok(!fs.existsSync(fixture));
    console.log(`PG_STATUS=${initialized ? 3 : "not initialized"}; PID_GONE=${pid ?? "not started"}; FIXTURE_REMOVED=${fixture}`);
  })();
  const terminate = () => cleanup().then(() => process.exit(143), error => { console.error(error); process.exit(1); });
  process.once("SIGTERM", terminate);
  try {
    ok(run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--locale=C"]));
    ok(run("pg_ctl", ["-D", data, "-l", path.join(fixture, "postgres.log"), "-o", `-p ${port}`, "-w", "-t", "5", "start"]));
    pid = Number(fs.readFileSync(pidFile, "utf8").split("\n")[0]);
    assert.ok(Number.isSafeInteger(pid) && pid > 1);
    assert.equal(sql(`select current_user, inet_server_addr(), current_setting('data_directory'),
      current_setting('unix_socket_directories'), current_setting('ssl'), current_setting('jit');`, null), `postgres|127.0.0.1|${data}||off|off`);
    ok(psql(`alter database postgres set statement_timeout='15s'; create role anon; create role authenticated;
      create role service_role bypassrls; create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}'), ('${observer}');
      insert into public.incidents values ('${incident}', 'vaquita', '${admin}');
      create schema fixture_control; create table fixture_control.releases(name text primary key);`));
    for (const file of ["supabase/tests/fixtures/retained-014.sql", "supabase/tests/fixtures/retained-20261011060218.sql",
      "supabase/migrations/015_d1_testnet_custody.sql"]) apply(file);
    if (phase !== "before-016") apply("supabase/migrations/016_d1_issuance_intents.sql");
    if (["before-018", "full"].includes(phase)) apply("supabase/migrations/017_d1_issuance_sequences.sql");
    if (phase === "full") apply("supabase/migrations/018_d1_unsigned_transactions.sql");
    const inputFor = (n, account = pool, deadline = clock() + 298) => ({
      request_id: id(n), authorized_by: admin, confirmed_at: deadline - 300, ledger: 900,
      memo_hash: createHash("sha256").update(`vaca.d1.donation.v1\n${incident}`).digest("hex"),
      payment: { transaction_hash: "a".repeat(64), operation_id: String(n), donor: admin, pool: account, amount: "2.0000000", asset: { type: "native" } },
      request: { version: 1, incident_id: incident, donor: admin, beneficiary: admin, amount: "1.0000000", asset: { type: "native" }, deadline: utc(deadline) },
    });
    const historical = inputFor(99, oldPool);
    rpc(`public.reserve_release_request('${id(99)}','${admin}',${lit(historical.request)})`);
    assert.equal(rpc(`public.allocate_donation_to_release_request('${id(99)}','${admin}',${lit(historical.payment)},'${oldPool}')`).state, "allocated");
    apply("supabase/migrations/023_d1_legacy_allocation_guard.sql");
    const activate = (namespace, account) => rpc(`public.d1_activate_pool('${id(namespace)}','${account}',900)`);
    activate(100, pool);
    rpc(`public.reserve_release_request('${id(98)}','${admin}',${lit(historical.request)})`);
    const seed = input => {
      const receipt = rpc(prepare(input));
      assert.equal(receipt.state, "allocated");
      prepared.add(Number(input.payment.operation_id));
      return receipt;
    };
    const input = inputFor(1), preparation = seed(input);
    seed(inputFor(2)); seed(inputFor(12));
    const beforeIntent = snapshot();
    const intent = rpc(register(1)); // Public behavior RED with 016 absent.
    assert.deepEqual(intent, { kind: "d1_issuance_request_intent", revision: 1, request_id: id(1),
      namespace: id(100), network: "TESTNET", pool, preparation_input: input, preparation });
    registered.add(1);
    assert.deepEqual(snapshot(), { ...beforeIntent, intents: { 1: intent } });
    assert.deepEqual(rpc(register(1)), intent);
    for (const n of [500, 99, 98]) rejected(register(n), "d1_preparation_not_found");
    rejected(register(1, oldPool), "unauthorized_admin_wallet");
    rejected("public.d1_register_issuance_intent(null,null)", "invalid_issuance_intent");
    const revokeAdmin = () => assert.equal(sql(`delete from public.admin_wallets where public_key='${admin}';`, null), "DELETE 1");
    const restoreAdmin = () => assert.equal(sql(`insert into public.admin_wallets values ('${admin}');`, null), "INSERT 0 1");
    revokeAdmin(); rejected(register(1), "unauthorized_admin_wallet"); restoreAdmin();
    const beforeIntentRace = snapshot();
    const concurrentIntent = identical(await contend("same-intent", register(12), register(12)));
    registered.add(12);
    assert.equal(concurrentIntent.request_id, id(12));
    assert.deepEqual(snapshot(), { ...beforeIntentRace, intents: { ...beforeIntentRace.intents, 12: concurrentIntent } });
    assert.deepEqual(rpc(prepare(input)), preparation);
    inspectAcl("d1_issuance_intents", [["d1_register_issuance_intent(uuid,text)", register(1)]]);

    const early = inputFor(20), d1Pool = key(4);
    activate(101, d1Pool);
    seed({ ...early, payment: { ...early.payment, pool: d1Pool } });
    const sequenceIntent = rpc(register(20)); registered.add(20);
    const beforeSequence = snapshot();
    const reservation = identical(await contend("same-sequence", reserve(20), reserve(20))); // Public RED with 017 absent.
    assert.deepEqual(reservation, { kind: "d1_issuance_sequence_reservation", revision: 1, request_id: id(20),
      namespace: id(101), network: "TESTNET", pool: d1Pool, observed_account_sequence: "0", transaction_sequence: "1", intent: sequenceIntent });
    assert.deepEqual(snapshot(), beforeSequence, "Reservation does not change preparation or accounting");

    const beforeLookup = snapshot();
    assert.deepEqual(rpc(load(2)), { kind: "d1_unsigned_transaction_lookup", revision: 1, request_id: id(2),
      namespace: id(100), network: "TESTNET", pool, reservation: null, transaction: null }); // Public RED with 018 absent.
    assert.deepEqual(snapshot(), beforeLookup);
    journalReady = true;
    assert.deepEqual(rpc(load(20)).reservation, reservation);
    assert.equal(rpc(load(20)).transaction, null);
    for (const invalid of [null, "", "00", "01", "-1", "+1", " 1", "1 ", "1.0", "1e1",
      "9223372036854775807", "9223372036854775808", "99999999999999999999"]) rejected(reserve(20, invalid), "invalid_issuance_sequence");
    rejected("public.d1_reserve_issuance_sequence(null,null,'0')", "invalid_issuance_sequence");
    rejected(reserve(20, "1"), "issuance_sequence_conflict");
    for (const n of [500, 99, 98]) rejected(reserve(n), "d1_preparation_not_found");
    rejected(reserve(2), "d1_issuance_intent_not_found");
    rejected(reserve(20, "0", oldPool), "unauthorized_admin_wallet");
    revokeAdmin(); rejected(reserve(20), "unauthorized_admin_wallet"); restoreAdmin();
    inspectAcl("d1_issuance_sequences", [["d1_reserve_issuance_sequence(uuid,text,text)", reserve(20)]]);
    for (const n of [500, 99, 98]) {
      rejected(load(n), "d1_preparation_not_found"); rejected(save(n), "d1_preparation_not_found");
    }
    rejected(save(2), "d1_issuance_sequence_not_found");
    rejected(load(20, oldPool), "unauthorized_admin_wallet");
    rejected("public.d1_load_unsigned_transaction(null,null)", "invalid_unsigned_transaction");
    rejected("public.d1_save_unsigned_transaction(null,null,null,null)", "invalid_unsigned_transaction");

    function journalRequest(n, deadline, makeReservation = true) {
      const account = key(n), namespace = n + 1000;
      activate(namespace, account);
      const input = inputFor(n, account, deadline);
      seed(input); rpc(register(n)); registered.add(n);
      return { account, namespace, input, reservation: makeReservation ? rpc(reserve(n, "42")) : null };
    }
    const stored = journalRequest(222), beforeSave = snapshot();
    const saved = identical(await contend("same-save", save(222), save(222)));
    assert.deepEqual(saved, { kind: "d1_unsigned_transaction_journal", revision: 1, request_id: id(222),
      namespace: id(stored.namespace), network: "TESTNET", pool: stored.account, deadline: stored.input.request.deadline,
      transaction_sequence: "43", reservation: stored.reservation, unsigned_xdr: "YWJj", transaction_hash: hash });
    assert.deepEqual(snapshot(), { ...beforeSave, unsigned: { ...beforeSave.unsigned, 222: { ...beforeSave.unsigned[222], transaction: saved } } });
    assert.deepEqual(rpc(save(222)), saved);
    rejected(save(222, "YWJk"), "unsigned_transaction_conflict");
    rejected(save(222, "YWJj", "c".repeat(64)), "unsigned_transaction_conflict");
    for (const bytes of [null, "", "A", "YQ", "YQ=", "YR==", "YWJ=", "YQ===", "YW-J", "YWJj\n", "A".repeat(65540)]) {
      rejected(save(222, bytes), "invalid_unsigned_transaction");
    }
    for (const invalid of [null, "", "B".repeat(64), "b".repeat(63), "g".repeat(64), "b".repeat(65)]) {
      rejected(save(222, "YWJj", invalid), "invalid_unsigned_transaction");
    }
    sql(`insert into public.admin_wallets values ('${oldPool}');`, null);
    assert.deepEqual(rpc(save(222, "YWJj", hash, oldPool)), saved);
    assert.deepEqual(rpc(load(222, oldPool)).transaction, saved);
    revokeAdmin();
    for (const n of [222, 20, 500]) rejected(load(n), "unauthorized_admin_wallet");
    rejected(save(222), "unauthorized_admin_wallet"); restoreAdmin();
    const boundary = journalRequest(223);
    const boundReceipt = rpc(save(223, "A".repeat(65536)));
    assert.equal(boundReceipt.unsigned_xdr, "A".repeat(65536), "Encoder wrapping is not stored");
    assert.deepEqual(boundReceipt.reservation, boundary.reservation);
    journalRequest(224);
    const beforeConflict = snapshot();
    const conflicting = await contend("changed-save", save(224, "YQ=="), save(224, "Yg=="));
    assert.deepEqual(conflicting.competed, errorResult("unsigned_transaction_conflict", "SET\nSET\n"));
    const winner = JSON.parse(conflicting.receipt);
    assert.equal(winner.unsigned_xdr, "YQ==");
    assert.deepEqual(snapshot(), { ...beforeConflict, unsigned: { ...beforeConflict.unsigned, 224: { ...beforeConflict.unsigned[224], transaction: winner } } });

    // Contenders in an independent pool; the maximum int64 successor is exact text.
    const rivalPool = key(5), sequence = "9223372036854775806";
    activate(102, rivalPool);
    for (const n of [30, 31]) { seed(inputFor(n, rivalPool)); rpc(register(n)); registered.add(n); }
    const beforeRace = snapshot();
    const firstOwner = await contend("first-owner", reserve(30, sequence), reserve(31, sequence));
    assert.deepEqual(firstOwner.competed, errorResult("issuance_source_busy", "SET\nSET\n"));
    const owner = JSON.parse(firstOwner.receipt);
    assert.equal(owner.request_id, id(30)); assert.equal(owner.pool, rivalPool); assert.equal(owner.namespace, id(102));
    assert.equal(owner.observed_account_sequence, sequence); assert.equal(owner.transaction_sequence, "9223372036854775807");
    assert.deepEqual(snapshot(), { ...beforeRace, unsigned: { ...beforeRace.unsigned, 30: { ...beforeRace.unsigned[30], reservation: owner } } });

    const expiry = clock() + 8, cutoff = utc(expiry);
    const short = journalRequest(225, expiry), shortSaved = rpc(save(225));
    journalRequest(226, expiry);
    journalRequest(227, expiry, false);
    seed(inputFor(21, short.account, expiry)); // Short rival with no intent.
    seed(inputFor(24, short.account)); rpc(register(24)); registered.add(24);
    rejected(reserve(24), "issuance_source_busy");
    const unsavedOwner = rpc(reserve(226, "42"));
    const beforeWait = snapshot();
    const waits = await Promise.all([
      contend("expiry-save", load(226), save(226), cutoff),
      contend("expiry-sequence", load(227), reserve(227), cutoff),
    ]);
    for (const wait of waits) assert.deepEqual(wait.competed, errorResult("deadline_expired", "SET\nSET\n"));
    assert.deepEqual(snapshot(), beforeWait);
    rejected(register(21), "deadline_expired");
    rejected(reserve(21), "d1_issuance_intent_not_found");
    rejected(reserve(24), "issuance_source_busy");
    rejected(save(226), "deadline_expired");
    assert.deepEqual(rpc(reserve(225, "42")), short.reservation);
    assert.deepEqual(rpc(register(225)), short.reservation.intent);
    assert.deepEqual(rpc(save(225)), shortSaved);
    assert.deepEqual(rpc(load(225)).transaction, shortSaved);
    assert.deepEqual(rpc(load(226)).reservation, unsavedOwner);
    assert.equal(rpc(load(226)).transaction, null);
    assert.deepEqual(snapshot(), beforeWait, "Expired replay is evidence only");
    rejected(reserve(225, "43"), "issuance_sequence_conflict");
    rejected(save(225, "YQ=="), "unsigned_transaction_conflict");
    rejected(save(225, "YWJj", "c".repeat(64)), "unsigned_transaction_conflict");
    revokeAdmin();
    rejected(load(225), "unauthorized_admin_wallet"); rejected(save(225), "unauthorized_admin_wallet"); restoreAdmin();
    inspectAcl("d1_unsigned_transactions", [["d1_load_unsigned_transaction(uuid,text)", load(222)],
      ["d1_save_unsigned_transaction(uuid,text,text,text)", save(222)]]);
    assert.deepEqual(rpc(prepare(input)), preparation);
    console.log("ISSUANCE_JOURNAL_OK=intent,sequence,opaque,canonical,bounds,admin,expiry,observed-locks,replay,conflicts,ACL,RLS,capacity");
  } finally {
    process.removeListener("SIGTERM", terminate);
    await cleanup();
  }
});
