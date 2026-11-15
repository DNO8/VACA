import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { captureRefundReadClient, observeSavedRefundAccount, validateRefundAccountBinding } from "../../functions/d1-custody/refund-account-observation.ts";
import type { RefundCandidateClient, RefundCandidateReceipt } from "../../functions/d1-custody/refund-candidate-journal.ts";
import type { TransactionHistoryState } from "../../functions/d1-custody/transaction-ingestion.ts";
import type { PoolAccountObservation } from "../../functions/d1-custody/discovery-source.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
const pool = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 41)).publicKey(), actor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 42)).publicKey();
const namespace = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222", ledgerHash = "a".repeat(64);
function equal(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(JSON.stringify({ actual: a, expected: b })); }
function snapshot(value: unknown) {
  const seen = new Set<object>(), checks: (() => void)[] = [];
  function visit(v: unknown) {
    if (v === null || typeof v !== "object" || seen.has(v)) return; seen.add(v);
    const proto = Object.getPrototypeOf(v), keys = Reflect.ownKeys(v), ds = Object.getOwnPropertyDescriptors(v);
    checks.push(() => { equal(Object.getPrototypeOf(v) === proto, true); equal(Reflect.ownKeys(v), keys);
      for (const k of keys) { const a = Object.getOwnPropertyDescriptor(v, k)!, b = Object.getOwnPropertyDescriptor(ds, k)!.value as PropertyDescriptor;
        equal([a.enumerable, a.configurable, a.writable, Object.is(a.value, b.value), a.get === b.get, a.set === b.set], [b.enumerable, b.configurable, b.writable, true, true, true]); }
    });
    Object.values(ds).forEach(d => { if ("value" in d) visit(d.value); });
  }
  visit(value); return () => checks.forEach(check => check());
}
function input() {
  const tx = new TransactionBuilder(new Account(pool, "3"), { fee: "100", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 1000, maxTime: 1100 } })
    .addOperation(Operation.payment({ destination: actor, asset: Asset.native(), amount: "1" })).build();
  const candidate: RefundCandidateReceipt = { kind: "d1_refund_candidate", revision: 1, request_id: requestId, namespace, network: "TESTNET", pool,
    authorized_by: actor, initial_transaction_hash: "b".repeat(64), initial_outcome_hash: "c".repeat(64), source_sequence: "3", transaction_sequence: "4",
    deadline: "1970-01-01T00:16:40Z", unsigned_xdr: tx.toXDR(), transaction_hash: tx.hash().toString("hex") };
  const checkpoint = { cursor: ((10n << 32n) + 4096n).toString(), through_ledger: 10, ledger_hash: ledgerHash, closed_at: 1010 };
  const history: TransactionHistoryState = { kind: "d1_transaction_history_state", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 1,
    income_state: { kind: "d1_discovery_state", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 1,
      checkpoint: { ...checkpoint, cursor: (BigInt(checkpoint.cursor) + 1n).toString() }, coverage_complete: true },
    checkpoint, coverage_complete: true, page_count: 1, record_count: 1 };
  const account: PoolAccountObservation = { pool, networkPassphrase: Networks.TESTNET, anchor: { sequence: 10, hash: ledgerHash, closedAt: 1010 },
    baseFee: "100", baseReserve: "5000000", sequence: "3", lastModifiedLedger: 9, native: { balance: "100000000", sellingLiabilities: "0" },
    issuedBalances: [{ code: "USD", issuer: actor, balance: "0", sellingLiabilities: "0" }], account: { subentry_count: 1, num_sponsoring: 0, num_sponsored: 0 } };
  return { candidate, history, account, timing: { startedAt: 1020, observedAt: 1021, maximumAgeSeconds: 30, futureToleranceSeconds: 2 } };
}
function run(v: ReturnType<typeof input>) { return validateRefundAccountBinding(v.candidate, v.history, v.account, v.timing); }
async function unavailable(action: () => unknown) {
  let caught: unknown; try { await action(); } catch (e) { caught = e; }
  equal(caught instanceof CustodyError, true); const e = caught as CustodyError;
  equal([Object.getPrototypeOf(e) === CustodyError.prototype, e.code, e.message, e.status], [true, "refund_account_observation_unavailable", "refund_account_observation_unavailable", 503]);
}
function detached(a: unknown, b: unknown, frozen = false) {
  if (a === null || typeof a !== "object") return;
  equal(a === b, false); if (frozen) equal(Object.isFrozen(a), true);
  Object.entries(a).forEach(([k, child]) => detached(child, (b as Record<string, unknown>)[k], frozen));
}
Deno.test("recovery binding returns detached deep-frozen account without changing inputs", () => {
  const v = input(), unchanged = snapshot(v), result = run(v); equal(result, v.account); detached(result, v.account, true); unchanged();
  v.account.native.balance = "1"; equal(result.native.balance, "100000000");
});
Deno.test("recovery binding denies scope, sequence, network, ledger hash and incomplete history", async () => {
  const changes: ((v: ReturnType<typeof input>) => void)[] = [v => Object.assign(v.candidate, { transaction_sequence: "5" }),
    v => { v.account.sequence = "4"; }, v => Object.assign(v.candidate, { network: "PUBLIC" }), v => Object.assign(v.account, { networkPassphrase: Networks.PUBLIC }),
    v => { v.history.namespace = requestId; }, v => { v.account.pool = actor; }, v => { v.account.anchor.hash = "d".repeat(64); },
    v => { v.history.income_state.checkpoint!.ledger_hash = "d".repeat(64); }, v => { v.history.coverage_complete = false; }, v => { v.history.income_state.coverage_complete = false; }];
  for (const change of changes) { const v = input(); change(v); const unchanged = snapshot(v); await unavailable(() => run(v)); unchanged(); }
});
Deno.test("recovery binding enforces inclusive 30s age and 2s future bounds, deadline and exclusive maxTime", async () => {
  for (const [closed, start, observed, accepted] of [[1010, 1020, 1040, true], [1010, 1020, 1041, false], [1010, 1008, 1008, true],
    [1010, 1007, 1007, false], [1000, 1000, 1000, true], [1000, 999, 1000, false], [1099, 1099, 1099, true], [1099, 1099, 1100, false], [1100, 1100, 1100, false]] as const) {
    const v = input(); v.account.anchor.closedAt = v.history.checkpoint!.closed_at = v.history.income_state.checkpoint!.closed_at = closed;
    Object.assign(v.timing, { startedAt: start, observedAt: observed }); const unchanged = snapshot(v);
    if (accepted) { const result = run(v); equal(result, v.account); detached(result, v.account, true); } else await unavailable(() => run(v)); unchanged();
  }
  for (const patch of [{ maximumAgeSeconds: 31 }, { futureToleranceSeconds: 3 }, { observedAt: 1019 }]) {
    const v = input(); Object.assign(v.timing, patch); const unchanged = snapshot(v); await unavailable(() => run(v)); unchanged();
  }
});
function malformed() {
  let hooks = 0; const getter = Object.defineProperty({}, "value", { enumerable: true, get() { hooks++; return 1; } });
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  return { values: [getter, cycle, new Array(1), { toJSON() { hooks++; return {}; }, valueOf() { hooks++; return 1; } }], hooks: () => hooks };
}
Deno.test("recovery binding rejects getters, cycles, sparse arrays and coercion hooks without invoking them", async () => {
  const bad = malformed();
  for (const value of bad.values) { const v = input(); Object.assign(v.account, { issuedBalances: value }); const unchanged = snapshot(v);
    await unavailable(() => run(v)); unchanged(); equal(bad.hooks(), 0); }
});
const reads = ["d1_load_refund_candidate", "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
  "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_issuance_fee_commitments", "d1_load_active_issuance_sequence",
  "d1_load_transaction_history_state", "d1_list_transaction_records", "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit"];
