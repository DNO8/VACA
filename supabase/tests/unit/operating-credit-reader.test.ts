import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { readOperatingCredits } from "../../functions/d1-custody/operating-credit-reader.ts";
import { parseDiscoveredOperation } from "../../functions/d1-custody/discovery.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
const [pool, team, admin, original] = [91, 92, 93, 94].map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
const namespace = "11111111-1111-4111-8111-111111111111", date = "2026-10-27T12:00:00Z", closedAt = Date.parse(date) / 1000, hash = "a".repeat(64);
function equal(a: unknown, b: unknown) {
  const normalize = (v: unknown): unknown => Array.isArray(v) ? v.map(normalize) : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, normalize(x)])) : v;
  if (JSON.stringify(normalize(a)) !== JSON.stringify(normalize(b))) throw new Error("Mismatch " + JSON.stringify([a, b]));
}
function receipt(position: number, creation = false, amount = "1.0000001") {
  const tx = new TransactionBuilder(new Account(team, String(position)), { fee: "100", networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 1 }, memo: Memo.text("D1OPS") }).addOperation(creation ? Operation.createAccount({ destination: pool, startingBalance: amount }) : Operation.payment({ destination: pool, asset: Asset.native(), amount })).build();
  const token = (10n << 32n) + BigInt(position) * 4096n, id = String(token + 1n), txHash = tx.hash().toString("hex");
  const raw = { operation: { id, paging_token: id, transaction_hash: txHash, transaction_successful: true, source_account: team, created_at: date,
    ...(creation ? { type: "create_account", type_i: 0, funder: team, account: pool, starting_balance: amount } : { type: "payment", type_i: 1, from: team, to: pool, amount, asset_type: "native" }) },
    transaction: { hash: txHash, paging_token: String(token), ledger: 10, successful: true, operation_count: 1, created_at: date, envelope_xdr: tx.toXDR() } };
  const record = parseDiscoveredOperation({ ...raw, pool, anchor: { sequence: 10, closedAt } });
  return { kind: "d1_operating_credit_observation", revision: 1, authorized_by: original, observation: { namespace, network: "TESTNET", pool, funder: team,
    operationId: id, transactionHash: txHash, ledger: 10, amountStroops: BigInt(amount.replace(".", "")).toString(), anchor: { sequence: 10, hash, closedAt }, record } };
}
function harness(receipts = [receipt(1, true), receipt(2), receipt(3)]) {
  const discovery = { kind: "d1_discovery_state", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 8, coverage_complete: true,
    checkpoint: { cursor: receipts.at(-1)?.observation.operationId ?? "0", through_ledger: 10, ledger_hash: hash, closed_at: closedAt } };
  const state = { kind: "d1_operating_credit_state", revision: 1, namespace, network: "TESTNET", pool, receipt_count: receipts.length, set_hash: "b".repeat(64), discovery_state: discovery };
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const h = { receipts, discovery, state, calls, mutate: (_name: string, _data: unknown) => {}, error: null as unknown, client: { async rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args }); let data: unknown;
    if (name === "d1_load_discovery_state") data = discovery;
    else if (name === "d1_load_operating_credit_state") data = state;
    else if (name === "d1_load_operating_credit") data = { kind: "d1_operating_credit_lookup", revision: 1, namespace, network: "TESTNET", pool, operation_id: args.p_operation_id, receipt: receipts.find(r => r.observation.operationId === args.p_operation_id) ?? null };
    else if (name === "d1_list_operating_credits") {
      const selected = receipts.filter(r => BigInt(r.observation.operationId) > BigInt(String(args.p_after))).slice(0, 2);
      const next = selected.at(-1)?.observation.operationId ?? String(args.p_after);
      data = { kind: "d1_operating_credits", revision: 1, namespace, network: "TESTNET", pool, from_cursor: args.p_after, next_cursor: next, receipts: selected,
        has_more: receipts.some(r => BigInt(r.observation.operationId) > BigInt(next)), credit_state: state };
    } else throw new Error("unexpected RPC");
    const result = structuredClone(data); h.mutate(name, result); return { data: result, error: h.error };
  } } }; return h;
}
async function reject(work: Promise<unknown>, status = 503) { let e: unknown; try { await work; } catch (error) { e = error; }
  equal(e instanceof CustodyError && e.status === status && e.message === e.code && (status !== 503 || e.code === "operating_credit_unavailable"), true); }
