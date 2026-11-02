import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { calculateOriginalObligations } from "../../functions/d1-custody/original-obligations.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { parseDiscoveredOperation } from "../../functions/d1-custody/discovery.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
const [pool, donor, issuer, original] = [101, 102, 103, 104].map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
const namespace = "11111111-1111-4111-8111-111111111111", date = "2026-10-27T12:00:00Z", closedAt = Date.parse(date) / 1000, hash = "a".repeat(64);
const context = { namespace, pool, firstLedger: 8, anchor: { sequence: 10, hash, closedAt } };
function equal(a: unknown, b: unknown) {
  const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v;
  if (JSON.stringify(sorted(a)) !== JSON.stringify(sorted(b))) throw new Error("Mismatch " + JSON.stringify([a, b]));
}
function fixture(position: number, creation = false, asset = Asset.native(), amount = "1.0000001", memo?: string, successful = true, source = donor, destination = pool) {
  let builder = new TransactionBuilder(new Account(source, String(position)), { fee: "500", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 0 } });
  if (memo) builder = builder.addMemo(Memo.text(memo));
  const tx = builder.addOperation(creation ? Operation.createAccount({ destination, startingBalance: amount }) : Operation.payment({ destination, asset, amount })).build();
  const result = xdr.OperationResult.opInner(creation ? xdr.OperationResultTr.createAccount(successful ? xdr.CreateAccountResult.createAccountSuccess() : xdr.CreateAccountResult.createAccountLowReserve()) :
    xdr.OperationResultTr.payment(successful ? xdr.PaymentResult.paymentSuccess() : xdr.PaymentResult.paymentUnderfunded()));
  const token = (10n << 32n) + BigInt(position) * 4096n, id = String(token + 1n), transactionHash = tx.hash().toString("hex");
  const dto = { hash: transactionHash, paging_token: String(token), ledger: 10, successful, operation_count: 1, created_at: date, envelope_xdr: tx.toXDR(),
    result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"), result: successful ? xdr.TransactionResultResult.txSuccess([result]) : xdr.TransactionResultResult.txFailed([result]), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64"),
    source_account: source, source_account_sequence: tx.sequence, fee_account: source, fee_charged: "123", max_fee: "500" };
  const transaction = parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: context.anchor }, transaction: dto, ledger: { sequence: 10, hash, closed_at: date } });
  const op = { id, paging_token: id, transaction_hash: transactionHash, transaction_successful: successful, created_at: date, source_account: source,
    ...(creation ? { type: "create_account", type_i: 0, funder: source, account: destination, starting_balance: amount } :
      { type: "payment", type_i: 1, from: source, to: destination, amount, asset_type: asset.isNative() ? "native" : "credit_alphanum4", ...(asset.isNative() ? {} : { asset_code: asset.getCode(), asset_issuer: asset.getIssuer() }) }) };
  function credit() {
    const record = parseDiscoveredOperation({ pool, anchor: context.anchor, operation: op, transaction: dto });
    return { kind: "d1_operating_credit_observation", revision: 1, authorized_by: original,
      observation: { namespace, network: "TESTNET", pool, funder: source, operationId: id, transactionHash, ledger: 10,
        amountStroops: BigInt(amount.replace(".", "")).toString(), anchor: { ...context.anchor }, record } };
  }
  return { transaction, credit, id };
}
function run(transactions: ReturnType<typeof fixture>["transaction"][], operatingCredits: unknown[] = []) {
  return calculateOriginalObligations({ ...context, transactions, operatingCredits });
}
function reject(work: () => unknown) { let e: unknown; try { work(); } catch (error) { e = error; }
  equal(e instanceof CustodyError && e.code === "donor_obligations_unavailable" && e.status === 503 && e.message === e.code, true); }
