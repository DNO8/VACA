import { Keypair, TransactionBuilder, Transaction, Networks, Operation, Account, xdr, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { observeIssuanceAccountingContext, observeIssuanceAccountingWithHistory } from "../../functions/d1-custody/issuance-accounting-context.ts";
import { withInitialSubmissionAuthorization } from "../../functions/d1-custody/initial-submission-authorization.ts";
import { recordInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome-journal.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { fixture, equal, pool, admin, team, donor, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";
type DTO = Record<string, any>;
type Reply = { data: any; error: unknown };
const scope = { namespace, pool, requestId, authenticatedAdmin: admin };
async function setup(failed = false, issued = false, unmapped = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture();
  const binding = { request_id: requestId, namespace, network: "TESTNET", pool }, trace: string[] = [];
  let signed: DTO | null = null, attempt: DTO | null = null, unsigned: DTO = {}, receipt: DTO | null = null;
  let observing = false;
  const hooks = { reply: (_name: string, r: Reply): Reply => r };
  const client = { async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
    trace.push(name); let data: unknown;
    if (observing && !["d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction",
      "d1_load_initial_financial_observation", "d1_load_issuance_fee_commitments", "d1_load_active_issuance_sequence", "d1_load_transaction_history_state",
      "d1_list_transaction_records", "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit"].includes(name)) throw Error("write forbidden: " + name);
    if (name === "d1_load_issuance_outcome") data = { kind: "d1_issuance_outcome_lookup", revision: 1, ...binding, outcome: receipt };
    else if (name === "d1_load_submission_attempt") data = { kind: "d1_submission_attempt_lookup", revision: 1, ...binding, attempt };
    else if (name === "d1_load_signed_transaction") data = { kind: "d1_signed_transaction_lookup", revision: 1, ...binding, transaction: signed };
    else if (name === "d1_load_initial_financial_observation") data = { kind: "d1_initial_financial_observation_lookup", revision: 1, ...binding,
      transaction_hash: unsigned.transaction_hash, snapshot_hash: args.p_snapshot_hash, observation: f.h.persisted.get(String(args.p_snapshot_hash)) ?? null };
    else if (name === "d1_load_active_issuance_sequence") data = unsigned.reservation;
    else if (name === "d1_record_signed_transaction") data = signed = { kind: "d1_signed_transaction_journal", revision: 1, ...binding,
      authorized_by: team, transaction_hash: unsigned.transaction_hash, snapshot_hash: args.p_snapshot_hash, signed_xdr: args.p_signed_xdr,
      envelope_hash: digest(Buffer.from(String(args.p_signed_xdr), "base64")).toString("hex"), reservation: structuredClone(unsigned.reservation) };
    else if (name === "d1_claim_submission_attempt") data = { kind: "d1_submission_claim", revision: 1, claimed: true,
      attempt: attempt = { kind: "d1_submission_attempt", revision: 1, ...binding, authorized_by: admin, transaction_hash: signed!.transaction_hash,
        envelope_hash: signed!.envelope_hash, snapshot_hash: args.p_snapshot_hash, attempt_id: args.p_attempt_id, claimed_at: f.h.now, reservation: structuredClone(unsigned.reservation) } };
    else if (name === "d1_record_issuance_outcome") data = receipt = { kind: "d1_issuance_outcome_journal", revision: 1, ...binding, authorized_by: team,
      attempt_id: attempt!.attempt_id, transaction_hash: signed!.transaction_hash, envelope_hash: signed!.envelope_hash, outcome_hash: "d".repeat(64), observed_outcome: structuredClone(args.p_observed_outcome) };
    else {
      const r = await f.h.client.rpc(name, args);
      if (name === "d1_load_unsigned_transaction") unsigned = structuredClone((r.data as DTO).transaction);
      if (observing && name === "d1_load_discovery_state") r.data = structuredClone(f.h.history.income_state);
      return hooks.reply(name, r);
    }
    return hooks.reply(name, { data: structuredClone(data), error: null });
  } };
  await withInitialSubmissionAuthorization(client, { ...f.configuration, loadPoolSigner: () => Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)) }, () => undefined);
  equal(f.h.calls.filter(n => n === "account").length, 4);
  const tx = TransactionBuilder.fromXDR(signed!.signed_xdr, Networks.TESTNET); if (!(tx instanceof Transaction)) throw Error("fixture transaction");
  function append(transaction: Transaction, inner: xdr.OperationResultTr, successful: boolean, ledger: number) {
    const token = ((BigInt(ledger) << 32n) + 4096n).toString(), hash = "f".repeat(64), time = closedAt + ledger - 6;
    const results = [xdr.OperationResult.opInner(inner)];
    const raw = { context: { pool, firstLedger: 8, anchor: { sequence: ledger, hash, closedAt: time } },
      ledger: { sequence: ledger, hash, closed_at: new Date(time * 1000).toISOString().replace(".000Z", "Z") },
      transaction: { hash: transaction.hash().toString("hex"), paging_token: token, ledger, created_at: new Date(time * 1000).toISOString().replace(".000Z", "Z"),
        source_account: pool, source_account_sequence: transaction.sequence, fee_account: pool, fee_charged: "80", max_fee: transaction.fee, successful,
        operation_count: 1, envelope_xdr: transaction.toXDR(), result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("80"),
          result: successful ? xdr.TransactionResultResult.txSuccess(results) : xdr.TransactionResultResult.txFailed(results), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") } };
    f.h.records.push(parseIncludedTransaction(raw)); f.h.history.record_count++; f.h.history.page_count++;
    Object.assign(f.h.history.checkpoint, { cursor: token, through_ledger: ledger, ledger_hash: hash, closed_at: time });
    Object.assign(f.h.history.income_state.checkpoint, { ...f.h.history.checkpoint, cursor: (BigInt(token) + 1n).toString() });
  }
  const result = failed ? xdr.CreateClaimableBalanceResult.createClaimableBalanceUnderfunded() :
    xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR(tx.getClaimableBalanceId(0), "hex"));
  append(tx, xdr.OperationResultTr.createClaimableBalance(result), !failed, 11);
  await recordInitialIssuanceOutcome(client, scope);
  if (unmapped) {
    const other = new TransactionBuilder(new Account(pool, tx.sequence), { fee: "100", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 0 } })
      .addOperation(Operation.manageData({ name: "unmapped", value: null })).build();
    append(other, xdr.OperationResultTr.manageData(xdr.ManageDataResult.manageDataSuccess()), true, 12);
  }
  f.h.credit.discovery_state = structuredClone(f.h.history.income_state);
  const snapshot = () => JSON.stringify([f.h.owner, f.h.records, f.h.history, f.h.credit, [...f.h.persisted], signed, attempt, receipt]);
  const counters = () => f.h.calls.filter(n => n === "account" || !n.startsWith("d1_load_") && !n.startsWith("d1_list_")).length;
  observing = true; trace.length = 0;
  return { f, client, hooks, tx, trace, snapshot, counters, get receipt() { return receipt!; }, get unsigned() { return unsigned; } };
}
type H = Awaited<ReturnType<typeof setup>>;
async function observe(h: H) {
  const before = h.snapshot(), count = h.counters();
  const result = await observeIssuanceAccountingContext(h.client, scope);
  equal(h.snapshot(), before); equal(h.counters(), count);
  equal(h.trace.every(n => n.startsWith("d1_load_") || n.startsWith("d1_list_")), true);
  equal([result.kind, result.revision], ["d1_issuance_accounting_context", 1]);
  equal(result.held, { commitment: h.f.h.owner.commitment, activeOwner: h.unsigned.reservation });
  equal(result.included, { feeChargedStroops: "80", sequence: h.tx.sequence, claimableBalanceId: h.receipt.observed_outcome.claimableBalanceId });
  const fees = h.f.h.records.filter(r => r.feePayer === pool).reduce((n, r) => n + BigInt(r.feeChargedStroops), 0n).toString();
  equal(result.confirmedPoolFeesSpentStroops, fees);
  equal([Object.isFrozen(result), Object.isFrozen(result.accounting.donations), Object.isFrozen(result.held.commitment)], [true, true, true]);
  equal([Object.hasOwn(result, "release"), Object.hasOwn(result, "spendable"), Object.hasOwn(result, "refundPermission")], [false, false, false]);
  return result;
}
Deno.test("accounting context native and issued partial issuance preserves gross donor debt and unissued remainder", async () => {
  for (const issued of [false, true]) {
    const h = await setup(false, issued), r = await observe(h), a = r.accounting;
    equal(a.original.nativeDonorLiabilityStroops, "100000000");
    equal(a.original.issuedDonorLiabilities, issued ? [{ amountStroops: "100000000", code: "USD", issuer: h.f.h.account.issuedBalances[0].issuer }] : []);
    const selected = a.donations.find(d => d.asset.type === (issued ? "issued" : "native"))!;
    equal([selected.donor, selected.amountStroops, selected.issuedStroops, selected.unissuedStroops], [donor, "100000000", "10000000", "90000000"]);
    equal([a.encumbrances.length, a.encumbrances[0].authorizedBy, a.encumbrances[0].claimableBalanceId], [1, team, h.tx.getClaimableBalanceId(0)]);
    equal([r.held.commitment.issuance_fee_stroops, r.held.commitment.future_refund_fee_stroops], [h.tx.fee, "300"]);
    equal(BigInt(r.included.feeChargedStroops) < BigInt(h.tx.fee), true);
    equal(r.held.commitment === h.f.h.owner.commitment, false);
  }
});
Deno.test("accounting context included failure consumes exact fee and sequence with no CB and full unissued principal", async () => {
  const h = await setup(true), r = await observe(h);
  equal(r.included.claimableBalanceId, null); equal(r.accounting.encumbrances, []);
  equal(r.accounting.donations.map(d => [d.amountStroops, d.issuedStroops, d.unissuedStroops]), [["100000000", "0", "100000000"]]);
  equal(r.accounting.failedIssuances, [{ requestId, transactionHash: h.tx.hash().toString("hex"), attemptId: h.receipt.attempt_id, feeChargedStroops: "80", sequence: h.tx.sequence }]);
});
Deno.test("accounting context absent or contradictory evidence fails closed without writes or counter changes", async () => {
  for (const fault of ["missing032", "attempt", "owner", "missing033", "foreign027", "missing027", "missing031", "incomplete", "drift", "denied", "notExactDenial"]) {
    const h = await setup(), before = h.snapshot(), counters = h.counters(); let states = 0;
    h.hooks.reply = (n, r) => {
      if (n === "d1_load_issuance_outcome" && fault === "missing032") r.data.outcome = null;
      if (n === "d1_load_issuance_outcome" && fault === "attempt") r.data.outcome.attempt_id = namespace;
      if (n === "d1_load_active_issuance_sequence" && fault === "owner") r.data.request_id = namespace;
      if (n === "d1_load_active_issuance_sequence" && fault === "missing033") r.data = null;
      if (n === "d1_load_issuance_fee_commitments" && fault === "foreign027") r.data.commitments.push({ ...r.data.commitment, request_id: namespace });
      if (n === "d1_load_issuance_fee_commitments" && fault === "missing027") { r.data.commitment = null; r.data.commitments = []; }
      if (n === "d1_load_submission_attempt" && fault === "missing031") r.data.attempt = null;
      if (n === "d1_load_transaction_history_state" && fault === "incomplete") r.data.coverage_complete = false;
      if (n === "d1_load_transaction_history_state" && fault === "drift" && ++states === 2) r.data.page_count++;
      if (fault === "denied" || fault === "notExactDenial") return { data: fault === "denied" ? null : {}, error: { code: "42501", message: "unauthorized_admin_wallet" } };
      return r;
    };
    let error: unknown; try { await observeIssuanceAccountingContext(h.client, scope); } catch (e) { error = e; }
    const code = fault === "denied" ? "unauthorized_admin_wallet" : "issuance_accounting_unavailable";
    equal(error instanceof CustodyError ? [error.code, error.status, error.message] : error, [code, fault === "denied" ? 403 : 503, code]);
    equal(h.snapshot(), before); equal(h.counters(), counters);
    equal(h.trace.every(n => n.startsWith("d1_load_") || n.startsWith("d1_list_")), true);
  }
});
Deno.test("accounting context expiry never releases owner or commitments and unmapped activity remains quarantine", async () => {
  const h = await setup(false, false, true); h.f.h.now = closedAt + 10000;
  const r = await observe(h), last = h.f.h.records.at(-1)!;
  equal(r.accounting.unmatchedActivity, [{ operationIndex: 0, reason: "unexplained_pool_operation", transactionHash: last.transactionHash }]);
  equal(r.accounting.encumbrances.length, 1); equal(r.held.activeOwner.request_id, requestId);
});