Deno.test("credit reader enumerates all native payment/creation receipts, SDK revalidates and preserves original authorizers", async () => {
  const h = harness(), before = JSON.stringify(h.receipts); const result = await readOperatingCredits(h.client, namespace, admin, pool);
  equal(result.observedCreditStroops, "30000003"); equal(result.receipts, h.receipts); equal(result.state, h.state); equal(JSON.stringify(h.receipts), before);
  equal(h.calls.map(c => c.name), ["d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit", "d1_load_operating_credit", "d1_list_operating_credits", "d1_load_operating_credit", "d1_load_operating_credit_state"]);
  equal(h.calls[2].args, { p_namespace: namespace, p_authorized_by: admin, p_after: "0", p_limit: 100 }); JSON.stringify(result);
});
Deno.test("credit reader accepts only a stable covered explicit empty set and rejects incomplete/oversized sets before pages", async () => {
  const h = harness([]); equal((await readOperatingCredits(h.client, namespace, admin, pool)).observedCreditStroops, "0"); equal(h.calls.length, 4);
  for (const patch of [{ receipt_count: 1001 }, { set_hash: "wrong" }, { namespace: "wrong" }, { pool: team }]) {
    const h = harness(); Object.assign(h.state, patch); await reject(readOperatingCredits(h.client, namespace, admin, pool)); equal(h.calls.length, 2);
  }
  const g = harness(); g.discovery.coverage_complete = false; await reject(readOperatingCredits(g.client, namespace, admin, pool)); equal(g.calls.length, 1);
});
Deno.test("credit reader rejects page/final state changes and original receipt substitutions without retry", async () => {
  for (const target of ["d1_list_operating_credits", "d1_load_operating_credit_state", "d1_load_operating_credit"]) {
    const h = harness(); let states = 0; h.mutate = (name, data) => {
      if (name === "d1_load_operating_credit_state") states++;
      if (name !== target || (name === "d1_load_operating_credit_state" && states === 1)) return;
      if (name === "d1_list_operating_credits") (data as { credit_state: typeof h.state }).credit_state.set_hash = "c".repeat(64);
      else if (name === "d1_load_operating_credit_state") (data as typeof h.state).set_hash = "c".repeat(64);
      else (data as { receipt: ReturnType<typeof receipt> }).receipt.authorized_by = admin;
    };
    await reject(readOperatingCredits(h.client, namespace, admin, pool)); equal(h.calls.length, target === "d1_list_operating_credits" ? 3 : target === "d1_load_operating_credit" ? 4 : 8);
  }
});
Deno.test("credit reader rejects omissions, duplicates, cursor aliases and non-JSON pages before lookups", async () => {
  for (const change of [(p: Record<string, unknown>) => { p.receipts = []; }, (p: Record<string, unknown>) => { p.has_more = false; },
    (p: Record<string, unknown>) => { p.next_cursor = "0"; }, (p: Record<string, unknown>) => { p.from_cursor = "1"; },
    (p: Record<string, unknown>) => { const r = p.receipts as ReturnType<typeof receipt>[]; r[1] = r[0]; },
    (p: Record<string, unknown>) => { Object.defineProperty(p, "receipts", { enumerable: true, get() { throw new Error("private"); } }); }]) {
    const h = harness(), before = JSON.stringify(h.receipts); h.mutate = (name, data) => { if (name === "d1_list_operating_credits") change(data as Record<string, unknown>); };
    await reject(readOperatingCredits(h.client, namespace, admin, pool)); equal(h.calls.some(c => c.name.startsWith("d1_record")), false); equal(JSON.stringify(h.receipts), before);
  }
});
Deno.test("credit reader rejects SDK amount mismatch, future/original scope and sum overflow, preserving receipts", async () => {
  for (const change of [(r: ReturnType<typeof receipt>) => { r.observation.amountStroops = "2"; }, (r: ReturnType<typeof receipt>) => { r.observation.anchor.sequence = 11; },
    (r: ReturnType<typeof receipt>) => { r.observation.anchor.hash = "d".repeat(64); }, (r: ReturnType<typeof receipt>) => { r.observation.ledger = 7; }]) {
    const h = harness(); change(h.receipts[0]); const before = JSON.stringify(h.receipts); await reject(readOperatingCredits(h.client, namespace, admin, pool)); equal(JSON.stringify(h.receipts), before);
  }
  const maximum = harness([receipt(1, false, "922337203685.4775807")]); equal((await readOperatingCredits(maximum.client, namespace, admin, pool)).observedCreditStroops, "9223372036854775807");
  const overflow = harness([receipt(1, false, "922337203685.4775807"), receipt(2, false, "0.0000001")]); await reject(readOperatingCredits(overflow.client, namespace, admin, pool));
});
Deno.test("credit reader preserves admin denial and sanitizes dependency errors without write/provider/retry", async () => {
  for (const error of [{ message: "unauthorized_admin_wallet" }, { message: "private" }, { get message() { throw new Error("private"); } }]) {
    const h = harness(); h.error = error; await reject(readOperatingCredits(h.client, namespace, admin, pool), Object.getOwnPropertyDescriptor(error, "message")?.value === "unauthorized_admin_wallet" ? 403 : 503); equal(h.calls.length, 1);
  }
});
