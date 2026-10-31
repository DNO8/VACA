// Standalone local PostgreSQL fixture; no preparation scenarios or network APIs.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawnSync } = require("node:child_process");
const { resolveFixtureRuntime } = require("./fixture-runtime.cjs");

const repo = path.resolve(__dirname, "../../..");
const { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const key = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const otherPool = "GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP";
const ns = "00000000-0000-4000-8000-000000000001";
const ns2 = "00000000-0000-4000-8000-000000000002";
const absent = "00000000-0000-4000-8000-000000000003";
const lit = (v) => "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("admin discovery query paginates immutable opaque records in numeric order", async () => {
  const fixture = fs.mkdtempSync(path.join(temp, "vaca-d1-query-"));
  const data = path.join(fixture, "data");
  const port = await freePort();
  let started = false;
  let pid;
  function run(tool, args) {
    const result = spawnSync(process.execPath, [launcher, tool, ...args], {
      env, encoding: "utf8", timeout: 10000,
    });
    assert.ifError(result.error);
    return result;
  }
  function ok(tool, args) {
    const r = run(tool, args);
    assert.equal(r.status, 0, `${tool}: ${r.stderr}\n${r.stdout}`);
    assert.equal(r.stderr, "");
    return r.stdout.trim();
  }
  const args = ["-X", "--no-password", ...connectionArgs, "-p", String(port),
    "-U", "postgres", "-v", "ON_ERROR_STOP=1", "--set", "VERBOSITY=terse", "-At"];
  function sql(source, role = "service_role") {
    return ok("psql", [...args, "-c", (role ? `set role ${role}; ` : "") + source])
      .replace(/^SET\r?\n/, "");
  }
  function apply(name, source) {
    const file = path.join(fixture, name);
    fs.writeFileSync(file, source);
    ok("psql", [...args, "-q", "-f", file]);
  }
  const rpc = (cursor = "'0'", limit = "100", namespace = ns, admin = key) =>
    `select public.d1_list_discovery_operations('${namespace}','${admin}',${cursor},${limit});`;
  const lookup = () => JSON.parse(sql(
    `select public.d1_load_discovery_checkpoint('${ns}','${key}');`));
  function rejected(source, error, role = "service_role") {
    const r = run("psql", [...args, "-c", `set role ${role}; ${source}`]);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "SET\n", "Rejected query returns no data");
    assert.equal(r.stderr, `ERROR:  ${error}\n`);
  }
  const records = ["2", "10", "18446744073709551615"].map((token, i) => ({
    paging_token: token, ledger: 900, transaction_hash: String(i + 1).repeat(64),
    operation_id: token,
    operation: { donor: "opaque-not-validated", raw: { memo: "do not normalize", n: i } },
  }));
  const page = {
    revision: 1, from_cursor: "0", to_cursor: records.at(-1).paging_token,
    through_ledger: 900, ledger_hash: "a".repeat(64), closed_at: 1000, records,
  };
  const recordPage = (value = page, namespace = ns) => JSON.parse(sql(
    `select public.d1_record_discovery_page('${namespace}','${key}',${lit(value)});`));
  try {
    ok("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
    ok("pg_ctl", ["-D", data, "-l", path.join(fixture, "postgres.log"),
      "-o", `-h 127.0.0.1 -p ${port}`, "-w", "-t", "5", "start"]);
    started = true;
    pid = Number(fs.readFileSync(path.join(data, "postmaster.pid"), "utf8").split("\n")[0]);
    apply("fixture.sql", `create role anon; create role authenticated; create role service_role;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${key}');`);
    const retained = JSON.parse(fs.readFileSync(path.join(repo,
      "recovery/supabase/2026-10-27/retained-migrations.json"), "utf8"));
    for (const version of ["014", "20261011060218"]) {
      apply(version + ".sql", retained.migrations.find((m) => m.version === version).statements.join(";\n"));
    }
    for (const name of ["015_d1_testnet_custody.sql", "019_d1_discovery.sql", "020_d1_discovery_queries.sql",
      "021_d1_discovery_state.sql"]) {
      const file = path.join(repo, "supabase/migrations", name);
      // Absence is deliberately exposed by the public RPC below in the RED run.
      if (fs.existsSync(file)) apply(name, fs.readFileSync(file, "utf8"));
    }
    sql(`select public.d1_activate_pool('${ns}','${key}',900);
      select public.d1_activate_pool('${ns2}','${otherPool}',901);`);
    const stateRpc = (namespace = ns, admin = key) =>
      `select public.d1_load_discovery_state('${namespace}','${admin}');`;
    const state = (namespace = ns) => JSON.parse(sql(stateRpc(namespace)));
    const expectedState = (namespace, pool, first, cp, covered) => ({
      kind: "d1_discovery_state", revision: 1, namespace, network: "TESTNET",
      pool, first_ledger: first, checkpoint: cp, coverage_complete: covered,
    });
    const initialState = expectedState(ns, key, 900, null, false);
    assert.deepEqual(state(), initialState, "No checkpoint means no coverage");
    assert.deepEqual(state(ns2), expectedState(ns2, otherPool, 901, null, false));
    const receipt = recordPage();
    const checkpoint = lookup();
    const read = (cursor, limit, namespace) => JSON.parse(sql(rpc(cursor, limit, namespace)));
    const expected = (rows, next, more, namespace = ns, pool = key, first = 900, cp = checkpoint.checkpoint) => ({
      kind: "d1_discovery_operations", revision: 1, namespace, network: "TESTNET",
      pool, first_ledger: first, checkpoint: cp, records: rows, next_cursor: next, has_more: more,
    });
    assert.deepEqual(read("'0'", "1"), expected([records[0]], "2", true));
    assert.deepEqual(read("'2'", "1"), expected([records[1]], "10", true));
    assert.deepEqual(read("'10'", "1"), expected([records[2]], records[2].paging_token, false));
    assert.deepEqual(read("'3'", "2"), expected(records.slice(1), records[2].paging_token, false));
    assert.deepEqual(read("'18446744073709551615'", "200"), expected([], records[2].paging_token, false));
    assert.deepEqual(read(), expected(records, records[2].paging_token, false));
    assert.deepEqual(JSON.parse(sql(`select public.d1_list_discovery_operations('${ns}','${key}');`)),
      expected(records, records[2].paging_token, false), "SQL defaults remain usable");
    assert.deepEqual(read("'0'", "100", ns2), expected([], "0", false, ns2, otherPool, 901, null));
    const secondPage = { ...page, to_cursor: "2", records: [{ ...records[0], operation: { isolated: true } }] };
    const secondReceipt = recordPage(secondPage, ns2);
    assert.deepEqual(read("'0'", "200", ns2),
      expected(secondPage.records, "2", false, ns2, otherPool, 901, checkpoint.checkpoint && {
        ...checkpoint.checkpoint, cursor: "2",
      }));

    const partialState = expectedState(ns, key, 900, checkpoint.checkpoint, false);
    assert.deepEqual(state(), partialState, "Nonempty page does not establish coverage");
    const cp2 = { ...checkpoint.checkpoint, cursor: "2" };
    assert.deepEqual(state(ns2), expectedState(ns2, otherPool, 901, cp2, false));
    const emptyPage = { ...secondPage, from_cursor: "2", records: [] };
    const emptyReceipt = recordPage(emptyPage, ns2);
    assert.equal(emptyReceipt.page_count, 2);
    assert.deepEqual(state(ns2), expectedState(ns2, otherPool, 901, cp2, true));
    const laterRecord = { ...records[1], ledger: 901 };
    const laterPage = { ...page, from_cursor: "2", to_cursor: "10", through_ledger: 901,
      ledger_hash: "b".repeat(64), closed_at: 1001, records: [laterRecord] };
    const laterReceipt = recordPage(laterPage, ns2);
    assert.equal(laterReceipt.page_count, 3);
    const laterCp = { cursor: "10", through_ledger: 901, ledger_hash: "b".repeat(64), closed_at: 1001 };
    const laterState = expectedState(ns2, otherPool, 901, laterCp, false);
    assert.deepEqual(state(ns2), laterState, "Old empty marker cannot cover a new checkpoint");
    assert.deepEqual(recordPage(emptyPage, ns2), emptyReceipt, "Historical empty replay is exact");
    assert.deepEqual(recordPage(secondPage, ns2), secondReceipt, "Original nonempty replay is exact");
    assert.deepEqual(state(ns2), laterState, "Replays neither rewind nor claim coverage");
    const laterEmpty = { ...laterPage, from_cursor: "10", records: [] };
    const laterEmptyReceipt = recordPage(laterEmpty, ns2);
    assert.equal(laterEmptyReceipt.page_count, 4, "Reads and replays did not increment counter");
    const coveredState = expectedState(ns2, otherPool, 901, laterCp, true);
    assert.deepEqual(state(ns2), coveredState);
    assert.deepEqual(recordPage(laterPage, ns2), laterReceipt);
    assert.deepEqual(recordPage(emptyPage, ns2), emptyReceipt);
    assert.deepEqual(state(ns2), coveredState, "Historical receipts cannot rewind covered state");
    assert.deepEqual(read("'0'", "200", ns2),
      expected([...secondPage.records, laterRecord], "10", false, ns2, otherPool, 901, laterCp));
    assert.deepEqual(state(), partialState, "Namespace coverage is isolated");

    // Every rejection is followed by public reads/replays: no record, checkpoint,
    // page receipt, or page counter may be changed by query validation/denial.
    function unchanged() {
      assert.deepEqual(read(), expected(records, records[2].paging_token, false));
      assert.deepEqual(lookup(), checkpoint);
      assert.deepEqual(recordPage(), receipt);
      assert.deepEqual(recordPage(secondPage, ns2), secondReceipt);
      assert.deepEqual(state(), partialState);
      assert.deepEqual(state(ns2), coveredState);
      assert.deepEqual(read("'0'", "200", ns2),
        expected([...secondPage.records, laterRecord], "10", false, ns2, otherPool, 901, laterCp));
      assert.deepEqual(recordPage(emptyPage, ns2), emptyReceipt);
      assert.deepEqual(recordPage(laterPage, ns2), laterReceipt);
      assert.deepEqual(recordPage(laterEmpty, ns2), laterEmptyReceipt);
    }
    for (const cursor of ["null", "''", "'00'", "'01'", "'-1'", "'+1'", "'1.0'", "' 1'", "'1e1'",
      "'18446744073709551616'", "'999999999999999999999'"]) {
      rejected(rpc(cursor), "invalid_discovery_query");
      unchanged();
    }
    for (const limit of ["null", "0", "-1", "201"]) {
      rejected(rpc("'0'", limit), "invalid_discovery_query");
      unchanged();
    }
    rejected(rpc("'0'", "1", absent), "pool_not_activated");
    unchanged();
    rejected(rpc("'0'", "1", ns, otherPool), "unauthorized_admin_wallet");
    unchanged();
    for (const role of ["anon", "authenticated"]) {
      rejected(rpc(), "permission denied for function d1_list_discovery_operations", role);
      unchanged();
    }
    rejected(stateRpc(absent), "pool_not_activated");
    unchanged();
    rejected(stateRpc(ns, otherPool), "unauthorized_admin_wallet");
    unchanged();
    rejected(`select public.d1_load_discovery_state(null,'${key}');`, "invalid_discovery_page");
    unchanged();
    rejected(`select public.d1_load_discovery_state('${ns}',null);`, "invalid_discovery_page");
    unchanged();
    for (const role of ["anon", "authenticated"]) {
      rejected(stateRpc(), "permission denied for function d1_load_discovery_state", role);
      unchanged();
    }
    sql(`delete from public.admin_wallets where public_key = '${key}';`, null);
    rejected(rpc(), "unauthorized_admin_wallet");
    rejected(stateRpc(), "unauthorized_admin_wallet");
    sql(`insert into public.admin_wallets values ('${key}');`, null);
    unchanged();
    console.log("PAGINATION_AUTHORIZATION_IMMUTABILITY_OK");
  } finally {
    if (started) ok("pg_ctl", ["-D", data, "-m", "immediate", "-w", "-t", "5", "stop"]);
    if (pid) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    fs.rmSync(fixture, { recursive: true, force: true });
    console.log("OWNED_FIXTURE_REMOVED");
  }
});
