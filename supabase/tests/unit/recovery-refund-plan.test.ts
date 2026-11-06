import { Keypair, TransactionBuilder, Transaction, Networks, Operation, Account, Asset, xdr, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { planRecoveryRefund, type RecoveryRefundConfiguration } from "../../functions/d1-custody/recovery-refund-plan.ts";
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
const cutoff = closedAt + 300;
const configuration = (): RecoveryRefundConfiguration => ({ sourceSequence: "3", feePerOperationStroops: "100", now: cutoff, validUntil: cutoff + 60 });
function unchanged(h: H, before: string, count: number) {
  equal(h.snapshot(), before); equal(h.counters(), count);
  equal(h.trace.every(n => n.startsWith("d1_load_") || n.startsWith("d1_list_")), true);
}
async function rejects(h: H, cfg: RecoveryRefundConfiguration, denied = false) {
  const before = h.snapshot(), count = h.counters(); let error: unknown;
  try { await planRecoveryRefund(h.client, scope, cfg); } catch (e) { error = e; }
  const code = denied ? "unauthorized_admin_wallet" : "recovery_refund_unavailable";
  equal(error instanceof CustodyError ? [error.status, error.code, error.message] : error, [denied ? 403 : 503, code, code]);
  unchanged(h, before, count);
}
Deno.test("recovery plan SDK envelopes refund native/issued full gross atomically; included failure has only Payment", async () => {
  for (const [failed, issued, delay, fee] of [[false, false, 0, "100"], [false, true, 1, "150"], [true, false, 0, "300"], [true, true, 1, "100"]] as const) {
    const h = await setup(failed, issued), cfg = { ...configuration(), now: cutoff + delay, feePerOperationStroops: String(fee) };
    const before = h.snapshot(), count = h.counters(), original = { ...cfg };
    h.hooks.reply = (_n, r) => { cfg.sourceSequence = "0"; cfg.now = 0; cfg.validUntil = 0; cfg.feePerOperationStroops = "9999"; return r; };
    const plan = await planRecoveryRefund(h.client, scope, cfg);
    unchanged(h, before, count); equal(h.trace.filter(n => n === "d1_load_issuance_outcome").length, 2);
    const cb = failed ? null : h.tx.getClaimableBalanceId(0), asset = issued ? new Asset("USD", h.f.h.account.issuedBalances[0].issuer) : Asset.native();
    const operations = [...(cb === null ? [] : [Operation.claimClaimableBalance({ balanceId: cb })]), Operation.payment({ destination: donor, asset, amount: "10.0000000" })];
    const builder = new TransactionBuilder(new Account(pool, original.sourceSequence), { fee, networkPassphrase: Networks.TESTNET,
      timebounds: { minTime: cutoff, maxTime: original.validUntil } });
    operations.forEach(op => builder.addOperation(op)); const expected = builder.build();
    const decoded = TransactionBuilder.fromXDR(plan.unsignedXdr, Networks.TESTNET);
    if (!(decoded instanceof Transaction)) throw Error("ordinary transaction required");
    equal([decoded.source, decoded.sequence, decoded.fee, decoded.signatures.length, decoded.networkPassphrase, decoded.hash().toString("hex")],
      [pool, "4", (BigInt(fee) * BigInt(operations.length)).toString(), 0, Networks.TESTNET, plan.transactionHash]);
    equal([decoded.timeBounds?.minTime, decoded.timeBounds?.maxTime], [String(cutoff), String(original.validUntil)]);
    equal(decoded.toEnvelope().v1().tx().operations().map(op => op.toXDR("base64")), operations.map(op => op.toXDR("base64")));
    equal(decoded.toXDR(), expected.toXDR());
    equal([plan.kind, plan.revision, plan.namespace, plan.requestId, plan.network, plan.source, plan.donor],
      ["d1_recovery_refund_plan", 1, namespace, requestId, "TESTNET", pool, donor]);
    equal(plan.asset.type === "issued" ? [plan.asset.type, plan.asset.code, plan.asset.issuer] : [plan.asset.type], issued ? ["issued", "USD", asset.getIssuer()] : ["native"]);
    equal(Object.keys(plan).sort(), ["kind", "revision", "namespace", "requestId", "network", "source", "donor", "asset", "grossAmountStroops", "issuedStroops",
      "unissuedStroops", "claimableBalanceId", "operationCount", "feeStroops", "sourceSequence", "transactionSequence", "deadline", "validUntil", "unsignedXdr", "transactionHash"].sort());
    equal([plan.grossAmountStroops, plan.issuedStroops, plan.unissuedStroops, plan.claimableBalanceId, plan.operationCount, plan.feeStroops,
      plan.sourceSequence, plan.transactionSequence, plan.deadline, plan.validUntil],
      ["100000000", failed ? "0" : "10000000", failed ? "100000000" : "90000000", cb, operations.length, expected.fee, "3", "4", "2026-10-27T12:05:00Z", original.validUntil]);
    equal([Object.isFrozen(plan), Object.isFrozen(plan.asset), plan.asset === h.unsigned.reservation.intent.preparation_input.payment.asset], [true, true, false]);
  }
});
Deno.test("recovery rejects unknown/missing outcomes, wrong mapping/owner and unmatched activity without fallback or state changes", async () => {
  for (const fault of ["missing032", "404", "unknown", "donor", "asset", "cb", "owner", "deadline", "ambiguous", "unmatched", "denied", "forged403", "notExactDenial"]) {
    const h = await setup(false, false, fault === "unmatched");
    h.hooks.reply = (n, r) => {
      if (n === "d1_load_issuance_outcome" && fault === "missing032") r.data.outcome = null;
      if (n === "d1_load_issuance_outcome" && fault === "cb") r.data.outcome.observed_outcome.claimableBalanceId = "00000000" + "a".repeat(64);
      if (n === "d1_load_active_issuance_sequence" && fault === "owner") r.data.request_id = namespace;
      if (n === "d1_list_transaction_records" && fault === "ambiguous") r.data.records.push(structuredClone(r.data.records[1]));
      if (n === "d1_load_unsigned_transaction") {
        const p = r.data.transaction.reservation.intent.preparation_input;
        if (fault === "donor") p.payment.donor = team;
        if (fault === "asset") p.payment.asset = { type: "issued", code: "USD", issuer: team };
        if (fault === "deadline") p.request.deadline = "2026-10-27T12:10:00Z";
      }
      if (fault === "forged403") throw new CustodyError("unauthorized_admin_wallet", 403);
      if (["404", "unknown", "denied", "notExactDenial"].includes(fault)) return { data: fault === "notExactDenial" ? {} : null,
        error: { code: fault === "404" ? "404" : fault === "unknown" ? "timeout" : "42501", message: "unauthorized_admin_wallet" } };
      return r;
    };
    await rejects(h, configuration(), fault === "denied");
  }
});
Deno.test("recovery validates construction facts, fee commitment, sequence and original deadline without mutations", async () => {
  for (const patch of [{ now: cutoff - 1 }, { now: NaN }, { now: 1.5 }, { now: Number.MAX_SAFE_INTEGER + 1 }, { validUntil: cutoff },
    { validUntil: Number.MAX_SAFE_INTEGER + 1 }, { feePerOperationStroops: "0" }, { feePerOperationStroops: "01" }, { feePerOperationStroops: "151" },
    { feePerOperationStroops: "4294967295" }, { feePerOperationStroops: "4294967296" }, { sourceSequence: "03" }, { sourceSequence: "2" },
    { sourceSequence: "9223372036854775807" }, { sourceSequence: "9223372036854775808" }, { extra: true }]) {
    await rejects(await setup(), { ...configuration(), ...patch });
  }
});
Deno.test("recovery rejects malformed construction configuration before any observation", async () => {
  const { validUntil: _omitted, ...missing } = configuration();
  for (const cfg of [missing, { ...configuration(), extra: true }, { ...configuration(), now: () => cutoff },
    { ...configuration(), sourceSequence: "03" }, { ...configuration(), feePerOperationStroops: "0" }]) {
    const h = await setup(); await rejects(h, cfg as unknown as RecoveryRefundConfiguration); equal(h.trace.length, 0);
  }
});
Deno.test("recovery rejects getters/inherited configuration before observation and never launders getter admin errors", async () => {
  for (const inherited of [false, true]) {
    const h = await setup(); let reads = 0;
    const cfg = inherited ? Object.create(configuration()) : Object.defineProperty(configuration(), "now", { enumerable: true,
      get() { reads++; throw new CustodyError("unauthorized_admin_wallet", 403); } });
    await rejects(h, cfg); equal([reads, h.trace.length], [0, 0]);
  }
});
