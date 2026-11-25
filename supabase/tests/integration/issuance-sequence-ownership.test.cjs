// Owned PostgreSQL and opaque receipts only: not consensus, signing or release authority.
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
const phase = process.env.D1_OWNERSHIP_PHASE ?? "full";
assert.ok(["full", "before-033"].includes(phase), "Invalid D1_OWNERSHIP_PHASE");
assert.equal(process.platform, "linux");
assert.equal(process.env.D1_TOOL_ROOT, toolRoot);
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime({ env: { D1_TOOL_ROOT: toolRoot, TMPDIR: "/tmp" } });

// Public StrKeys made from repeated synthetic bytes; no signing material.
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
const admin = key(0), alternate = key(1), incident = "issuance-ownership-fixture";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const text = value => value == null ? "null" : "'" + String(value).replaceAll("'", "''") + "'";
const lit = value => text(JSON.stringify(value)) + "::jsonb";
const call = (name, n, actor = admin) => `public.${name}('${id(n)}','${actor}')`;
const prepare = input => `public.d1_prepare(${lit(input)})`;
const load = (n, actor) => call("d1_load_unsigned_transaction", n, actor);
const active = (n, actor) => `coalesce(${call("d1_load_active_issuance_sequence", n, actor)},'null'::jsonb)`;
const reserve = (n, sequence = "10", actor = admin) => `public.d1_reserve_issuance_sequence('${id(n)}','${actor}',${text(sequence)})`;
const hash = "a".repeat(64);
const save = (n, actor = admin) => `public.d1_save_unsigned_transaction('${id(n)}','${actor}','AAAA','${hash}')`;
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

