import { Account, Keypair, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { TransactionHistoryDatabase, ingestTransactionPage } from "../../functions/d1-custody/transaction-ingestion.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
const [pool, admin, original, other] = [61, 62, 63, 64].map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
const ns = "11111111-1111-4111-8111-111111111111", hash = "a".repeat(64), closedAt = 1793102400;
const cp = { cursor: "0", through_ledger: 9, ledger_hash: hash, closed_at: closedAt };
function equal(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Mismatch " + JSON.stringify([a, b])); }
function fixture(failed = false, payer = pool) {
  const tx = new TransactionBuilder(new Account(payer, "1"), { fee: "500", networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 } }).addOperation(Operation.manageData({ name: "test", value: null, source: pool })).build();
  const results = [xdr.OperationResult.opInner(xdr.OperationResultTr.manageData(failed ? xdr.ManageDataResult.manageDataNameNotFound() : xdr.ManageDataResult.manageDataSuccess()))];
  const record = parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: { sequence: 9, hash, closedAt } },
    ledger: { sequence: 9, hash, closed_at: "2026-10-27T12:00:00Z" }, transaction: { hash: tx.hash().toString("hex"), ledger: 9,
      created_at: "2026-10-27T12:00:00Z", source_account: payer, source_account_sequence: tx.sequence, fee_account: payer,
      fee_charged: "123", max_fee: "500", successful: !failed, operation_count: 1, paging_token: String((9n << 32n) + 4096n), envelope_xdr: tx.toXDR(),
      result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"), result: failed ? xdr.TransactionResultResult.txFailed(results) : xdr.TransactionResultResult.txSuccess(results), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") } });
  return { revision: 1 as const, from_cursor: "0", to_cursor: record.pagingToken, through_ledger: 9, ledger_hash: hash, closed_at: closedAt, records: [record] };
}
function state() { return { kind: "d1_transaction_history_state", revision: 1, namespace: ns, network: "TESTNET", pool, first_ledger: 8,
  income_state: { kind: "d1_discovery_state", revision: 1, namespace: ns, network: "TESTNET", pool, first_ledger: 8, checkpoint: { ...cp }, coverage_complete: true },
  checkpoint: null as typeof cp | null, coverage_complete: false, page_count: 0, record_count: 0 }; }
type Page = ReturnType<typeof fixture>;
function receipt(page: Page, s = state(), author = admin) { return { kind: "d1_transaction_page", revision: 1, namespace: ns, network: "TESTNET", pool,
  first_ledger: 8, authorized_by: author, page: structuredClone(page), checkpoint: { ...cp, cursor: page.to_cursor },
  page_count: s.page_count + 1, record_count: s.record_count + page.records.length, page_record_count: page.records.length }; }
function harness(page = fixture()) {
  const calls: { name: string; args: Record<string, unknown> }[] = []; let reads = 0;
  const h = { state: state(), error: null as unknown, saved: null as unknown, save: async (): Promise<{ data: unknown; error: unknown }> => ({ data: h.saved ?? receipt(page, h.state), error: null }),
    calls, source: { async readTransactionPageAtCheckpoint(context: unknown, cursor: string) { reads++; equal(context, { pool, firstLedger: 8, checkpoint: h.state.income_state.checkpoint }); equal(cursor, h.state.checkpoint?.cursor ?? "0");
      return { page, complete: page.records.length === 0, account: { balance: 1n } } as never; } }, get reads() { return reads; },
    database: null as unknown as TransactionHistoryDatabase };
  h.database = new TransactionHistoryDatabase({ async rpc(name, args) { calls.push({ name, args }); if (name === "d1_load_transaction_history_state") return { data: h.state, error: h.error }; return await h.save(); } }, ns, admin, pool, "TESTNET"); return h;
}
async function reject(work: Promise<unknown>, status = 503) { let e: unknown; try { await work; } catch (error) { e = error; }
  equal(e instanceof CustodyError && e.status === status && e.message === e.code, true); }
