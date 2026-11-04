import { Account, Asset, Claimant, Keypair, Networks, Operation, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { parseInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
const [pool, beneficiary] = [101, 102].map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)));
const closedAt = 1793102400, ledgerHash = "a".repeat(64), time = "2026-10-27T12:00:00Z";
function equal(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify([a, b])); }
function freeze<T>(v: T): T { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
// Independent protocol preimage: envelope type6, AccountID type0, source32,
// signed int64 sequence and zero-based operation index. Not the transaction hash.
function expectedId(sequence: string) {
  const bytes = Buffer.alloc(52); bytes.writeUInt32BE(6); pool.rawPublicKey().copy(bytes, 8);
  bytes.writeBigInt64BE(BigInt(sequence), 40);
  return "00000000" + createHash("sha256").update(bytes).digest("hex");
}
function result(failed: boolean, id: string) {
  const op = failed ? xdr.CreateClaimableBalanceResult.createClaimableBalanceUnderfunded() :
    xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR(id, "hex"));
  const operations = [xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(op))];
  return new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"),
    result: failed ? xdr.TransactionResultResult.txFailed(operations) : xdr.TransactionResultResult.txSuccess(operations),
    ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
}
function fixture(failed = false, issued = false) {
  const deadline = (closedAt + 300).toString(), predicate = Claimant.predicateBeforeAbsoluteTime(deadline);
  const tx = new TransactionBuilder(new Account(pool.publicKey(), "9007199254740993"), { fee: "500", networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: closedAt + 30 } }).addOperation(Operation.createClaimableBalance({
      asset: issued ? new Asset("USD", beneficiary.publicKey()) : Asset.native(), amount: "2.0000001",
      claimants: [new Claimant(beneficiary.publicKey(), predicate), new Claimant(pool.publicKey(), Claimant.predicateNot(predicate))],
    })).build();
  tx.sign(pool);
  const id = expectedId(tx.sequence);
  return { tx, id, input: { context: { pool: pool.publicKey(), firstLedger: 8, anchor: { sequence: 9, hash: ledgerHash, closedAt } },
    ledger: { sequence: 9, hash: ledgerHash, closed_at: time },
    transaction: { hash: tx.hash().toString("hex"), ledger: 9, created_at: time, source_account: pool.publicKey(),
      source_account_sequence: tx.sequence, fee_account: pool.publicKey(), fee_charged: "123", max_fee: "500", successful: !failed,
      operation_count: 1, paging_token: ((9n << 32n) + (1n << 12n)).toString(), envelope_xdr: tx.toXDR(), result_xdr: result(failed, id) } } };
}
function reject(poolAddress: unknown, signed: unknown, input: unknown, serializable = true) {
  const before = serializable ? JSON.stringify(input) : undefined;
  let error: unknown; try { parseInitialIssuanceOutcome(poolAddress as string, signed as string, input); } catch (e) { error = e; }
  equal(error instanceof CustodyError && [error.code, error.status, error.message],
    ["initial_issuance_outcome_unavailable", 503, "initial_issuance_outcome_unavailable"]);
  if (serializable) equal(JSON.stringify(input), before);
}
Deno.test("issuance outcomes bind native and issued signed bytes to protocol-derived CB ID", () => {
  for (const issued of [false, true]) {
    const { tx, id, input } = fixture(false, issued), before = JSON.stringify(input);
    equal(tx.getClaimableBalanceId(0), id);
    const value = parseInitialIssuanceOutcome(pool.publicKey(), tx.toXDR(), freeze(input));
    equal([value.kind, value.revision, value.outcome, value.claimableBalanceId], ["d1_initial_issuance_outcome", 1, "success", id]);
    equal(value.observation.transactionHash, tx.hash().toString("hex"));
    equal([value.observation.envelopeXdr, value.observation.feeChargedStroops, value.observation.feeBidStroops,
      value.observation.sequence, value.observation.ledger, value.observation.closedAt], [tx.toXDR(), "123", "500", tx.sequence, 9, closedAt]);
    equal(JSON.stringify(input), before);
    equal([Object.isFrozen(value), Object.isFrozen(value.observation), Object.isFrozen(value.observation.raw.transaction),
      Object.isFrozen(value.observation.context.anchor), Object.isFrozen(value.observation.operationTypes)], [true, true, true, true, true]);
  }
});
Deno.test("included failed has no CB mapping but retains actual fee and consumed sequence", () => {
  const { tx, input } = fixture(true), value = parseInitialIssuanceOutcome(pool.publicKey(), tx.toXDR(), input);
  equal([value.outcome, value.claimableBalanceId, value.observation.feeChargedStroops, value.observation.sequence], ["failed", null, "123", tx.sequence]);
  input.context.anchor.hash = "b".repeat(64); input.transaction.fee_charged = "999";
  equal([value.observation.context.anchor.hash, value.observation.raw.transaction.fee_charged], [ledgerHash, "123"]);
});
Deno.test("forged CB IDs and same-shape foreign envelope or pool never become a mapping", () => {
  for (const id of ["00000000" + "f".repeat(64), expectedId("9007199254740995")]) {
    const { tx, input } = fixture(); input.transaction.result_xdr = result(false, id); reject(pool.publicKey(), tx.toXDR(), input);
  }
  const { tx, input } = fixture(), other = fixture(false, true);
  reject(pool.publicKey(), other.tx.toXDR(), input); reject(beneficiary.publicKey(), tx.toXDR(), input);
  input.context.pool = beneficiary.publicKey(); reject(pool.publicKey(), tx.toXDR(), input);
});
Deno.test("canonical ordinary signed pool envelope and exact one creation are mandatory", () => {
  const original = fixture();
  for (const change of ["unsigned", "wrong-key", "extra", "hint", "signature", "public-network", "fee-bump", "wrong-op", "two-ops", "override"]) {
    let tx = TransactionBuilder.fromXDR(original.tx.toXDR(), Networks.TESTNET);
    if (!(tx instanceof Transaction)) throw new Error("fixture");
    if (change === "public-network") tx = new Transaction(tx.toEnvelope(), Networks.PUBLIC);
    if (["wrong-op", "two-ops", "override"].includes(change)) {
      const builder = new TransactionBuilder(new Account(pool.publicKey(), "9007199254740993"), { fee: "500", networkPassphrase: Networks.TESTNET }).setTimeout(0);
      if (change === "wrong-op") builder.addOperation(Operation.manageData({ name: "x", value: null }));
      else {
        builder.addOperation(Operation.createClaimableBalance({ asset: Asset.native(), amount: "2", claimants: [new Claimant(beneficiary.publicKey(), Claimant.predicateUnconditional())],
          source: change === "override" ? beneficiary.publicKey() : undefined }));
        if (change === "two-ops") builder.addOperation(Operation.manageData({ name: "x", value: null }));
      }
      tx = builder.build();
    }
    if (change !== "extra") tx.signatures.splice(0);
    if (change !== "unsigned") tx.sign(change === "wrong-key" ? beneficiary : pool);
    if (change === "hint") tx.signatures[0].hint(Buffer.alloc(4));
    if (change === "signature") tx.signatures[0].signature(Buffer.alloc(64));
    const bytes = change === "fee-bump" ? TransactionBuilder.buildFeeBumpTransaction(beneficiary.publicKey(), "600", tx, Networks.TESTNET).toXDR() : tx.toXDR();
    const input = structuredClone(original.input); input.transaction.envelope_xdr = bytes;
    if (["wrong-op", "two-ops", "override"].includes(change)) {
      Object.assign(input.transaction, { hash: tx.hash().toString("hex"), max_fee: tx.fee, operation_count: tx.operations.length });
      const decoded = xdr.TransactionResult.fromXDR(input.transaction.result_xdr, "base64");
      const manage = xdr.OperationResult.opInner(xdr.OperationResultTr.manageData(xdr.ManageDataResult.manageDataSuccess()));
      const results = change === "wrong-op" ? [manage] : change === "two-ops" ? [...decoded.result().results(), manage] : decoded.result().results();
      decoded.result(xdr.TransactionResultResult.txSuccess(results)); input.transaction.result_xdr = decoded.toXDR("base64");
    }
    reject(pool.publicKey(), bytes, input);
  }
  for (const signed of ["", original.tx.toXDR() + "\n", "x".repeat(65537), null, undefined]) reject(pool.publicKey(), signed, original.input);
  reject("not-an-account", original.tx.toXDR(), original.input);
});
Deno.test("unknown nonincluded and inconsistent included DTOs never imply failed issuance", () => {
  for (const code of [xdr.TransactionResultResult.txTooEarly(), xdr.TransactionResultResult.txBadSeq(), xdr.TransactionResultResult.txInternalError()]) {
    const { tx, input } = fixture(); input.transaction.result_xdr = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("0"), result: code,
      ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64"); reject(pool.publicKey(), tx.toXDR(), input);
  }
  for (const patch of [{ successful: false }, { hash: "b".repeat(64) }, { fee_charged: "124" }, { fee_account: beneficiary.publicKey() },
    { source_account_sequence: "1" }, { ledger: 8 }, { paging_token: "0" }, { created_at: "2026-10-27T12:00:01Z" }]) {
    const { tx, input } = fixture(); Object.assign(input.transaction, patch); reject(pool.publicKey(), tx.toXDR(), freeze(input));
  }
  for (const input of [null, { status: 404 }, { error: "timeout" }, {}]) reject(pool.publicKey(), fixture().tx.toXDR(), input);
});
Deno.test("bounded detached input rejects getters and malformed JSON without reading accessors", () => {
  const { tx } = fixture();
  for (const input of [[], { ...fixture().input, context: undefined }, { ...fixture().input, opaque: "x".repeat(131072) }]) reject(pool.publicKey(), tx.toXDR(), input, false);
  const input = fixture().input; let calls = 0;
  Object.defineProperty(input.transaction, "opaque", { enumerable: true, get() { calls++; throw new Error("private"); } });
  reject(pool.publicKey(), tx.toXDR(), input, false); equal(calls, 0);
});
