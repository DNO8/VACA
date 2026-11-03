import { Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { withInitialFinancialAuthorization } from "../../functions/d1-custody/initial-financial-authorization.ts";
import { fixture, equal, pool, admin, team, closedAt } from "../fixtures/initial-financial-authorization.ts";
type Row = Record<string, any>;
const fresh = "d1_record_fresh_initial_financial_observation";
function harness() {
  const f = fixture(), actions: unknown[] = [];
  return { ...f, actions, run: (client = f.h.client) => withInitialFinancialAuthorization(client, f.configuration, (value: unknown) => { actions.push(value); return "accepted"; }) };
}
async function reject(f: ReturnType<typeof harness>, saved = false, status = 503, client = f.h.client) {
  const before = JSON.stringify([f.h.owner, f.h.history, f.h.credit]); let caught: unknown;
  try { await f.run(client); } catch (e) { caught = e; }
  const code = status === 403 ? "unauthorized_admin_wallet" : "initial_financial_authorization_unavailable";
  equal(caught instanceof CustodyError ? [caught.code, caught.status, caught.message] : caught, [code, status, code]);
  equal(f.actions.length, 0); equal(JSON.stringify([f.h.owner, f.h.history, f.h.credit]), before);
  equal(f.h.persisted.size, saved ? 1 : 0); equal(f.h.calls.filter(c => c === fresh).length, saved ? 1 : 0);
  equal(f.h.calls.every(c => c === "account" || c.startsWith("d1_load_") || c.startsWith("d1_list_") || c === fresh), true);
  if (saved) equal(f.h.calls.at(-1), fresh); // No readback/retry/release after an uncertain write.
}
Deno.test("financial action awaits one durable fresh response and binds exact validated unsigned bytes", async () => {
  const f = harness(), arrived = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let bytes = "";
  f.h.mutate = (name, data, count) => { if (name === "d1_load_unsigned_transaction" && count === 3) bytes = (data as Row).transaction.unsigned_xdr; };
  f.h.beforeResponse = async name => { if (name === fresh) { arrived.resolve(); await release.promise; } };
  const attempt = f.run(); attempt.catch(() => {});
  try { await Promise.race([arrived.promise, attempt.then(() => { throw Error("Premature completion"); })]); equal(f.actions.length, 0); equal(f.h.persisted.size, 1); }
  finally { release.resolve(); }
  equal(await attempt, "accepted"); equal(f.actions.length, 1); const result = f.actions[0] as Row;
  equal(result.unsignedXdr, bytes); equal(result.transactionHash, TransactionBuilder.fromXDR(bytes, Networks.TESTNET).hash().toString("hex"));
  equal(result.receipt.transaction_hash, result.transactionHash); equal(result.snapshot, result.receipt.observation.snapshot);
  equal(result.snapshot.pool, pool); equal(result.receipt.authorized_by, admin); equal(f.h.calls.filter(c => c === fresh).length, 1);
  const rotated = harness(); rotated.h.observationAuthorizer = team; await rotated.run(); equal((rotated.actions[0] as Row).receipt.observation.authorized_by, team);
});
Deno.test("financial action refuses missing SDK facts or changed historical journal without any new ownership or save", async () => {
  const debt = harness(); debt.h.account.native.balance = "100000001"; await reject(debt);
  const missing = harness(); missing.h.owner.commitment = null as never; missing.h.owner.commitments = []; await reject(missing);
  for (const field of ["unsigned_xdr", "transaction_hash", "transaction"] as const) {
    const f = harness(); f.h.mutate = (name, data, count) => { if (name !== "d1_load_unsigned_transaction" || count !== 3) return;
      if (field === "transaction") (data as Row).transaction = null; else (data as Row).transaction[field] = field === "unsigned_xdr" ? "AAAA" : "0".repeat(64);
    }; await reject(f);
  }
});
Deno.test("financial action rejects substituted response scope actor bytes snapshot fees and validation timestamps", async () => {
  const changes: ((r: Row) => void)[] = [r => { r.kind = "foreign"; }, r => { r.revision = 2; }, r => { r.request_id = "foreign"; }, r => { r.namespace = "foreign"; },
    r => { r.network = "PUBLIC"; }, r => { r.pool = team; }, r => { r.authorized_by = team; }, r => { r.transaction_hash = "0".repeat(64); }, r => { r.snapshot_hash = "bad"; },
    r => { r.expires_at++; }, r => { r.validated_at += 3; }, r => { r.observation.transaction_hash = "0".repeat(64); }, r => { r.observation.snapshot_hash = "f".repeat(64); },
    r => { r.observation.authorized_by = "not-a-key"; }, r => { r.observation.snapshot.obligations.nativeDonorLiabilityStroops = "0"; }, r => { r.observation.snapshot.budget.otherFutureFees = "0"; }];
  for (const change of changes) { const f = harness(); f.h.mutate = (name, data) => { if (name === fresh) change(data as Row); }; await reject(f, true); }
  const f = harness(), original = f.h.client.rpc;
  await reject(f, true, 503, { async rpc(name: string, args: Record<string, unknown>) {
    if (name === fresh) (args.p_snapshot as Row).budget.remainingOperating = "0"; return await original(name, args);
  } }); // A provider cannot mutate the separate expected SDK facts through its argument.
});
Deno.test("financial action retains possible persisted evidence on lost responses without retry or readback", async () => {
  const f = harness(); f.h.mutate = name => { if (name === fresh) f.h.error = { code: "XX000", message: "SECRET provider" }; }; await reject(f, true);
  const thrown = harness(); thrown.h.beforeResponse = async name => { if (name === fresh) throw new CustodyError("unauthorized_admin_wallet", 403); }; await reject(thrown, true);
});
Deno.test("financial action checks monotonic freshness after acknowledged save and never retries a failed callback", async () => {
  for (const now of [closedAt + 31, closedAt + 1]) { const f = harness(); f.h.beforeResponse = async name => { if (name === fresh) f.h.now = now; }; await reject(f, true); }
  const beforeSave = harness(); beforeSave.h.mutate = (name, _data, count) => { if (name === "d1_load_unsigned_transaction" && count === 3) beforeSave.h.now--; }; await reject(beforeSave);
  const f = harness(), failure = new Error("action failed"); let count = 0, caught: unknown;
  try { await withInitialFinancialAuthorization(f.h.client, f.configuration, () => { count++; throw failure; }); } catch (e) { caught = e; }
  equal(caught === failure, true); equal(count, 1); equal(f.h.persisted.size, 1); equal(f.h.calls.at(-1), fresh); equal(f.h.calls.filter(c => c === fresh).length, 1);
});
Deno.test("financial action preserves only explicit database admin denial and rejects unsafe transport objects", async () => {
  const denied = harness(); denied.h.error = { code: "42501", message: "unauthorized_admin_wallet" }; await reject(denied, false, 403);
  const forged = harness(); forged.h.beforeResponse = async () => { throw new CustodyError("unauthorized_admin_wallet", 403); }; await reject(forged);
  const changes: ((r: Row) => void)[] = [r => { r.observation.snapshot.unissuedRefundOperationIds = Array(2); }, r => { r.self = r; },
    r => { r.alias = r.observation; }, r => { Object.setPrototypeOf(r.observation, Date.prototype); }, r => { r.extra = "X".repeat(2097153); }];
  for (const change of changes) { const f = harness(); f.h.mutate = (name, data) => { if (name === fresh) change(data as Row); }; await reject(f, true); }
  const getter = harness(); let invoked = false; getter.h.mutate = (name, data) => { if (name === fresh) Object.defineProperty((data as Row).observation.snapshot, "pool", { enumerable: true, get() { invoked = true; throw Error("SECRET"); } }); };
  await reject(getter, true); equal(invoked, false);
});
