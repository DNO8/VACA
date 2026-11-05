import { Keypair, TransactionBuilder, Networks, Transaction, xdr, hash } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { createCustodyHandler, CustodyError } from "../../functions/d1-custody/handler.ts";
import { withInitialSubmissionAuthorization } from "../../functions/d1-custody/initial-submission-authorization.ts";
import { recordInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome-journal.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { fixture, equal, pool, admin, team, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";

type DTO = Record<string, any>;
type Reply = { data: any; error: unknown };
const load = "d1_load_issuance_outcome";
const reads = [load, "d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"];
const wallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 104));
async function setup(failed = false, issued = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture();
  const scope = { request_id: requestId, namespace, network: "TESTNET", pool };
  let signed: DTO | null = null, attempt: DTO | null = null, unsigned: DTO | undefined, receipt: DTO | null = null;
  let actions = 0;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const hooks = { reply: (_name: string, r: Reply): Reply => r };
  const client = { async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
    calls.push({ name, args: structuredClone(args) }); let data: unknown;
    if (name === load) data = { kind: "d1_issuance_outcome_lookup", revision: 1, ...scope, outcome: receipt };
    else if (name === "d1_load_submission_attempt") data = { kind: "d1_submission_attempt_lookup", revision: 1, ...scope, attempt };
    else if (name === "d1_load_signed_transaction") data = { kind: "d1_signed_transaction_lookup", revision: 1, ...scope, transaction: signed };
    else if (name === "d1_load_initial_financial_observation") data = { kind: "d1_initial_financial_observation_lookup", revision: 1, ...scope,
      transaction_hash: unsigned!.transaction_hash, snapshot_hash: args.p_snapshot_hash,
      observation: f.h.persisted.get(String(args.p_snapshot_hash)) ?? null };
    else if (name === "d1_record_signed_transaction") data = signed = { kind: "d1_signed_transaction_journal", revision: 1, ...scope,
      authorized_by: admin, transaction_hash: unsigned!.transaction_hash, snapshot_hash: args.p_snapshot_hash,
      signed_xdr: args.p_signed_xdr, envelope_hash: hash(Buffer.from(String(args.p_signed_xdr), "base64")).toString("hex"),
      reservation: structuredClone(unsigned!.reservation) };
    else if (name === "d1_claim_submission_attempt") data = { kind: "d1_submission_claim", revision: 1, claimed: true,
      attempt: attempt = { kind: "d1_submission_attempt", revision: 1, ...scope, authorized_by: admin,
        transaction_hash: signed!.transaction_hash, envelope_hash: signed!.envelope_hash, snapshot_hash: args.p_snapshot_hash,
        attempt_id: args.p_attempt_id, claimed_at: f.h.now, reservation: structuredClone(unsigned!.reservation) } };
    else if (name === "d1_record_issuance_outcome") data = receipt = { kind: "d1_issuance_outcome_journal", revision: 1, ...scope,
      authorized_by: team, attempt_id: attempt!.attempt_id, transaction_hash: signed!.transaction_hash,
      envelope_hash: signed!.envelope_hash, outcome_hash: "d".repeat(64), observed_outcome: structuredClone(args.p_observed_outcome) };
    else {
      const r = await f.h.client.rpc(name, args);
      if (name === "d1_load_unsigned_transaction") unsigned = structuredClone((r.data as DTO).transaction);
      return hooks.reply(name, r);
    }
    return hooks.reply(name, { data: structuredClone(data), error: null });
  } };
  const configuration = { ...f.configuration, loadPoolSigner() { return Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)); } };
  await withInitialSubmissionAuthorization(client, configuration, () => undefined);
  const tx = TransactionBuilder.fromXDR(signed!.signed_xdr, Networks.TESTNET);
  if (!(tx instanceof Transaction)) throw Error("fixture ordinary transaction expected");
  const inner = failed ? xdr.CreateClaimableBalanceResult.createClaimableBalanceUnderfunded() :
    xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR(tx.getClaimableBalanceId(0), "hex"));
  const operations = [xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(inner))];
  const result = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("100"),
    result: failed ? xdr.TransactionResultResult.txFailed(operations) : xdr.TransactionResultResult.txSuccess(operations),
    ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
  const token = ((11n << 32n) + 4096n).toString(), ledgerHash = "f".repeat(64);
  const time = new Date((closedAt + 5) * 1000).toISOString().replace(".000Z", "Z");
  const observation = parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: { sequence: 11, hash: ledgerHash, closedAt: closedAt + 5 } },
    ledger: { sequence: 11, hash: ledgerHash, closed_at: time },
    transaction: { hash: tx.hash().toString("hex"), paging_token: token, ledger: 11, created_at: time,
      source_account: pool, source_account_sequence: tx.sequence, fee_account: pool, fee_charged: "100", max_fee: tx.fee,
      successful: !failed, operation_count: 1, envelope_xdr: tx.toXDR(), result_xdr: result } });
  f.h.records.push(observation); f.h.history.record_count++; f.h.history.page_count++;
  Object.assign(f.h.history.checkpoint, { cursor: token, through_ledger: 11, ledger_hash: ledgerHash, closed_at: closedAt + 5 });
  Object.assign(f.h.history.income_state.checkpoint, { ...f.h.history.checkpoint, cursor: (BigInt(token) + 1n).toString() });
  await recordInitialIssuanceOutcome(client, configuration);
  // Only the public HTTP invocation below is under test; all fixtures are local SDK evidence.
  const never = (): never => { actions++; throw Error("PRIVATE_PROVIDER_XDR_SECRET_DO_NOT_LEAK"); };
  configuration.loadPoolSigner = never; configuration.source.readAccountAtCheckpoint = never;
  const fetcher: typeof fetch = never;
  const handler = createCustodyHandler({ poolSigner: Keypair.fromPublicKey(pool), now: () => f.h.now,
    issuance: { client, configuration, fetcher } });
  function request(change: DTO = {}, badSignature = false) {
    const message: DTO = { version: 1, network: "TESTNET", pool, namespace, action: "issue", request_id: requestId,
      timestamp: f.h.now, payload: {}, wallet: admin, ...change };
    const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
    const signature = (badSignature ? Keypair.fromRawEd25519Seed(Buffer.alloc(32, 102)) : wallet)
      .sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical))).toString("base64");
    return new Request("https://local.invalid/functions/v1/d1-custody/issue", { method: "POST", body: JSON.stringify({ ...message, signature }) });
  }
  const state = () => JSON.stringify([f.h.owner, f.h.history, f.h.credit, f.h.records, [...f.h.persisted], signed, attempt, receipt]);
  const counters = () => [actions, f.h.persisted.size, f.h.records.length, f.h.history.record_count, f.h.history.page_count];
  calls.length = 0; f.h.calls.length = 0;
  return { f, calls, hooks, handler, request, state, counters, tx, get receipt() { return receipt!; }, get signed() { return signed!; } };
}
type H = Awaited<ReturnType<typeof setup>>;
async function response(h: H, status: number, body: unknown, request = h.request()) {
  const before = h.state(), counters = h.counters(), reply = await h.handler(request);
  equal(reply.status, status);
  equal([...reply.headers], [["cache-control", "no-store"], ["content-type", "application/json"]]);
  equal(await reply.text(), JSON.stringify(body)); // Exact allowlist also forbids XDR/provider/private-field leakage.
  equal(h.state(), before); equal(h.counters(), counters); equal(h.counters()[0], 0);
  equal(h.calls.filter(c => !reads.includes(c.name)), []);
  for (const { name, args } of h.calls) {
    const expected: DTO = { p_request_id: requestId, p_authorized_by: admin };
    if (name === "d1_load_initial_financial_observation") expected.p_snapshot_hash = h.signed.snapshot_hash;
    equal(args, expected);
  }
}
const errorBody = { error: "initial_submission_unavailable" };
function selected(h: H, failed: boolean) {
  const p = h.signed.reservation.intent.preparation_input;
  return { state: failed ? "issuance_failed_observed" : "issuance_observed", verification: "persisted_sdk_observation",
    requestId, transactionHash: h.signed.transaction_hash, donor: p.payment.donor, beneficiary: p.request.beneficiary,
    asset: p.request.asset, amount: p.request.amount, paymentTransactionHash: p.payment.transaction_hash, deadline: p.request.deadline,
    ...(!failed ? { claimableBalanceId: h.tx.getClaimableBalanceId(0) } : {}) };
}
Deno.test("issue HTTP existing 032 native and issued success plus included failure return only SDK-validated selected mapping", async () => {
  for (const [failed, issued] of [[false, false], [false, true], [true, false]]) {
    const h = await setup(failed, issued);
    // Current discovery is intentionally unusable: historical evidence must not fetch or ingest it.
    h.f.h.history.coverage_complete = false;
    await response(h, 200, selected(h, failed));
    equal(h.calls[0].name, load); equal(h.calls.filter(c => c.name === load).length, 1);
    for (const name of reads.slice(1)) equal(h.calls.some(c => c.name === name), true);
    equal(h.f.h.calls.filter(n => n !== "d1_load_unsigned_transaction"), []);
  }
});
Deno.test("issue HTTP rejects forged stored CB signature and unsigned preparation instead of projecting unvalidated donor data", async () => {
  for (const fault of ["cb", "signature", "unsigned", "paymentHash"]) {
    const h = await setup();
    h.hooks.reply = (name, r) => {
      if (name === load && fault === "cb") r.data.outcome.observed_outcome.claimableBalanceId = "00000000" + "0".repeat(64);
      if (name === "d1_load_signed_transaction" && fault === "signature") {
        const tx = TransactionBuilder.fromXDR(r.data.transaction.signed_xdr, Networks.TESTNET);
        if (!(tx instanceof Transaction)) throw Error("fixture");
        tx.signatures[0] = new xdr.DecoratedSignature({ hint: tx.signatures[0].hint(), signature: Buffer.alloc(64) });
        r.data.transaction.signed_xdr = tx.toXDR(); r.data.transaction.envelope_hash = hash(Buffer.from(tx.toXDR(), "base64")).toString("hex");
      }
      if (name === "d1_load_unsigned_transaction" && fault === "unsigned") r.data.transaction.reservation.intent.preparation_input.request.beneficiary = team;
      if (name === "d1_load_unsigned_transaction" && fault === "paymentHash") r.data.transaction.reservation.intent.preparation_input.payment.transaction_hash = "PRIVATE_NOT_A_HASH";
      return r;
    };
    await response(h, 503, errorBody); equal(h.calls.filter(c => c.name === load).length, 1);
  }
});
Deno.test("issue HTTP invalid stale and wrong-scope proofs reject before the outcome lookup or any action", async () => {
  for (const [change, badSignature, status, code] of [
    [{}, true, 401, "invalid_signature"], [{ timestamp: 0 }, false, 401, "stale_request"],
    [{ namespace: requestId }, false, 400, "invalid_request"], [{ pool: team }, false, 400, "invalid_request"],
  ] as const) {
    const h = await setup(); await response(h, status, { error: code }, h.request(change, badSignature));
    equal(h.calls, []); equal(h.f.h.calls, []);
  }
});
Deno.test("issue HTTP malformed bounded and erroneous 032 lookups fail closed without pending fallback or getters", async () => {
  for (const fault of ["missing", "null", "getter", "replyGetter", "cycle", "bytes", "scope", "request", "network", "pool", "extra", "error", "dataError"]) {
    const h = await setup(); let getters = 0;
    h.hooks.reply = (name, r) => {
      if (name !== load) return r;
      if (fault === "missing") delete r.data.outcome;
      if (fault === "null") r.data = null;
      if (fault === "getter") Object.defineProperty(r.data, "outcome", { enumerable: true, get() { getters++; throw Error("PRIVATE"); } });
      if (fault === "replyGetter") Object.defineProperty(r, "data", { enumerable: true, get() { getters++; throw Error("PRIVATE"); } });
      if (fault === "cycle") r.data.outcome = r.data;
      if (fault === "bytes") r.data.outcome = "x".repeat(2097153);
      if (fault === "scope") r.data.namespace = requestId;
      if (fault === "request") r.data.request_id = namespace;
      if (fault === "network") r.data.network = "PUBLIC";
      if (fault === "pool") r.data.pool = team;
      if (fault === "extra") r.data.extra = true;
      if (fault === "error") return { data: null, error: { code: "PRIVATE", message: "PROVIDER_JSON_SECRET" } };
      if (fault === "dataError") return { data: r.data, error: { code: "42501", message: "unauthorized_admin_wallet" } };
      return r;
    };
    await response(h, 503, errorBody); equal(getters, 0); equal(h.calls.map(c => c.name), [load]); equal(h.f.h.calls, []);
  }
});
Deno.test("issue HTTP only exact null-data database admin denial is 403; thrown dependency denial is sanitized 503", async () => {
  for (const database of [true, false]) {
    const h = await setup(); h.hooks.reply = name => {
      equal(name, load);
      if (!database) throw new CustodyError("unauthorized_admin_wallet", 403);
      return { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
    };
    await response(h, database ? 403 : 503, database ? { error: "unauthorized_admin_wallet" } : errorBody);
    equal(h.calls.map(c => c.name), [load]); equal(h.f.h.calls, []);
  }
});
