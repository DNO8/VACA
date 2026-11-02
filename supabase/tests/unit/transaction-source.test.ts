import { Account, Keypair, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { HorizonDiscoverySource } from "../../functions/d1-custody/discovery-source.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";

const pool = Keypair.random().publicKey(), other = Keypair.random().publicKey();
const origin = "https://horizon-testnet.stellar.org", date = "2026-10-27T12:00:00Z";
const closedAt = Date.parse(date) / 1000, hash = "a".repeat(64);
const toid = (ledger: number, position = 1) => String((BigInt(ledger) << 32n) + (BigInt(position) << 12n));
const input = () => ({ pool, firstLedger: 8,
  checkpoint: { cursor: String(BigInt(toid(9)) + 1n), through_ledger: 10, ledger_hash: hash, closed_at: closedAt } });
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Mismatch: " + JSON.stringify([a, b]));
}
function transaction(ledger = 9, position = 1, failed = false, source = pool) {
  const tx = new TransactionBuilder(new Account(source, String(position)), { fee: "500", networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 } }).addOperation(Operation.manageData({ name: "test", value: null, source: pool })).build();
  const results = [xdr.OperationResult.opInner(xdr.OperationResultTr.manageData(failed ?
    xdr.ManageDataResult.manageDataNameNotFound() : xdr.ManageDataResult.manageDataSuccess()))];
  const result = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"),
    result: failed ? xdr.TransactionResultResult.txFailed(results) : xdr.TransactionResultResult.txSuccess(results),
    ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") });
  return { hash: tx.hash().toString("hex"), ledger, created_at: date, source_account: source,
    source_account_sequence: tx.sequence, fee_account: source, fee_charged: "123", max_fee: "500", successful: !failed,
    operation_count: 1, paging_token: toid(ledger, position), envelope_xdr: tx.toXDR(), result_xdr: result.toXDR("base64") };
}
function harness() {
  const records: Record<string, unknown>[] = [transaction(), transaction(9, 3, true), transaction(10, 1, false, other)];
  const root: Record<string, unknown> = { network_passphrase: Networks.TESTNET, history_elder_ledger: 1, history_latest_ledger: 10 };
  const head: Record<string, unknown> = { sequence: 10, hash, closed_at: date, base_fee_in_stroops: 100, base_reserve_in_stroops: 5000000 };
  const headers: Record<string, Record<string, unknown>> = { "9": { sequence: 9, hash: "b".repeat(64), closed_at: date }, "10": { ...head } };
  const account = { id: pool, account_id: pool, sequence: "4", last_modified_ledger: 9,
    balances: [{ asset_type: "native", balance: "100.0000000", selling_liabilities: "0.0000000", buying_liabilities: "0.0000000" }],
    subentry_count: 0, num_sponsoring: 0, num_sponsored: 0,
    signers: [{ key: pool, type: "ed25519_public_key", weight: 1 }],
    thresholds: { low_threshold: 1, med_threshold: 1, high_threshold: 1 } };
  let page: unknown = { _embedded: { records }, _links: { next: { href: "https://evil.invalid/next" } } };
  const calls: { url: string; init?: RequestInit }[] = [];
  let hook: ((url: string) => void) | undefined;
  const source = new HorizonDiscoverySource(async (url, init) => {
    const text = String(url); calls.push({ url: text, init }); hook?.(text);
    let dto: unknown;
    if (text === origin + "/") dto = root;
    else if (text === origin + `/accounts/${pool}`) dto = account;
    else if (text === origin + "/ledgers?limit=1&order=desc") dto = { _embedded: { records: [head] } };
    else if (text.startsWith(origin + `/accounts/${pool}/transactions?`)) dto = page;
    else if (text.startsWith(origin + "/ledgers/")) dto = headers[text.split("/").pop()!];
    else throw new Error("unexpected URL");
    return new Response(JSON.stringify(dto));
  });
  return { source, records, root, head, headers, account, calls,
    hook(fn: typeof hook) { hook = fn; }, page(value: unknown) { page = value; } };
}
async function reject(h: ReturnType<typeof harness>, context: unknown = input(), cursor = "0") {
  const before = JSON.stringify(context), facts = JSON.stringify([h.records, h.root, h.head, h.headers, h.account]);
  let error: unknown, result: unknown;
  try { result = await h.source.readTransactionPageAtCheckpoint(context as ReturnType<typeof input>, cursor); } catch (e) { error = e; }
  equal(result, undefined);
  equal(error instanceof CustodyError && error.status === 503 && error.code === "dependency_unavailable" && error.message === error.code, true);
  equal(JSON.stringify(context), before); equal(JSON.stringify([h.records, h.root, h.head, h.headers, h.account]), facts);
  equal(h.calls.filter(c => c.url.includes("/transactions?")).length <= 1, true);
  equal(h.calls.every(c => c.url.startsWith(origin + "/")), true);
}
Deno.test("transaction source pins independent cursor/include_failed and decodes every outcome with ledger caching", async () => {
  const h = harness(), context = input(), before = JSON.stringify(context), cursor = toid(8);
  const result = await h.source.readTransactionPageAtCheckpoint(context, cursor);
  equal(result.complete, false);
  equal(result.page, { revision: 1, from_cursor: cursor, to_cursor: toid(10), through_ledger: 10,
    ledger_hash: hash, closed_at: closedAt, records: h.records.map(transaction => parseIncludedTransaction({ transaction,
      ledger: h.headers[String(transaction.ledger)], context: { pool, firstLedger: 8, anchor: { sequence: 10, hash, closedAt } } })) });
  equal([result.account.pool, result.account.anchor], [pool, { sequence: 10, hash, closedAt }]);
  equal(result.page.records.map(r => [r.outcome, r.feePayer, r.feeChargedStroops, r.poolOperationSourceIndices]),
    [["success", pool, "123", [0]], ["failed", pool, "123", [0]], ["success", other, "123", [0]]]);
  equal(h.calls.map(c => c.url), [origin + "/", origin + `/accounts/${pool}`, origin + "/ledgers?limit=1&order=desc",
    origin + `/accounts/${pool}/transactions?order=asc&include_failed=true&limit=100&cursor=${cursor}`,
    origin + "/ledgers/9", origin + "/ledgers/10", origin + "/ledgers?limit=1&order=desc"]);
  for (const { init } of h.calls) {
    equal([init?.method, init?.redirect, init?.credentials], ["GET", "error", "omit"]);
    equal(init?.signal instanceof AbortSignal, true);
  }
  equal(JSON.stringify(context), before);
});
Deno.test("transaction source only verified empty lists complete and keep independent cursor", async () => {
  for (const count of [0, 1, 100]) {
    const h = harness(); h.records.splice(0, h.records.length, ...Array.from({ length: count }, (_, i) => transaction(9, i + 2)));
    const result = await h.source.readTransactionPageAtCheckpoint(input(), toid(9));
    equal([result.complete, result.page.from_cursor, result.page.to_cursor, result.page.records.length],
      [count === 0, toid(9), count ? toid(9, count + 1) : toid(9), count]);
    equal(h.calls.length, count ? 6 : 5);
  }
});
Deno.test("transaction source rejects invalid TX cursors and bad context before transport", async () => {
  for (const cursor of ["01", "-1", "1", String(9n << 32n), String(BigInt(toid(9)) + 1n),
    "18446744073709551616", toid(11), toid(7), "https://evil.invalid"]) {
    const h = harness(); await reject(h, input(), cursor); equal(h.calls.length, 0);
  }
  for (const context of [{ ...input(), pool: "bad" }, { ...input(), firstLedger: 11 }, { ...input(), checkpoint: null },
    { ...input(), checkpoint: { ...input().checkpoint, extra: true } },
    { ...input(), checkpoint: { ...input().checkpoint, cursor: "01" } }]) {
    const h = harness(); await reject(h, context); equal(h.calls.length, 0);
  }
  const h = harness(), context = input();
  Object.defineProperty(context.checkpoint, "opaque", { enumerable: true, value: () => "private" });
  await reject(h, context); equal(h.calls.length, 0);
});
Deno.test("transaction source rejects order duplicates page bounds and active boundary without skipping", async () => {
  for (const change of [(h: ReturnType<typeof harness>) => h.records.reverse(),
    (h: ReturnType<typeof harness>) => h.records.push(h.records[2]),
    (h: ReturnType<typeof harness>) => h.records.splice(0, 3, ...Array(101).fill(h.records[0])),
    ...["01", "0", toid(11), toid(7), String(BigInt(toid(9)) + 1n), "18446744073709551616"]
      .map(paging_token => (h: ReturnType<typeof harness>) => { h.records[0].paging_token = paging_token; }),
    (h: ReturnType<typeof harness>) => { h.records[0].ledger = 7; },
    (h: ReturnType<typeof harness>) => { h.records[0].paging_token = toid(8); h.records[0].ledger = 8; }]) {
    const h = harness(); change(h); await reject(h, input(), toid(8)); equal(h.calls.length, 4);
  }
  for (const page of [null, {}, { _embedded: { records: null } }, { _embedded: { records: [null] } }]) {
    const h = harness(); h.page(page); await reject(h); equal(h.calls.length, 4);
  }
});
Deno.test("transaction source binds record source fees time XDR TOID and fetched headers", async () => {
  for (const patch of [{ source_account: other }, { fee_account: other }, { successful: false }, { fee_charged: "124" },
    { hash: "c".repeat(64) }, { created_at: "2026-10-27T12:00:01Z" }, { envelope_xdr: "AAAA" },
    { result_xdr: "AAAA" }, { paging_token: toid(8), ledger: 9 }]) {
    const h = harness(); Object.assign(h.records[0], patch); await reject(h); equal(h.calls.length, patch.ledger ? 4 : 5);
  }
  for (const patch of [{ sequence: 8 }, { hash: "bad" }, { closed_at: "2026-10-27T12:00:01Z" }]) {
    const h = harness(); Object.assign(h.headers["9"], patch); await reject(h); equal(h.calls.length, 5);
  }
  const h = harness(); h.headers["10"].hash = "c".repeat(64); await reject(h); equal(h.calls.length, 6);
});
Deno.test("transaction source rejects retention network account anchor and final head changes even for empty pages", async () => {
  for (const patch of [{ network_passphrase: Networks.PUBLIC }, { history_elder_ledger: 9 }, { history_latest_ledger: 11 }]) {
    const h = harness(); Object.assign(h.root, patch); await reject(h); equal(h.calls.length, 1);
  }
  const account = harness(); account.account.account_id = other; await reject(account); equal(account.calls.length, 2);
  for (const final of [false, true]) for (const patch of [{ sequence: 11 }, { sequence: 9 }, { hash: "c".repeat(64) },
    { closed_at: "2026-10-27T12:00:01Z" }]) {
    const h = harness(); h.records.length = 0;
    if (final) h.hook(url => { if (url.includes("/transactions?")) Object.assign(h.head, patch); });
    else Object.assign(h.head, patch);
    // Deliberate simulated upstream mutation is not an input mutation by the reader.
    let error: unknown, result: unknown;
    try { result = await h.source.readTransactionPageAtCheckpoint(input(), "0"); } catch (e) { error = e; }
    equal(result, undefined); equal(error instanceof CustodyError && error.status === 503 && error.code === "dependency_unavailable", true);
    equal(h.calls.length, final ? 5 : 3);
  }
});
Deno.test("transaction source snapshots context before first await and returned decoder context stays detached", async () => {
  const h = harness(), context = input();
  h.hook(() => { context.pool = other; context.firstLedger = 11; context.checkpoint.through_ledger = 11;
    context.checkpoint.ledger_hash = "c".repeat(64); context.checkpoint.cursor = "bad"; context.checkpoint.closed_at = 0; });
  const result = await h.source.readTransactionPageAtCheckpoint(context, "0");
  equal(result.page.records.every(r => r.context.pool === pool && r.context.firstLedger === 8 &&
    r.context.anchor.sequence === 10 && r.context.anchor.hash === hash && r.context.anchor.closedAt === closedAt), true);
  equal([result.page.through_ledger, result.account.pool, result.page.from_cursor], [10, pool, "0"]);
  equal(h.calls.length, 7);
});