Deno.test("transaction ingestion loads first, binds exact RPC args and SDK success/failed/other payer with JSONB order", async () => {
  for (const [failed, payer] of [[false, pool], [true, pool], [false, other]] as const) {
    const p = fixture(failed, payer), h = harness(p); p.records[0] = Object.fromEntries(Object.entries(p.records[0]).reverse()) as typeof p.records[0];
    const before = JSON.stringify(p), result = await ingestTransactionPage(h.database, h.source);
    equal(h.reads, 1); equal(h.calls, [{ name: "d1_load_transaction_history_state", args: { p_namespace: ns, p_authorized_by: admin } },
      { name: "d1_record_transaction_page", args: { p_namespace: ns, p_authorized_by: admin, p_page: p } }]);
    equal(result.completeAtAnchor, false); equal(result.anchor, { ...cp, cursor: p.to_cursor }); JSON.stringify(result); equal(JSON.stringify(p), before);
  }
});
Deno.test("transaction ingestion invalid or revoked state never touches provider", async () => {
  for (const patch of [{ revision: 2 }, { namespace: "22222222-2222-4222-8222-222222222222" }, { pool: other }, { network: "PUBLIC" },
    { first_ledger: 10 }, { page_count: 1 }, { coverage_complete: true }, { income_state: { ...state().income_state, coverage_complete: false } },
    { checkpoint: { ...cp, cursor: "1" } }, { checkpoint: { ...cp, cursor: String((7n << 32n) + 4096n) }, page_count: 1, record_count: 1 },
    { checkpoint: { ...cp, through_ledger: 10 }, page_count: 1 }]) {
    const h = harness(); Object.assign(h.state, patch); await reject(ingestTransactionPage(h.database, h.source)); equal([h.reads, h.calls.length], [0, 1]);
  }
  const h = harness(); h.error = { message: "unauthorized_admin_wallet" }; await reject(ingestTransactionPage(h.database), 403); equal(h.calls.length, 1);
});
Deno.test("transaction ingestion awaits exactly one save, preserves other original authorizer", async () => {
  const p = fixture(), h = harness(p); let finish!: (v: Awaited<ReturnType<typeof h.save>>) => void;
  h.save = () => new Promise(resolve => { finish = resolve; }); let done = false;
  const pending = ingestTransactionPage(h.database, h.source).then(v => { done = true; return v; });
  for (let i = 0; i < 10 && !finish; i++) await Promise.resolve(); equal([done, h.calls.length], [false, 2]);
  finish({ data: receipt(p, h.state, original), error: null }); equal((await pending).receipt.authorized_by, original);
});
Deno.test("transaction ingestion rejects wrong receipts, counters, body and coercing errors without retry or mutation", async () => {
  const p = fixture();
  for (const patch of [{ authorized_by: "Gbad" }, { pool: other }, { namespace: "wrong" }, { first_ledger: 7 }, { revision: 2 }, { page_count: 2 },
    { record_count: 2 }, { page_record_count: 2 }, { checkpoint: cp }, { page: { ...p, closed_at: closedAt + 1 } }, { kind: "wrong" }, { network: "PUBLIC" }, { record_count: -1 }]) {
    const h = harness(p); h.saved = { ...receipt(p), ...patch }; const before = JSON.stringify(h.state); await reject(ingestTransactionPage(h.database, h.source));
    equal([h.calls.length, h.reads, JSON.stringify(h.state)], [2, 1, before]);
  }
  for (const error of [{ message: { toString() { throw new Error("secret"); } } }, Object.create({ message: "unauthorized_admin_wallet" }),
    { get message() { throw new Error("secret"); } }, { message: "transaction_history_conflict" }]) {
    const h = harness(); h.error = error; await reject(ingestTransactionPage(h.database, h.source), Object.hasOwn(error, "message") && Object.getOwnPropertyDescriptor(error, "message")?.value === "transaction_history_conflict" ? 409 : 503); equal([h.reads, h.calls.length], [0, 1]);
  }
});
Deno.test("transaction ingestion validates entire JSON page before saving and never invokes source getters", async () => {
  for (const mutate of [(p: Page) => { p.records[0].feeChargedStroops = "124"; }, (p: Page) => { Object.assign(p.records[0], { unknown: 1 }); },
    (p: Page) => { p.from_cursor = "4096"; }, (p: Page) => { p.to_cursor = "0"; }, (p: Page) => { p.ledger_hash = "b".repeat(64); },
    (p: Page) => { Object.assign(p, { opaque: () => 1 }); }, (p: Page) => { p.records = Array(1); },
    (p: Page) => { Object.assign(p.records[0].raw.transaction, { bad: 1n }); }, (p: Page) => { Object.assign(p, { cycle: p }); }]) {
    const p = fixture(), h = harness(p); mutate(p); await reject(ingestTransactionPage(h.database, h.source)); equal([h.calls.length, h.reads], [1, 1]);
  }
  const h = harness(); let getters = 0; Object.defineProperty(h.source, "readTransactionPageAtCheckpoint", { get() { getters++; throw new Error("secret"); } });
  h.error = { message: "unauthorized_admin_wallet" }; await reject(ingestTransactionPage(h.database, h.source), 403); equal(getters, 0);
  const p = fixture(), g = harness(p); Object.defineProperty(p, "records", { enumerable: true, get() { getters++; throw new Error("secret"); } });
  await reject(ingestTransactionPage(g.database, g.source)); equal(g.calls.length, 1);
  for (const bad of [undefined, 1n, () => 1, Array(1), new Date(), "x".repeat(1048577)]) {
    const p = fixture(), h = harness(p); Object.assign(p.records[0].raw.transaction, { opaque: bad });
    await reject(ingestTransactionPage(h.database, h.source)); equal([h.calls.length, h.reads], [1, 1]);
  }
  for (const result of [{ page: fixture(), complete: true }, { page: fixture(), complete: "false" }, null,
    { page: fixture(), get complete() { throw new Error("secret"); } },
    { get page() { throw new Error("secret"); }, complete: false }]) {
    const h = harness(); await reject(ingestTransactionPage(h.database, { async readTransactionPageAtCheckpoint() { return result as never; } })); equal(h.calls.length, 1);
  }
});
Deno.test("transaction ingestion snapshots load and source context before awaits and preserves independent cursors", async () => {
  const p = fixture(), h = harness(p); h.state.income_state.checkpoint.cursor = "38654709761";
  let finish!: (v: never) => void, contextSeen: unknown;
  const pending = ingestTransactionPage(h.database, { readTransactionPageAtCheckpoint(context, cursor) {
    contextSeen = structuredClone(context); equal(cursor, "0");
    Object.assign(context, { pool: other }); Object.assign(context.checkpoint!, { ledger_hash: "b".repeat(64) });
    return new Promise(resolve => { finish = resolve; });
  } });
  for (let i = 0; i < 10 && !finish; i++) await Promise.resolve();
  equal(contextSeen, { pool, firstLedger: 8, checkpoint: h.state.income_state.checkpoint });
  h.state.income_state.checkpoint.ledger_hash = "c".repeat(64);
  finish({ page: p, complete: false, account: { sequence: 1n } } as never);
  const result = await pending; equal(result.anchor.ledger_hash, hash); equal(h.calls.length, 2); JSON.stringify(result);
});
Deno.test("transaction ingestion unknown committed save is 503, explicit new invocation resumes advanced independent cursor", async () => {
  const p = fixture(), h = harness(p); h.save = async () => { h.state.checkpoint = { ...cp, cursor: p.to_cursor }; h.state.page_count = 1; h.state.record_count = 1; throw new Error("unknown commit"); };
  await reject(ingestTransactionPage(h.database, h.source)); equal([h.reads, h.calls.length], [1, 2]);
  p.from_cursor = p.to_cursor; p.records = []; h.save = async () => ({ data: receipt(p, h.state, original), error: null });
  const result = await ingestTransactionPage(h.database, h.source); equal([h.reads, h.calls.length, result.completeAtAnchor], [2, 4, true]);
  h.state.page_count = 2; h.state.coverage_complete = true; h.saved = { ...receipt(p, h.state, original), page_count: 2 };
  h.save = async () => ({ data: h.saved, error: null }); equal((await ingestTransactionPage(h.database, h.source)).receipt.authorized_by, original);
});