Deno.test("original obligations protect native/issued principal by original donor and ignore absent/wrong donation memos", () => {
  const a = fixture(1, true), b = fixture(2, false, Asset.native(), "0.0000001", "wrong"), c = fixture(3, false, new Asset("USD", issuer));
  const records = [a.transaction, b.transaction, c.transaction], before = JSON.stringify(records), r = run(records);
  equal(r.nativeDonorLiabilityStroops, "10000002"); equal(r.issuedDonorLiabilities, [{ code: "USD", issuer, amountStroops: "10000001" }]);
  equal(r.donations.map(d => [d.donor, d.operationId, d.amountStroops]), [[donor, a.id, "10000001"], [donor, b.id, "1"], [donor, c.id, "10000001"]]);
  equal(r.unexplainedActivity, []); equal(JSON.stringify(records), before); JSON.stringify(r);
});
Deno.test("original obligations exclude only exactly matched recorded native D1OPS credits, never memo alone", () => {
  const a = fixture(1, true, Asset.native(), "10.0000001", "D1OPS"), b = fixture(2, false, Asset.native(), "2.0000001", "D1OPS");
  const r = run([a.transaction, b.transaction], [a.credit()]); equal(r.nativeDonorLiabilityStroops, "20000001");
  equal(r.observedOperatingCreditStroops, "100000001"); equal(r.operatingOperationIds, [a.id]); equal(r.donations.map(d => d.operationId), [b.id]);
  for (const mutate of [(r: ReturnType<typeof a.credit>) => { r.authorized_by = "Gbad"; }, (r: ReturnType<typeof a.credit>) => { r.observation.amountStroops = "1"; },
    (r: ReturnType<typeof a.credit>) => { r.observation.namespace = "wrong"; }, (r: ReturnType<typeof a.credit>) => { r.observation.operationId = b.id; },
    (r: ReturnType<typeof a.credit>) => { r.observation.anchor.hash = "b".repeat(64); }]) { const credit = a.credit(); mutate(credit); reject(() => run([a.transaction, b.transaction], [credit])); }
  reject(() => run([a.transaction], [a.credit(), a.credit()]));
  const wrong = fixture(3, false, Asset.native(), "1.0000001", "OTHER"); reject(() => run([wrong.transaction], [wrong.credit()]));
});
Deno.test("failed incoming and pool outgoing do not discharge original principal or disguise unknown ownership", () => {
  const a = fixture(1), failed = fixture(2, false, Asset.native(), "1.0000001", undefined, false), outgoing = fixture(3, false, Asset.native(), "1.0000001", undefined, true, pool, donor);
  const r = run([a.transaction, failed.transaction, outgoing.transaction]); equal(r.nativeDonorLiabilityStroops, "10000001"); equal(r.donations.length, 1);
  equal(r.unexplainedActivity, [{ transactionHash: outgoing.transaction.transactionHash, operationIndex: 0, reason: "unexplained_pool_operation" }]);
  const tx = new TransactionBuilder(new Account(donor, "1"), { fee: "500", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 0 } })
    .addOperation(Operation.setOptions({ homeDomain: "example.test" })).build();
  const result = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"), result: xdr.TransactionResultResult.txSuccess([
    xdr.OperationResult.opInner(xdr.OperationResultTr.setOptions(xdr.SetOptionsResult.setOptionsSuccess()))]), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") });
  const unsupported = parseIncludedTransaction({ context: a.transaction.context, ledger: a.transaction.raw.ledger, transaction: { ...a.transaction.raw.transaction,
    hash: tx.hash().toString("hex"), envelope_xdr: tx.toXDR(), result_xdr: result.toXDR("base64") } });
  equal(run([unsupported]).unexplainedActivity, [{ transactionHash: unsupported.transactionHash, operationIndex: 0, reason: "unsupported_operation" }]);
});
Deno.test("original obligation sums preserve exact signed-int64 boundaries and reject overflow without mutation", () => {
  const a = fixture(1, false, Asset.native(), "922337203685.4775807"), b = fixture(2, false, Asset.native(), "0.0000001");
  equal(run([a.transaction]).nativeDonorLiabilityStroops, "9223372036854775807"); reject(() => run([a.transaction, b.transaction]));
  const c = fixture(3, false, new Asset("USD", issuer), "922337203685.4775807"), d = fixture(4, false, new Asset("USD", issuer), "0.0000001"); reject(() => run([c.transaction, d.transaction]));
});
Deno.test("original obligations reject aliases, missing scope, SDK contradictions, accessors and oversized input", () => {
  const a = fixture(1); reject(() => run([a.transaction, a.transaction]));
  for (const mutate of [(r: typeof a.transaction) => { r.feeChargedStroops = "124"; }, (r: typeof a.transaction) => { r.context.pool = donor; },
    (r: typeof a.transaction) => { r.context.firstLedger = 7; }]) { const r = structuredClone(a.transaction); mutate(r); reject(() => run([r])); }
  reject(() => calculateOriginalObligations({ ...context, firstLedger: 11, transactions: [a.transaction], operatingCredits: [] }));
  const getter = structuredClone(a.transaction); let invoked = false; Object.defineProperty(getter, "raw", { enumerable: true, get() { invoked = true; throw new Error("private"); } });
  reject(() => run([getter])); equal(invoked, false); reject(() => run(Array(1001).fill(a.transaction)));
});
