// Extracted saved-initial SDK scaffold. RPC/hash tokens are opaque transport mocks, not PostgreSQL identity.
import { Account, Operation, Keypair, TransactionBuilder, Transaction, Networks, xdr, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { withInitialSubmissionAuthorization } from "../../functions/d1-custody/initial-submission-authorization.ts";
import { recordInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome-journal.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { fixture, equal, pool, admin, team, namespace, requestId, closedAt } from "./initial-financial-authorization.ts";
type DTO = Record<string, any>;
type Reply = { data: any; error: unknown };
const scope = { namespace, pool, requestId, authenticatedAdmin: admin };
export async function savedInitialFixture(failed = false, issued = false, unmapped = false, creationCovered = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture();
  const firstLedger = creationCovered ? 10 : 8;
  if (creationCovered) {
    // Establish this fixture's scope BEFORE any initial SDK observation or immutable journal is captured.
    f.h.history.first_ledger = firstLedger;
    f.h.history.income_state.first_ledger = firstLedger;
    f.h.credit.discovery_state.first_ledger = firstLedger;
    f.h.records.splice(0, f.h.records.length, ...f.h.records.map(record => parseIncludedTransaction({
      ...record.raw, context: { pool, firstLedger, anchor: { sequence: record.ledger, hash: record.ledgerHash, closedAt: record.closedAt } },
    })));
    const previous = f.h.mutate;
    f.h.mutate = (name, data, count) => {
      if (name === "d1_load_discovery_state") {
        if (data === null || typeof data !== "object") throw Error("fixture discovery state");
        Reflect.set(data, "first_ledger", firstLedger);
      }
      previous(name, data, count);
    };
  }
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
    const raw = { context: { pool, firstLedger, anchor: { sequence: ledger, hash, closedAt: time } },
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
