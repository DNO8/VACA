import { Keypair, TransactionBuilder, Networks, Transaction, xdr, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { recordInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome-journal.ts";
import { withInitialSubmissionAuthorization } from "../../functions/d1-custody/initial-submission-authorization.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { fixture, equal, pool, admin, team, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";
type DTO = Record<string, any>;
type Reply = { data: any; error: unknown };
const load = "d1_load_issuance_outcome", save = "d1_record_issuance_outcome", loadAttempt = "d1_load_submission_attempt";
async function setup(failed = false, issued = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture();
  const scope = { request_id: requestId, namespace, network: "TESTNET", pool }, trace: string[] = [];
  let signed: DTO | null = null, attempt: DTO | null = null, unsigned: DTO, receipt: DTO | null = null, keys = 0;
  const hooks = { reply: (_name: string, r: Reply): Reply => r, afterSave: () => {}, concurrent: false };
  const client = { async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
    trace.push(name); let data: unknown;
    if (name === load) data = { kind: "d1_issuance_outcome_lookup", revision: 1, ...scope, outcome: receipt };
    else if (name === loadAttempt) data = { kind: "d1_submission_attempt_lookup", revision: 1, ...scope, attempt };
    else if (name === "d1_load_signed_transaction") data = { kind: "d1_signed_transaction_lookup", revision: 1, ...scope, transaction: signed };
    else if (name === "d1_load_initial_financial_observation") data = { kind: "d1_initial_financial_observation_lookup", revision: 1, ...scope,
      transaction_hash: unsigned.transaction_hash, snapshot_hash: args.p_snapshot_hash, observation: f.h.persisted.get(String(args.p_snapshot_hash)) ?? null };
    else if (name === "d1_record_signed_transaction") data = signed = { kind: "d1_signed_transaction_journal", revision: 1, ...scope,
      authorized_by: admin, transaction_hash: unsigned.transaction_hash, snapshot_hash: args.p_snapshot_hash,
      signed_xdr: args.p_signed_xdr, envelope_hash: digest(Buffer.from(String(args.p_signed_xdr), "base64")).toString("hex"), reservation: structuredClone(unsigned.reservation) };
    else if (name === "d1_claim_submission_attempt") data = { kind: "d1_submission_claim", revision: 1, claimed: true,
      attempt: attempt = { kind: "d1_submission_attempt", revision: 1, ...scope, authorized_by: admin,
        transaction_hash: signed!.transaction_hash, envelope_hash: signed!.envelope_hash, snapshot_hash: args.p_snapshot_hash,
        attempt_id: args.p_attempt_id, claimed_at: f.h.now, reservation: structuredClone(unsigned.reservation) } };
    else if (name === save) {
      equal(Object.keys(args).sort(), ["p_request_id", "p_authorized_by", "p_observed_outcome"].sort());
      equal([args.p_request_id, args.p_authorized_by], [requestId, admin]);
      receipt ??= { kind: "d1_issuance_outcome_journal", revision: 1, ...scope, authorized_by: hooks.concurrent ? team : admin,
        attempt_id: attempt!.attempt_id, transaction_hash: signed!.transaction_hash, envelope_hash: signed!.envelope_hash,
        outcome_hash: "d".repeat(64), observed_outcome: structuredClone(args.p_observed_outcome) };
      hooks.afterSave(); data = receipt;
    } else {
      const r = await f.h.client.rpc(name, args); if (name === "d1_load_unsigned_transaction") unsigned = structuredClone((r.data as DTO).transaction);
      return hooks.reply(name, r);
    }
    return hooks.reply(name, { data: structuredClone(data), error: null });
  } };
  const configuration = { ...f.configuration, loadPoolSigner() { keys++; return Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)); } };
  await withInitialSubmissionAuthorization(client, configuration, () => undefined);
  const tx = TransactionBuilder.fromXDR(signed!.signed_xdr, Networks.TESTNET); if (!(tx instanceof Transaction)) throw Error("fixture");
  const inner = failed ? xdr.CreateClaimableBalanceResult.createClaimableBalanceUnderfunded() :
    xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR(tx.getClaimableBalanceId(0), "hex"));
  const operations = [xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(inner))];
  const result = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("100"),
    result: failed ? xdr.TransactionResultResult.txFailed(operations) : xdr.TransactionResultResult.txSuccess(operations),
    ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
  const token = ((11n << 32n) + 4096n).toString(), hash = "f".repeat(64);
  const time = new Date((closedAt + 5) * 1000).toISOString().replace(".000Z", "Z");
  const raw = { context: { pool, firstLedger: 8, anchor: { sequence: 11, hash, closedAt: closedAt + 5 } },
    ledger: { sequence: 11, hash, closed_at: time },
    transaction: { hash: tx.hash().toString("hex"), paging_token: token, ledger: 11, created_at: time,
      source_account: pool, source_account_sequence: tx.sequence, fee_account: pool, fee_charged: "100", max_fee: tx.fee,
      successful: !failed, operation_count: 1, envelope_xdr: tx.toXDR(), result_xdr: result } };
  const observation = parseIncludedTransaction(raw); f.h.records.push(observation); f.h.history.record_count++; f.h.history.page_count++;
  Object.assign(f.h.history.checkpoint, { cursor: token, through_ledger: 11, ledger_hash: hash, closed_at: closedAt + 5 });
  Object.assign(f.h.history.income_state.checkpoint, { ...f.h.history.checkpoint, cursor: (BigInt(token) + 1n).toString() });
  trace.length = 0; f.h.calls.length = 0;
  return { f, client, configuration, hooks, trace, raw, tx, observation, get signed() { return signed!; }, get attempt() { return attempt!; },
    get receipt() { return receipt; }, get keys() { return keys; }, missingAttempt() { attempt = null; }, missingSigned() { signed = null; } };
}
type H = Awaited<ReturnType<typeof setup>>;
const state = (h: H) => JSON.stringify([h.f.h.owner, h.f.h.history, h.f.h.credit, h.f.h.records, [...h.f.h.persisted], h.signed, h.attempt]);
async function reject(h: H, status = 503) {
  const before = state(h); let error: unknown;
  try { await recordInitialIssuanceOutcome(h.client, h.configuration); } catch (e) { error = e; }
  const code = status === 403 ? "unauthorized_admin_wallet" : "initial_issuance_journal_unavailable";
  equal(error instanceof CustodyError ? [error.code, error.status, error.message] : error, [code, status, code]); equal(state(h), before);
  equal(h.trace.filter(n => n === save).length <= 1, true); equal(h.keys, 1);
}
Deno.test("outcome journal internally validates native issued and failed evidence before one save without financial effects", async () => {
  for (const [failed, issued] of [[false, false], [false, true], [true, false]]) {
    const h = await setup(failed, issued), before = state(h), receipt = await recordInitialIssuanceOutcome(h.client, h.configuration);
    equal([receipt.kind, receipt.observed_outcome.outcome, receipt.observed_outcome.claimableBalanceId],
      ["d1_issuance_outcome_journal", failed ? "failed" : "success", failed ? null : h.tx.getClaimableBalanceId(0)]);
    equal([receipt.attempt_id, receipt.transaction_hash, receipt.envelope_hash], [h.attempt.attempt_id, h.signed.transaction_hash, h.signed.envelope_hash]);
    equal([receipt.observed_outcome.observation.feeChargedStroops, receipt.observed_outcome.observation.sequence], ["100", h.tx.sequence]);
    equal([h.trace[0], h.trace.filter(n => n === save).length, h.keys], [load, 1, 1]); equal(state(h), before);
    equal([Object.isFrozen(receipt), Object.isFrozen(receipt.observed_outcome.observation.raw.transaction)], [true, true]);
    equal(h.trace.filter(n => ["d1_claim_submission_attempt", "d1_record_signed_transaction", "d1_record_fresh_initial_financial_observation", "account"].includes(n)), []);
  }
});
Deno.test("outcome journal historical replay revalidates stored raw and actual signed attempt without current history clock or signer", async () => {
  const h = await setup(); h.hooks.concurrent = true;
  const first = await recordInitialIssuanceOutcome(h.client, h.configuration); equal(first.authorized_by, team);
  const never = () => { throw Error("private/fresh forbidden"); }; h.configuration.now = never; h.configuration.loadPoolSigner = never;
  h.configuration.source.readAccountAtCheckpoint = never; h.f.h.history.coverage_complete = false;
  h.hooks.reply = (n, r) => { if (n === "d1_load_transaction_history_state" || n === "d1_list_transaction_records") throw Error("current history forbidden"); return r; };
  h.trace.length = 0; equal(await recordInitialIssuanceOutcome(h.client, h.configuration), first);
  equal(h.trace[0], load); equal(h.trace.includes(save), false); equal(h.keys, 1);
  h.receipt!.observed_outcome.observation.raw.transaction.result_xdr = "AAAA"; await reject(h); equal(h.trace.includes(save), false);
});
Deno.test("outcome journal requires existing actual attempt signed bytes and stable complete ingested SDK history", async () => {
  for (const fault of ["attempt", "signed", "unsigned", "membership", "missing", "incomplete", "drift", "forgedId"]) {
    const h = await setup();
    if (fault === "attempt") h.missingAttempt(); if (fault === "signed") h.missingSigned();
    if (fault === "missing") { h.f.h.records.pop(); h.f.h.history.record_count--; h.f.h.history.checkpoint.cursor = h.f.h.records.at(-1)!.pagingToken; }
    if (fault === "incomplete") h.f.h.history.coverage_complete = false;
    let reads = 0;
    h.hooks.reply = (n, r) => {
      if (fault === "unsigned" && n === "d1_load_unsigned_transaction") r.data.transaction.unsigned_xdr = h.signed.signed_xdr;
      if (fault === "membership" && n === "d1_load_initial_financial_observation") r.data.observation.snapshot.requestId = namespace;
      if (fault === "drift" && n === "d1_load_transaction_history_state" && ++reads === 2) r.data.page_count++;
      if (fault === "forgedId" && n === "d1_list_transaction_records") {
        const t = r.data.records.at(-1), tr = xdr.TransactionResult.fromXDR(t.raw.transaction.result_xdr, "base64");
        // XDR union arms are getters: rebuild the success union to change its ID.
        const wrong = xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR("00000000" + "0".repeat(64), "hex"));
        tr.result(xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(wrong))]));
        equal(tr.toXDR("base64") !== t.raw.transaction.result_xdr, true); t.raw.transaction.result_xdr = tr.toXDR("base64");
        const changed = parseIncludedTransaction({ context: t.context, ...t.raw }); r.data.records[r.data.records.length - 1] = changed;
      } return r;
    };
    try { await reject(h); } catch (error) { throw new Error(fault, { cause: error }); } equal(h.trace.includes(save), false);
    equal(h.trace.filter(n => ["d1_claim_submission_attempt", "d1_record_signed_transaction", "d1_record_fresh_initial_financial_observation"].includes(n)), []);
  }
});
Deno.test("outcome journal validates every saved receipt binding and exact decoded result", async () => {
  for (const fault of ["request_id", "namespace", "network", "pool", "attempt_id", "transaction_hash", "envelope_hash", "outcome_hash", "authorized_by", "outcome", "extra"]) {
    const h = await setup(); h.hooks.reply = (n, r) => {
      if (n !== save) return r;
      if (["request_id", "namespace", "attempt_id"].includes(fault)) r.data[fault] = crypto.randomUUID();
      else if (fault === "network") r.data.network = "PUBLIC";
      else if (fault === "pool") r.data.pool = team;
      else if (fault === "authorized_by") r.data.authorized_by = "secret_DO_NOT_LEAK";
      else if (fault === "outcome") r.data.observed_outcome.claimableBalanceId = "00000000" + "0".repeat(64);
      else if (fault === "extra") r.data.extra = true;
      else r.data[fault] = fault === "outcome_hash" ? "bad" : "0".repeat(64); return r;
    };
    await reject(h); equal(h.trace.at(-1), save); equal(h.trace.filter(n => n === save).length, 1);
  }
});
Deno.test("outcome journal awaits one durable save and unknown commit has no automatic readback retry or release", async () => {
  const h = await setup(); let entered!: () => void, release!: () => void, done = false;
  const reached = new Promise<void>(r => entered = r), barrier = new Promise<void>(r => release = r);
  const client = { async rpc(n: string, a: Record<string, unknown>) { const r = await h.client.rpc(n, a); if (n === save) { entered(); await barrier; } return r; } };
  const pending = recordInitialIssuanceOutcome(client, h.configuration).then(r => { done = true; return r; });
  await reached; equal(done, false); release(); await pending; equal(done, true);
  const x = await setup(); x.hooks.afterSave = () => { throw Error("unknown secret_DO_NOT_LEAK"); };
  await reject(x); equal(x.trace.at(-1), save); equal(x.trace.filter(n => n === save).length, 1);
  x.hooks.afterSave = () => {}; x.trace.length = 0; equal((await recordInitialIssuanceOutcome(x.client, x.configuration)).transaction_hash, x.signed.transaction_hash);
  equal(x.trace.includes(save), false);
});
Deno.test("outcome journal bounds lookup data without getters and accepts only exact database admin denial", async () => {
  for (const fault of ["getter", "cycle", "bytes", "scope", "extra", "db", "transport", "data"]) {
    const h = await setup(); let reads = 0;
    h.hooks.reply = (n, r) => {
      if (n !== load) return r;
      if (fault === "getter") Object.defineProperty(r.data, "outcome", { enumerable: true, get() { reads++; throw Error("secret"); } });
      if (fault === "cycle") r.data.bad = r.data; if (fault === "bytes") r.data.bad = "x".repeat(2097153);
      if (fault === "scope") r.data.namespace = requestId; if (fault === "extra") r.data.extra = true;
      if (fault === "transport") throw new CustodyError("unauthorized_admin_wallet", 403);
      if (fault === "db" || fault === "data") return { data: fault === "db" ? null : {}, error: { code: "42501", message: "unauthorized_admin_wallet" } };
      return r;
    };
    await reject(h, fault === "db" ? 403 : 503); equal(reads, 0); equal(h.trace, [load]); equal(h.receipt, null);
  }
});
