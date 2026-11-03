import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError, type Preparation } from "../../functions/d1-custody/handler.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { parseDiscoveredOperation } from "../../functions/d1-custody/discovery.ts";
import { planIssuance } from "../../functions/d1-custody/issuance-plan.ts";
import { observeInitialFinancialSnapshot } from "../../functions/d1-custody/initial-financial-snapshot.ts";
const [pool, team, donor, admin, beneficiary, issuer] = [101, 102, 103, 104, 105, 106].map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
const namespace = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222", hash = "a".repeat(64), date = "2026-10-27T12:00:00Z", closedAt = Date.parse(date) / 1000;
function equal(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error("assertion failed: " + JSON.stringify([a, b])); }
function included(position: number, kind: "create" | "payment" | "pool" | "issued" = "payment", success = true, startingBalance = "100.0000000") {
  const source = kind === "create" ? team : kind === "pool" ? pool : donor, token = String((10n << 32n) + BigInt(position) * 4096n);
  const op = kind === "create" ? Operation.createAccount({ destination: pool, startingBalance }) : kind === "pool" ? Operation.manageData({ name: "test", value: null }) : Operation.payment({ destination: pool, asset: kind === "issued" ? new Asset("USD", issuer) : Asset.native(), amount: "10.0000000" });
  const tx = new TransactionBuilder(new Account(source, String(position)), { fee: "500", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 0 }, memo: kind === "create" ? Memo.text("D1OPS") : Memo.none() }).addOperation(op).build();
  const inner = kind === "create" ? xdr.OperationResultTr.createAccount(xdr.CreateAccountResult.createAccountSuccess()) : kind === "pool" ? xdr.OperationResultTr.manageData(success ? xdr.ManageDataResult.manageDataSuccess() : xdr.ManageDataResult.manageDataNameNotFound()) : xdr.OperationResultTr.payment(xdr.PaymentResult.paymentSuccess());
  const results = [xdr.OperationResult.opInner(inner)];
  const transaction = { hash: tx.hash().toString("hex"), paging_token: token, ledger: 10, created_at: date, source_account: source, source_account_sequence: tx.sequence,
    fee_account: source, fee_charged: "123", max_fee: tx.fee, successful: success, operation_count: 1, envelope_xdr: tx.toXDR(),
    result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"), result: success ? xdr.TransactionResultResult.txSuccess(results) : xdr.TransactionResultResult.txFailed(results), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") };
  return { transaction, token, record: parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: { sequence: 10, hash, closedAt } }, ledger: { sequence: 10, hash, closed_at: date }, transaction }) };
}
function fixture(extra: "none" | "success" | "failed" = "none", selectedPayment: "donation" | "operating" | "absent" = "donation", startingBalance = "100.0000000", issuedDonation = false, issueAmount = "1.0000000") {
  const birth = included(1, "create", true, startingBalance), payment = included(2), records = [birth.record, payment.record];
  if (extra !== "none") records.push(included(3, "pool", extra === "success").record);
  if (issuedDonation) records.push(included(3, "issued").record);
  const operationId = String(BigInt(birth.token) + 1n), operation = { id: operationId, paging_token: operationId, transaction_hash: birth.transaction.hash, transaction_successful: true,
    source_account: team, created_at: date, type: "create_account", type_i: 0, funder: team, account: pool, starting_balance: startingBalance };
  const receipt = { kind: "d1_operating_credit_observation", revision: 1, authorized_by: admin, observation: { namespace, network: "TESTNET", pool, funder: team,
    operationId, transactionHash: birth.transaction.hash, ledger: 10, amountStroops: BigInt(startingBalance.replace(".", "")).toString(), anchor: { sequence: 10, hash, closedAt }, record: parseDiscoveredOperation({ pool, anchor: { sequence: 10, closedAt }, operation, transaction: birth.transaction }) } };
  const checkpoint = { cursor: records.at(-1)!.pagingToken, through_ledger: 10, ledger_hash: hash, closed_at: closedAt };
  const discovery = { kind: "d1_discovery_state", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 8, checkpoint: { ...checkpoint, cursor: String(BigInt(checkpoint.cursor) + 1n) }, coverage_complete: true };
  const history = { kind: "d1_transaction_history_state", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 8, income_state: structuredClone(discovery), checkpoint, coverage_complete: true, page_count: records.length + 1, record_count: records.length };
  const credit = { kind: "d1_operating_credit_state", revision: 1, namespace, network: "TESTNET", pool, receipt_count: 1, set_hash: "c".repeat(64), discovery_state: structuredClone(discovery) };
  const selected = selectedPayment === "donation" ? payment : selectedPayment === "operating" ? birth : included(20);
  const selectedDonor = selectedPayment === "operating" ? team : donor;
  const prepared: Preparation = { request_id: requestId, authorized_by: admin, confirmed_at: closedAt, ledger: 10, memo_hash: "b".repeat(64),
    payment: { transaction_hash: selected.transaction.hash, operation_id: String(BigInt(selected.token) + 1n), donor: selectedDonor, pool, amount: selectedPayment === "operating" ? startingBalance : "10.0000000", asset: { type: "native" } },
    request: { version: 1, incident_id: "incident-1", donor: selectedDonor, beneficiary, amount: issueAmount, asset: { type: "native" }, deadline: "2026-10-27T12:05:00Z" } };
  const scope = { request_id: requestId, namespace, network: "TESTNET", pool };
  const intent = { kind: "d1_issuance_request_intent", revision: 1, ...scope, preparation_input: prepared, preparation: { revision: 1, state: "allocated", request_id: requestId, allocation: {} } };
  const reservation = { kind: "d1_issuance_sequence_reservation", revision: 1, ...scope, observed_account_sequence: "2", transaction_sequence: "3", intent };
  const { unsignedXdr } = planIssuance(prepared, { networkPassphrase: Networks.TESTNET, pool, sequence: "2", now: closedAt + 1, fee: "100" });
  const journal = { kind: "d1_unsigned_transaction_journal", revision: 1, ...scope, reservation: structuredClone(reservation), deadline: prepared.request.deadline, transaction_sequence: "3", unsigned_xdr: unsignedXdr, transaction_hash: TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET).hash().toString("hex") };
  const commitment = { kind: "d1_issuance_fee_commitment", revision: 1, ...scope, reservation: structuredClone(reservation), authorized_by: admin, deadline: prepared.request.deadline, issuance_fee_stroops: "100", future_refund_fee_stroops: "300" };
  const owner = { kind: "d1_issuance_fee_commitment_lookup", revision: 1, ...scope, reservation: structuredClone(reservation), commitment: structuredClone(commitment), commitments: [structuredClone(commitment)] };
  const account = { pool, networkPassphrase: Networks.TESTNET as const, anchor: { sequence: 10, hash, closedAt }, sequence: "2", lastModifiedLedger: 10, baseFee: "100", baseReserve: "5000000",
    native: { balance: (BigInt(startingBalance.replace(".", "")) + 100000000n).toString(), sellingLiabilities: "0" }, issuedBalances: [] as { code: string; issuer: string; balance: string; sellingLiabilities: string }[], account: { subentry_count: 0, num_sponsoring: 0, num_sponsored: 0 } };
  const calls: string[] = [], counts: Record<string, number> = {};
  const h = { owner, account, history, credit, receipt, records, calls, now: closedAt + 2, error: null as unknown, mutate: (_name: string, _data: unknown, _count: number) => {},
    client: { async rpc(name: string, args: Record<string, unknown>) {
      calls.push(name); counts[name] = (counts[name] ?? 0) + 1; let data: unknown;
      switch (name) {
        case "d1_load_issuance_fee_commitments": data = h.owner; break;
        case "d1_load_unsigned_transaction": data = { kind: "d1_unsigned_transaction_lookup", revision: 1, ...scope, reservation: structuredClone(reservation), transaction: journal }; break;
        case "d1_load_transaction_history_state": data = h.history; break;
        case "d1_list_transaction_records": data = { kind: "d1_transaction_records", revision: 1, namespace, network: "TESTNET", pool, from_cursor: "0", next_cursor: checkpoint.cursor, records: h.records, has_more: false, history_state: h.history }; break;
        case "d1_load_discovery_state": data = discovery; break;
        case "d1_load_operating_credit_state": data = h.credit; break;
        case "d1_list_operating_credits": data = { kind: "d1_operating_credits", revision: 1, namespace, network: "TESTNET", pool, from_cursor: args.p_after, next_cursor: operationId, receipts: [h.receipt], has_more: false, credit_state: h.credit }; break;
        case "d1_load_operating_credit": data = { kind: "d1_operating_credit_lookup", revision: 1, namespace, network: "TESTNET", pool, operation_id: operationId, receipt: h.receipt }; break;
        default: throw Error("Unexpected write/RPC: " + name);
      }
      const detached = JSON.parse(JSON.stringify(data)); h.mutate(name, detached, counts[name]); return { data: detached, error: h.error };
    } }, source: { async readAccountAtCheckpoint() { calls.push("account"); const result = structuredClone(h.account); h.mutate("account", result, calls.filter(c => c === "account").length); return result; } } };
  return { h, run: () => observeInitialFinancialSnapshot(h.client, { namespace, pool, requestId, authenticatedAdmin: admin, source: h.source, now: () => h.now, maximumAgeSeconds: 30, futureToleranceSeconds: 2 }) };
}
async function reject(f: ReturnType<typeof fixture>, status = 503) {
  const before = JSON.stringify([f.h.owner, f.h.receipt, f.h.history]); let e: unknown;
  try { await f.run(); } catch (error) { e = error; }
  equal(e instanceof CustodyError ? [e.code, e.status, e.message] : e, status === 403 ? ["unauthorized_admin_wallet", 403, "unauthorized_admin_wallet"] : ["initial_financial_snapshot_unavailable", 503, "initial_financial_snapshot_unavailable"]);
  equal(JSON.stringify([f.h.owner, f.h.receipt, f.h.history]), before); equal(f.h.calls.every(c => c === "account" || c.startsWith("d1_load_") || c.startsWith("d1_list_")), true);
}
Deno.test("initial financial snapshot joins stable SDK facts and counts the selected commitment once without spending authority", async () => {
  const f = fixture(), s = await f.run(); equal(s.kind, "d1_initial_financial_snapshot"); equal(s.observedAt, closedAt + 2); equal(s.expiresAt, closedAt + 30);
  equal(s.obligations.nativeDonorLiabilityStroops, "100000000"); equal(s.obligations.observedOperatingCreditStroops, "1000000000");
  equal(s.budget.otherFutureFees, "100"); equal(s.budget.requiredOperating, "20000500"); equal(s.budget.availableOperating, "1000000000"); equal(s.budget.remainingOperating, "979999500");
  equal(s.commitment, f.h.owner.commitment); equal(f.h.calls.filter(c => c === "account").length, 2); equal(f.h.calls.filter(c => c === "d1_load_issuance_fee_commitments").length, 2);
  const complete = await fixture("none", "donation", "100.0000000", false, "10.0000000").run(); equal(complete.budget.otherFutureFees, "0"); equal(complete.budget.requiredOperating, "20000400");
});
Deno.test("initial financial snapshot quarantines successful and failed pool activity instead of inferring discharged principal", async () => {
  for (const outcome of ["success", "failed"] as const) { const f = fixture(outcome); await reject(f); equal(f.h.calls.includes("account"), false); }
});
Deno.test("initial financial snapshot rejects drift in final history credit and owner reads without retry or mutation", async () => {
  for (const name of ["d1_load_transaction_history_state", "d1_load_operating_credit_state", "d1_load_issuance_fee_commitments"]) {
    const f = fixture(); f.h.mutate = (actual, data, count) => {
      if (actual !== name || count !== (name === "d1_load_transaction_history_state" ? 6 : name === "d1_load_operating_credit_state" ? 3 : 2)) return;
      const row = data as Record<string, unknown>; if (name === "d1_load_transaction_history_state") row.page_count = 999;
      else if (name === "d1_load_operating_credit_state") row.set_hash = "d".repeat(64); else row.commitments = [];
    }; await reject(f);
  }
});
Deno.test("initial financial snapshot rejects stale future rollback or expired evidence and wrong account sequence", async () => {
  for (const now of [closedAt + 31, closedAt - 3, closedAt + 300]) { const f = fixture(); f.h.now = now; await reject(f); }
  const backwards = fixture(); backwards.h.mutate = name => { if (name === "account") backwards.h.now--; }; await reject(backwards);
  const sequence = fixture(); sequence.h.account.sequence = "3"; await reject(sequence);
});
Deno.test("initial financial snapshot protects native and issued principal and refuses insufficient or missing financial evidence", async () => {
  const physical = fixture(); physical.h.account.native.balance = "100000001"; await reject(physical);
  const noCredit = fixture(); noCredit.h.credit.receipt_count = 0; await reject(noCredit);
  const noOwner = fixture(); noOwner.h.owner.commitment = null as never; noOwner.h.owner.commitments = []; await reject(noOwner);
  const foreign = fixture(); foreign.h.credit.discovery_state.checkpoint.ledger_hash = "f".repeat(64); await reject(foreign);
  const fee = fixture(); fee.h.account.baseFee = "101"; await reject(fee);
  const explicitZero = fixture(); explicitZero.h.account.issuedBalances = [{ code: "USD", issuer, balance: "0", sellingLiabilities: "0" }];
  explicitZero.h.account.account.subentry_count = 1; equal((await explicitZero.run()).budget.requiredOperating, "25000500");
  for (const selected of ["operating", "absent"] as const) await reject(fixture("none", selected));
  await reject(fixture("none", "donation", "1.5000000")); // Valid credit still insufficient for reserves+commitments.
  await reject(fixture("none", "donation", "100.0000000", true)); // Funded issued principal cannot disappear without a balance.
  const issued = fixture("none", "donation", "100.0000000", true); issued.h.account.issuedBalances = [{ code: "USD", issuer, balance: "100000000", sellingLiabilities: "0" }]; issued.h.account.account.subentry_count = 1;
  const both = await issued.run(); equal(both.obligations.issuedDonorLiabilities.map(a => [a.code, a.issuer, a.amountStroops]), [["USD", issuer, "100000000"]]); equal(both.budget.otherFutureFees, "200");
});
Deno.test("initial financial snapshot sanitizes unavailable dependencies and preserves only explicit current-admin rejection", async () => {
  const denied = fixture(); denied.h.error = { code: "42501", message: "unauthorized_admin_wallet" }; await reject(denied, 403);
  const secret = fixture(); secret.h.error = { code: "XX000", message: "SECRET provider" }; await reject(secret);
  const getter = fixture(); let invoked = false; getter.h.mutate = (name, data) => { if (name === "account") Object.defineProperty(data, "pool", { enumerable: true, get() { invoked = true; throw Error("SECRET"); } }); };
  await reject(getter); equal(invoked, false);
});
