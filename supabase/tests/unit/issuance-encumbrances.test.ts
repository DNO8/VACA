import { Keypair, Transaction, TransactionBuilder, Networks, xdr, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { calculateIssuanceEncumbrances } from "../../functions/d1-custody/issuance-encumbrances.ts";
import { calculateOriginalObligations } from "../../functions/d1-custody/original-obligations.ts";
import { parseInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome.ts";
import { planIssuance } from "../../functions/d1-custody/issuance-plan.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { fixture, pool, admin, donor, beneficiary, team, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";
type DTO = Record<string, any>;
function equal(a: unknown, b: unknown) {
  const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : v !== null && typeof v === "object" ?
    Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v;
  if (JSON.stringify(sorted(a)) !== JSON.stringify(sorted(b))) throw Error(JSON.stringify([a, b]));
}
async function setup(issued = false, failed = false, amount = "4.0000000", options: { id?: string; sequence?: string; position?: number } = {}) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, amount, "before") : fixture("none", "donation", "100.0000000", false, amount);
  const reply = await f.h.client.rpc("d1_load_unsigned_transaction", {}), unsignedJournal = (reply.data as DTO).transaction;
  const id = options.id ?? requestId, reservation = unsignedJournal.reservation;
  if (options.id) { unsignedJournal.request_id = id; reservation.request_id = id; reservation.intent.request_id = id;
    reservation.intent.preparation_input.request_id = id; reservation.intent.preparation.request_id = id; }
  if (options.sequence) {
    reservation.observed_account_sequence = options.sequence; reservation.transaction_sequence = (BigInt(options.sequence) + 1n).toString();
    unsignedJournal.transaction_sequence = reservation.transaction_sequence;
    unsignedJournal.unsigned_xdr = planIssuance(reservation.intent.preparation_input, { networkPassphrase: Networks.TESTNET, pool,
      sequence: options.sequence, now: closedAt + 1, fee: "100" }).unsignedXdr;
    unsignedJournal.transaction_hash = TransactionBuilder.fromXDR(unsignedJournal.unsigned_xdr, Networks.TESTNET).hash().toString("hex");
  }
  const tx = TransactionBuilder.fromXDR(unsignedJournal.unsigned_xdr, Networks.TESTNET); if (!(tx instanceof Transaction)) throw Error("fixture");
  tx.sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)));
  const cb = failed ? xdr.CreateClaimableBalanceResult.createClaimableBalanceUnderfunded() :
    xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR(tx.getClaimableBalanceId(0), "hex"));
  const ops = [xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(cb))];
  const result = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("100"),
    result: failed ? xdr.TransactionResultResult.txFailed(ops) : xdr.TransactionResultResult.txSuccess(ops),
    ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
  const anchor = { sequence: 11, hash: "f".repeat(64), closedAt: closedAt + 5 }, time = "2026-10-27T12:00:05Z";
  const raw = { context: { pool, firstLedger: 8, anchor }, ledger: { sequence: 11, hash: anchor.hash, closed_at: time },
    transaction: { hash: tx.hash().toString("hex"), paging_token: ((11n << 32n) + BigInt(options.position ?? 1) * 4096n).toString(), ledger: 11, created_at: time,
      source_account: pool, source_account_sequence: tx.sequence, fee_account: pool, fee_charged: "100", max_fee: tx.fee,
      successful: !failed, operation_count: 1, envelope_xdr: tx.toXDR(), result_xdr: result } };
  const observed = parseInitialIssuanceOutcome(pool, tx.toXDR(), raw);
  const outcomeReceipt = { kind: "d1_issuance_outcome_journal", revision: 1, request_id: id, namespace, network: "TESTNET", pool,
    authorized_by: admin, attempt_id: options.id ? "55555555-5555-4555-8555-555555555555" : "33333333-3333-4333-8333-333333333333", transaction_hash: tx.hash().toString("hex"),
    envelope_hash: digest(Buffer.from(tx.toXDR(), "base64")).toString("hex"), outcome_hash: "d".repeat(64), observed_outcome: structuredClone(observed) };
  const input = { namespace, pool, firstLedger: 8, anchor, transactions: [...f.h.records, structuredClone(observed.observation)], operatingCredits: [f.h.receipt],
    issuances: [{ unsignedJournal, outcomeReceipt }] };
  return { input, tx, f, unsignedJournal, outcomeReceipt, prepared: unsignedJournal.reservation.intent.preparation_input };
}
type H = Awaited<ReturnType<typeof setup>>;
function reject(input: H["input"], serializable = true) {
  const before = serializable ? JSON.stringify(input) : undefined; let error: unknown;
  try { calculateIssuanceEncumbrances(input); } catch (e) { error = e; }
  equal(error instanceof CustodyError ? [error.code, error.status, error.message] : error,
    ["issuance_encumbrances_unavailable", 503, "issuance_encumbrances_unavailable"]);
  if (serializable) equal(JSON.stringify(input), before);
}
Deno.test("encumbrances map native and issued principal without reducing original debt or charging donor fees", async () => {
  for (const issued of [false, true]) for (const amount of ["4.0000000", "10.0000000"]) {
    const h = await setup(issued, false, amount), before = JSON.stringify(h.input), value = calculateIssuanceEncumbrances(h.input);
    equal(value.original, calculateOriginalObligations(h.input)); equal(value.original.nativeDonorLiabilityStroops, "100000000");
    equal(value.original.issuedDonorLiabilities.map(a => a.amountStroops), issued ? ["100000000"] : []);
    const d = value.donations.find(d => d.operationId === h.prepared.payment.operation_id)!;
    equal([d.donor, d.amountStroops, d.issuedStroops, d.unissuedStroops], [donor, "100000000", amount.replace(".", ""), amount === "4.0000000" ? "60000000" : "0"]);
    const m = value.encumbrances[0];
    equal([m.requestId, m.donor, m.beneficiary, m.operationId, m.paymentTransactionHash, m.deadline, m.claimableBalanceId],
      [requestId, donor, beneficiary, h.prepared.payment.operation_id, h.prepared.payment.transaction_hash, h.prepared.request.deadline, h.tx.getClaimableBalanceId(0)]);
    equal([m.issuanceTransactionHash, m.feeChargedStroops, m.sequence, m.amountStroops, m.asset],
      [h.tx.hash().toString("hex"), "100", h.tx.sequence, amount.replace(".", ""), h.prepared.request.asset]);
    equal(value.original.observedOperatingCreditStroops, "1000000000"); equal(value.unmatchedActivity, []); equal(value.failedIssuances, []);
    equal(JSON.stringify(h.input), before); equal(Object.isFrozen(value.encumbrances[0].asset), true);
    h.prepared.request.beneficiary = team; equal(m.beneficiary, beneficiary);
  }
});
Deno.test("included failed issuance keeps full unissued principal and fee sequence evidence without a CB mapping", async () => {
  const h = await setup(false, true), v = calculateIssuanceEncumbrances(h.input);
  equal(v.encumbrances, []); equal(v.donations.map(d => [d.issuedStroops, d.unissuedStroops]), [["0", "100000000"]]);
  equal(v.failedIssuances, [{ requestId, transactionHash: h.tx.hash().toString("hex"), attemptId: h.outcomeReceipt.attempt_id,
    feeChargedStroops: "100", sequence: h.tx.sequence }]);
  equal(v.original, calculateOriginalObligations(h.input)); equal(v.unmatchedActivity, []);
});
Deno.test("encumbrances reject mismatched scope original donor facts saved bytes and decoded history without input mutation", async () => {
  for (const fault of ["namespace", "request", "attempt", "actor", "hash", "envelopeHash", "outcomeHash", "body", "signature", "donor", "payment", "amount", "deadline", "ledger", "confirmed", "beneficiary", "asset", "history", "cb", "extra"]) {
    const h = await setup(), j = h.unsignedJournal, p = h.prepared, r = h.outcomeReceipt as DTO;
    if (fault === "namespace") r.namespace = requestId;
    if (fault === "request") r.request_id = namespace;
    if (fault === "attempt") r.attempt_id = "bad";
    if (fault === "actor") r.authorized_by = "secret_DO_NOT_LEAK";
    if (fault === "hash") r.transaction_hash = "0".repeat(64);
    if (fault === "envelopeHash") r.envelope_hash = "0".repeat(64);
    if (fault === "outcomeHash") r.outcome_hash = "invalid";
    if (fault === "body") j.unsigned_xdr = h.tx.toXDR();
    if (fault === "signature") {
      h.tx.signatures[0].signature(Buffer.alloc(64)); const bytes = h.tx.toXDR(), record = h.input.transactions.at(-1)!;
      record.envelopeXdr = bytes; record.raw.transaction.envelope_xdr = bytes;
      r.observed_outcome.observation.envelopeXdr = bytes; r.observed_outcome.observation.raw.transaction.envelope_xdr = bytes;
      r.envelope_hash = digest(Buffer.from(bytes, "base64")).toString("hex");
    }
    if (fault === "donor") { p.payment.donor = team; p.request.donor = team; }
    if (fault === "payment") p.payment.operation_id = h.input.operatingCredits[0].observation.operationId;
    if (fault === "amount") p.payment.amount = "11.0000000";
    if (fault === "deadline") p.request.deadline = "2026-10-27T12:05:01Z";
    if (fault === "ledger") p.ledger = 9;
    if (fault === "confirmed") p.confirmed_at--;
    if (fault === "beneficiary") p.request.beneficiary = team;
    if (fault === "asset") p.payment.asset = { type: "issued", code: "USD", issuer: team };
    if (fault === "history") h.input.transactions.pop();
    if (fault === "cb") r.observed_outcome.claimableBalanceId = "00000000" + "0".repeat(64);
    if (fault === "extra") r.extra = true;
    try { reject(h.input); } catch (e) { throw Error(fault, { cause: e }); }
  }
});
Deno.test("encumbrances reject duplicate and aggregate overallocated issuances and never consume operating credits", async () => {
  const h = await setup(); h.input.issuances.push(structuredClone(h.input.issuances[0])); reject(h.input);
  const full = await setup(false, false, "10.0000000");
  const second = await setup(false, false, "4.0000000", { id: "44444444-4444-4444-8444-444444444444", sequence: "3", position: 2 });
  const o = second.outcomeReceipt.observed_outcome.observation;
  full.input.transactions.push(o); full.input.issuances.push(second.input.issuances[0]); reject(full.input);
  const partial = await setup(); partial.input.transactions.push(o); partial.input.issuances.push(second.input.issuances[0]);
  equal(calculateIssuanceEncumbrances(partial.input).donations.map(d => [d.issuedStroops, d.unissuedStroops]), [["80000000", "20000000"]]);
  const operating = await setup(); operating.prepared.payment.operation_id = operating.input.operatingCredits[0].observation.operationId;
  operating.prepared.payment.transaction_hash = operating.input.operatingCredits[0].observation.transactionHash;
  operating.prepared.payment.donor = team; operating.prepared.request.donor = team;
  operating.prepared.payment.amount = "100.0000000"; reject(operating.input);
});
Deno.test("unmatched successful pool activity remains quarantined and absent evidence does not classify an issuance", async () => {
  const h = await setup(); h.input.issuances = [];
  const v = calculateIssuanceEncumbrances(h.input);
  equal(v.unmatchedActivity, v.original.unexplainedActivity); equal(v.encumbrances, []);
  equal(v.donations.map(d => [d.issuedStroops, d.unissuedStroops]), [["0", "100000000"]]);
  const good = await setup(), other = await setup(false, false, "5.0000000", { id: "44444444-4444-4444-8444-444444444444", sequence: "3", position: 2 });
  good.input.transactions.push(other.input.transactions.at(-1)!);
  const unmatched = calculateIssuanceEncumbrances(good.input);
  equal(unmatched.unmatchedActivity, [{ transactionHash: other.tx.hash().toString("hex"), operationIndex: 0, reason: "unexplained_pool_operation" }]);
  equal(unmatched.encumbrances.length, 1);
  const record = structuredClone(good.input.transactions.at(-1)!);
  record.feeChargedStroops = "99"; good.input.transactions.push(record); reject(good.input);
});
Deno.test("encumbrance projection rejects malformed bounded evidence without executing getters", async () => {
  const h = await setup(), entry = h.input.issuances[0]; let reads = 0;
  Object.defineProperty(entry, "outcomeReceipt", { enumerable: true, get() { reads++; throw Error("private"); } });
  reject(h.input, false); equal(reads, 0);
  const large = await setup(); (large.input as DTO).bad = "x".repeat(8388609); reject(large.input, false);
  const cycle = await setup(); (cycle.input as DTO).bad = cycle.input; reject(cycle.input, false);
});
