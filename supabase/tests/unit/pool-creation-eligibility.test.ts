import { Account, Keypair, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { observePoolCreation } from "../../functions/d1-custody/pool-creation-eligibility.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
const [pool, admin, funder, other] = [81, 82, 83, 84].map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
const ns = "11111111-1111-4111-8111-111111111111", hash = "a".repeat(64), closedAt = 1793102400;
function equal(a: unknown, b: unknown) {
  const normalize = (v: unknown): unknown => Array.isArray(v) ? v.map(normalize) : v !== null && typeof v === "object" ?
    Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, normalize(x)])) : v;
  if (JSON.stringify(normalize(a)) !== JSON.stringify(normalize(b))) throw new Error("Mismatch " + JSON.stringify([a, b]));
}
const create = (destination = pool) => Operation.createAccount({ destination, startingBalance: "10.0000001" });
const merge = (source = pool) => Operation.accountMerge({ destination: other, source });
const data = () => Operation.manageData({ name: "test", value: null });
function record(position: number, operations = [create()], success = true) {
  let builder = new TransactionBuilder(new Account(funder, String(position)), { fee: "500", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 0 } });
  for (const op of operations) builder = builder.addOperation(op);
  const tx = builder.build();
  const results = operations.map(op => {
    let tr;
    switch (op.body().switch().value) {
      case 0: tr = xdr.OperationResultTr.createAccount(success ? xdr.CreateAccountResult.createAccountSuccess() : xdr.CreateAccountResult.createAccountLowReserve()); break;
      case 8: tr = xdr.OperationResultTr.accountMerge(success ? xdr.AccountMergeResult.accountMergeSuccess(xdr.Int64.fromString("1")) : xdr.AccountMergeResult.accountMergeNoAccount()); break;
      default: tr = xdr.OperationResultTr.manageData(success ? xdr.ManageDataResult.manageDataSuccess() : xdr.ManageDataResult.manageDataNameNotFound());
    }
    return xdr.OperationResult.opInner(tr);
  });
  return parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: { sequence: 9, hash, closedAt } },
    ledger: { sequence: 9, hash, closed_at: "2026-10-27T12:00:00Z" }, transaction: { hash: tx.hash().toString("hex"), ledger: 9,
      created_at: "2026-10-27T12:00:00Z", source_account: funder, source_account_sequence: tx.sequence, fee_account: funder,
      fee_charged: "123", max_fee: tx.fee, successful: success, operation_count: operations.length,
      paging_token: String((9n << 32n) + BigInt(position) * 4096n), envelope_xdr: tx.toXDR(),
      result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"), result: success ? xdr.TransactionResultResult.txSuccess(results) : xdr.TransactionResultResult.txFailed(results), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") } });
}
function harness(records = [record(1)]) {
  const cp = { cursor: records.at(-1)?.pagingToken ?? "0", through_ledger: 9, ledger_hash: hash, closed_at: closedAt };
  const state = { kind: "d1_transaction_history_state", revision: 1, namespace: ns, network: "TESTNET", pool, first_ledger: 8,
    income_state: { kind: "d1_discovery_state", revision: 1, namespace: ns, network: "TESTNET", pool, first_ledger: 8,
      checkpoint: { ...cp, cursor: "38654709761" }, coverage_complete: true }, checkpoint: cp, coverage_complete: true, page_count: records.length + 1, record_count: records.length };
  const calls: string[] = [], args: unknown[] = [];
  const account = { pool, networkPassphrase: Networks.TESTNET as const, anchor: { sequence: 9, hash, closedAt }, sequence: "2", lastModifiedLedger: 9,
    baseFee: "100", baseReserve: "5000000", native: { balance: "100000001", sellingLiabilities: "0" }, issuedBalances: [],
    account: { subentry_count: 0, num_sponsoring: 0, num_sponsored: 0 } };
  const h = { state, calls, args, account, error: null as unknown, onAccount: () => {}, client: { async rpc(name: string, parameters: Record<string, unknown>) {
    calls.push(name); args.push(parameters);
    if (name === "d1_load_transaction_history_state") return { data: state, error: h.error };
    return { data: { kind: "d1_transaction_records", revision: 1, namespace: ns, network: "TESTNET", pool,
      from_cursor: "0", next_cursor: cp.cursor, records, has_more: false, history_state: structuredClone(state) }, error: h.error };
  } }, source: { async readAccountAtCheckpoint(context: unknown) { calls.push("account"); args.push(context); h.onAccount(); return account; } } };
  return h;
}
async function reject(work: Promise<unknown>, status = 503) { let e: unknown; try { await work; } catch (error) { e = error; }
  equal(e instanceof CustodyError && e.status === status && e.message === e.code && (status !== 503 || e.code === "pool_creation_unavailable"), true); }