// Additional source definitions only; not executed by the source incorporation.
Deno.test("accounting provenance exposes frozen input history with the same legacy context and RPC trace", async () => {
  const h = await setup(), before = h.snapshot(), counters = h.counters();
  const result = await observeIssuanceAccountingWithHistory(h.client, scope), trace = [...h.trace];
  equal(h.snapshot(), before); equal(h.counters(), counters);
  equal(result.history.records, h.f.h.records); equal(result.context.confirmedPoolFeesSpentStroops, result.history.confirmedPoolFeesSpentStroops);
  equal([Object.isFrozen(result), Object.isFrozen(result.context), Object.isFrozen(result.history), Object.isFrozen(result.history.records)], [true, true, true, true]);
  h.trace.length = 0; const legacy = await observeIssuanceAccountingContext(h.client, scope);
  equal(result.context, legacy); equal(h.trace, trace); equal(h.snapshot(), before); equal(h.counters(), counters);
});
Deno.test("accounting provenance keeps denial and missing-history failures read-only", async () => {
  for (const denied of [false, true]) {
    const h = await setup(), before = h.snapshot(), counters = h.counters();
    h.hooks.reply = (name, reply) => {
      if (denied) return { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
      if (name === "d1_load_issuance_outcome") reply.data.outcome = null;
      return reply;
    };
    let error: unknown; try { await observeIssuanceAccountingWithHistory(h.client, scope); } catch (e) { error = e; }
    const code = denied ? "unauthorized_admin_wallet" : "issuance_accounting_unavailable";
    equal(error instanceof CustodyError ? [error.code, error.status, error.message] : error, [code, denied ? 403 : 503, code]);
    equal(h.snapshot(), before); equal(h.counters(), counters); equal(h.trace.every(n => n.startsWith("d1_load_") || n.startsWith("d1_list_")), true);
  }
});
