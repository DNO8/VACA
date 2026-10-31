import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyDatabase } from "../../functions/d1-custody/adapters.ts";
import { CustodyError, type Preparation } from "../../functions/d1-custody/handler.ts";
import { planIssuance } from "../../functions/d1-custody/issuance-plan.ts";
import { createIssuanceCoordinator } from "../../functions/d1-custody/issuance-coordinator.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("assertion failed");
}
const [pool, donor, beneficiary, admin, issuer] = [1, 2, 3, 4, 5].map((n) =>
  Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey()
);
const requestId = "00000000-0000-4000-8000-000000000001";
const namespace = "00000000-0000-4000-8000-000000000002";
const sequence = "9007199254740993";
const confirmed = 1793102400;
function fixture() {
  const prepared: Preparation = {
    request_id: requestId, authorized_by: donor,
    payment: { transaction_hash: "a".repeat(64), operation_id: "123", donor, pool,
      asset: { type: "native" }, amount: "2.0000000" },
    request: { version: 1, incident_id: "incident-1", donor, beneficiary,
      asset: { type: "native" }, amount: "1.0000001", deadline: "2026-10-27T12:05:00Z" },
    confirmed_at: confirmed, ledger: 900, memo_hash: "b".repeat(64),
  };
  const intent = { kind: "d1_issuance_request_intent", revision: 1, request_id: requestId,
    namespace, network: "TESTNET", pool, preparation_input: prepared,
    preparation: { revision: 1, state: "allocated", request_id: requestId, allocation: {} } };
  const reservation = { kind: "d1_issuance_sequence_reservation", revision: 1,
    request_id: requestId, namespace, network: "TESTNET", pool,
    observed_account_sequence: sequence, transaction_sequence: "9007199254740994", intent };
  const calls: unknown[] = [];
  const state = { registered: false, reserved: false };
  const options = {
    intent: intent as unknown, reservation: reservation as unknown,
    observation: { network: "TESTNET", pool, sequence }, now: confirmed + 10,
    fee: "100", fail: "", error: { code: "", message: "" }, transport: false,
    lookup: { kind: "d1_unsigned_transaction_lookup", revision: 1, request_id: requestId,
      namespace, network: "TESTNET", pool, reservation: null, transaction: null } as Record<string, unknown>,
    saved: null as unknown, saveResponse: undefined as unknown, loseSave: false,
    saveGate: undefined as Promise<void> | undefined,
    journalState: { value: null as Record<string, unknown> | null },
    commitThenLoseResponse: false, committedError: undefined as unknown,
  };
  const database = new CustodyDatabase({ rpc(name, args) {
    calls.push([name, args]);
    if (name === "d1_reserve_issuance_sequence" && options.commitThenLoseResponse) {
      state.reserved = true;
      if (options.committedError !== undefined) {
        return Promise.resolve({ data: null, error: options.committedError }) as never;
      }
      throw new Error("SECRET unknown committed outcome");
    }
    if (options.fail === name) {
      if (options.transport) throw new Error("SECRET provider diagnostics");
      return Promise.resolve({ data: null, error: options.error });
    }
    if (name === "d1_load_unsigned_transaction") return Promise.resolve({ data: structuredClone(options.lookup), error: null });
    if (name === "d1_save_unsigned_transaction") {
      const previous = options.journalState.value;
      if (previous && (previous.unsigned_xdr !== args.p_unsigned_xdr || previous.transaction_hash !== args.p_transaction_hash)) {
        return Promise.resolve({ data: null, error: { message: "unsigned_transaction_conflict" } });
      }
      options.saved = { kind: "d1_unsigned_transaction_journal", revision: 1, request_id: requestId,
        namespace, network: "TESTNET", pool, deadline: prepared.request.deadline,
        transaction_sequence: reservation.transaction_sequence, reservation: structuredClone(reservation),
        unsigned_xdr: args.p_unsigned_xdr, transaction_hash: args.p_transaction_hash };
      options.journalState.value = options.saved as ReturnType<typeof journal>;
      if (options.loseSave) throw new Error("SECRET committed save");
      return (options.saveGate ?? Promise.resolve()).then(() => ({
        data: options.saveResponse === undefined ? options.saved : options.saveResponse, error: null,
      }));
    }
    if (name === "d1_register_issuance_intent") state.registered = true;
    if (name === "d1_reserve_issuance_sequence") state.reserved = true;
    return Promise.resolve({ data: structuredClone(name === "d1_register_issuance_intent"
      ? options.intent : options.reservation), error: null });
  } });
  const run = createIssuanceCoordinator({ pool, database,
    observeAccount: (observedPool: string) => {
      calls.push(["observe", observedPool]);
      if (options.fail === "observe") throw new Error("SECRET observation");
      return Promise.resolve(options.observation);
    },
    now: () => {
      calls.push(["clock"]);
      if (options.fail === "clock") throw new CustodyError("SECRET clock", 400);
      return options.now;
    },
    fee: () => {
      calls.push(["fee"]);
      if (options.fail === "fee") throw new Error("SECRET fee");
      return options.fee;
    },
  });
  return { prepared, intent, reservation, calls, state, options, run };
}
type Fixture = ReturnType<typeof fixture>;
function journal(f: Fixture) {
  const { unsignedXdr } = planIssuance(f.prepared, { networkPassphrase: Networks.TESTNET,
    pool, sequence, now: confirmed + 10, fee: "100" });
  return { kind: "d1_unsigned_transaction_journal", revision: 1, request_id: requestId,
    namespace, network: "TESTNET", pool, deadline: f.prepared.request.deadline,
    transaction_sequence: f.reservation.transaction_sequence, reservation: f.reservation,
    unsigned_xdr: unsignedXdr,
    transaction_hash: TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET).hash().toString("hex") };
}
async function failure(f: Fixture, code: string, status: number, names: string[]) {
  const before = JSON.stringify([f.intent, f.reservation, f.options.lookup]);
  let result;
  try { await f.run(requestId, admin); } catch (e) {
    result = e instanceof CustodyError ? [e.code, e.status, e.message] : "unsafe";
  }
  equal(result, [code, status, code]);
  equal(f.calls.map((c) => (c as string[])[0]), names);
  equal(JSON.stringify([f.intent, f.reservation, f.options.lookup]), before);
}
const load = "d1_load_unsigned_transaction", save = "d1_save_unsigned_transaction";
Deno.test("no provisional plan escapes while persistence is pending", async () => {
  const f = fixture(); f.options.lookup.reservation = f.reservation;
  const gate = Promise.withResolvers<void>(); f.options.saveGate = gate.promise;
  let returned = false;
  const result = f.run(requestId, admin).then((value) => { returned = true; return value; });
  try {
    // Drain this bounded in-memory provider chain without real timers or network.
    for (let i = 0; i < 30; i++) await Promise.resolve();
    equal(f.calls.map((c) => (c as string[])[0]), [load, "clock", "fee", save]);
    equal(returned, false);
  } finally { gate.resolve(); }
  equal((await result).unsignedXdr, (f.options.saved as ReturnType<typeof journal>).unsigned_xdr);
});
Deno.test("lookup failures and malformed roots stop before any downstream authority", async () => {
  for (const root of [null, [], {}, "lookup"]) {
    const f = fixture(); f.options.lookup = root as never;
    await failure(f, "dependency_unavailable", 503, [load]);
    equal(f.state, { registered: false, reserved: false });
  }
  for (const message of ["unauthorized_admin_wallet", "SECRET"] as const) {
    const f = fixture(); f.options.lookup.reservation = f.reservation;
    f.options.lookup.transaction = journal(f); f.options.fail = load;
    f.options.error.message = message;
    await failure(f, message === "SECRET" ? "dependency_unavailable" : message,
      message === "SECRET" ? 503 : 403, [load]);
  }
});
Deno.test("saved journal replays original SDK bytes after expiry with only authorized lookup", async () => {
  const f = fixture(), saved = journal(f);
  f.options.lookup.reservation = f.reservation; f.options.lookup.transaction = saved;
  f.options.now = confirmed + 999; f.options.fail = "observe";
  const before = JSON.stringify(f.options.lookup);
  equal(await f.run(requestId, admin), { unsignedXdr: saved.unsigned_xdr, reservation: f.reservation });
  equal(f.calls, [[load, { p_request_id: requestId, p_authorized_by: admin }]]);
  equal(JSON.stringify(f.options.lookup), before);
  equal(f.state, { registered: false, reserved: false });
});
Deno.test("owned-only recovery uses original observation and expires without save or release", async () => {
  const f = fixture(); f.options.lookup.reservation = f.reservation;
  const result = await f.run(requestId, admin);
  equal(result.unsignedXdr, journal(f).unsigned_xdr);
  equal(f.calls.map((c) => (c as string[])[0]), [load, "clock", "fee", save]);
  equal(f.state, { registered: false, reserved: false });
  const expired = fixture(); expired.options.lookup.reservation = expired.reservation;
  expired.options.now = confirmed + 300;
  await failure(expired, "issuance_window_exhausted", 410, [load, "clock"]);
});
Deno.test("unknown committed save fails once; explicit retry recovers without fresh dependencies", async () => {
  const f = fixture(); f.options.lookup.reservation = f.reservation; f.options.loseSave = true;
  await failure(f, "dependency_unavailable", 503, [load, "clock", "fee", save]);
  f.options.lookup.transaction = f.options.saved; f.calls.length = 0;
  f.options.fail = "clock";
  const result = await f.run(requestId, admin);
  equal(result.unsignedXdr, (f.options.saved as ReturnType<typeof journal>).unsigned_xdr);
  equal(f.calls.map((c) => (c as string[])[0]), [load]);
});
Deno.test("malformed lookup/reservation/journal and SDK bindings fail closed before downstream actions", async () => {
  for (const patch of [{ kind: "bad" }, { revision: 2 }, { request_id: namespace },
    { namespace: "bad" }, { network: "PUBLIC" }, { pool: donor }, { reservation: undefined },
    { transaction: undefined }, { transaction: {}, reservation: null },
    ...[null, [], { intent: {} }, { transaction_sequence: "1" }].map((reservation) => ({ reservation }))]) {
    // Null reservation with null journal is a valid first-flow state, tested above.
    if (patch.reservation === null && !("transaction" in patch)) continue;
    const f = fixture(); Object.assign(f.options.lookup, patch);
    await failure(f, "dependency_unavailable", 503, [load]);
    equal(f.state, { registered: false, reserved: false });
  }
  for (const patch of [{ kind: "bad" }, { revision: 2 }, { request_id: namespace },
    { namespace: requestId }, { network: "PUBLIC" }, { pool: donor }, { deadline: "wrong" },
    { transaction_sequence: "1" }, { reservation: {} }, { unsigned_xdr: "AAAA" },
    { transaction_hash: "0".repeat(64) }]) {
    const f = fixture(); f.options.lookup.reservation = f.reservation;
    f.options.lookup.transaction = { ...journal(f), ...patch };
    await failure(f, "dependency_unavailable", 503, [load]);
  }
  for (const mode of ["signed", "source", "amount"]) {
    const f = fixture(), saved = journal(f);
    const tx = TransactionBuilder.fromXDR(saved.unsigned_xdr, Networks.TESTNET) as Transaction;
    if (mode === "signed") tx.sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)));
    else {
      const changed = structuredClone(f.prepared);
      if (mode === "source") changed.payment.pool = donor;
      else changed.request.amount = "1.0000002";
      saved.unsigned_xdr = planIssuance(changed, { networkPassphrase: Networks.TESTNET,
        pool: changed.payment.pool, sequence, now: confirmed + 10, fee: "100" }).unsignedXdr;
    }
    if (mode === "signed") saved.unsigned_xdr = tx.toXDR();
    saved.transaction_hash = TransactionBuilder.fromXDR(saved.unsigned_xdr, Networks.TESTNET).hash().toString("hex");
    f.options.lookup.reservation = f.reservation; f.options.lookup.transaction = saved;
    await failure(f, "dependency_unavailable", 503, [load]);
  }
});
Deno.test("competing plans have one durable winner and conflict never overwrites", async () => {
  const a = fixture(), b = fixture();
  for (const f of [a, b]) f.options.lookup.reservation = f.reservation;
  b.options.journalState = a.options.journalState; b.options.now++;
  const results = await Promise.allSettled([a.run(requestId, admin), b.run(requestId, admin)]);
  equal(results.map((r) => r.status), ["fulfilled", "rejected"]);
  const loser = results[1];
  equal(loser.status === "rejected" && [loser.reason.code, loser.reason.status, loser.reason.message],
    ["unsigned_transaction_conflict", 409, "unsigned_transaction_conflict"]);
  equal(a.options.journalState.value, a.options.saved);
  equal(b.options.saved, null);
  for (const f of [a, b]) equal(f.calls.map((c) => (c as string[])[0]), [load, "clock", "fee", save]);
});
Deno.test("save response must bind whole immutable journal and exact proposal before success", async () => {
  for (const patch of [null, { kind: "bad" }, { deadline: "bad" }, { reservation: {} },
    { transaction_hash: "0".repeat(64) }, { unsigned_xdr: "AAAA" },
    journal(fixture())]) {
    const f = fixture(); f.options.lookup.reservation = f.reservation;
    f.options.saveResponse = patch === null ? null : { ...journal(f), ...patch };
    if (patch && "unsigned_xdr" in patch && patch.unsigned_xdr === journal(f).unsigned_xdr) f.options.now++;
    await failure(f, "dependency_unavailable", 503, [load, "clock", "fee", save]);
  }
});
async function rejects(f: Fixture, code: string, status: number, stages: number, reserved = false) {
  const stored = JSON.stringify([f.intent, f.reservation]);
  let observed: unknown;
  try { await f.run(requestId, admin); } catch (error) {
    observed = error instanceof CustodyError ? [error.code, error.status, error.message] : "unsafe error";
  }
  equal(observed, [code, status, code]);
  equal(f.calls.length, stages + 1);
  equal(JSON.stringify([f.intent, f.reservation]), stored);
  equal(f.state, { registered: stages > 0 && f.options.fail !== "d1_register_issuance_intent", reserved });
}

