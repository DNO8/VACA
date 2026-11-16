import { Keypair, Networks, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import type { RefundCandidateReceipt } from "./refund-candidate-journal.ts";
import { parseIncludedTransaction, type IncludedTransactionObservation } from "./transaction-observation.ts";

type AssetIdentity = Readonly<{ type: "native" } | { type: "issued"; code: string; issuer: string }>;
export interface RefundOriginalPayment {
  readonly donor: string;
  readonly asset: AssetIdentity;
  readonly grossAmount: string;
  readonly confirmedAt: string;
}
export interface RefundOutcome {
  readonly kind: "d1_refund_outcome";
  readonly revision: 1;
  readonly observation: Readonly<IncludedTransactionObservation>;
  readonly originalPayment: Readonly<RefundOriginalPayment>;
  readonly outcome: "success" | "failed";
  readonly donorRefundedAmount: string;
  readonly claimedBalanceId: string | null;
}
type Data = Record<string, unknown>;
function check(value: unknown): asserts value { if (!value) throw new Error("invalid"); }
function exact(value: unknown, names: string): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  check((keys as string[]).sort().join(",") === names.split(",").sort().join(","));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function timestamp(value: unknown): number {
  check(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value));
  const seconds = Date.parse(value) / 1000;
  check(Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 253402300799 &&
    new Date(seconds * 1000).toISOString().replace(".000Z", "Z") === value); return seconds;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
/** Pure included-DTO/XDR consistency, NOT source provenance, consensus or settlement.
 * The consumer MUST load candidate/signed bytes from034/036 and the immutable
 * original payment from its genuine parent preparation. Never accept HTTP DTOs
 * here as a financial authorization or silently substitute a net liability.
 */
export function parseRefundOutcome(
  candidate: Readonly<RefundCandidateReceipt>, originalPayment: Readonly<RefundOriginalPayment>,
  savedSignedXdr: string, input: unknown,
): Readonly<RefundOutcome> {
  try {
    const c = exact(candidate, "kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,source_sequence,transaction_sequence,deadline,unsigned_xdr,transaction_hash");
    const p = exact(originalPayment, "donor,asset,grossAmount,confirmedAt");
    check(c.kind === "d1_refund_candidate" && c.revision === 1 && c.network === "TESTNET" &&
      typeof c.pool === "string" && StrKey.isValidEd25519PublicKey(c.pool) &&
      typeof c.authorized_by === "string" && StrKey.isValidEd25519PublicKey(c.authorized_by));
    for (const id of [c.request_id, c.namespace]) check(typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id));
    for (const hash of [c.initial_transaction_hash, c.initial_outcome_hash, c.transaction_hash]) check(typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash));
    check(typeof c.source_sequence === "string" && /^[1-9][0-9]{0,18}$/.test(c.source_sequence));
    const sourceSequence = BigInt(c.source_sequence);
    check(sourceSequence < 9223372036854775807n && c.transaction_sequence === (sourceSequence + 1n).toString());
    check(typeof p.donor === "string" && StrKey.isValidEd25519PublicKey(p.donor) &&
      typeof p.grossAmount === "string" && /^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(p.grossAmount));
    const gross = BigInt(p.grossAmount.replace(".", "")); check(gross > 0n && gross <= 9223372036854775807n);
    const deadline = timestamp(c.deadline), confirmedAt = timestamp(p.confirmedAt);
    check(deadline === confirmedAt + 300);
    check(p.asset !== null && typeof p.asset === "object");
    const assetType = Object.getOwnPropertyDescriptor(p.asset, "type");
    check(assetType && assetType.enumerable && "value" in assetType);
    const asset = exact(p.asset, assetType.value === "native" ? "type" : "type,code,issuer");
    let identity: AssetIdentity;
    if (asset.type === "native") identity = Object.freeze({ type: "native" });
    else {
      check(asset.type === "issued" && typeof asset.code === "string" && /^[A-Za-z0-9]{1,12}$/.test(asset.code) &&
        typeof asset.issuer === "string" && StrKey.isValidEd25519PublicKey(asset.issuer));
      identity = Object.freeze({ type: "issued", code: asset.code, issuer: asset.issuer });
    }
    check(typeof c.unsigned_xdr === "string" && c.unsigned_xdr.length <= 65536 &&
      Buffer.from(c.unsigned_xdr, "base64").toString("base64") === c.unsigned_xdr &&
      typeof savedSignedXdr === "string" && savedSignedXdr.length > 0 && savedSignedXdr.length <= 65536 &&
      Buffer.from(savedSignedXdr, "base64").toString("base64") === savedSignedXdr);
    const unsigned = TransactionBuilder.fromXDR(c.unsigned_xdr, Networks.TESTNET), tx = TransactionBuilder.fromXDR(savedSignedXdr, Networks.TESTNET);
    check(unsigned instanceof Transaction && tx instanceof Transaction && unsigned.toEnvelope().switch().name === "envelopeTypeTx" &&
      tx.toEnvelope().switch().name === "envelopeTypeTx" && unsigned.toXDR() === c.unsigned_xdr && tx.toXDR() === savedSignedXdr &&
      unsigned.source === c.pool && tx.source === c.pool && unsigned.sequence === c.transaction_sequence && tx.sequence === c.transaction_sequence &&
      unsigned.signatures.length === 0 && tx.signatures.length === 1 && unsigned.hash().toString("hex") === c.transaction_hash &&
      tx.hash().toString("hex") === c.transaction_hash && unsigned.toEnvelope().v1().tx().toXDR("base64") === tx.toEnvelope().v1().tx().toXDR("base64"));
    check(tx.timeBounds !== undefined && tx.timeBounds.minTime === String(deadline) && /^[1-9][0-9]*$/.test(tx.timeBounds.maxTime) &&
      BigInt(tx.timeBounds.maxTime) > BigInt(deadline));
    const key = Keypair.fromPublicKey(c.pool), signature = tx.signatures[0];
    check(signature.hint().toString("hex") === key.signatureHint().toString("hex") && key.verify(tx.hash(), signature.signature()));
    check(tx.operations.length === 1 || tx.operations.length === 2);
    check(tx.operations.every(op => (op.source ?? tx.source) === c.pool));
    let claimedBalanceId: string | null = null;
    if (tx.operations.length === 2) {
      const claim = tx.operations[0];
      check(claim.type === "claimClaimableBalance" && /^[0-9a-f]{72}$/.test(claim.balanceId)); claimedBalanceId = claim.balanceId;
    }
    const payment = tx.operations[tx.operations.length - 1];
    check(payment.type === "payment" && payment.destination === p.donor && payment.amount === p.grossAmount);
    check(identity.type === "native" ? payment.asset.isNative() : !payment.asset.isNative() &&
      payment.asset.getCode() === identity.code && payment.asset.getIssuer() === identity.issuer);
    const observation = parseIncludedTransaction(input);
    check(observation.context.pool === c.pool && observation.source === c.pool && observation.feePayer === c.pool &&
      observation.transactionHash === c.transaction_hash && observation.sequence === c.transaction_sequence && observation.envelopeXdr === savedSignedXdr &&
      observation.closedAt >= deadline && BigInt(observation.closedAt) <= BigInt(tx.timeBounds.maxTime) &&
      observation.poolOperationSourceIndices.length === tx.operations.length && observation.poolOperationSourceIndices.every((value, i) => value === i));
    const original: Readonly<RefundOriginalPayment> = Object.freeze({ donor: p.donor, asset: identity, grossAmount: p.grossAmount, confirmedAt: p.confirmedAt as string });
    // txFailed rolls back ALL classic principal operations, even if an earlier
    // operation result was success; the included native fee remains separate.
    return freeze({ kind: "d1_refund_outcome", revision: 1, observation, originalPayment: original,
      outcome: observation.outcome, donorRefundedAmount: observation.outcome === "success" ? p.grossAmount : "0.0000000",
      claimedBalanceId: observation.outcome === "success" ? claimedBalanceId : null });
  } catch { throw new CustodyError("refund_outcome_unavailable", 503); }
}
