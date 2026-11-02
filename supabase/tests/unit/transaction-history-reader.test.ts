import { Account, Keypair, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { readTransactionHistory } from "../../functions/d1-custody/transaction-history-reader.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
const [pool, admin, other] = [71, 72, 73].map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
const ns = "11111111-1111-4111-8111-111111111111", hash = "a".repeat(64), closedAt = 1793102400;
function equal(a: unknown, b: unknown) {
  function sorted(v: unknown): unknown { return Array.isArray(v) ? v.map(sorted) : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v; }
  if (JSON.stringify(sorted(a)) !== JSON.stringify(sorted(b))) throw new Error("Mismatch " + JSON.stringify([a, b]));
}
function record(position: number, failed = false, payer = pool) {
  const tx = new TransactionBuilder(new Account(payer, String(position)), { fee: "500", networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 } }).addOperation(Operation.manageData({ name: "test", value: null, source: pool })).build();
  const results = [xdr.OperationResult.opInner(xdr.OperationResultTr.manageData(failed ? xdr.ManageDataResult.manageDataNameNotFound() : xdr.ManageDataResult.manageDataSuccess()))];
  return parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: { sequence: 9, hash, closedAt } },
    ledger: { sequence: 9, hash, closed_at: "2026-10-27T12:00:00Z" }, transaction: { hash: tx.hash().toString("hex"), ledger: 9,
      created_at: "2026-10-27T12:00:00Z", source_account: payer, source_account_sequence: tx.sequence, fee_account: payer,
      fee_charged: "123", max_fee: "500", successful: !failed, operation_count: 1, paging_token: String((9n << 32n) + BigInt(position) * 4096n), envelope_xdr: tx.toXDR(),
      result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"), result: failed ? xdr.TransactionResultResult.txFailed(results) : xdr.TransactionResultResult.txSuccess(results), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") } });
}
function harness(empty = false) {
  const records = empty ? [] : [record(1), record(2, true), record(3, false, other)];
  const cp = { cursor: records.at(-1)?.pagingToken ?? "0", through_ledger: 9, ledger_hash: hash, closed_at: closedAt };
  const state = { kind: "d1_transaction_history_state", revision: 1, namespace: ns, network: "TESTNET", pool, first_ledger: 8,
    income_state: { kind: "d1_discovery_state", revision: 1, namespace: ns, network: "TESTNET", pool, first_ledger: 8,
      checkpoint: { ...cp, cursor: "38654709761" }, coverage_complete: true }, checkpoint: cp, coverage_complete: true, page_count: empty ? 1 : 3, record_count: records.length };
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const h = { records, state, calls, mutate: (_page: Record<string, unknown>) => {}, final: () => {}, error: null as unknown,
    client: { async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args }); if (name === "d1_load_transaction_history_state") { if (calls.length > 1) h.final(); return { data: state, error: h.error }; }
      const from = String(args.p_after), index = from === "0" ? 0 : records.findIndex(r => r.pagingToken === from) + 1;
      const selected = records.slice(index, index + 2);
      const page = { kind: "d1_transaction_records", revision: 1, namespace: ns, network: "TESTNET", pool,
        from_cursor: from, next_cursor: selected.at(-1)?.pagingToken ?? from, records: structuredClone(selected), has_more: index + selected.length < records.length,
        history_state: structuredClone(state) }; h.mutate(page); return { data: page, error: h.error };
    } } };
  return h;
}
async function reject(work: Promise<unknown>, status = 503) { let e: unknown; try { await work; } catch (error) { e = error; }
  equal(e instanceof CustodyError && e.status === status && e.message === e.code, true); }
Deno.test("historical reader revalidates all pages, counts success+failed pool fees only and never writes", async () => {
  const h = harness(), before = JSON.stringify(h.state);
  const result = await readTransactionHistory(h.client, ns, admin, pool);
  equal(result.confirmedPoolFeesSpentStroops, "246"); equal(result.records, h.records); equal(result.state, h.state);
  equal(h.calls.map(c => c.name), ["d1_load_transaction_history_state", "d1_list_transaction_records", "d1_list_transaction_records", "d1_load_transaction_history_state"]);
  equal(h.calls[1].args, { p_namespace: ns, p_authorized_by: admin, p_after: "0", p_limit: 100 });
  equal(h.calls[2].args.p_after, h.records[1].pagingToken); equal(JSON.stringify(h.state), before); JSON.stringify(result);
});
Deno.test("historical reader only returns zero for an explicitly covered empty stable history", async () => {
  const h = harness(true); equal((await readTransactionHistory(h.client, ns, admin, pool)).confirmedPoolFeesSpentStroops, "0"); equal(h.calls.length, 3);
  for (const patch of [{ coverage_complete: false }, { record_count: 1001 }, { checkpoint: null }]) {
    const h = harness(); Object.assign(h.state, patch); await reject(readTransactionHistory(h.client, ns, admin, pool)); equal(h.calls.length, 1);
  }
});
Deno.test("historical reader rejects state drift on a page or final load without retry", async () => {
  for (const final of [false, true]) { const h = harness();
    if (final) h.final = () => { h.state.page_count++; }; else h.mutate = p => { (p.history_state as typeof h.state).page_count++; };
    await reject(readTransactionHistory(h.client, ns, admin, pool)); equal(h.calls.length, final ? 4 : 2);
  }
});
Deno.test("historical reader rejects malformed pages, omitted records, SDK mismatches, aliases and getters", async () => {
  const mutations = [(p: Record<string, unknown>) => { p.namespace = "wrong"; }, (p: Record<string, unknown>) => { p.has_more = false; },
    (p: Record<string, unknown>) => { p.next_cursor = "0"; }, (p: Record<string, unknown>) => { p.records = []; },
    (p: Record<string, unknown>) => { (p.records as ReturnType<typeof record>[])[0].feeChargedStroops = "124"; },
    (p: Record<string, unknown>) => { (p.records as ReturnType<typeof record>[])[0].context.pool = other; },
    (p: Record<string, unknown>) => { (p.records as ReturnType<typeof record>[])[1] = (p.records as ReturnType<typeof record>[])[0]; },
    (p: Record<string, unknown>) => { Object.defineProperty(p, "has_more", { enumerable: true, get() { throw new Error("secret"); } }); }];
  for (const mutate of mutations) { const h = harness(), before = JSON.stringify(h.state); h.mutate = mutate;
    await reject(readTransactionHistory(h.client, ns, admin, pool)); equal(h.calls.length, 2); equal(JSON.stringify(h.state), before);
  }
});
Deno.test("historical reader sanitizes unknown failures and preserves current-admin denial without retry", async () => {
  for (const error of [{ message: "unauthorized_admin_wallet" }, { get message() { throw new Error("secret"); } }, { message: "secret" }]) {
    const h = harness(); h.error = error; await reject(readTransactionHistory(h.client, ns, admin, pool), Object.getOwnPropertyDescriptor(error, "message")?.value === "unauthorized_admin_wallet" ? 403 : 503); equal(h.calls.length, 1);
  }
  const h = harness(); h.client.rpc = async () => { throw new Error("secret"); }; await reject(readTransactionHistory(h.client, ns, admin, pool));
});