Deno.test("coordinator exact RPC order/arguments; stored native/issued allocation and bigint XDR", async () => {
  for (const asset of [{ type: "native" } as const, { type: "issued", code: "USD", issuer } as const]) {
    const f = fixture();
    f.prepared.payment.asset = f.prepared.request.asset = asset;
    const result = await f.run(requestId, admin);
    equal(f.calls, [
      ["d1_load_unsigned_transaction", { p_request_id: requestId, p_authorized_by: admin }],
      ["d1_register_issuance_intent", { p_request_id: requestId, p_authorized_by: admin }],
      ["observe", pool],
      ["d1_reserve_issuance_sequence", { p_request_id: requestId, p_authorized_by: admin,
        p_observed_account_sequence: sequence }], ["clock"], ["fee"],
      ["d1_save_unsigned_transaction", { p_request_id: requestId, p_authorized_by: admin,
        p_unsigned_xdr: result.unsignedXdr,
        p_transaction_hash: TransactionBuilder.fromXDR(result.unsignedXdr, Networks.TESTNET).hash().toString("hex") }],
    ]);
    equal(f.state, { registered: true, reserved: true });
    equal(result.reservation, f.reservation);
    const tx = TransactionBuilder.fromXDR(result.unsignedXdr, Networks.TESTNET);
    if (!(tx instanceof Transaction)) throw new Error("ordinary transaction required");
    equal([tx.source, tx.sequence, tx.fee, tx.signatures.length], [pool, "9007199254740994", "100", 0]);
    equal(tx.timeBounds, { minTime: String(f.options.now), maxTime: String(confirmed + 299) });
    equal(tx.operations.length, 1);
    const op = tx.operations[0];
    if (op.type !== "createClaimableBalance") throw new Error("wrong operation");
    equal(op.amount, "1.0000001");
    equal(op.asset.isNative(), asset.type === "native");
    if (asset.type === "issued") equal([op.asset.getCode(), op.asset.getIssuer()], ["USD", issuer]);
    equal(op.claimants.map((c) => c.destination), [beneficiary, pool]);
  }
});

