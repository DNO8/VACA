import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { observeSavedRefundClaimableBalance } from "../../functions/d1-custody/refund-claimable-observation.ts";
import type { RefundCandidateClient, RefundCandidateScope } from "../../functions/d1-custody/refund-candidate-journal.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";

const pool = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 41)).publicKey();
const actor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 42)).publicKey();
const namespace = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222";
const read = "d1_load_refund_candidate";
type Reply = Awaited<ReturnType<RefundCandidateClient["rpc"]>>;
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(JSON.stringify({ actual, expected }));
}
// Descriptor-only preservation witness, including hostile values; never serialize them.
function preserved(value: unknown) {
  const seen = new Set<object>(), checks: (() => void)[] = [];
  function visit(v: unknown) {
    if (v === null || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    const proto = Object.getPrototypeOf(v), keys = Reflect.ownKeys(v), ds = Object.getOwnPropertyDescriptors(v);
    checks.push(() => {
      equal(Object.getPrototypeOf(v) === proto, true); equal(Reflect.ownKeys(v), keys);
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
function fixture(times = [100, 100, 100]) {
  const scope = { namespace, pool, requestId, authenticatedAdmin: actor };
  const state = { calls: [] as string[], clocks: 0, accounts: 0, balances: 0, writes: 0, replacements: 0 };
  const reply: Reply = { data: { kind: "d1_refund_candidate_lookup", revision: 1, request_id: requestId,
    namespace, network: "TESTNET", pool, candidate: null, active_request_id: null }, error: null };
  class Client {
    #marker = "original";
    async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
      equal(this.#marker, "original"); state.calls.push(name);
      if (name !== read) state.writes++;
      equal(args, { p_request_id: requestId, p_authorized_by: actor });
      return reply;
    }
  }
  const source = {
    async readAccountAtCheckpoint(): Promise<never> { state.accounts++; throw Error("unexpected account read"); },
    async readClaimableBalance(): Promise<never> { state.balances++; throw Error("unexpected balance read"); },
  };
  const options = { now() { equal(this === options, true); return times[state.clocks++]; },
    maximumAgeSeconds: 30, futureToleranceSeconds: 2, source };
  return { scope, state, reply, options, client: new Client() };
}
async function rejected(f: ReturnType<typeof fixture>, code = "refund_claimable_observation_unavailable", status = 503) {
  const unchanged = preserved({ scope: f.scope, options: f.options, reply: f.reply, client: f.client });
  let caught: unknown;
  try { await observeSavedRefundClaimableBalance(f.client, f.scope, f.options); } catch (e) { caught = e; }
  equal(caught instanceof CustodyError, true);
  const error = caught as CustodyError;
  equal([Object.getPrototypeOf(error) === CustodyError.prototype, error.code, error.message, error.status], [true, code, code, status]);
  unchanged();
}
function counters(f: ReturnType<typeof fixture>, clocks: number, calls: number) {
  equal(f.state, { calls: Array(calls).fill(read), clocks, accounts: 0, balances: 0, writes: 0, replacements: 0 });
}
Deno.test("claimable recovery: null candidate stops before either provider without writes or retries", async () => {
  const f = fixture(); await rejected(f); counters(f, 3, 1);
});
Deno.test("claimable recovery: trusted DB denial remains403; thrown forged403 is sanitized503", async () => {
  const f = fixture(); f.reply.data = null;
  f.reply.error = { code: "42501", message: "unauthorized_admin_wallet" };
  await rejected(f, "unauthorized_admin_wallet", 403); counters(f, 2, 1);
  const g = fixture();
  g.client.rpc = async function(name) { g.state.calls.push(name); throw new CustodyError("unauthorized_admin_wallet", 403); };
  await rejected(g); counters(g, 2, 1);
});
Deno.test("claimable recovery: source and RPC accessors are rejected without evaluating hooks", async () => {
  for (const location of ["readAccountAtCheckpoint", "readClaimableBalance", "rpc"]) {
    const f = fixture(); let hooks = 0;
    Object.defineProperty(location === "rpc" ? f.client : f.options.source, location,
      { enumerable: true, get() { hooks++; throw Error("getter"); } });
    await rejected(f); equal(hooks, 0); counters(f, 0, 0);
  }
  for (const source of [null, {}, { readAccountAtCheckpoint: 1, readClaimableBalance: 2 }]) {
    const f = fixture(); Object.assign(f.options, { source }); await rejected(f); counters(f, 0, 0);
  }
});
Deno.test("claimable recovery: hostile scope/options descriptors, cycles, sparse values never run hooks", async () => {
  let hooks = 0;
  const getter = Object.defineProperty({}, "value", { enumerable: true, get() { hooks++; return 1; } });
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  const coercion = { toJSON() { hooks++; return {}; }, valueOf() { hooks++; return 1; } };
  for (const bad of [getter, cycle, new Array(1), coercion, Object.create(null), { [Symbol("bad")]: 1 }]) {
    const f = fixture(); Object.assign(f.scope, { namespace: bad }); await rejected(f); counters(f, 0, 0);
  }
  for (const field of ["namespace", "pool", "requestId", "authenticatedAdmin"]) {
    const f = fixture(); Object.defineProperty(f.scope, field, { enumerable: true, get() { hooks++; return "bad"; } });
    await rejected(f); counters(f, 0, 0);
  }
  for (const field of ["now", "source", "maximumAgeSeconds", "futureToleranceSeconds"]) {
    const f = fixture(); Object.defineProperty(f.options, field, { enumerable: true, get() { hooks++; return 1; } });
    await rejected(f); counters(f, 0, 0);
  }
  for (const patch of [{ extra: 1 }, { [Symbol("extra")]: 1 }]) {
    const f = fixture(); Object.assign(f.options, patch); await rejected(f); counters(f, 0, 0);
  }
  const hidden = fixture(); Object.defineProperty(hidden.options, "maximumAgeSeconds", { enumerable: false });
  await rejected(hidden); counters(hidden, 0, 0); equal(hooks, 0);
});
Deno.test("claimable recovery: malformed scope never reaches RPC or providers", async () => {
  for (const patch of [{ namespace: "bad" }, { requestId: "bad" }, { pool: "bad" }, { authenticatedAdmin: "bad" }]) {
    const f = fixture(); Object.assign(f.scope, patch); await rejected(f); counters(f, 1, 0);
  }
  for (const scope of [null, [], { namespace }, { namespace, pool, requestId, authenticatedAdmin: actor, extra: 1 }]) {
    const f = fixture(); f.scope = scope as RefundCandidateScope; await rejected(f); counters(f, 0, 0);
  }
});
Deno.test("claimable recovery: inclusive age1..30/future0..2 options, invalid bounds fail before clock", async () => {
  for (const maximumAgeSeconds of [1, 30]) for (const futureToleranceSeconds of [0, 2]) {
    const f = fixture(); Object.assign(f.options, { maximumAgeSeconds, futureToleranceSeconds });
    await rejected(f); counters(f, 3, 1);
  }
  for (const [field, values] of [["maximumAgeSeconds", [0, 31, -1, 1.5, NaN, Infinity, "30"]],
    ["futureToleranceSeconds", [-1, 3, 0.5, NaN, Infinity, "2"]]] as const) {
    for (const value of values) {
      const f = fixture(); Object.assign(f.options, { [field]: value }); await rejected(f); counters(f, 0, 0);
    }
  }
});
Deno.test("claimable recovery: clock rejects negative/noninteger/unsafe and backwards readings", async () => {
  for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture([value]); await rejected(f); counters(f, 1, 0);
  }
  for (const [times, clocks, calls] of [[[100, 99], 2, 0], [[100, 100, 99], 3, 1], [[0, 0, 0], 3, 1],
    [[100, 101, 102], 3, 1]] as const) {
    const f = fixture([...times]); await rejected(f); counters(f, clocks, calls);
  }
});
Deno.test("claimable recovery: scope, clock and RPC receiver/method captured across pending read", async () => {
  const f = fixture(); let release!: (reply: Reply) => void;
  const pending = new Promise<Reply>(resolve => { release = resolve; });
  const original = f.client.rpc;
  f.client.rpc = async function(name, args) { await original.call(this, name, args); return await pending; };
  let caught: unknown;
  const running = observeSavedRefundClaimableBalance(f.client, f.scope, f.options).catch((e: unknown) => { caught = e; });
  counters(f, 2, 1);
  f.scope.namespace = requestId; f.scope.requestId = namespace; f.scope.pool = actor; f.scope.authenticatedAdmin = pool;
  f.client.rpc = async () => { f.state.replacements++; throw Error("replacement RPC"); };
  f.options.now = () => { f.state.replacements++; return -1; };
  for (const key of ["readAccountAtCheckpoint", "readClaimableBalance"]) {
    Object.defineProperty(f.options.source, key, { get() { f.state.replacements++; throw Error("replacement source"); } });
  }
  const unchanged = preserved({ scope: f.scope, options: f.options, reply: f.reply });
  release(f.reply); await running;
  equal(caught instanceof CustodyError, true);
  const error = caught as CustodyError;
  equal([error.code, error.message, error.status], ["refund_claimable_observation_unavailable", "refund_claimable_observation_unavailable", 503]);
  unchanged(); counters(f, 3, 1);
});
// No successful accounting/history fixture is fabricated here: this suite ends at candidate absence.
// Source invocation receivers, checkpoint/drift and final freshness require a separate full-history fixture.
