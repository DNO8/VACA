import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { HorizonDiscoverySource } from "../../functions/d1-custody/discovery-source.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";

const pool = Keypair.random().publicKey(), donor = Keypair.random().publicKey();
const origin = "https://horizon-testnet.stellar.org";
const date = "2026-10-27T12:00:00Z", closed = Date.parse(date) / 1000;
const hash = "a".repeat(64);
const checkpoint = { cursor: "0", through_ledger: 9, ledger_hash: "b".repeat(64), closed_at: closed - 5 };
const input = () => ({ pool, firstLedger: 8, checkpoint: null });
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Mismatch: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function fixture(asset = Asset.native()) {
  const tx = new TransactionBuilder(new Account(donor, "1"), { fee: "100", networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 } })
    .addOperation(Operation.payment({ destination: pool, asset, amount: "1" }))
    .addOperation(Operation.manageData({ name: "retained", value: null })).build();
  const txHash = tx.hash().toString("hex"), token = (7n << 32n) + 4096n;
  const operations: Record<string, unknown>[] = [
    { type: "payment", type_i: 1, from: donor, to: pool, amount: "1.0000000",
      ...(asset.isNative() ? { asset_type: "native" } :
        { asset_type: "credit_alphanum4", asset_code: asset.getCode(), asset_issuer: asset.getIssuer() }) },
    { type: "manage_data", type_i: 10 },
  ].map((op, i) => ({ ...op, id: String(token + BigInt(i + 1)), paging_token: String(token + BigInt(i + 1)),
    transaction_hash: txHash, transaction_successful: true, source_account: donor, created_at: date }));
  const transaction = { hash: txHash, paging_token: String(token), ledger: 7, successful: true,
    operation_count: 2, created_at: date, envelope_xdr: tx.toXDR() };
  return { operations, transaction };
}
function harness(asset = Asset.native()) {
  const f = fixture(asset);
  const ledger: Record<string, unknown> = { sequence: 10, hash, closed_at: date };
  const root: Record<string, unknown> = { network_passphrase: Networks.TESTNET, history_elder_ledger: 1, history_latest_ledger: 10 };
  const saved: Record<string, unknown> = { sequence: 9, hash: checkpoint.ledger_hash, closed_at: "2026-10-27T11:59:55Z" };
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let override: ((url: string) => Response | Promise<Response> | undefined) | undefined;
  const fetcher: typeof fetch = async (url, init) => {
    const text = String(url); calls.push({ url: text, init });
    const custom = override?.(text);
    if (custom !== undefined) return await custom;
    let dto: unknown;
    if (text === origin + "/ledgers?limit=1&order=desc") dto = { _embedded: { records: [ledger] } };
    else if (text === origin + "/") dto = root;
    else if (text === origin + "/ledgers/9") dto = saved;
    else if (text.startsWith(origin + "/accounts/")) dto = { _embedded: { records: f.operations }, _links: { next: { href: "https://evil.invalid" } } };
    else if (text === origin + "/transactions/" + f.transaction.hash) dto = f.transaction;
    else throw new Error("unexpected URL");
    return new Response(JSON.stringify(dto));
  };
  return { ...f, ledger, root, saved, calls, source: new HorizonDiscoverySource(fetcher),
    override(fn: typeof override) { override = fn; } };
}
async function reject(h: ReturnType<typeof harness>, context: unknown = input()) {
  const before = JSON.stringify(context), facts = JSON.stringify([h.operations, h.transaction]);
  let error: unknown;
  try { await h.source.readPage(context as Parameters<HorizonDiscoverySource["readPage"]>[0]); } catch (e) { error = e; }
  equal(error instanceof CustodyError, true);
  equal([(error as CustodyError).message, (error as CustodyError).status], ["dependency_unavailable", 503]);
  equal(JSON.stringify(context), before); equal(JSON.stringify([h.operations, h.transaction]), facts);
}
Deno.test("source normalizes all historical/missing-memo/unsupported facts and pins URLs with per-call hash caching", async () => {
  const h = harness(), context = Object.freeze(input());
  const { page, complete } = await h.source.readPage(context);
  equal(Object.keys(page).sort(), ["closed_at", "from_cursor", "ledger_hash", "records", "revision", "through_ledger", "to_cursor"]);
  equal({ ...page, records: undefined }, { revision: 1, from_cursor: "0", to_cursor: h.operations[1].paging_token,
    through_ledger: 10, ledger_hash: hash, closed_at: closed, records: undefined });
  equal(complete, false); equal(page.records.map((r) => r.operation.kind), ["incoming_payment", "quarantined"]);
  equal(page.records[0].operation.memo, { type: "none", value: null });
  equal(page.records.map((r) => r.operation.raw), h.operations.map((operation) => ({ operation, transaction: h.transaction })));
  equal(h.calls.map((c) => c.url), [origin + "/ledgers?limit=1&order=desc", origin + "/",
    origin + `/accounts/${pool}/operations?order=asc&limit=50&include_failed=false&cursor=0`,
    origin + "/transactions/" + h.transaction.hash]);
  for (const { init } of h.calls) {
    equal([init?.method, init?.redirect, init?.credentials], ["GET", "error", "omit"]);
    equal(init?.signal instanceof AbortSignal, true);
  }
  await h.source.readPage(context);
  equal(h.calls.filter((c) => c.url.includes("/transactions/")).length, 2);
  const issued = harness(new Asset("USD", donor));
  const issuedPage = (await issued.source.readPage(context)).page;
  equal(issuedPage.records[0].operation.kind, "incoming_payment");
  equal(issuedPage.records[0].operation.raw, { operation: issued.operations[0], transaction: issued.transaction });
});
Deno.test("source completion requires an actually empty list and preserves the saved cursor", async () => {
  const h = harness(); h.operations.length = 0;
  const saved = { ...checkpoint, cursor: String((7n << 32n) + 4098n) };
  const result = await h.source.readPage({ ...input(), checkpoint: saved });
  equal(result, { page: { revision: 1, from_cursor: saved.cursor, to_cursor: saved.cursor,
    through_ledger: 10, ledger_hash: hash, closed_at: closed, records: [] }, complete: true });
  equal(h.calls.map((c) => c.url), [origin + "/ledgers?limit=1&order=desc", origin + "/", origin + "/ledgers/9",
    origin + `/accounts/${pool}/operations?order=asc&limit=50&include_failed=false&cursor=${saved.cursor}`]);
});
Deno.test("source rejects network/history gaps, regression/reset and saved-anchor contradictions", async () => {
  for (const patch of [{ network_passphrase: Networks.PUBLIC }, { history_elder_ledger: 9 },
    { history_latest_ledger: 9 }, { history_elder_ledger: "1" }]) {
    const h = harness(); Object.assign(h.root, patch); await reject(h);
  }
  for (const patch of [{ sequence: 8 }, { sequence: 0 }, { sequence: 4294967296 }, { sequence: "10" }, { hash: "A".repeat(64) },
    { closed_at: "2026-02-30T12:00:00Z" }, { closed_at: "2026-10-27T12:00:00.000Z" }]) {
    const h = harness(); Object.assign(h.ledger, patch); await reject(h, { ...input(), checkpoint });
  }
  for (const patch of [{ hash }, { sequence: 8 }, { closed_at: date }]) {
    const h = harness(); Object.assign(h.saved, patch); await reject(h, { ...input(), checkpoint });
  }
  const same = harness(); Object.assign(same.ledger, same.saved); same.operations.length = 0;
  equal((await same.source.readPage({ ...input(), checkpoint })).complete, true);
  equal(same.calls.some((c) => c.url.endsWith("/ledgers/9")), false);
  const reset = harness(); reset.ledger.sequence = 9;
  await reject(reset, { ...input(), checkpoint });
});
Deno.test("source rejects unordered/noncanonical/out-of-bounds cursors and stale snapshots without skipping/retry", async () => {
  for (const tokens of [["01"], ["18446744073709551616"], ["0"],
    [String(11n << 32n)], [String(7n << 32n), String(7n << 32n)]]) {
    const h = harness(); h.operations.splice(0, 2, ...tokens.map((paging_token) => ({ ...h.operations[0], paging_token, id: paging_token })));
    await reject(h); equal(h.calls.filter((c) => c.url.includes("/accounts/")).length, 1);
  }
  const reversed = harness(); reversed.operations.reverse(); await reject(reversed);
  const repeated = harness(); await reject(repeated, { ...input(), checkpoint: { ...checkpoint, cursor: repeated.operations[0].paging_token } });
  const huge = harness(); huge.operations.push(...Array(49).fill(huge.operations[0])); await reject(huge);
});
Deno.test("source sanitizes HTTP/body/JSON/parser failures and validates backend context without mutation", async () => {
  for (const response of [() => new Response("secret", { status: 503 }), () => new Response("", { status: 302 }),
    () => new Response("{"), () => new Response(new Uint8Array([255])), () => new Response("x".repeat(1048577)),
    () => new Response(JSON.stringify({ _embedded: { records: null } }))]) {
    const h = harness(); h.override(() => response()); await reject(h); equal(h.calls.length, 1);
  }
  const thrown = harness(); thrown.override(() => { throw new Error("secret"); }); await reject(thrown);
  const badDTO = harness(); badDTO.transaction.successful = false; await reject(badDTO);
  const invalidHash = harness(); invalidHash.operations[0].transaction_hash = "https://evil.invalid"; await reject(invalidHash);
  for (const context of [{ ...input(), pool: "bad" }, { ...input(), firstLedger: 0 },
    { ...input(), checkpoint: { ...checkpoint, extra: true } }, { ...input(), checkpoint: { ...checkpoint, cursor: "01" } }]) {
    const h = harness(); await reject(h, context); equal(h.calls.length, 0);
  }
});
Deno.test("source bounds a stalled body by the fetch/body deadline", async () => {
  const h = harness();
  h.override(() => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } })));
  await reject(h);
  equal(h.calls.length, 1); equal(h.calls[0].init?.signal?.aborted, true);
});