Deno.test("coordinator rejects malformed intent bindings before observation or reservation", async () => {
  for (const patch of [null, { kind: "wrong" }, { revision: 2 }, { request_id: namespace },
    { network: "PUBLIC" }, { pool: donor }, { namespace: "bad" },
    { preparation_input: {} }, { preparation_input: { request_id: namespace } },
    { preparation: { revision: 1, state: "allocated", request_id: namespace, allocation: {} } }]) {
    const f = fixture();
    f.options.intent = patch === null ? null : { ...f.intent, ...patch };
    await rejects(f, "dependency_unavailable", 503, 1);
  }
});

Deno.test("coordinator rejects unbound account observations before reserving", async () => {
  for (const patch of [{ pool: donor }, { network: "PUBLIC" }, { sequence: "01" },
    { sequence: "9223372036854775807" }]) {
    const f = fixture(); Object.assign(f.options.observation, patch);
    await rejects(f, "dependency_unavailable", 503, 2);
  }
});

Deno.test("coordinator validates every reservation binding and preserves committed ownership", async () => {
  for (const patch of [null, { kind: "wrong" }, { revision: 2 }, { request_id: namespace },
    { network: "PUBLIC" }, { pool: donor }, { namespace: requestId },
    { observed_account_sequence: "9007199254740992" }, { transaction_sequence: "9007199254740995" },
    { intent: { changed: true } }]) {
    const f = fixture(); f.options.reservation = patch === null ? null : { ...f.reservation, ...patch };
    await rejects(f, "dependency_unavailable", 503, 3, true);
  }
});

