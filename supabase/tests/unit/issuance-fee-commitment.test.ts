import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError, type Preparation } from "../../functions/d1-custody/handler.ts";
import { planIssuance } from "../../functions/d1-custody/issuance-plan.ts";
import { IssuanceFeeCommitmentDatabase } from "../../functions/d1-custody/issuance-fee-commitment.ts";
const [pool, donor, beneficiary, admin, rotated, issuer] = [1, 2, 3, 4, 5, 6].map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
const requestId = "00000000-0000-4000-8000-000000000001", namespace = "00000000-0000-4000-8000-000000000002";
const load = "d1_load_issuance_fee_commitments", unsignedLoad = "d1_load_unsigned_transaction", save = "d1_record_issuance_fee_commitment";
function equal(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error("assertion failed"); }
function fixture(issued = false) {
  const asset: Preparation["request"]["asset"] = issued ? { type: "issued", code: "USD", issuer } : { type: "native" };
  const prepared: Preparation = { request_id: requestId, authorized_by: donor, confirmed_at: 1793102400, ledger: 900, memo_hash: "b".repeat(64),
    payment: { transaction_hash: "a".repeat(64), operation_id: "123", donor, pool, asset: { ...asset }, amount: "2.0000000" },
    request: { version: 1, incident_id: "incident-1", donor, beneficiary, asset: { ...asset }, amount: "1.0000001", deadline: "2026-10-27T12:05:00Z" } };
  const scope = { request_id: requestId, namespace, network: "TESTNET", pool };
  const intent = { kind: "d1_issuance_request_intent", revision: 1, ...scope, preparation_input: prepared,
    preparation: { revision: 1, state: "allocated", request_id: requestId, allocation: {} } };
  const reservation = { kind: "d1_issuance_sequence_reservation", revision: 1, ...scope,
    observed_account_sequence: "9007199254740993", transaction_sequence: "9007199254740994", intent };
  const { unsignedXdr } = planIssuance(prepared, { networkPassphrase: Networks.TESTNET, pool, sequence: reservation.observed_account_sequence, now: prepared.confirmed_at + 10, fee: "100" });
  const journal = { kind: "d1_unsigned_transaction_journal", revision: 1, ...scope, deadline: prepared.request.deadline,
    transaction_sequence: reservation.transaction_sequence, reservation, unsigned_xdr: unsignedXdr,
    transaction_hash: TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET).hash().toString("hex") };
  const expected = { kind: "d1_issuance_fee_commitment", revision: 1, ...scope, authorized_by: admin, reservation,
    issuance_fee_stroops: "100", future_refund_fee_stroops: "300", deadline: prepared.request.deadline };
  const state = { lookup: { kind: "d1_issuance_fee_commitment_lookup", revision: 1, ...scope, reservation: structuredClone(reservation), commitment: null as unknown, commitments: [] as unknown[] },
    unsigned: { kind: "d1_unsigned_transaction_lookup", revision: 1, ...scope, reservation: structuredClone(reservation), transaction: structuredClone(journal) as unknown },
    committed: null as unknown, savedResponse: undefined as unknown, fail: "", error: null as unknown, transport: false, lose: false,
    quote: "300", badQuote: false, gate: undefined as Promise<void> | undefined };
  const calls: unknown[][] = [];
  const database = new IssuanceFeeCommitmentDatabase({ rpc(name, args) {
    calls.push([name, structuredClone(args)]);
    if (state.fail === name) { if (state.transport) throw Error("SECRET transport"); return Promise.resolve({ data: null, error: state.error }); }
    if (name === save) {
      state.committed = structuredClone(expected);
      if (state.lose) throw Error("SECRET save may have committed");
      return (state.gate ?? Promise.resolve()).then(() => ({ data: state.savedResponse === undefined ? structuredClone(expected) : state.savedResponse, error: null }));
    }
    return Promise.resolve({ data: name === load ? state.lookup : state.unsigned, error: null });
  } }, { pool, futureRefundFee: () => { calls.push(["quote"]); if (state.badQuote) throw Error("SECRET quote"); return state.quote; } });
  return { prepared, reservation, journal, expected, state, calls, run: (by = admin) => database.record(requestId, by) };
}
type Fixture = ReturnType<typeof fixture>;
async function failure(f: Fixture, names: string[], code = "issuance_fee_commitment_unavailable", status = 503) {
  const before = JSON.stringify([f.state.lookup, f.state.unsigned]);
  let error: unknown; try { await f.run(); } catch (e) { error = e instanceof CustodyError ? [e.code, e.status, e.message] : "unsafe"; }
  equal(error, [code, status, code]); equal(f.calls.map(c => c[0]), names); equal(JSON.stringify([f.state.lookup, f.state.unsigned]), before);
}
Deno.test("fee commitments derive exact native/issued SDK fee from durable unsigned owner and await one save", async () => {
  for (const issued of [false, true]) {
    const f = fixture(issued), gate = Promise.withResolvers<void>(); f.state.gate = gate.promise;
    let returned = false; const result = f.run().then(r => { returned = true; return r; });
    void result.catch(() => {}); // Observe rejection immediately, assert/await the original below.
    try { for (let i = 0; i < 30; i++) await Promise.resolve(); equal(returned, false); equal(f.calls.map(c => c[0]), [load, unsignedLoad, "quote", save]); }
    finally { gate.resolve(); }
    equal(await result, f.expected);
    equal(f.calls[3][1], { p_request_id: requestId, p_authorized_by: admin, p_issuance_fee_stroops: "100", p_future_refund_fee_stroops: "300" });
    equal(f.state.committed, f.expected); equal(f.state.lookup.commitment, null);
  }
});
Deno.test("historical exact commitment replay preserves original authorizer with no current quote clock plan or write", async () => {
  const f = fixture(); f.state.lookup.commitment = structuredClone(f.expected); f.state.lookup.commitments = [structuredClone(f.expected)];
  f.state.badQuote = true; f.state.quote = "999";
  equal(await f.run(rotated), f.expected); equal(f.calls.map(c => c[0]), [load, unsignedLoad]); equal(f.state.committed, null);
});
Deno.test("fee commitments reject missing owner unsigned evidence omitted membership and SDK or reservation contradictions without save", async () => {
  const mutations: ((f: Fixture) => void)[] = [
    f => { f.state.lookup.reservation = null as never; }, f => { f.state.unsigned.transaction = null; },
    f => { f.state.lookup.namespace = requestId; }, f => { f.state.unsigned.reservation = { ...structuredClone(f.reservation), observed_account_sequence: "1" }; },
    f => { f.state.unsigned.transaction = { ...f.journal, unsigned_xdr: "AAAA" }; },
    f => { f.state.unsigned.transaction = { ...f.journal, transaction_hash: "f".repeat(64) }; },
    f => { f.state.unsigned.transaction = { ...f.journal, deadline: "2000-01-01T00:00:00Z" }; },
    f => { f.state.lookup.commitment = f.expected; }, f => { f.state.lookup.commitments = [f.expected]; },
    f => { f.state.lookup.commitment = { ...structuredClone(f.expected), issuance_fee_stroops: "101" }; f.state.lookup.commitments = [structuredClone(f.state.lookup.commitment)]; },
    f => { f.state.lookup.commitment = structuredClone(f.expected); f.state.lookup.commitments = [structuredClone(f.expected), structuredClone(f.expected)]; },
    f => { f.state.lookup.commitment = { ...structuredClone(f.expected), reservation: { ...structuredClone(f.reservation), transaction_sequence: "2" } }; f.state.lookup.commitments = [structuredClone(f.state.lookup.commitment)]; },
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); await failure(f, f.state.lookup.reservation === null ? [load] : [load, unsignedLoad]); equal(f.state.committed, null); }
});
Deno.test("fee commitments validate positive int64 refund policy bounds and saved response with no inferred success", async () => {
  for (const quote of ["0", "01", "-1", "9223372036854775808", "9223372036854775708"]) { const f = fixture(); f.state.quote = quote; await failure(f, [load, unsignedLoad, "quote"]); equal(f.state.committed, null); }
  const edge = fixture(); edge.state.quote = "9223372036854775707"; edge.expected.future_refund_fee_stroops = edge.state.quote;
  equal(await edge.run(), edge.expected);
  for (const response of [null, {}, { ...fixture().expected, issuance_fee_stroops: "101" }, { ...fixture().expected, authorized_by: rotated }]) {
    const f = fixture(); f.state.savedResponse = response; await failure(f, [load, unsignedLoad, "quote", save]); equal(f.state.committed, f.expected);
  }
});
Deno.test("fee commitment RPC errors stay sanitized and unknown committed saves never retry read back or release ownership", async () => {
  for (const name of [load, unsignedLoad, save]) for (const transport of [false, true]) {
    const f = fixture(); f.state.fail = name; f.state.transport = transport; f.state.error = { code: "XX000", message: "SECRET provider" };
    await failure(f, name === load ? [load] : name === unsignedLoad ? [load, unsignedLoad] : [load, unsignedLoad, "quote", save]);
  }
  const denied = fixture(); denied.state.fail = load; denied.state.error = { code: "42501", message: "unauthorized_admin_wallet" };
  await failure(denied, [load], "unauthorized_admin_wallet", 403);
  const lost = fixture(); lost.state.lose = true; await failure(lost, [load, unsignedLoad, "quote", save]); equal(lost.state.committed, lost.expected);
});
Deno.test("fee commitment snapshots reject accessors aliases cycles and oversized responses without invoking untrusted getters", async () => {
  let getters = 0;
  for (const mutate of [
    (f: Fixture) => { Object.defineProperty(f.state.lookup, "namespace", { enumerable: true, get() { getters++; throw Error("SECRET getter invoked"); } }); },
    (f: Fixture) => { (f.state.lookup as unknown as Record<string, unknown>).extra = f.state.lookup; },
    (f: Fixture) => { (f.state.lookup as unknown as Record<string, unknown>).extra = f.state.lookup.reservation; },
    (f: Fixture) => { (f.state.lookup as unknown as Record<string, unknown>).extra = Array(2); },
    (f: Fixture) => { (f.state.lookup as unknown as Record<string, unknown>).extra = "X".repeat(1024 * 1024); },
  ]) {
    const f = fixture(); mutate(f); let error: unknown;
    try { await f.run(); } catch (e) { error = e instanceof CustodyError ? [e.code, e.status, e.message] : "unsafe"; }
    equal(error, ["issuance_fee_commitment_unavailable", 503, "issuance_fee_commitment_unavailable"]); equal(f.calls.map(c => c[0]), [load]); equal(f.state.committed, null); equal(getters, 0);
  }
});