test("033 upgrades populated 017/018 receipts and preserves permanent active ownership", async () => {
  const port = await freePort();
  const fixture = fs.mkdtempSync(path.join(temp, "vaca-d1-ownership-"));
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
  const inputs = new Map(), namespaces = new Set(), sessions = [];
  let migrated = false, pid, cleanupPromise;
  const stateSql = () => select(`jsonb_build_object(
    'requests', (select jsonb_agg(r order by request_id) from public.release_requests r),
    'payments', (select jsonb_agg(p order by transaction_hash, operation_id) from public.donation_payments p),
    'allocations', (select jsonb_agg(a order by request_id) from public.donation_allocations a),
    'evidence', jsonb_build_object(${[...inputs].map(([n, input]) => `'${n}', jsonb_build_object(
      'preparation', ${prepare(input)}, 'intent', ${call("d1_register_issuance_intent", n)}, 'unsigned', ${load(n)})`).join(",")}),
    'active', ${migrated ? `jsonb_build_object(${[...namespaces].map(n => `'${n}',${active(n)}`).join(",")})` : "null"})`);
  const state = () => JSON.parse(sql(stateSql()));
  const rejectedSql = (source, message, role = "service_role") => {
    const before = state();
    assert.deepEqual(psql(`set role ${role}; ${source}`), errorResult(message));
    assert.deepEqual(state(), before, "Rejected operation must not change any retained receipts or counters");
  };
  const rejected = (expression, message, role) => rejectedSql(select(expression), message, role);
  const expire = deadline => sql(`select pg_sleep(greatest(0, extract(epoch from '${deadline}'::timestamptz - clock_timestamp()) + 0.01));`, null);

  // The trusted launcher buffers stdio; a separate owner-only release row signals COMMIT.
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
  async function hold(label, source) {
    const holder = session(`set application_name='${label}'; begin; ${source}
      do $barrier$ begin while not exists (select 1 from fixture_control.releases where name='${label}') loop
        perform pg_sleep(0.025); end loop; end $barrier$; commit;`);
    await waitFor(`select exists(select 1 from pg_stat_activity where application_name='${label}' and wait_event='PgSleep');`, holder, label);
    return holder;
  }
  async function blocked(label, blocker, expression) {
    const waiter = session(`set application_name='${label}'; set role service_role; ${select(expression)}`);
    // A second waiter on the same tuple may queue behind the first waiter.
    await waitFor(`with recursive blockers(pid) as (
      select unnest(pg_blocking_pids(pid)) from pg_stat_activity where application_name='${label}'
      union select unnest(pg_blocking_pids(pid)) from blockers
    ) select exists(select 1 from blockers join pg_stat_activity using (pid) where application_name='${blocker}');`,
    waiter, `${label} blocked by ${blocker}`);
    return waiter;
  }
  const release = label => assert.equal(sql(`insert into fixture_control.releases values ('${label}');`, null), "INSERT 0 1");
  const heldReceipt = async holder => {
    const result = await holder.done, receipt = result.stdout.split("\n")[3];
    assert.deepEqual(result, { status: 0, stdout: `SET\nBEGIN\nSET\n${receipt}\nRESET\nDO\nCOMMIT\n`, stderr: "" });
    return JSON.parse(receipt);
  };
  const heldRpc = (label, expression) => hold(label, `set role service_role; ${select(expression)} reset role;`);
  const loser = async (client, message) => assert.deepEqual(await client.done, errorResult(message, "SET\nSET\n"));
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
      insert into public.admin_wallets values ('${admin}'), ('${alternate}');
      insert into public.incidents values ('${incident}', 'vaquita', '${admin}');
      create schema fixture_control; create table fixture_control.releases(name text primary key);`));
    for (const file of ["supabase/tests/fixtures/retained-014.sql", "supabase/tests/fixtures/retained-20261011060218.sql",
      "supabase/migrations/015_d1_testnet_custody.sql", "supabase/migrations/016_d1_issuance_intents.sql",
      "supabase/migrations/017_d1_issuance_sequences.sql", "supabase/migrations/018_d1_unsigned_transactions.sql",
      "supabase/migrations/023_d1_legacy_allocation_guard.sql"]) apply(file);
    const seed = (n, namespace, deadline = clock() + 298) => {
      const pool = key(namespace), cutoff = new Date(deadline * 1000).toISOString().replace(".000Z", "Z");
      const input = { request_id: id(n), authorized_by: admin, confirmed_at: deadline - 300, ledger: 900,
        memo_hash: createHash("sha256").update(`vaca.d1.donation.v1\n${incident}`).digest("hex"),
        payment: { transaction_hash: n.toString(16).padStart(64, "0"), operation_id: String(n), donor: admin,
          pool, amount: "2.0000000", asset: { type: "native" } },
        request: { version: 1, incident_id: incident, donor: admin, beneficiary: admin, amount: "1.0000000", asset: { type: "native" }, deadline: cutoff } };
      assert.deepEqual(rpc(`public.d1_activate_pool('${id(namespace)}','${pool}',900)`), { namespace: id(namespace), pool, first_ledger: 900 });
      assert.equal(rpc(prepare(input)).state, "allocated");
      assert.equal(rpc(call("d1_register_issuance_intent", n)).request_id, id(n));
      inputs.set(n, input); namespaces.add(namespace);
      return cutoff;
    };

    // Upgrade actual 017 history already referenced by 018, including an expired owner.
    seed(1, 101); seed(9, 101);
    const reservation = rpc(reserve(1)), bytes = rpc(save(1));
    const cutoff = clock() + 5, expiry = seed(2, 102, cutoff);
    seed(3, 102, cutoff); seed(8, 102);
    const expiredOwner = rpc(reserve(2)), expiredBytes = rpc(save(2));
    assert.equal(bytes.unsigned_xdr, "AAAA"); assert.equal(bytes.transaction_hash, hash);
    assert.deepEqual(bytes.reservation, reservation);
    assert.deepEqual(expiredBytes.reservation, expiredOwner);
    expire(expiry);
    assert.ok(clock() >= cutoff);
    const beforeMigration = sql(stateSql());
    const unsignedFk = () => sql(`select oid, conindid, convalidated, pg_get_constraintdef(oid)
      from pg_constraint where contype='f' and conrelid='public.d1_unsigned_transactions'::regclass
      and confrelid='public.d1_issuance_sequences'::regclass;`, null);
    const evidenceTables = ["release_requests", "donation_payments", "donation_allocations", "d1_pools", "d1_preparations", "d1_issuance_intents", "d1_issuance_sequences", "d1_unsigned_transactions"];
    const rawRows = tables => sql(select(`jsonb_build_array(${tables.map(t => `(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)) from public.${t} r)`).join(",")})`), null);
    const rawBefore = rawRows(evidenceTables);
    const originalFk = unsignedFk();
    assert.match(originalFk, /^\d+\|[1-9]\d*\|t\|FOREIGN KEY \(request_id\) REFERENCES d1_issuance_sequences\(request_id\)$/);
    if (phase !== "before-033") apply("supabase/migrations/033_d1_issuance_sequence_ownership.sql");
    assert.deepEqual(rpc(active(101)), reservation); // Public behavior RED with 033 absent.
    assert.deepEqual(rpc(active(102, alternate)), expiredOwner, "Backfill includes owners already expired at upgrade");
    assert.equal(unsignedFk(), originalFk, "018's existing validated FK still uses its original unique index");
    assert.equal(sql(stateSql()), beforeMigration, "Upgrade retains exact preparation, intent, accounting and unsigned receipts");
    assert.equal(rawRows(evidenceTables), rawBefore);
    const allTables = [...evidenceTables, "d1_active_issuance_sequences"];
    const rawUpgraded = rawRows(allTables);
    for (const [n, seq, code, msg] of [[2,"11","23505","issuance_sequence_conflict"], [3,"10","22023","deadline_expired"], [8,"10","55000","issuance_source_busy"]]) {
      assert.equal(sql(`do $$ begin perform ${reserve(n,seq,alternate)}; raise exception 'unexpected success'; exception when sqlstate '${code}' then if sqlerrm <> '${msg}' then raise; end if; end $$;`), "DO");
      assert.equal(rawRows(allTables), rawUpgraded);
    }
    for (const t of ["d1_issuance_intents","d1_issuance_sequences","d1_unsigned_transactions","d1_active_issuance_sequences"]) {
      assert.equal(sql(`select relrowsecurity and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) a where a.grantee <> relowner) from pg_class where oid='public.${t}'::regclass;`,null),"t");
    }
    for (const sig of ["d1_register_issuance_intent(uuid,text)","d1_reserve_issuance_sequence(uuid,text,text)","d1_load_unsigned_transaction(uuid,text)","d1_save_unsigned_transaction(uuid,text,text,text)","d1_load_active_issuance_sequence(uuid,text)"]) {
      assert.equal(sql(`select prosecdef and proconfig=array['search_path=""'] and (select array_agg(a.grantee::text||':'||privilege_type||':'||is_grantable::text) from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee<>proowner)=array[('service_role'::regrole::oid)::text||':EXECUTE:false'] from pg_proc where oid='public.${sig}'::regprocedure;`,null),"t");
    }
    console.log("INDEPENDENT_UPGRADE_OK=raw-rows,three-sqlstate/message-pairs,full-table-and-rpc-acls");
    migrated = true;
    const immutable = state();
    assert.equal(rpc(load(9)).reservation, null, "A prepared sibling does not own another request's reservation");
    for (const [n, owner, saved] of [[1, reservation, bytes], [2, expiredOwner, expiredBytes]]) {
      assert.deepEqual(rpc(reserve(n, "10", alternate)), owner);
      assert.deepEqual(rpc(save(n, alternate)), saved);
      assert.deepEqual(rpc(load(n, alternate)).transaction, saved);
    }
    assert.deepEqual(state(), immutable);
    rejected(reserve(2, "11"), "issuance_sequence_conflict");
    rejected(reserve(3), "deadline_expired");
    rejected(reserve(8), "issuance_source_busy");
    for (const bad of [null, "01", "-1", "9223372036854775807"]) rejected(reserve(2, bad), "invalid_issuance_sequence");

    // Prove both contenders can win when they actually acquire the source first.
    for (const [namespace, first, second] of [[104, 4, 5], [105, 15, 14]]) {
      seed(Math.min(first, second), namespace); seed(Math.max(first, second), namespace);
      assert.equal(rpc(active(namespace)), null);
      const before = state(), label = `owner-${namespace}`;
      const holder = await heldRpc(label, reserve(first));
      const contender = await blocked(`contender-${namespace}`, label, reserve(second));
      release(label);
      const owner = await heldReceipt(holder);
      await loser(contender, "issuance_source_busy");
      assert.equal(owner.request_id, id(first));
      assert.equal(owner.intent.preparation_input.authorized_by, admin);
      assert.deepEqual(rpc(active(namespace)), owner);
      assert.deepEqual(rpc(reserve(first, "10", alternate)), owner);
      const afterRace = { ...before, active: { ...before.active, [namespace]: owner }, evidence: { ...before.evidence,
        [first]: { ...before.evidence[first], unsigned: { ...before.evidence[first].unsigned, reservation: owner } } } };
      assert.deepEqual(state(), afterRace, "Only the winning reservation is stored; accounting is unchanged");
      const saved = rpc(save(first)); // New 018 insert exercises the retained FK after 033.
      assert.deepEqual(saved.reservation, owner);
      assert.deepEqual(state(), { ...afterRace, evidence: { ...afterRace.evidence,
        [first]: { ...afterRace.evidence[first], unsigned: { ...afterRace.evidence[first].unsigned, transaction: saved } } } });
    }

    const waitDeadline = seed(6, 106, clock() + 5), beforeWait = state();
    const lock = await heldRpc("expiry-holder", load(6));
    const waiting = await blocked("expiry-waiter", "expiry-holder", reserve(6));
    assert.equal(sql(`select clock_timestamp() < '${waitDeadline}'::timestamptz;`, null), "t", "Reservation is blocked before cutoff");
    expire(waitDeadline);
    release("expiry-holder");
    assert.deepEqual(await heldReceipt(lock), beforeWait.evidence[6].unsigned);
    await loser(waiting, "deadline_expired");
    assert.deepEqual(state(), beforeWait);
    assert.equal(rpc(active(106)), null);

    // Both saved forms must wait on the current-admin row; revocation commits first.
    const beforeRevoke = state();
    const revoke = await hold("revoke-holder", `delete from public.admin_wallets where public_key='${alternate}';`);
    const replay = await blocked("revoke-reserve", "revoke-holder", reserve(4, "10", alternate));
    const replayBytes = await blocked("revoke-save", "revoke-holder", save(4, alternate));
    release("revoke-holder");
    assert.deepEqual(await revoke.done, { status: 0, stdout: "SET\nBEGIN\nDELETE 1\nDO\nCOMMIT\n", stderr: "" });
    await loser(replay, "unauthorized_admin_wallet");
    await loser(replayBytes, "unauthorized_admin_wallet");
    assert.deepEqual(state(), beforeRevoke);
    rejected(active(104, alternate), "unauthorized_admin_wallet");
    rejected(load(4, alternate), "unauthorized_admin_wallet");
    rejected(reserve(4, null, alternate), "invalid_issuance_sequence");
    rejected(`public.d1_load_active_issuance_sequence(null,'${admin}')`, "invalid_issuance_sequence");
    rejected(call("d1_load_active_issuance_sequence", 104, "not-a-wallet"), "invalid_issuance_sequence");
    rejected(active(999), "pool_not_activated");
    for (const role of ["anon", "authenticated"]) {
      rejected(active(104), "permission denied for function d1_load_active_issuance_sequence", role);
      rejected(reserve(4), "permission denied for function d1_reserve_issuance_sequence", role);
    }
    for (const table of ["d1_issuance_sequences", "d1_active_issuance_sequences"]) {
      assert.equal(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass;`, null), "t");
      for (const role of ["anon", "authenticated", "service_role"]) {
        for (const source of [`select * from public.${table};`, `insert into public.${table} default values;`,
          `update public.${table} set namespace=namespace;`, `delete from public.${table};`, `truncate public.${table};`]) {
          rejectedSql(source, `permission denied for table ${table}`, role);
        }
      }
    }
    assert.deepEqual(rpc(active(101)), reservation);
    assert.deepEqual(rpc(active(102)), expiredOwner);
    assert.deepEqual(rpc(load(2)).transaction, expiredBytes);
    console.log("ISSUANCE_OWNERSHIP_OK=populated-017/018-upgrade,retained-FK,expired-owner,two-first-owner-orders,observed-expiry-and-revocation-locks,unchanged-receipts-and-capacity,ACL,RLS");
  } finally {
    process.removeListener("SIGTERM", terminate);
    await cleanup();
  }
});
