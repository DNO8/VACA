import { Keypair } from "@stellar/stellar-sdk";
import { DiscoveryDatabase, ingestDiscoveryPage } from "../../functions/d1-custody/discovery-ingestion.ts";
import { type DiscoveryPage } from "../../functions/d1-custody/discovery-source.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
const namespace = "11111111-1111-1111-1111-111111111111";
const admin = Keypair.random().publicKey(), pool = Keypair.random().publicKey();
const hash = "a".repeat(64);
const checkpoint = { cursor: "0", through_ledger: 8, ledger_hash: hash, closed_at: 10 };
const state = () => ({ kind: "d1_discovery_state", revision: 1, namespace, network: "TESTNET", pool,
  first_ledger: 8, checkpoint: null, coverage_complete: false });
const page = (): DiscoveryPage => ({ revision: 1, from_cursor: "0", to_cursor: "0", through_ledger: 8,
  ledger_hash: hash, closed_at: 10, records: [] });
const receipt = (p = page()) => ({ kind: "d1_discovery_page", revision: 1, namespace, network: "TESTNET", pool,
  from_cursor: p.from_cursor, to_cursor: p.to_cursor, checkpoint_ledger: p.through_ledger,
  checkpoint_hash: p.ledger_hash, page_count: 1, record_count: p.records.length });
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("mismatch: " + JSON.stringify([a, b]));
}
async function rejects(fn: () => unknown, code = "dependency_unavailable", status = 503) {
  let error; try { await fn(); } catch (e) { error = e; }
  equal(error instanceof CustodyError, true);
  equal([(error as CustodyError).code, (error as CustodyError).message, (error as CustodyError).status], [code, code, status]);
}
function harness() {
  const calls: unknown[] = [];
  let load: unknown = state(), save: unknown = receipt(), failure: unknown = null;
  const db = new DiscoveryDatabase({ rpc(name, args) {
    calls.push([name, args]);
    return Promise.resolve({ data: name === "d1_load_discovery_state" ? load : save, error: failure });
  } }, namespace, admin);
  return { db, calls, load(v: unknown) { load = v; }, save(v: unknown) { save = v; }, error(v: unknown) { failure = v; } };
}
Deno.test("adapter pins exact RPC allowlists and accepts canonical state/receipt boundaries", async () => {
  const h = harness(); equal(await h.db.loadState(), state()); equal(await h.db.recordPage(pool, page()), receipt());
  equal(h.calls, [["d1_load_discovery_state", { p_namespace: namespace, p_authorized_by: admin }],
    ["d1_record_discovery_page", { p_namespace: namespace, p_authorized_by: admin, p_page: page() }]]);
  const bounded = { ...checkpoint, cursor: "18446744073709551615", through_ledger: 4294967295, closed_at: 253402300799 };
  h.load({ ...state(), checkpoint: bounded, coverage_complete: true });
  equal((await h.db.loadState()).checkpoint, bounded);
});
Deno.test("adapter rejects malformed states before source/write, including prototype and scalar coercion", async () => {
  const patches = [{ revision: "1" }, { kind: "wrong" }, { namespace: namespace.toUpperCase() + "x" },
    { network: "PUBLIC" }, { pool: "bad" }, { first_ledger: 0 }, { first_ledger: 4294967296 },
    { coverage_complete: 1 }, { coverage_complete: true }, { extra: true },
    ...["01", "18446744073709551616", 0].map((cursor) => ({ checkpoint: { ...checkpoint, cursor } })),
    ...[{ through_ledger: 0 }, { ledger_hash: "A".repeat(64) }, { closed_at: -1 }, { closed_at: 253402300800 },
      { extra: true }].map((p) => ({ checkpoint: { ...checkpoint, ...p } }))];
  for (const value of [null, [], Object.create(state()), ...patches.map((p) => ({ ...state(), ...p }))]) {
    const h = harness(); h.load(value); let reads = 0;
    await rejects(() => ingestDiscoveryPage(h.db, { async readPage() { reads++; return { page: page(), complete: true }; } }));
    equal(reads, 0); equal(h.calls.length, 1);
  }
});
Deno.test("adapter validates every receipt binding and exact shape before returning", async () => {
  for (const patch of [{ kind: "wrong" }, { revision: "1" }, { namespace: "other" }, { network: "PUBLIC" },
    { pool: admin }, { from_cursor: "1" }, { to_cursor: "1" }, { checkpoint_ledger: 9 },
    { checkpoint_hash: "b".repeat(64) }, { record_count: 1 }, { page_count: 0 }, { page_count: "1" },
    { page_count: Number.MAX_SAFE_INTEGER + 1 }, { extra: true }]) {
    const h = harness(); h.save({ ...receipt(), ...patch }); await rejects(() => h.db.recordPage(pool, page())); equal(h.calls.length, 1);
  }
});
Deno.test("adapter maps only own known string errors and sanitizes exceptions/malformed responses", async () => {
  for (const [message, status] of [["unauthorized_admin_wallet", 403], ["pool_not_activated", 422], ["discovery_conflict", 409]] as const) {
    const h = harness(); h.error({ message }); await rejects(() => h.db.loadState(), message, status);
    await rejects(() => h.db.recordPage(pool, page()), message, status);
  }
  for (const error of [{ message: "secret" }, { message: "toString" }, { message: { toString: () => "discovery_conflict" } },
    Object.create({ message: "discovery_conflict" }), {}, "secret"]) {
    const h = harness(); h.error(error); await rejects(() => h.db.loadState());
  }
  for (const result of [null, [], {}, Object.create({ data: state(), error: null }), { data: state(), error: undefined }]) {
    const db = new DiscoveryDatabase({ rpc: () => Promise.resolve(result as never) }, namespace, admin);
    await rejects(() => db.loadState());
  }
  const db = new DiscoveryDatabase({ rpc() { throw new Error("secret"); } }, namespace, admin);
  await rejects(() => db.loadState());
});
Deno.test("coordinator loads then reads server context then awaits one durable matching receipt", async () => {
  const order: string[] = []; let resolve!: (v: { data: unknown; error: null }) => void;
  const db = new DiscoveryDatabase({ rpc(name) {
    order.push(name); return name === "d1_load_discovery_state" ? Promise.resolve({ data: state(), error: null }) :
      new Promise((r) => { resolve = r; });
  } }, namespace, admin);
  let done = false;
  const pending = ingestDiscoveryPage(db, { async readPage(context) {
    order.push("source"); equal(context, { pool, firstLedger: 8, checkpoint: null }); return { page: page(), complete: true };
  } }).then((r) => { done = true; return r; });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  equal(order, ["d1_load_discovery_state", "source", "d1_record_discovery_page"]); equal(done, false);
  resolve({ data: receipt(), error: null });
  equal(await pending, { receipt: receipt(), anchor: checkpoint, completeAtAnchor: true });
});
Deno.test("coordinator rejects source cursor/anchor/completion contradictions without writing", async () => {
  for (const patch of [{ from_cursor: "1" }, { to_cursor: "01" }, { through_ledger: 7 },
    { ledger_hash: "b".repeat(64) }, { closed_at: 11 }, { closed_at: 9 }, { revision: 2 }]) {
    const h = harness(); h.load({ ...state(), checkpoint });
    await rejects(() => ingestDiscoveryPage(h.db, { async readPage() { return { page: { ...page(), ...patch } as DiscoveryPage, complete: true }; } }));
    equal(h.calls.length, 1);
  }
  const h = harness();
  await rejects(() => ingestDiscoveryPage(h.db, { async readPage() { return { page: page(), complete: false }; } }));
  equal(h.calls.length, 1);
  await rejects(() => ingestDiscoveryPage(h.db, { async readPage() { throw new Error("secret"); } }));
});
Deno.test("adapter rejects invalid bindings and malformed pages without invoking RPC", async () => {
  let calls = 0;
  const client = { rpc() { calls++; return Promise.resolve({ data: null, error: null }); } };
  for (const [ns, identity] of [[namespace.toUpperCase() + "x", admin], [namespace, "bad"]]) {
    await rejects(() => new DiscoveryDatabase(client, ns, identity));
  }
  const db = new DiscoveryDatabase(client, namespace, admin);
  for (const patch of [{ from_cursor: "01" }, { to_cursor: "18446744073709551616" },
    { through_ledger: 4294967296 }, { ledger_hash: "bad" }, { closed_at: 0.1 }, { records: null }]) {
    await rejects(() => db.recordPage(pool, { ...page(), ...patch } as DiscoveryPage));
  }
  equal(calls, 0);
});
Deno.test("coordinator sanitizes unsnapshotable source data before any write", async () => {
  const h = harness(), p = page();
  p.to_cursor = String((8n << 32n) + 1n);
  p.records = [{ paging_token: p.to_cursor, ledger: 8, transaction_hash: hash,
    operation_id: p.to_cursor, operation: { invalid: () => "dependency detail" } } as unknown as DiscoveryPage["records"][number]];
  await rejects(() => ingestDiscoveryPage(h.db, { async readPage() {
    return { page: p, complete: false };
  } }));
  equal(h.calls.length, 1);
});
Deno.test("coordinator saves an advancing empty anchor even when prior coverage is complete", async () => {
  const h = harness(); h.load({ ...state(), checkpoint, coverage_complete: true });
  const p = { ...page(), through_ledger: 9, closed_at: 11, ledger_hash: "b".repeat(64) };
  h.save(receipt(p));
  const result = await ingestDiscoveryPage(h.db, { async readPage(context) {
    equal(context, { pool, firstLedger: 8, checkpoint }); return { page: p, complete: true };
  } });
  equal(result.anchor, { cursor: "0", through_ledger: 9, ledger_hash: "b".repeat(64), closed_at: 11 });
  equal(result.completeAtAnchor, true); equal(h.calls.length, 2);
});
Deno.test("unknown committed save rejects without retry/readback; explicit later invocation resumes", async () => {
  const p = page(); p.to_cursor = String((8n << 32n) + 1n);
  p.records = [{ paging_token: p.to_cursor, ledger: 8, transaction_hash: hash, operation_id: p.to_cursor,
    operation: {} } as DiscoveryPage["records"][number]];
  let saved: typeof checkpoint | null = null, writes = 0, reads = 0;
  const calls: string[] = [];
  const db = new DiscoveryDatabase({ rpc(name, args) {
    calls.push(name);
    if (name === "d1_load_discovery_state") return Promise.resolve({ data: { ...state(), checkpoint: saved }, error: null });
    writes++; const incoming = args.p_page as DiscoveryPage;
    saved = { ...checkpoint, cursor: incoming.to_cursor };
    if (writes === 1) throw new Error("lost response after commit");
    return Promise.resolve({ data: { ...receipt(incoming), page_count: 2 }, error: null });
  } }, namespace, admin);
  const source = { async readPage(context: { checkpoint: typeof saved }) {
    reads++; equal(context.checkpoint, reads === 1 ? null : saved);
    return reads === 1 ? { page: p, complete: false } :
      { page: { ...page(), from_cursor: p.to_cursor, to_cursor: p.to_cursor }, complete: true };
  } };
  await rejects(() => ingestDiscoveryPage(db, source)); equal([writes, reads, calls.length], [1, 1, 2]);
  const result = await ingestDiscoveryPage(db, source);
  equal([writes, reads, calls.length, result.anchor.cursor], [2, 2, 4, p.to_cursor]);
});
