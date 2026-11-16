import { Account, Keypair, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { observeSavedRefundCreation } from "../../functions/d1-custody/refund-creation-observation.ts";
import { observeSavedRefundFunding } from "../../functions/d1-custody/refund-funding-observation.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import type { TransactionHistoryState } from "../../functions/d1-custody/transaction-ingestion.ts";
import type { PoolAccountObservation } from "../../functions/d1-custody/discovery-source.ts";
import type { RefundCandidateClient, RefundCandidateScope } from "../../functions/d1-custody/refund-candidate-journal.ts";
import type { SavedRefundClaimableOptions } from "../../functions/d1-custody/refund-claimable-observation.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";

const [pool, actor, funder] = [81, 82, 83].map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
const namespace = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222";
const hash = "a".repeat(64), closedAt = 1793102400;
const stateRead = "d1_load_transaction_history_state", pageRead = "d1_list_transaction_records", candidateRead = "d1_load_refund_candidate";
type Reply = Awaited<ReturnType<RefundCandidateClient["rpc"]>>;
type Observer = (client: RefundCandidateClient, scope: RefundCandidateScope, options: SavedRefundClaimableOptions) => Promise<unknown>;
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(JSON.stringify({ actual, expected }));
}
// Preserve hostile descriptors without invoking getters, coercion, or serialization hooks.
function preserved(value: unknown) {
  const seen = new Set<object>(), checks: (() => void)[] = [];
  function visit(v: unknown) {
    if (v === null || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    const proto = Object.getPrototypeOf(v), keys = Reflect.ownKeys(v), ds = Object.getOwnPropertyDescriptors(v);
    checks.push(() => {
      equal(Object.getPrototypeOf(v) === proto, true);
      const current = Reflect.ownKeys(v);
      equal(current.length, keys.length); keys.forEach((key, i) => equal(key === current[i], true));
      for (const key of keys) {
        const a = Object.getOwnPropertyDescriptor(v, key)!, b = Object.getOwnPropertyDescriptor(ds, key)!.value as PropertyDescriptor;
        equal([a.enumerable, a.configurable, a.writable, Object.is(a.value, b.value), a.get === b.get, a.set === b.set],
          [b.enumerable, b.configurable, b.writable, true, true, true]);
      }
    });
    Object.values(ds).forEach(d => { if ("value" in d) visit(d.value); });
  }
  visit(value); return () => checks.forEach(check => check());
}
// Real SDK envelope/result decoded through the production parser, not an approved financial DTO.
function creationRecord() {
  const tx = new TransactionBuilder(new Account(funder, "1"), { fee: "500", networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 } }).addOperation(Operation.createAccount({ destination: pool, startingBalance: "10.0000001" })).build();
  const result = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"),
    result: xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(
      xdr.OperationResultTr.createAccount(xdr.CreateAccountResult.createAccountSuccess()))]),
    ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") });
  return parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: { sequence: 9, hash, closedAt } },
    ledger: { sequence: 9, hash, closed_at: "2026-10-27T12:00:00Z" }, transaction: { hash: tx.hash().toString("hex"), ledger: 9,
      created_at: "2026-10-27T12:00:00Z", source_account: funder, source_account_sequence: tx.sequence, fee_account: funder,
      fee_charged: "123", max_fee: tx.fee, successful: true, operation_count: 1,
      paging_token: String((9n << 32n) + 4096n), envelope_xdr: tx.toXDR(), result_xdr: result.toXDR("base64") } });
}
function fixture() {
  const record = creationRecord(), cp = { cursor: record.pagingToken, through_ledger: 9, ledger_hash: hash, closed_at: closedAt };
  const history: TransactionHistoryState = { kind: "d1_transaction_history_state", revision: 1, namespace, network: "TESTNET", pool,
    first_ledger: 8, income_state: { kind: "d1_discovery_state", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 8,
      checkpoint: { ...cp, cursor: String(BigInt(cp.cursor) + 1n) }, coverage_complete: true },
    checkpoint: cp, coverage_complete: true, page_count: 2, record_count: 1 };
  const account: PoolAccountObservation = { pool, networkPassphrase: Networks.TESTNET, anchor: { sequence: 9, hash, closedAt },
    sequence: "2", lastModifiedLedger: 9, baseFee: "100", baseReserve: "5000000", native: { balance: "100000001", sellingLiabilities: "0" },
    issuedBalances: [], account: { subentry_count: 0, num_sponsoring: 0, num_sponsored: 0 } };
  const scope: RefundCandidateScope = { namespace, pool, requestId, authenticatedAdmin: actor };
  const counts = { calls: [] as string[], clocks: 0, accounts: 0, balances: 0, writes: 0, replacements: 0 };
  const replies: Record<string, Reply> = {
    [stateRead]: { data: history, error: null },
    [pageRead]: { data: { kind: "d1_transaction_records", revision: 1, namespace, network: "TESTNET", pool,
      from_cursor: "0", next_cursor: cp.cursor, records: [record], has_more: false, history_state: structuredClone(history) }, error: null },
    [candidateRead]: { data: { kind: "d1_refund_candidate_lookup", revision: 1, request_id: requestId, namespace, network: "TESTNET", pool,
      candidate: null, active_request_id: null }, error: null },
  };
  class Client {
    #marker = "original";
    async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
      equal(this.#marker, "original"); counts.calls.push(name);
      if (!Object.hasOwn(replies, name)) { counts.writes++; throw Error("unexpected capability"); }
      equal(args, name === candidateRead ? { p_request_id: requestId, p_authorized_by: actor } :
        { p_namespace: namespace, p_authorized_by: actor, ...(name === pageRead ? { p_after: "0", p_limit: 100 } : {}) });
      return replies[name];
    }
  }
  class Source {
    #marker = "original";
    async readAccountAtCheckpoint(context: unknown): Promise<PoolAccountObservation> {
      equal(this.#marker, "original"); counts.accounts++;
      equal(context, { pool, firstLedger: 8, checkpoint: history.income_state.checkpoint }); return account;
    }
    async readClaimableBalance(): Promise<never> { equal(this.#marker, "original"); counts.balances++; throw Error("unexpected balance read"); }
  }
  const source = new Source();
  const options = { now() { equal(this === options, true); counts.clocks++; return closedAt; }, maximumAgeSeconds: 30, futureToleranceSeconds: 2, source };
  return { scope, counts, history, account, replies, options, client: new Client() };
}
type Fixture = ReturnType<typeof fixture>;
function counters(f: Fixture, calls: string[], clocks: number, accounts = 0) {
  equal(f.counts, { calls, clocks, accounts, balances: 0, writes: 0, replacements: 0 });
}
function exactError(error: unknown, code: string, status: number) {
  equal(error instanceof CustodyError, true);
  const e = error as CustodyError;
  equal([Object.getPrototypeOf(e) === CustodyError.prototype, e.code, e.message, e.status], [true, code, code, status]);
}
async function rejected(observe: Observer, f: Fixture, code: string, status = 503) {
  const unchanged = preserved({ scope: f.scope, options: f.options, replies: f.replies, account: f.account, client: f.client });
  let caught: unknown;
  try { await observe(f.client, f.scope, f.options); } catch (error) { caught = error; }
  exactError(caught, code, status); unchanged();
}
const throughCreation = [stateRead, pageRead, stateRead, stateRead];
for (const [label, observe] of [["creation", observeSavedRefundCreation], ["funding", observeSavedRefundFunding]] as const) {
  const unavailable = `refund_${label}_observation_unavailable`;
  Deno.test(`${label} recovery: real SDK creation reaches null candidate with read-only calls and no retry`, async () => {
    const f = fixture(); await rejected(observe, f, unavailable);
    counters(f, [...throughCreation, candidateRead], 5, 1);
  });
  Deno.test(`${label} recovery: trusted initial/later denial is exact403, unknown/forged errors exact503`, async () => {
    for (const read of [stateRead, candidateRead]) {
      const f = fixture(); f.replies[read] = { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
      await rejected(observe, f, "unauthorized_admin_wallet", 403);
      counters(f, read === stateRead ? [stateRead] : [...throughCreation, candidateRead], read === stateRead ? 1 : 4, read === stateRead ? 0 : 1);
    }
    for (const reply of [{ data: null, error: null }, { data: {}, error: null },
      { data: null, error: { message: "private SQL detail" } }, { data: null, error: { message: "unauthorized_admin_wallet extra" } }]) {
      const f = fixture(); f.replies[stateRead] = reply; await rejected(observe, f, unavailable); counters(f, [stateRead], 1);
    }
    for (const error of [new CustodyError("unauthorized_admin_wallet", 403), Error("private transport detail")]) {
      const f = fixture(); const original = f.client.rpc;
      f.client.rpc = async function(name, args) { await original.call(this, name, args); throw error; };
      await rejected(observe, f, unavailable); counters(f, [stateRead], 1);
    }
  });
  Deno.test(`${label} recovery: provider forged403 and unknown account cannot become trusted denial`, async () => {
    for (const error of [new CustodyError("unauthorized_admin_wallet", 403), Error("private provider detail")]) {
      const f = fixture(); const original = f.options.source.readAccountAtCheckpoint;
      f.options.source.readAccountAtCheckpoint = async function(context) { await original.call(this, context); throw error; };
      await rejected(observe, f, unavailable); counters(f, [stateRead, pageRead, stateRead], 1, 1);
    }
    for (const value of [null, {}, { ...fixture().account, pool: actor }]) {
      const f = fixture(); const original = f.options.source.readAccountAtCheckpoint;
      f.options.source.readAccountAtCheckpoint = async function(context) { await original.call(this, context); return value as PoolAccountObservation; };
      await rejected(observe, f, unavailable); counters(f, [stateRead, pageRead, stateRead], 1, 1);
    }
  });
  Deno.test(`${label} recovery: getter/descriptors preserved, no hooks or capabilities evaluated`, async () => {
    let hooks = 0;
    for (const target of ["rpc", "readAccountAtCheckpoint", "readClaimableBalance", "now", "source", "maximumAgeSeconds", "futureToleranceSeconds", "namespace", "requestId", "pool", "authenticatedAdmin"]) {
      const f = fixture();
      const receiver = target === "rpc" ? f.client : target.startsWith("read") ? f.options.source : Object.hasOwn(f.options, target) ? f.options : f.scope;
      Object.defineProperty(receiver, target, { enumerable: true, configurable: true, get() { hooks++; throw Error("private getter"); } });
      await rejected(observe, f, unavailable); counters(f, [], 0);
    }
    for (const target of ["scope", "options", "account", "reply"] as const) {
      const f = fixture(); const receiver = target === "scope" ? f.scope : target === "options" ? f.options : target === "account" ? f.account : f.replies[stateRead];
      Object.defineProperty(receiver, "hidden", { value: 1, enumerable: false });
      await rejected(observe, f, unavailable);
      counters(f, target === "account" ? [stateRead, pageRead, stateRead] : target === "reply" ? [stateRead] : [], target === "scope" || target === "options" ? 0 : 1, target === "account" ? 1 : 0);
    }
    equal(hooks, 0);
  });
  Deno.test(`${label} recovery: malformed scopes and option boundaries fail without writes`, async () => {
    for (const maximumAgeSeconds of [1, 30]) for (const futureToleranceSeconds of [0, 2]) {
      const f = fixture(); Object.assign(f.options, { maximumAgeSeconds, futureToleranceSeconds });
      await rejected(observe, f, unavailable); counters(f, [...throughCreation, candidateRead], 5, 1);
    }
    for (const [key, values] of [["maximumAgeSeconds", [0, 31, 1.5, NaN, "30"]], ["futureToleranceSeconds", [-1, 3, Infinity, "2"]]] as const) {
      for (const value of values) {
        const f = fixture(); Object.assign(f.options, { [key]: value }); await rejected(observe, f, unavailable); counters(f, [], 0);
      }
    }
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    for (const value of [null, [], cycle, { namespace }, { namespace, pool, requestId, authenticatedAdmin: actor, extra: 1 }]) {
      const f = fixture(); f.scope = value as RefundCandidateScope; await rejected(observe, f, unavailable); counters(f, [], 0);
    }
  });
  Deno.test(`${label} recovery: methods, receivers, scope and options captured before pending RPC`, async () => {
    const f = fixture(); let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; }); const original = f.client.rpc;
    f.client.rpc = async function(name, args) { const reply = await original.call(this, name, args); await pending; return reply; };
    let caught: unknown;
    const running = observe(f.client, f.scope, f.options).catch((error: unknown) => { caught = error; });
    counters(f, [stateRead], 1);
    Object.assign(f.scope, { namespace: requestId, requestId: namespace, pool: actor, authenticatedAdmin: pool });
    Object.assign(f.options, { maximumAgeSeconds: 0, futureToleranceSeconds: 99 });
    f.options.now = () => { f.counts.replacements++; return -1; };
    f.client.rpc = async () => { f.counts.replacements++; throw Error("replacement RPC"); };
    for (const key of ["readAccountAtCheckpoint", "readClaimableBalance"]) {
      Object.defineProperty(f.options.source, key, { get() { f.counts.replacements++; throw Error("replacement source"); } });
    }
    const unchanged = preserved({ scope: f.scope, options: f.options, replies: f.replies, account: f.account });
    release(); await running; exactError(caught, unavailable, 503); unchanged(); counters(f, [...throughCreation, candidateRead], 5, 1);
  });
  Deno.test(`${label} recovery: later unknown candidate stops without balance provider or retries`, async () => {
    for (const data of [null, {}, { kind: "unknown" }]) {
      const f = fixture(); f.replies[candidateRead] = { data, error: null };
      await rejected(observe, f, unavailable); counters(f, [...throughCreation, candidateRead], 4, 1);
    }
  });
  Deno.test(`${label} recovery: backward/invalid clock fails closed, preserving caller data`, async () => {
    for (const times of [[-1], [NaN], [Number.MAX_SAFE_INTEGER + 1], [closedAt, closedAt - 1]]) {
      const f = fixture(); f.options.now = function() { equal(this === f.options, true); return times[f.counts.clocks++]; };
      await rejected(observe, f, unavailable);
      counters(f, times.length === 1 ? [] : throughCreation, times.length, times.length === 1 ? 0 : 1);
    }
  });
}
// Stops at candidate absence: no fabricated complete accounting/provenance, funding success,
// signing, submission, service admission or real financial authorization is claimed.
