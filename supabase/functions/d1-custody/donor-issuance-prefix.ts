import { Networks } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import type { VerifiedDonorPaymentCommand } from "./donor-payment-command.ts";
import { parseCapturedJSONB, type Immutable } from "./donor-captured-history.ts";
import { validateDonorCapturedAllocations, type ValidatedDonorCapturedAllocations } from "./donor-allocation-projection.ts";
import { validateUnsignedTransaction, type ValidatedUnsignedTransaction } from "./unsigned-transaction.ts";

type ObjectValue = Record<string, unknown>;
export interface DonorIssuancePrefix {
  requestId: string;
  intent: ObjectValue | null;
  reservation: ObjectValue | null;
  unsigned: ValidatedUnsignedTransaction | null;
}
export type ValidatedDonorIssuancePrefix = ValidatedDonorCapturedAllocations & { prefixes: DonorIssuancePrefix[] };
function valid(v: unknown): asserts v { if (!v) throw new CustodyError("donor_payment_unavailable", 503); }
function object(v: unknown): ObjectValue {
  valid(v !== null && typeof v === "object" && !Array.isArray(v)); return v as ObjectValue;
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

/** Private historical prefix, NOT signing authority or final issuance status.
 * Later financial/signed/submission/outcome rows remain explicitly unvalidated in
 * allocations[].raw. Null prefix facts do not establish absence on the network.
 * Parse only the bounded, detached descriptor-safe allocation validator output. */
export function validateDonorIssuancePrefix(capture: unknown, expected: VerifiedDonorPaymentCommand): Immutable<ValidatedDonorIssuancePrefix> {
  try {
    const context = validateDonorCapturedAllocations(capture, expected);
    const { namespace, pool } = context.capture.scope;
    const prefixes = context.allocations.map(allocation => {
      const { requestId, preparation, raw } = allocation;
      const common = { revision: 1, request_id: requestId, namespace, network: "TESTNET", pool };
      let intent: ObjectValue | null = null, reservation: ObjectValue | null = null;
      let unsigned: ValidatedUnsignedTransaction | null = null;
      if (raw.d1_issuance_intents !== null) {
        valid(raw.d1_issuance_intents.request_id === requestId);
        intent = object(parseCapturedJSONB(raw.d1_issuance_intents.receipt));
        valid(same(intent, { ...common, kind: "d1_issuance_request_intent", preparation_input: preparation,
          preparation: parseCapturedJSONB(raw.d1_preparations!.receipt) }));
      }
      if (raw.d1_issuance_sequences !== null) {
        valid(intent && raw.d1_issuance_sequences.request_id === requestId && raw.d1_issuance_sequences.namespace === namespace);
        reservation = object(parseCapturedJSONB(raw.d1_issuance_sequences.receipt));
        const observed = reservation.observed_account_sequence;
        valid(typeof observed === "string" && /^(0|[1-9][0-9]{0,18})$/.test(observed) && BigInt(observed) < 9223372036854775807n);
        valid(same(reservation, { ...common, kind: "d1_issuance_sequence_reservation", intent,
          observed_account_sequence: observed, transaction_sequence: String(BigInt(observed) + 1n) }));
      }
      if (raw.d1_unsigned_transactions !== null) {
        valid(reservation && raw.d1_unsigned_transactions.request_id === requestId);
        const receipt = object(parseCapturedJSONB(raw.d1_unsigned_transactions.receipt));
        valid(same(receipt, { ...common, kind: "d1_unsigned_transaction_journal", reservation,
          deadline: preparation.request.deadline, transaction_sequence: reservation.transaction_sequence,
          unsigned_xdr: receipt.unsigned_xdr, transaction_hash: receipt.transaction_hash }));
        valid(typeof receipt.unsigned_xdr === "string" && typeof receipt.transaction_hash === "string");
        // The unchanged validator derives historical minTime/fee from XDR, NOT
        // dbReadAt/latest anchor. This proves encoded consistency, not a clock
        // reading or original fee-provider observation that was never persisted.
        unsigned = validateUnsignedTransaction({ prepared: preparation, networkPassphrase: Networks.TESTNET, pool,
          observedSequence: reservation.observed_account_sequence as string, transactionSequence: reservation.transaction_sequence as string,
          unsignedXdr: receipt.unsigned_xdr, expectedTransactionHash: receipt.transaction_hash });
      }
      return { requestId, intent, reservation, unsigned };
    });
    return freeze({ ...context, prefixes });
  } catch { throw new CustodyError("donor_payment_unavailable", 503); }
}