type Reply = Awaited<ReturnType<RefundCandidateClient["rpc"]>>;
function transport() {
  const state = { names: [] as string[], writes: 0, reply: { data: { value: 7 }, error: null } as Reply, failure: false };
  class Client {
    #marker = "captured";
    async rpc(name: string, parameters: Record<string, unknown>): Promise<Reply> {
      equal(this.#marker, "captured"); state.names.push(name); if (!reads.includes(name)) state.writes++;
      if (state.failure) throw new CustodyError("unauthorized_admin_wallet", 403);
      if (parameters.nested) (parameters.nested as { value: number }).value = 9;
      return state.reply;
    }
  }
  return { state, client: new Client() };
}
Deno.test("recovery facade captures receiver, forwards all fourteen reads, detaches data and blocks mutators before callback", async () => {
  const { state, client } = transport(), stable = snapshot(client), facade = captureRefundReadClient(client); stable();
  equal([Object.isFrozen(facade), facade === client, state.names.length], [true, false, 0]);
  let replacements = 0; client.rpc = async () => { replacements++; throw Error("replacement"); };
  const parameters = { nested: { value: 1 } }, unchanged = snapshot(parameters), replyUnchanged = snapshot(state.reply);
  for (const name of reads) { const reply = await facade.rpc(name, parameters); equal(reply, state.reply); detached(reply, state.reply); unchanged(); replyUnchanged(); }
  equal(state.names, reads);
  for (const name of ["d1_record_refund_candidate", "d1_record_transaction_page", "d1_record_fresh_initial_financial_observation", "d1_release_issuance_sequence", "d1_load_unknown"]) {
    await unavailable(() => facade.rpc(name, parameters)); equal(state.names, reads); unchanged(); replyUnchanged(); equal([state.writes, replacements], [0, 0]);
  }
});
Deno.test("recovery facade rejects unsafe params/replies and rpc getters without hooks or extra callbacks", async () => {
  const bad = malformed(), { state, client } = transport(), facade = captureRefundReadClient(client);
  for (const value of bad.values) {
    const parameters = { nested: value }, unchanged = snapshot(parameters), before = state.names.length;
    await unavailable(() => facade.rpc(reads[0], parameters)); unchanged(); equal(state.names.length, before);
    state.reply = { data: value, error: null }; const replyUnchanged = snapshot(state.reply);
    await unavailable(() => facade.rpc(reads[0], {})); replyUnchanged(); equal(state.names.length, before + 1); equal([state.writes, bad.hooks()], [0, 0]);
  }
  let getters = 0; const accessor = Object.defineProperty({}, "rpc", { get() { getters++; return client.rpc; } }), unchanged = snapshot(accessor);
  const before = state.names.length; await unavailable(() => captureRefundReadClient(accessor as RefundCandidateClient)); unchanged(); equal([getters, state.names.length], [0, before]);
});
Deno.test("recovery facade preserves DB denial as detached data but sanitizes thrown forged403 to503", async () => {
  const { state, client } = transport(), facade = captureRefundReadClient(client);
  state.reply = { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
  const unchanged = snapshot(state.reply), parameters = { p_request_id: requestId }, argsUnchanged = snapshot(parameters);
  const reply = await facade.rpc(reads[0], parameters); equal(reply, state.reply); detached(reply, state.reply); unchanged(); argsUnchanged();
  state.failure = true; await unavailable(() => facade.rpc(reads[0], parameters)); unchanged(); argsUnchanged(); equal(state.names, [reads[0], reads[0]]); equal(state.writes, 0);
});
Deno.test("recovery observer rejects null candidate before injected account source with no writes or retries", async () => {
  const scope = { namespace, pool, requestId, authenticatedAdmin: actor }, { state, client } = transport(); let clocks = 0, accounts = 0;
  state.reply = { data: { kind: "d1_refund_candidate_lookup", revision: 1, request_id: requestId, namespace, network: "TESTNET", pool, candidate: null, active_request_id: null }, error: null };
  const options = { now() { clocks++; return 1020; }, maximumAgeSeconds: 30, futureToleranceSeconds: 2,
    source: { async readAccountAtCheckpoint() { accounts++; return input().account; } } };
  const unchanged = snapshot({ scope, options, reply: state.reply });
  await unavailable(() => observeSavedRefundAccount(client, scope, options)); unchanged(); equal(state.names, [reads[0]]); equal([clocks, accounts, state.writes], [2, 0, 0]);
});