Deno.test("coordinator structural equality ignores JSON object order", async () => {
  const f = fixture();
  f.reservation.intent = Object.fromEntries(Object.entries(f.intent).reverse()) as typeof f.intent;
  const result = await f.run(requestId, admin);
  equal(typeof result.unsignedXdr, "string");
  equal(f.calls.length, 7); equal(f.state, { registered: true, reserved: true });
});

Deno.test("coordinator expired replay and invalid planner data produce no plan or ownership release", async () => {
  for (const mode of ["expired", "amount", "asset", "deadline", "fee"]) {
    const f = fixture();
    if (mode === "expired") f.options.now = confirmed + 300;
    if (mode === "amount") f.prepared.request.amount = "3.0000000";
    if (mode === "asset") f.prepared.request.asset = { type: "issued", code: "USD", issuer };
    if (mode === "deadline") f.prepared.request.deadline = "2026-10-27T12:06:00Z";
    if (mode === "fee") f.options.fee = "99";
    await rejects(f, mode === "expired" ? "issuance_window_exhausted" : "invalid_issuance_plan",
      mode === "expired" ? 410 : 422, mode === "expired" ? 4 : 5, true);
  }
});

Deno.test("real adapter sanitizes RPC/provider failures without retry or compensating calls", async () => {
  for (const stage of ["d1_register_issuance_intent", "observe", "d1_reserve_issuance_sequence"]) {
    for (const [message, code, status] of [
      ["issuance_source_busy", "issuance_source_busy", 409],
      ["issuance_sequence_conflict", "issuance_sequence_conflict", 409],
      ["unauthorized_admin_wallet", "unauthorized_admin_wallet", 403],
      ["deadline_expired", "deadline_expired", 410],
      ...["invalid_issuance_intent", "invalid_issuance_sequence", "d1_preparation_not_found",
        "d1_issuance_intent_not_found"].map((s) => [s, s, 422]),
      ["SECRET SQL", "dependency_unavailable", 503],
      ["serialization", "serialization_failure", 503], ["transport", "dependency_unavailable", 503],
    ] as const) {
      const f = fixture(); f.options.fail = stage;
      f.options.transport = message === "transport";
      f.options.error = { message: String(message), code: message === "serialization" ? "40001" : "XX000" };
      await rejects(f, stage === "observe" ? "dependency_unavailable" : String(code),
        stage === "observe" ? 503 : Number(status), stage === "d1_register_issuance_intent" ? 1 : stage === "observe" ? 2 : 3);
    }
  }
});

