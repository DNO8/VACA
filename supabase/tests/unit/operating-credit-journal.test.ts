import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { OperatingCreditDatabase, recordOperatingCredit } from "../../functions/d1-custody/operating-credit-journal.ts";
import { parseDiscoveredOperation } from "../../functions/d1-custody/discovery.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";

const namespace = "11111111-1111-1111-1111-111111111111";
const pool = Keypair.random().publicKey(), team = Keypair.random().publicKey(), admin = Keypair.random().publicKey();
const date = "2026-10-27T12:00:00Z", closedAt = Date.parse(date) / 1000;
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Mismatch: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function fixture(creation = false, memo = "D1OPS", asset = Asset.native(), amount = "922337203685.4775807") {
  const tx = new TransactionBuilder(new Account(team, "1"), { fee: "100", networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 1 }, memo: Memo.text(memo) }).addOperation(creation ?
    Operation.createAccount({ destination: pool, startingBalance: amount }) :
    Operation.payment({ destination: pool, asset, amount })).build();
  const token = (10n << 32n) + 4096n, id = String(token + 1n), hash = tx.hash().toString("hex");
  const raw = { operation: { id, paging_token: id, transaction_hash: hash, transaction_successful: true,
    source_account: team, created_at: date, ...(creation ? { type: "create_account", type_i: 0, funder: team,
      account: pool, starting_balance: amount } : { type: "payment", type_i: 1, from: team,
      to: pool, amount, ...(asset.isNative() ? { asset_type: "native" } :
        { asset_type: "credit_alphanum4", asset_code: asset.getCode(), asset_issuer: asset.getIssuer() }) }) },
    transaction: { hash, paging_token: String(token), ledger: 10, successful: true, operation_count: 1,
      created_at: date, envelope_xdr: tx.toXDR() } };
  const record = parseDiscoveredOperation({ ...raw, pool, anchor: { sequence: 10, closedAt } });
  const observation = { namespace, network: "TESTNET", pool, funder: team, operationId: id, transactionHash: hash,
    ledger: 10, amountStroops: "9223372036854775807", anchor: { sequence: 10, hash: "a".repeat(64), closedAt }, record };
  const receipt = { kind: "d1_operating_credit_observation", revision: 1, authorized_by: team, observation };
  const state = { kind: "d1_discovery_state", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 8,
    coverage_complete: true, checkpoint: { cursor: id, through_ledger: 10, ledger_hash: "a".repeat(64), closed_at: closedAt } };
  const calls: [string, Record<string, unknown>][] = [], events: string[] = [];
  let stored: unknown = null, loadPatch: Record<string, unknown> = {}, reply: unknown, rpcError: unknown = null;
  let save: (() => Promise<unknown>) | undefined, sourceCalls = 0;
  const client = { async rpc(name: string, args: Record<string, unknown>) {
    calls.push([name, structuredClone(args)]); events.push(name);
    if (rpcError !== null) return { data: null, error: rpcError };
    if (name === "d1_load_operating_credit") return { data: { kind: "d1_operating_credit_lookup", revision: 1,
      namespace, network: "TESTNET", pool, operation_id: id, receipt: stored, ...loadPatch }, error: null };
    if (name === "d1_load_discovery_state") return { data: structuredClone(state), error: null };
    if (name !== "d1_record_operating_credit") throw new Error("unexpected RPC");
    stored = { ...receipt, authorized_by: admin, observation: structuredClone(args.p_observation) };
    return { data: save ? await save() : reply === undefined ? structuredClone(stored) : reply, error: null };
  } };
  const database = new OperatingCreditDatabase(client, namespace, admin);
  const source = { async readOperationAtCheckpoint() { sourceCalls++; events.push("source"); return structuredClone(record); } };
  return { id, record, observation, receipt, state, calls, events, database, source,
    run: (funders = [team]) => recordOperatingCredit(database, id, funders, source),
    stored: () => stored, setStored(v: unknown) { stored = v; }, sourceCalls: () => sourceCalls,
    patch(v: Record<string, unknown>) { loadPatch = v; }, error(v: unknown) { rpcError = v; },
    reply(v: unknown) { reply = v; }, save(fn: () => Promise<unknown>) { save = fn; } };
}
async function rejects(run: () => Promise<unknown>, message = "operating_credit_unavailable", status = 503) {
  let error: unknown; try { await run(); } catch (e) { error = e; }
  equal(error instanceof CustodyError, true);
  equal([(error as CustodyError).message, (error as CustodyError).status], [message, status]);
}
function reorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorder);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reorder(v)]));
  return value;
}
Deno.test("historical JSONB reordered credit replays original authorizer without providers or current funders", async () => {
  for (const creation of [false, true]) {
    const h = fixture(creation), old = reorder(h.receipt); h.setStored(old);
    h.source.readOperationAtCheckpoint = () => { throw new Error("no provider allowed"); };
    const before = JSON.stringify(h.stored());
    equal(await h.run([]), old); equal(JSON.stringify(h.stored()), before);
    equal(h.calls, [["d1_load_operating_credit", { p_namespace: namespace, p_authorized_by: admin, p_operation_id: h.id }]]);
    equal(h.sourceCalls(), 0);
  }
});
Deno.test("miss uses accepted observer and awaits exactly one save with pinned backend context", async () => {
  const h = fixture(), funders = [team], before = JSON.stringify([h.state, h.record]);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }), saved = new Promise<void>((resolve) => { entered = resolve; });
  h.save(async () => { entered(); await gate; return h.stored(); });
  let done = false; const pending = h.run(funders).then((v) => { done = true; return v; });
  funders[0] = admin;
  h.source.readOperationAtCheckpoint = () => { throw new Error("mutated backend source"); };
  Object.assign(h.database, { namespace: "wrong", authenticatedAdmin: team });
  await saved; equal(done, false); release();
  equal(await pending, { ...h.receipt, authorized_by: admin });
  equal(h.events, ["d1_load_operating_credit", "d1_load_discovery_state", "source", "d1_record_operating_credit"]);
  equal(h.calls, [["d1_load_operating_credit", { p_namespace: namespace, p_authorized_by: admin, p_operation_id: h.id }],
    ["d1_load_discovery_state", { p_namespace: namespace, p_authorized_by: admin }],
    ["d1_record_operating_credit", { p_namespace: namespace, p_authorized_by: admin, p_observation: h.observation }]]);
  equal(JSON.stringify([h.state, h.record]), before); equal(h.sourceCalls(), 1);
});
Deno.test("unknown committed save never retries or reads back; explicit next invocation loads original", async () => {
  const h = fixture(); h.save(() => { throw new Error("private response lost"); });
  await rejects(h.run); equal(h.calls.length, 3); equal(h.sourceCalls(), 1);
  const original = h.stored(); equal(await h.run([]), original); equal(h.calls.length, 4); equal(h.sourceCalls(), 1);
});
Deno.test("malformed lookup and historical metadata reject without state/source/write or stored mutation", async () => {
  for (const patch of [{ extra: true }, { network: "PUBLIC" }, { namespace: "wrong" }, { pool: "bad" },
    { operation_id: "1" }, { receipt: [] }, { receipt: { ...fixture().receipt, extra: true } }]) {
    const h = fixture(); h.patch(patch); const before = JSON.stringify(h.stored()); await rejects(h.run);
    equal(h.calls.length, 1); equal(h.sourceCalls(), 0); equal(JSON.stringify(h.stored()), before);
  }
  const mutations: ((r: ReturnType<typeof fixture>["receipt"]) => void)[] = [
    (r) => { r.authorized_by = "bad"; }, (r) => { r.observation.namespace = "wrong"; },
    (r) => { r.observation.pool = team; }, (r) => { r.observation.funder = admin; },
    (r) => { r.observation.amountStroops = "0"; }, (r) => { r.observation.amountStroops = "9223372036854775808"; },
    (r) => { r.observation.transactionHash = "b".repeat(64); }, (r) => { r.observation.ledger = 9; },
    (r) => { r.observation.anchor.closedAt--; }, (r) => { r.observation.record.operation.memo.value = "other"; },
    (r) => { r.observation.record.operation.raw.transaction.envelope_xdr = "private"; },
    (r) => { r.observation.record.operation.raw.operation.amount = "0.0000000"; },
    (r) => { Object.assign(r.observation.record.operation.raw, { extra: true }); },
    (r) => { Object.assign(r.observation.record, { extra: true }); },
    (r) => { Object.assign(r.observation, { hidden: () => 1 }); },
    (r) => { Object.defineProperty(r, "observation", { get() { throw new Error("private"); } }); },
  ];
  for (const mutate of mutations) {
    const h = fixture(); mutate(h.receipt); h.setStored(h.receipt); await rejects(h.run);
    equal(h.calls.length, 1); equal(h.sourceCalls(), 0); equal(h.stored() === h.receipt, true);
  }
});
Deno.test("adapter narrowly maps own string RPC errors and sanitizes throws and malformed replies", async () => {
  for (const [error, message, status] of [
    [{ message: "unauthorized_admin_wallet" }, "unauthorized_admin_wallet", 403],
    [{ message: "operating_credit_conflict" }, "operating_credit_conflict", 409],
    ...["private", { message: ["unauthorized_admin_wallet"] }, { message: {} }, { message: "toString" },
      Object.create({ message: "unauthorized_admin_wallet" })].map((e) => [e, "operating_credit_unavailable", 503]),
  ] as [unknown, string, number][]) {
    const h = fixture(); h.error(error); await rejects(h.run, message, status); equal(h.calls.length, 1); equal(h.sourceCalls(), 0);
  }
  for (const reply of [null, [], { ...fixture().receipt, authorized_by: team },
    { ...fixture().receipt, observation: { ...fixture().observation, amountStroops: "1" } }]) {
    const h = fixture(); h.reply(reply); await rejects(h.run); equal(h.calls.length, 3); equal(h.sourceCalls(), 1);
  }
  const database = new OperatingCreditDatabase({ rpc() { throw new Error("private"); } }, namespace, admin);
  await rejects(() => recordOperatingCredit(database, fixture().id, [team]));
});
Deno.test("bad ids, context, source records and dependency state fail closed without writes", async () => {
  for (const id of ["0", "01", "18446744073709551616"]) {
    const h = fixture(); await rejects(() => recordOperatingCredit(h.database, id, [team], h.source)); equal(h.calls, []);
  }
  for (const [ns, who] of [["bad", admin], [namespace, "bad"]]) {
    let error: unknown; try { new OperatingCreditDatabase({ rpc() { throw new Error("unexpected"); } }, ns, who); } catch (e) { error = e; }
    equal([(error as CustodyError).message, (error as CustodyError).status], ["operating_credit_unavailable", 503]);
  }
  for (const h of [fixture(false, "notD1OPS"), fixture(false, "D1OPS", new Asset("USD", team)), fixture(false, "D1OPS", Asset.native(), "0.0000001")]) {
    h.setStored(h.receipt); await rejects(h.run); equal(h.calls.length, 1); equal(h.sourceCalls(), 0);
  }
  for (const mutate of [(h: ReturnType<typeof fixture>) => { h.state.coverage_complete = false; },
    (h: ReturnType<typeof fixture>) => { h.record.operation.memo.value = "other"; },
    (h: ReturnType<typeof fixture>) => { Object.assign(h.record.operation.raw, { invalid: undefined }); },
    (h: ReturnType<typeof fixture>) => { h.source.readOperationAtCheckpoint = () => { throw new Error("private"); }; }]) {
    const h = fixture(); mutate(h); const before = JSON.stringify([h.state, h.record]); await rejects(h.run);
    equal(h.calls.map(([name]) => name), ["d1_load_operating_credit", "d1_load_discovery_state"]);
    equal(h.stored(), null); equal(JSON.stringify([h.state, h.record]), before);
  }
});
