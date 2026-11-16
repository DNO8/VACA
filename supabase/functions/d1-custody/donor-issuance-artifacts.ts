import { hash, Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import type { VerifiedDonorPaymentCommand } from "./donor-payment-command.ts";
import { parseCapturedJSONB, type Immutable } from "./donor-captured-history.ts";
import { validateDonorFinancialDigests, type ValidatedDonorFinancialDigests } from "./donor-financial-digest.ts";
import { CustodyError } from "./handler.ts";

type ObjectValue = Record<string, unknown>;
interface ArtifactCommon {
  revision: 1; request_id: string; namespace: string; network: "TESTNET";
  pool: string; authorized_by: string;
}
export interface DonorFeeCommitment extends ArtifactCommon {
  kind: "d1_issuance_fee_commitment"; reservation: Immutable<ObjectValue>;
  issuance_fee_stroops: string; future_refund_fee_stroops: string; deadline: string;
}
export interface DonorSignedArtifact extends ArtifactCommon {
  kind: "d1_signed_transaction_journal"; reservation: Immutable<ObjectValue>;
  transaction_hash: string; snapshot_hash: string; signed_xdr: string; envelope_hash: string;
}
export interface DonorSubmissionArtifact extends ArtifactCommon {
  kind: "d1_submission_attempt"; reservation: Immutable<ObjectValue>;
  transaction_hash: string; envelope_hash: string; snapshot_hash: string;
  attempt_id: string; claimed_at: number;
}
export interface DonorIssuanceArtifacts {
  requestId: string; commitment: DonorFeeCommitment | null;
  signed: DonorSignedArtifact | null; submission: DonorSubmissionArtifact | null;
}
export type ValidatedDonorIssuanceArtifacts = ValidatedDonorFinancialDigests & {
  artifactAssurance: "historical-consistency-only"; artifacts: DonorIssuanceArtifacts[];
};
const COMMON = ["kind", "revision", "request_id", "namespace", "network", "pool", "authorized_by"];
function valid(v: unknown): asserts v { if (!v) throw new CustodyError("donor_payment_unavailable", 503); }
function object(v: unknown): ObjectValue {
  valid(v !== null && typeof v === "object" && !Array.isArray(v)); return v as ObjectValue;
}
function exact(v: unknown, fields: string[]): ObjectValue {
  const result = object(v), actual = Object.keys(result).sort(), expected = [...COMMON, ...fields].sort();
  valid(actual.length === expected.length && actual.every((key, i) => key === expected[i])); return result;
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && same((a as ObjectValue)[k], (b as ObjectValue)[k]));
}
function freeze<T>(v: T): Immutable<T> {
  if (v !== null && typeof v === "object" && !Object.isFrozen(v)) {
    Object.values(v).forEach(freeze); Object.freeze(v);
  }
  return v as Immutable<T>;
}
function digest(v: unknown): string { valid(typeof v === "string" && /^[0-9a-f]{64}$/.test(v)); return v; }
function fee(v: unknown): string { valid(typeof v === "string" && /^[1-9][0-9]{0,18}$/.test(v)); return v; }
function uuid(v: unknown): string {
  valid(typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)); return v;
}
function common(v: ObjectValue, kind: string, requestId: string, namespace: string, pool: string): ArtifactCommon {
  valid(v.kind === kind && v.revision === 1 && v.request_id === requestId && v.namespace === namespace &&
    v.network === "TESTNET" && v.pool === pool);
  const actor = v.authorized_by;
  valid(typeof actor === "string" && /^G[A-Z2-7]{55}$/.test(actor) && Keypair.fromPublicKey(actor).publicKey() === actor);
  return { revision: 1, request_id: requestId, namespace, network: "TESTNET", pool, authorized_by: actor };
}

/** Private historical consistency only, never signing/submission authority or a
 * public DTO. Predecessor capture detaches data descriptors before any traversal;
 * only its bounded receipt strings are parsed here. Raw outcomes stay unvalidated. */
