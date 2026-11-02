import { Account, Keypair, MuxedAccount, Networks, Operation, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
const [pool, other] = [31, 32].map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
const closedAt = 1793102400, hash = "a".repeat(64), time = "2026-10-27T12:00:00Z";
function equal(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Mismatch: " + JSON.stringify([a, b])); }
function result(failed = false, fee = "123", types = [10]) {
  const results = types.map((type, i) => type === 10 ? xdr.OperationResult.opInner(
    xdr.OperationResultTr.manageData(i === 0 && failed ? xdr.ManageDataResult.manageDataNameNotFound() : xdr.ManageDataResult.manageDataSuccess())) :
    xdr.OperationResult.opInner(xdr.OperationResultTr.bumpSequence(xdr.BumpSequenceResult.bumpSequenceSuccess())));
  return new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString(fee),
    result: failed ? xdr.TransactionResultResult.txFailed(results) : xdr.TransactionResultResult.txSuccess(results),
    ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
}
function fixture(failed = false, source = pool, override?: string) {
  const account = source.startsWith("M") ? MuxedAccount.fromAddress(source, "9007199254740993") : new Account(source, "9007199254740993");
  const tx = new TransactionBuilder(account, { fee: "500", networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 } }).addOperation(Operation.manageData({ name: "test", value: null, source: override })).build();
  return { context: { pool, firstLedger: 8, anchor: { sequence: 9, hash, closedAt } },
    ledger: { sequence: 9, hash, closed_at: time },
    transaction: { hash: tx.hash().toString("hex"), ledger: 9, created_at: time, source_account: source,
      source_account_sequence: tx.sequence, fee_account: source, fee_charged: "123", max_fee: "500", successful: !failed,
      operation_count: 1, paging_token: ((9n << 32n) + (1n << 12n)).toString(), envelope_xdr: tx.toXDR(), result_xdr: result(failed) } };
}
function freeze<T>(v: T): T { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
function reject(v: unknown, serializable = true) {
  const before = serializable ? JSON.stringify(v) : undefined;
  let error: unknown; try { parseIncludedTransaction(v); } catch (e) { error = e; }
  equal(error instanceof CustodyError && error.status === 503 && error.code === "transaction_observation_unavailable" && error.message === error.code, true);
  if (serializable) equal(JSON.stringify(v), before);
}
Deno.test("included success and failed derive actual fee and consumed sequence, not maximum bid", () => {
  for (const failed of [false, true]) {
    const input = fixture(failed), before = JSON.stringify(input);
    const o = parseIncludedTransaction(freeze(input));
    equal(o, { network: "TESTNET", transactionHash: input.transaction.hash, source: pool, sequence: "9007199254740994",
      feePayer: pool, feeChargedStroops: "123", feeBidStroops: "500", outcome: failed ? "failed" : "success",
      ledger: 9, ledgerHash: hash, closedAt, pagingToken: input.transaction.paging_token,
      envelopeXdr: input.transaction.envelope_xdr, resultXdr: input.transaction.result_xdr,
      operationTypes: [10], poolOperationSourceIndices: [0], raw: { transaction: input.transaction, ledger: input.ledger }, context: input.context });
    equal(JSON.stringify(input), before);
  }
});
Deno.test("other fee payer retains actual source and pool operation overrides without charging pool", () => {
  for (const override of [undefined, pool]) {
    const input = fixture(false, other, override), o = parseIncludedTransaction(input);
    equal([o.source, o.feePayer, o.poolOperationSourceIndices], [other, other, override ? [0] : []]);
    input.transaction.hash = "b".repeat(64); input.context.anchor.hash = "c".repeat(64);
    equal([o.raw.transaction.hash, o.context.anchor.hash], [o.transactionHash, hash]);
  }
  equal(parseIncludedTransaction(fixture(false, pool, other)).poolOperationSourceIndices, []);
});
Deno.test("hash network DTO result TOID and ledger header contradictions fail closed", () => {
  for (const patch of [{ hash: "b".repeat(64) }, { source_account: other }, { source_account_sequence: "1" },
    { fee_account: other }, { fee_charged: "124" }, { max_fee: "501" }, { successful: false }, { operation_count: 2 },
    { ledger: 8 }, { created_at: "2026-10-27T12:00:01Z" }, { paging_token: "38654709761" },
    { paging_token: (9n << 32n).toString() }, { paging_token: "18446744073709551616" },
    { result_xdr: result(false, "501") }, { result_xdr: result(false, "123", [11]) },
    { result_xdr: result(true) }, { result_xdr: result(false, "123", []) }]) {
    const v = fixture(); Object.assign(v.transaction, patch); reject(freeze(v));
  }
  const wrong = fixture(); wrong.transaction.hash = TransactionBuilder.fromXDR(wrong.transaction.envelope_xdr, Networks.PUBLIC).hash().toString("hex"); reject(wrong);
  for (const patch of [{ sequence: 8 }, { hash: "b".repeat(64) }, { closed_at: "2026-10-27T12:00:01Z" }]) {
    const v = fixture(); Object.assign(v.ledger, patch); reject(v);
  }
  for (const patch of [{ firstLedger: 10 }, { firstLedger: 0 }, { anchor: { sequence: 8, hash, closedAt } },
    { anchor: { sequence: 9, hash, closedAt: closedAt + 1 } }]) { const v = fixture(); Object.assign(v.context, patch); reject(v); }
  const earlier = fixture(); earlier.context.anchor.sequence = 10; earlier.context.anchor.closedAt++; equal(parseIncludedTransaction(earlier).ledger, 9);
});
Deno.test("canonical int64 base64 unsupported envelopes and nonincluded result codes reject", () => {
  for (const value of ["01", "-1", "9223372036854775808", "1.0", 123]) {
    for (const key of ["fee_charged", "max_fee", "source_account_sequence"]) { const v = fixture(); Object.assign(v.transaction, { [key]: value }); reject(v); }
  }
  for (const key of ["result_xdr", "envelope_xdr"]) for (const value of ["AAAA", "", fixture().transaction[key as "result_xdr"] + "\n"]) {
    const v = fixture(); Object.assign(v.transaction, { [key]: value }); reject(v);
  }
  for (const code of [xdr.TransactionResultResult.txTooEarly(), xdr.TransactionResultResult.txBadSeq(), xdr.TransactionResultResult.txInternalError()]) {
    const v = fixture(); v.transaction.result_xdr = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("0"), result: code, ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64"); reject(v);
  }
  const notFailed = fixture(true); notFailed.transaction.result_xdr = result(false); reject(notFailed);
  const badSuccess = fixture(); badSuccess.transaction.result_xdr = result(true); const bad = xdr.TransactionResult.fromXDR(badSuccess.transaction.result_xdr, "base64");
  bad.result(xdr.TransactionResultResult.txSuccess(bad.result().results())); badSuccess.transaction.result_xdr = bad.toXDR("base64"); reject(badSuccess);
  const noFailedOp = fixture(true); const decoded = xdr.TransactionResult.fromXDR(result(false), "base64");
  decoded.result(xdr.TransactionResultResult.txFailed(decoded.result().results())); noFailedOp.transaction.result_xdr = decoded.toXDR("base64"); reject(noFailedOp);
  const bump = fixture(); const inner = TransactionBuilder.fromXDR(bump.transaction.envelope_xdr, Networks.TESTNET);
  if (!(inner instanceof Transaction)) throw new Error("fixture");
  bump.transaction.envelope_xdr = TransactionBuilder.buildFeeBumpTransaction(other, "600", inner, Networks.TESTNET).toXDR(); reject(bump);
  reject(fixture(false, new MuxedAccount(new Account(pool, "1"), "7").accountId()));
  const v0 = fixture(); const env = inner.toEnvelope();
  v0.transaction.envelope_xdr = xdr.TransactionEnvelope.envelopeTypeTxV0(new xdr.TransactionV0Envelope({
    tx: new xdr.TransactionV0({ sourceAccountEd25519: Keypair.fromPublicKey(pool).rawPublicKey(), fee: 500,
      seqNum: xdr.Int64.fromString(inner.sequence), timeBounds: null, memo: env.v1().tx().memo(), operations: env.v1().tx().operations(), ext: xdr.TransactionV0Ext.fromXDR("AAAAAA==", "base64") }), signatures: [] })).toXDR("base64"); reject(v0);
});
Deno.test("malformed nonJSON getters and bounded raw records are sanitized without mutation", () => {
  for (const bad of [null, [], {}, { ...fixture(), context: undefined }]) reject(bad, bad !== null && !Object.hasOwn(bad ?? {}, "context"));
  for (const value of [undefined, NaN, 1n, () => 1, new Date(), "x".repeat(131072), "\u0000"]) {
    const v = fixture(); Object.assign(v.transaction, { opaque: value }); reject(v, false);
  }
  for (const target of ["context", "transaction", "ledger"]) {
    const v = fixture(); let calls = 0; Object.defineProperty(v[target as keyof typeof v], "opaque", { enumerable: true, get() { calls++; throw new Error("sensitive"); } });
    reject(v, false); equal(calls, 0);
  }
  const array = fixture(); Object.assign(array.transaction, { opaque: Array(1) }); reject(array, false);
});