Deno.test("unknown committed outcome and late provider failures never release or retry", async () => {
  const f = fixture(); f.options.commitThenLoseResponse = true;
  await rejects(f, "dependency_unavailable", 503, 3, true);
  for (const stage of ["clock", "fee"]) {
    const f = fixture(); f.options.fail = stage;
    await rejects(f, "dependency_unavailable", 503, stage === "clock" ? 4 : 5, true);
  }
});

Deno.test("malformed reservation errors retain committed ownership without retry or release", async () => {
  for (const message of [{ toString: null }, ["deadline_expired"], null, undefined,
    "toString", "constructor", "__proto__"]) {
    const f = fixture();
    f.options.commitThenLoseResponse = true;
    f.options.committedError = { code: "XX000", message };
    await rejects(f, "dependency_unavailable", 503, 3, true);
    equal(f.calls, [
      ["d1_load_unsigned_transaction", { p_request_id: requestId, p_authorized_by: admin }],
      ["d1_register_issuance_intent", { p_request_id: requestId, p_authorized_by: admin }],
      ["observe", pool],
      ["d1_reserve_issuance_sequence", { p_request_id: requestId, p_authorized_by: admin,
        p_observed_account_sequence: sequence }],
    ]);
  }
});

Deno.test("prepare public RPC behavior remains unchanged", async () => {
  const input = fixture().prepared;
  for (const error of [null, { code: "40001", message: "private" },
    { message: "unauthorized_admin_wallet" }, { message: "idempotency_conflict" },
    { message: "deadline_expired" }, { message: "invalid_preparation" }, { message: "private" }]) {
    const calls: unknown[] = [];
    const receipt = { revision: 1, state: "allocated" };
    const database = new CustodyDatabase({ rpc(name, args) {
      calls.push([name, args]); return Promise.resolve({ data: receipt, error });
    } });
    let result;
    try { result = await database.prepare(input); } catch (e) {
      if (!(e instanceof CustodyError)) throw e;
      result = [e.code, e.status];
    }
    equal(calls, [["d1_prepare", { p_input: input }]]);
    equal(result, !error ? receipt : error.code === "40001" ? ["serialization_failure", 503]
      : error.message === "private" ? ["dependency_unavailable", 503]
      : [error.message, ({ unauthorized_admin_wallet: 403, idempotency_conflict: 409,
        deadline_expired: 410, invalid_preparation: 422 } as Record<string, number>)[error.message]]);
  }
});
