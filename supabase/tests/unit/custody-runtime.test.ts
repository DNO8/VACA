import { Buffer } from "node:buffer";
import { hash, Keypair, Networks, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { createCustodyRuntime, type PrivateCustodyRuntime } from "../../functions/d1-custody/runtime.ts";
import { createCustodyHandler, type CustodyConfiguration } from "../../functions/d1-custody/handler.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { recordInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome-journal.ts";
import { fixture, equal, pool, admin, team, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";

type DTO = Record<string, any>;
type Reply = { data: any; error: unknown };
const wallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 104));
const outcomeLoad = "d1_load_issuance_outcome", attemptLoad = "d1_load_submission_attempt", claim = "d1_claim_submission_attempt";
const iso = (time: number) => new Date(time * 1000).toISOString().replace(".000Z", "Z");
function setup() {
  const f = fixture(), scope = { request_id: requestId, namespace, network: "TESTNET", pool };
  let signed: DTO | null = null, attempt: DTO | null = null, unsigned: DTO | null = null, receipt: DTO | null = null;
  let keys = 0, posts = 0, accounts = 0, pages = 0, availability = 0;
  const trace: string[] = [], calls: { name: string; args: Record<string, unknown> }[] = [];
  const hooks = { deny: false, unknown: false, financial: false, transport: false };
  const client = { async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
    trace.push(name); calls.push({ name, args: structuredClone(args) });
    if (hooks.deny) return { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
    let data: unknown;
    if (name === outcomeLoad) data = { kind: "d1_issuance_outcome_lookup", revision: 1, ...scope, outcome: receipt };
    else if (name === attemptLoad) data = { kind: "d1_submission_attempt_lookup", revision: 1, ...scope, attempt };
    else if (name === "d1_load_signed_transaction") data = { kind: "d1_signed_transaction_lookup", revision: 1, ...scope, transaction: signed };
    else if (name === "d1_load_initial_financial_observation") data = { kind: "d1_initial_financial_observation_lookup", revision: 1,
      ...scope, transaction_hash: unsigned!.transaction_hash, snapshot_hash: args.p_snapshot_hash,
      observation: f.h.persisted.get(String(args.p_snapshot_hash)) ?? null };
    else if (name === "d1_record_signed_transaction") data = signed = { kind: "d1_signed_transaction_journal", revision: 1, ...scope,
      authorized_by: admin, transaction_hash: unsigned!.transaction_hash, snapshot_hash: args.p_snapshot_hash,
      signed_xdr: args.p_signed_xdr, envelope_hash: hash(Buffer.from(String(args.p_signed_xdr), "base64")).toString("hex"),
      reservation: structuredClone(unsigned!.reservation) };
    else if (name === claim) {
      const existed = attempt !== null;
      attempt ??= { kind: "d1_submission_attempt", revision: 1, ...scope, authorized_by: admin,
        transaction_hash: signed!.transaction_hash, envelope_hash: signed!.envelope_hash, snapshot_hash: args.p_snapshot_hash,
        attempt_id: args.p_attempt_id, claimed_at: f.h.now, reservation: structuredClone(unsigned!.reservation) };
      if (hooks.unknown) throw Error("PRIVATE_UNKNOWN_CLAIM");
      data = { kind: "d1_submission_claim", revision: 1, claimed: !existed, attempt };
    } else if (name === "d1_record_issuance_outcome") data = receipt = { kind: "d1_issuance_outcome_journal", revision: 1, ...scope,
      authorized_by: team, attempt_id: attempt!.attempt_id, transaction_hash: signed!.transaction_hash,
      envelope_hash: signed!.envelope_hash, outcome_hash: "d".repeat(64), observed_outcome: structuredClone(args.p_observed_outcome) };
    else {
      const reply = await f.h.client.rpc(name, args);
      if (name === "d1_load_unsigned_transaction") unsigned = structuredClone((reply.data as DTO).transaction);
      return reply;
    }
    return { data: structuredClone(data), error: null };
  } };
  const configuration = { namespace, pool, now: () => f.h.now, maximumAgeSeconds: 30, futureToleranceSeconds: 2,
    source: { async readAccountAtCheckpoint() {
      accounts++; trace.push("account"); if (hooks.financial) throw Error("PRIVATE_FINANCIAL_DENIAL");
      return await f.h.source.readAccountAtCheckpoint();
    } },
    loadPoolSigner() { keys++; trace.push("signer"); return Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)); } };
  const fetcher: typeof fetch = async () => {
    posts++; trace.push("POST"); if (hooks.transport) throw Error("PRIVATE_TRANSPORT_FAILURE");
    return Response.json({ hash: signed!.transaction_hash, private_provider: "DO_NOT_LEAK" });
  };
  const reconciliationSource = {
    async readPage(): Promise<never> { pages++; throw Error("PRIVATE_PAGE_FORBIDDEN"); },
    async readTransactionPageAtCheckpoint(): Promise<never> { pages++; throw Error("PRIVATE_PAGE_FORBIDDEN"); },
  };
  const lifecycle: PrivateCustodyRuntime = { client, configuration, fetcher, reconciliationSource };
  const base: CustodyConfiguration = { poolSigner: Keypair.fromPublicKey(pool), now: () => f.h.now };
  function runtime(option: PrivateCustodyRuntime | undefined = lifecycle) { return createCustodyRuntime(base, option); }
  function request(action = "issue", change: DTO = {}, bad = false) {
    const message: DTO = { version: 1, network: "TESTNET", pool, namespace, action, request_id: requestId,
      timestamp: f.h.now, payload: {}, wallet: admin, ...change };
    const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
    const signer = bad ? Keypair.fromRawEd25519Seed(Buffer.alloc(32, 102)) : wallet;
    const signature = signer.sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical))).toString("base64");
    return new Request("https://local.invalid/functions/v1/d1-custody/" + action,
      { method: "POST", body: JSON.stringify({ ...message, signature }) });
  }
  const principal = () => JSON.stringify([f.h.owner, f.h.history, f.h.credit, f.h.records, f.h.receipt]);
  const stored = () => JSON.stringify([principal(), [...f.h.persisted], signed, attempt, receipt]);
  const counters = () => [keys, posts, accounts, pages, availability, f.h.persisted.size, f.h.records.length];
  const clear = () => { trace.length = 0; calls.length = 0; f.h.calls.length = 0; };
  async function observe() {
    const tx = TransactionBuilder.fromXDR(signed!.signed_xdr, Networks.TESTNET);
    if (!(tx instanceof Transaction)) throw Error("ordinary fixture expected");
    const operation = xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(
      xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR(tx.getClaimableBalanceId(0), "hex"))));
    const result = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("100"),
      result: xdr.TransactionResultResult.txSuccess([operation]), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
    const token = ((11n << 32n) + 4096n).toString(), ledgerHash = "f".repeat(64), time = iso(closedAt + 5);
    const observation = parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: { sequence: 11, hash: ledgerHash, closedAt: closedAt + 5 } },
      ledger: { sequence: 11, hash: ledgerHash, closed_at: time }, transaction: { hash: tx.hash().toString("hex"), paging_token: token,
        ledger: 11, created_at: time, source_account: pool, source_account_sequence: tx.sequence, fee_account: pool, fee_charged: "100",
        max_fee: tx.fee, successful: true, operation_count: 1, envelope_xdr: tx.toXDR(), result_xdr: result } });
    f.h.records.push(observation); f.h.history.record_count++; f.h.history.page_count++;
    Object.assign(f.h.history.checkpoint, { cursor: token, through_ledger: 11, ledger_hash: ledgerHash, closed_at: closedAt + 5 });
    Object.assign(f.h.history.income_state.checkpoint, { ...f.h.history.checkpoint, cursor: (BigInt(token) + 1n).toString() });
    await recordInitialIssuanceOutcome(client, { ...configuration, requestId, authenticatedAdmin: admin });
    return tx.getClaimableBalanceId(0);
  }
  const availabilityFetcher: typeof fetch = async () => { availability++; return new Response("PRIVATE_MISSING", { status: 404 }); };
  return { f, base, lifecycle, configuration, runtime, request, principal, stored, counters, clear, calls, trace, hooks, observe,
    availabilityFetcher, get signed() { return signed!; }, get attempt() { return attempt!; } };
}
type Harness = ReturnType<typeof setup>;
async function response(reply: Response, status: number, body: unknown) {
  equal(reply.status, status); equal([...reply.headers], [["cache-control", "no-store"], ["content-type", "application/json"]]);
  equal(await reply.text(), JSON.stringify(body));
}
async function pending(h: Harness) {
  const reply = await h.runtime()(h.request()); equal(reply.status, 202);
  await response(reply, 202, { state: "pending", verification: "unverified", requestId, transactionHash: h.signed.transaction_hash });
}
async function rejected(h: Harness, action: string, status: number, code: string, change: DTO = {}, bad = false) {
  const before = h.stored(), counts = h.counters();
  await response(await h.runtime()(h.request(action, change, bad)), status, { error: code });
  equal(h.stored(), before); equal(h.counters(), counts);
}
Deno.test("runtime default preserves config prepare and unmatched public responses without private dependencies", async () => {
  const h = setup(); let payments = 0, preparations = 0;
  const incident = "runtime legacy", paymentHash = "a".repeat(64), beneficiary = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 103)).publicKey();
  const base = { ...h.base, ledger: { async payment() { payments++; return { transaction_hash: paymentHash, operation_id: "1",
    donor: team, pool, asset: { type: "native" as const }, amount: "1.0000000", confirmed_at: closedAt, ledger: 10,
    memo_hash: hash(Buffer.from("vaca.d1.donation.v1\n" + incident)).toString("hex") }; } },
    database: { async prepare(input: unknown) { preparations++; return { kind: "preserved_preparation", input }; } } };
  const message: DTO = { version: 1, network: "TESTNET", pool, action: "prepare", request_id: requestId, timestamp: h.f.h.now,
    payload: { amount: "1.0000000", beneficiary, incident_id: incident, operation_id: "1", transaction_hash: paymentHash }, wallet: admin };
  const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
  const signature = wallet.sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical))).toString("base64");
  const prepare = new Request("https://local.invalid/functions/v1/d1-custody/prepare", { method: "POST", body: JSON.stringify({ ...message, signature }) });
  for (const request of [new Request("https://local.invalid/functions/v1/d1-custody/config"), prepare,
    new Request("https://local.invalid/missing"), h.request(), h.request("reconcile")]) {
    const old = await createCustodyHandler(base)(request.clone()), current = await createCustodyRuntime(base)(request.clone());
    equal([current.status, [...current.headers], await current.text()], [old.status, [...old.headers], await old.text()]);
  }
  equal([payments, preparations], [2, 2]); equal(h.counters(), [0, 0, 0, 0, 0, 0, 2]); equal(h.calls, []);
});
Deno.test("runtime private composition is lazy then reaches real SDK signing and one pending submission", async () => {
  const h = setup(), before = h.principal(); h.runtime(); equal([h.trace, h.calls, h.counters()], [[], [], [0, 0, 0, 0, 0, 0, 2]]);
  await pending(h); equal(h.principal(), before); equal(h.counters(), [1, 1, 4, 0, 0, 1, 2]);
  equal(h.trace.indexOf("account") < h.trace.indexOf("signer"), true);
  equal(h.trace.indexOf("d1_record_fresh_initial_financial_observation") < h.trace.indexOf("signer"), true);
  equal(h.trace.slice(-2), [claim, "POST"]); equal(h.calls.filter(c => c.name === claim).length, 1);
  h.clear(); const stored = h.stored(), counters = h.counters(); await pending(h);
  equal(h.stored(), stored); equal(h.counters(), counters); equal(h.trace.filter(n => n === claim || n === "POST" || n === "signer"), []);
});
Deno.test("runtime mounts action-specific cached reconciliation and saved outcome without secret or page reads", async () => {
  const h = setup(); await pending(h); const id = await h.observe(); h.clear();
  const before = h.stored(), counters = h.counters();
  await response(await h.runtime()(h.request("reconcile")), 200,
    { state: "issuance_outcome_recorded", requestId, transactionHash: h.signed.transaction_hash, outcome: "success" });
  const input = h.signed.reservation.intent.preparation_input;
  await response(await h.runtime()(h.request()), 200, { state: "issuance_observed", verification: "persisted_sdk_observation", requestId,
    transactionHash: h.signed.transaction_hash, donor: input.payment.donor, beneficiary: input.request.beneficiary,
    asset: input.request.asset, amount: input.request.amount, paymentTransactionHash: input.payment.transaction_hash,
    deadline: input.request.deadline, claimableBalanceId: id });
  equal(h.stored(), before); equal(h.counters(), counters);
  equal(h.calls.filter(c => !c.name.startsWith("d1_load_")), []);
});
Deno.test("runtime rejects bad stale and wrong-scope proofs before private RPC signer or transport", async () => {
  for (const action of ["issue", "reconcile"]) for (const [change, bad, code, status] of [
    [{}, true, "invalid_signature", 401], [{ timestamp: 0 }, false, "stale_request", 401],
    [{ namespace: requestId }, false, "invalid_request", 400], [{ payload: { amount: "1.0000000" } }, false, "invalid_request", 400],
  ] as const) {
    const h = setup(); await rejected(h, action, status, code, change, bad);
    equal([h.calls, h.f.h.calls, h.counters()], [[], [], [0, 0, 0, 0, 0, 0, 2]]);
  }
});
Deno.test("runtime preserves database admin denial and denies financial access before loading the private signer", async () => {
  for (const action of ["issue", "reconcile"]) {
    const h = setup(); h.hooks.deny = true; await rejected(h, action, 403, "unauthorized_admin_wallet");
    equal(h.counters(), [0, 0, 0, 0, 0, 0, 2]); equal(h.f.h.calls, []); equal(h.calls.length, 1);
  }
  const h = setup(); h.hooks.financial = true;
  const before = h.principal(); await response(await h.runtime()(h.request()), 503, { error: "initial_submission_unavailable" });
  equal(h.principal(), before); equal(h.counters(), [0, 0, 1, 0, 0, 0, 2]);
  equal(h.trace.filter(n => n === claim || n === "signer" || n === "POST"), []);
});
Deno.test("runtime retains unknown attempts without post retry readback or ownership disposition", async () => {
  for (const unknownClaim of [true, false]) {
    const h = setup(); h.hooks.unknown = unknownClaim; h.hooks.transport = !unknownClaim; const before = h.principal();
    await response(await h.runtime()(h.request()), 503, { error: "initial_submission_unavailable" });
    equal(h.principal(), before); equal(h.counters().slice(0, 5), [1, unknownClaim ? 0 : 1, 4, 0, 0]);
    equal(h.trace.at(-1), unknownClaim ? claim : "POST"); equal(h.calls.filter(c => c.name === claim).length, 1);
    equal(h.calls.filter(c => c.name === attemptLoad).length, 1); equal(typeof h.attempt.attempt_id, "string");
    h.clear(); const stored = h.stored(), counters = h.counters(); await pending(h);
    equal(h.stored(), stored); equal(h.counters(), counters); equal(h.trace.filter(n => n === claim || n === "POST"), []);
  }
});
Deno.test("runtime passes only explicit availability transport and absence never triggers submission or disposition", async () => {
  const h = setup(); await pending(h); await h.observe(); h.clear();
  const before = h.stored(), counters = h.counters();
  await response(await h.runtime({ ...h.lifecycle, availabilityFetcher: h.availabilityFetcher })(h.request()), 503,
    { error: "initial_submission_unavailable" });
  equal(h.stored(), before); equal(h.counters(), counters.map((n, i) => i === 4 ? n + 1 : n));
  equal(h.calls.filter(c => !c.name.startsWith("d1_load_")), []); equal(h.trace.filter(n => n === "POST" || n === claim), []);
});