Deno.test("new-pool gate derives successful creation from full SDK history and checks current account before evidence", async () => {
  const h = harness([record(1, [data(), create()]), record(2, [data()], false)]), before = JSON.stringify(h.state);
  const result = await observePoolCreation(h.client, ns, admin, pool, h.source);
  equal(result, { kind: "d1_pool_creation_evidence", revision: 1, namespace: ns, network: "TESTNET", pool, firstLedger: 8,
    anchor: { sequence: 9, hash, closedAt }, creation: { transactionHash: record(1, [data(), create()]).transactionHash,
      operationId: String((9n << 32n) + 4098n), operationIndex: 1, ledger: 9, closedAt, funder, startingBalanceStroops: "100000001" } });
  equal(h.calls, ["d1_load_transaction_history_state", "d1_list_transaction_records", "d1_load_transaction_history_state", "account", "d1_load_transaction_history_state"]);
  equal(h.args[3], { pool, firstLedger: 8, checkpoint: h.state.income_state.checkpoint }); equal(JSON.stringify(h.state), before);
});
Deno.test("new-pool gate rejects empty, failed, unrelated or late creation without account read or writes", async () => {
  for (const records of [[], [record(1, [create()], false)], [record(1, [create(other)])], [record(1, [data()]), record(2)],
    [record(1, [create(), create()])], [record(1), record(2)]]) {
    const h = harness(records); await reject(observePoolCreation(h.client, ns, admin, pool, h.source)); equal(h.calls.includes("account"), false);
    equal(h.calls.every(c => c === "d1_load_transaction_history_state" || c === "d1_list_transaction_records"), true);
  }
});
Deno.test("new-pool gate rejects successful pool-source merge including same-transaction recreation, not failed merges or other sources", async () => {
  for (const records of [[record(1, [create(), merge()])], [record(1), record(2, [merge()])], [record(1, [create(), merge(), create()])]]) {
    const h = harness(records); await reject(observePoolCreation(h.client, ns, admin, pool, h.source)); equal(h.calls.includes("account"), false);
  }
  for (const records of [[record(1), record(2, [merge()], false)], [record(1), record(2, [merge(funder)])]]) {
    const h = harness(records); await observePoolCreation(h.client, ns, admin, pool, h.source); equal(h.calls.at(-1), "d1_load_transaction_history_state");
  }
});
Deno.test("new-pool gate fails closed on incomplete, preactivation and malformed SDK history before account lookup", async () => {
  for (const mutate of [(h: ReturnType<typeof harness>) => { h.state.coverage_complete = false; },
    (h: ReturnType<typeof harness>) => { h.state.first_ledger = 10; h.state.income_state.first_ledger = 10; },
    (h: ReturnType<typeof harness>) => { h.state.income_state.coverage_complete = false; }]) {
    const h = harness(); mutate(h); await reject(observePoolCreation(h.client, ns, admin, pool, h.source)); equal(h.calls, ["d1_load_transaction_history_state"]);
  }
  const r = record(1); r.outcome = "failed"; const h = harness([r]); await reject(observePoolCreation(h.client, ns, admin, pool, h.source)); equal(h.calls.includes("account"), false);
});
Deno.test("new-pool gate rejects wrong or unavailable current account and state drift without retry", async () => {
  for (const patch of [{ pool: other }, { networkPassphrase: Networks.PUBLIC }, { anchor: { sequence: 9, hash: "b".repeat(64), closedAt } },
    { lastModifiedLedger: 8 }, { lastModifiedLedger: 10 }]) {
    const h = harness(); Object.assign(h.account, patch); await reject(observePoolCreation(h.client, ns, admin, pool, h.source)); equal(h.calls.length, 4);
  }
  const h = harness(); h.onAccount = () => { h.state.page_count++; }; await reject(observePoolCreation(h.client, ns, admin, pool, h.source)); equal(h.calls.length, 5);
  const unavailable = harness(); unavailable.onAccount = () => { throw new Error("private"); }; await reject(observePoolCreation(unavailable.client, ns, admin, pool, unavailable.source)); equal(unavailable.calls.length, 4);
});
Deno.test("new-pool gate preserves admin denial and rejects source accessors without leaking errors", async () => {
  const h = harness(); h.error = { message: "unauthorized_admin_wallet" }; await reject(observePoolCreation(h.client, ns, admin, pool, h.source), 403); equal(h.calls.length, 1);
  const g = harness(); let invoked = false; Object.defineProperty(g.account, "pool", { enumerable: true, get() { invoked = true; throw new Error("private"); } });
  await reject(observePoolCreation(g.client, ns, admin, pool, g.source)); equal(invoked, false); equal(g.calls.length, 4);
});
