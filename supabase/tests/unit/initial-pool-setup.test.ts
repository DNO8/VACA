import { Account, Asset, Memo, Networks, Operation, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { calculateOriginalObligations } from "../../functions/d1-custody/original-obligations.ts";
import { withInitialFinancialAuthorization } from "../../functions/d1-custody/initial-financial-authorization.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { fixture, equal, namespace, pool, donor, issuer, type InitialSetup } from "../fixtures/initial-financial-authorization.ts";
const setupFixture = (setup: InitialSetup = "before") => fixture("none", "issued", "100.0000000", true, "1.0000000", setup);
function obligations(f: ReturnType<typeof fixture>, credits: unknown[] = [f.h.receipt]) {
  return calculateOriginalObligations({ namespace, pool, firstLedger: 8, anchor: f.h.account.anchor, transactions: f.h.records, operatingCredits: credits });
}
async function reject(f: ReturnType<typeof fixture>) {
  const before = JSON.stringify([f.h.owner, f.h.records, f.h.credit]); let called = false, caught: unknown;
  try { await withInitialFinancialAuthorization(f.h.client, f.configuration, () => { called = true; }); } catch (e) { caught = e; }
  equal(caught instanceof CustodyError ? [caught.code, caught.status, caught.message] : caught, ["initial_financial_authorization_unavailable", 503, "initial_financial_authorization_unavailable"]);
  equal(called, false); equal(f.h.persisted.size, 0); equal(JSON.stringify([f.h.owner, f.h.records, f.h.credit]), before);
  equal(f.h.calls.every(c => c === "account" || c.startsWith("d1_load_") || c.startsWith("d1_list_")), true);
}
Deno.test("initial positive credit trustline setup preserves all native and issued principal plus reserves and actual fees", async () => {
  const f = setupFixture(), result = await withInitialFinancialAuthorization(f.h.client, f.configuration, value => value), s = result.snapshot;
  equal(s.obligations.unexplainedActivity, []); equal(s.obligations.nativeDonorLiabilityStroops, "100000000");
  equal(s.obligations.issuedDonorLiabilities.map(a => [a.code, a.issuer, a.amountStroops]), [["USD", issuer, "100000000"]]);
  equal(s.obligations.observedOperatingCreditStroops, "1000000000"); equal(s.budget.availableOperating, "999999877"); equal(s.budget.requiredOperating, "25000600");
  equal(s.budget.otherFutureFees, "200"); equal(s.account.account.subentry_count, 1);
  const tx = TransactionBuilder.fromXDR(result.unsignedXdr, Networks.TESTNET); if (!(tx instanceof Transaction)) throw Error("wrong envelope");
  const op = tx.operations[0]; if (op.type !== "createClaimableBalance") throw Error("wrong operation");
  equal([op.asset.getCode(), op.asset.getIssuer(), op.amount], ["USD", issuer, "1.0000000"]); equal(f.h.persisted.size, 1);
});
Deno.test("initial setup never admits late zero failed liquidity-pool source-only or other pool activity", async () => {
  for (const setup of ["after", "zero", "failed", "lp", "feeOnly"] as const) await reject(setupFixture(setup));
  for (const outcome of ["success", "failed"] as const) await reject(fixture(outcome));
  const unfunded = setupFixture(); unfunded.h.account.issuedBalances = []; await reject(unfunded);
  const physical = setupFixture(); physical.h.account.native.balance = "100000001"; await reject(physical);
  const team = fixture("none", "issued", "1.5000000", true, "1.0000000", "before"); await reject(team);
});
Deno.test("initial setup uses exact operation order even inside the same transaction instead of ledger timestamps", () => {
  for (const before of [true, false]) for (const limit of ["0.0000001", "922337203685.4775807"]) {
    const f = fixture(), old = f.h.records[1], trust = Operation.changeTrust({ asset: new Asset("USD", issuer), limit }),
      income = Operation.payment({ source: donor, destination: pool, asset: Asset.native(), amount: "10.0000000" });
    const operations = before ? [trust, income] : [income, trust];
    const builder = new TransactionBuilder(new Account(pool, "1"), { fee: "500", networkPassphrase: Networks.TESTNET, memo: Memo.none(), timebounds: { minTime: 0, maxTime: 0 } });
    for (const op of operations) builder.addOperation(op); const tx = builder.build();
    const results = operations.map(op => xdr.OperationResult.opInner(op.body().switch().value === 6 ? xdr.OperationResultTr.changeTrust(xdr.ChangeTrustResult.changeTrustSuccess()) : xdr.OperationResultTr.payment(xdr.PaymentResult.paymentSuccess())));
    const transaction = { ...old.raw.transaction, hash: tx.hash().toString("hex"), source_account: pool, source_account_sequence: tx.sequence, fee_account: pool, max_fee: tx.fee, operation_count: 2, envelope_xdr: tx.toXDR(),
      result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"), result: xdr.TransactionResultResult.txSuccess(results), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") };
    f.h.records[1] = parseIncludedTransaction({ context: old.context, ledger: old.raw.ledger, transaction });
    const input = JSON.stringify(f.h.records), result = obligations(f); equal(result.nativeDonorLiabilityStroops, "100000000");
    equal(result.unexplainedActivity.length, before ? 0 : 1); equal(JSON.stringify(f.h.records), input);
    if (!before) equal(result.unexplainedActivity[0].operationIndex, 1);
  }
});
Deno.test("initial setup cannot turn unapproved genesis into team credit or bypass raw SDK bindings", async () => {
  const f = setupFixture(), result = obligations(f, []); equal(result.nativeDonorLiabilityStroops, "1100000000"); equal(result.observedOperatingCreditStroops, "0"); equal(result.unexplainedActivity.length, 1);
  const forged = setupFixture(); forged.h.records[1].poolOperationSourceIndices = []; await reject(forged);
});