export function validateDonorIssuanceArtifacts(capture: unknown, expected: VerifiedDonorPaymentCommand): Immutable<ValidatedDonorIssuanceArtifacts> {
  try {
    const context = validateDonorFinancialDigests(capture, expected);
    const { namespace, pool } = context.capture.scope, attempts = new Set<string>();
    const artifacts = context.allocations.map((allocation, index): DonorIssuanceArtifacts => {
      const { requestId, preparation, raw } = allocation;
      const prefix = context.prefixes[index], financial = context.financialDigests[index];
      valid(prefix.requestId === requestId && financial.requestId === requestId);
      const reservation = prefix.reservation;
      // The predecessor already validates unsigned economics and canonical XDR.
      const unsigned = prefix.unsigned ? TransactionBuilder.fromXDR(prefix.unsigned.unsignedXdr, Networks.TESTNET) : null;
      valid(unsigned === null || unsigned instanceof Transaction);
      let commitment: DonorFeeCommitment | null = null;
      let signed: DonorSignedArtifact | null = null, submission: DonorSubmissionArtifact | null = null;
      if (raw.d1_issuance_fee_commitments !== null) {
        valid(reservation && raw.d1_issuance_fee_commitments.request_id === requestId);
        const receipt = exact(parseCapturedJSONB(raw.d1_issuance_fee_commitments.receipt),
          ["reservation", "issuance_fee_stroops", "future_refund_fee_stroops", "deadline"]);
        const bound = common(receipt, "d1_issuance_fee_commitment", requestId, namespace, pool);
        const issuance = fee(receipt.issuance_fee_stroops), refund = fee(receipt.future_refund_fee_stroops);
        valid(BigInt(issuance) + BigInt(refund) <= 9223372036854775807n && same(receipt.reservation, reservation) &&
          receipt.deadline === preparation.request.deadline);
        valid(unsigned === null || issuance === unsigned.fee);
        commitment = { ...bound, kind: "d1_issuance_fee_commitment", reservation,
          issuance_fee_stroops: issuance, future_refund_fee_stroops: refund, deadline: preparation.request.deadline };
      }
      const snapshots = new Set<string>();
      for (const observation of financial.observations) {
        valid(unsigned && commitment);
        const snapshot = object(observation.receipt.snapshot);
        valid(same(snapshot.commitment, commitment));
        snapshots.add(observation.snapshotHash);
      }
      if (raw.d1_signed_transactions !== null) {
        valid(unsigned && prefix.unsigned && reservation && commitment && raw.d1_signed_transactions.request_id === requestId);
        const receipt = exact(parseCapturedJSONB(raw.d1_signed_transactions.receipt),
          ["transaction_hash", "snapshot_hash", "signed_xdr", "envelope_hash", "reservation"]);
        const bound = common(receipt, "d1_signed_transaction_journal", requestId, namespace, pool);
        const transactionHash = digest(receipt.transaction_hash), snapshotHash = digest(receipt.snapshot_hash);
        const envelopeHash = digest(receipt.envelope_hash), xdr = receipt.signed_xdr;
        valid(raw.d1_signed_transactions.snapshot_hash === snapshotHash && snapshots.has(snapshotHash) &&
          transactionHash === prefix.unsigned.transactionHash && same(receipt.reservation, reservation));
        valid(typeof xdr === "string" && xdr.length >= 4 && xdr.length <= 65536 &&
          /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(xdr));
        const bytes = Buffer.from(xdr, "base64");
        valid(bytes.toString("base64") === xdr && hash(bytes).toString("hex") === envelopeHash);
        const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
        valid(transaction instanceof Transaction && transaction.toEnvelope().switch().name === "envelopeTypeTx" &&
          unsigned.toEnvelope().switch().name === "envelopeTypeTx" && unsigned.signatures.length === 0 &&
          transaction.toXDR() === xdr && transaction.source === pool && transaction.signatures.length === 1 &&
          transaction.toEnvelope().v1().tx().toXDR("base64") === unsigned.toEnvelope().v1().tx().toXDR("base64") &&
          transaction.hash().toString("hex") === transactionHash && unsigned.hash().toString("hex") === transactionHash);
        const verifier = Keypair.fromPublicKey(pool), signature = transaction.signatures[0];
        valid(signature.hint().toString("hex") === verifier.signatureHint().toString("hex") &&
          verifier.verify(transaction.hash(), signature.signature()));
        signed = { ...bound, kind: "d1_signed_transaction_journal", reservation, transaction_hash: transactionHash,
          snapshot_hash: snapshotHash, signed_xdr: xdr, envelope_hash: envelopeHash };
      }
      if (raw.d1_submission_attempts !== null) {
        valid(signed && reservation && raw.d1_submission_attempts.request_id === requestId);
        const receipt = exact(parseCapturedJSONB(raw.d1_submission_attempts.receipt),
          ["transaction_hash", "envelope_hash", "snapshot_hash", "attempt_id", "claimed_at", "reservation"]);
        const bound = common(receipt, "d1_submission_attempt", requestId, namespace, pool);
        const transactionHash = digest(receipt.transaction_hash), envelopeHash = digest(receipt.envelope_hash);
        const snapshotHash = digest(receipt.snapshot_hash), attemptId = uuid(receipt.attempt_id), claimedAt = receipt.claimed_at;
        valid(raw.d1_submission_attempts.attempt_id === attemptId && !attempts.has(attemptId) &&
          transactionHash === signed.transaction_hash && envelopeHash === signed.envelope_hash && same(receipt.reservation, reservation));
        // Historical031 replay: safe nonnegative epoch seconds, not a renewed
        // clock/expiry gate. Submission's snapshot B need not equal signing's A.
        valid(typeof claimedAt === "number" && Number.isSafeInteger(claimedAt) && claimedAt >= 0 && snapshots.has(snapshotHash));
        attempts.add(attemptId);
        submission = { ...bound, kind: "d1_submission_attempt", reservation, transaction_hash: transactionHash,
          envelope_hash: envelopeHash, snapshot_hash: snapshotHash, attempt_id: attemptId, claimed_at: claimedAt };
      }
      return { requestId, commitment, signed, submission };
    });
    return freeze({ ...context, artifactAssurance: "historical-consistency-only" as const, artifacts });
  } catch { throw new CustodyError("donor_payment_unavailable", 503); }
}
