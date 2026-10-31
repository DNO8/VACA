import { Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import type { Preparation } from "./handler.ts";
import { planIssuance } from "./issuance-plan.ts";

type Immutable<T> = { readonly [K in keyof T]: Immutable<T[K]> };
export interface UnsignedTransactionInput {
  readonly prepared: Immutable<Preparation>;
  readonly networkPassphrase: string;
  readonly pool: string;
  readonly observedSequence: string;
  readonly transactionSequence: string;
  readonly unsignedXdr: string;
  readonly expectedTransactionHash: string;
}
export interface ValidatedUnsignedTransaction {
  readonly unsignedXdr: string;
  readonly transactionHash: string;
}

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new Error("invalid_unsigned_transaction");
}

/**
 * Historical evidence validation, NOT a new plan or authority to sign.
 * Preparation/configuration/reservation must come from trusted persisted facts.
 * No current clock, state mutation, expiry reset, signing or submission occurs.
 */
export function validateUnsignedTransaction(
  input: UnsignedTransactionInput,
): ValidatedUnsignedTransaction {
  try {
    requireValid(input.networkPassphrase === Networks.TESTNET);
    const { unsignedXdr, expectedTransactionHash, observedSequence, transactionSequence } = input;
    // Bound before decoding, matching 018's canonical Base64 storage contract.
    requireValid(typeof unsignedXdr === "string" && unsignedXdr.length >= 4 &&
      unsignedXdr.length <= 65536 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(unsignedXdr));
    requireValid(Buffer.from(unsignedXdr, "base64").toString("base64") === unsignedXdr);
    requireValid(typeof expectedTransactionHash === "string" &&
      /^[0-9a-f]{64}$/.test(expectedTransactionHash));
    requireValid(typeof observedSequence === "string" &&
      /^(0|[1-9][0-9]{0,18})$/.test(observedSequence) &&
      BigInt(observedSequence) < 9223372036854775807n);
    requireValid(typeof transactionSequence === "string" &&
      transactionSequence === (BigInt(observedSequence) + 1n).toString());

    const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
    requireValid(tx instanceof Transaction &&
      tx.toEnvelope().switch().name === "envelopeTypeTx" && tx.signatures.length === 0);
    requireValid(tx.source === input.pool && tx.sequence === transactionSequence);
    const minTime = tx.timeBounds?.minTime;
    requireValid(typeof minTime === "string" && /^(0|[1-9][0-9]*)$/.test(minTime));
    const historicalTime = Number(minTime);
    requireValid(Number.isSafeInteger(historicalTime));
    // Reuse ALL existing economic/asset/predicate/deadline/fee guards and SDK form.
    // Exact reconstruction also excludes memo, op source, extra ops, preconditions,
    // signer requirements, alternate envelopes and trailing/noncanonical XDR bytes.
    const reconstructed = planIssuance(input.prepared, {
      networkPassphrase: Networks.TESTNET, pool: input.pool, sequence: observedSequence,
      now: historicalTime, fee: tx.fee,
    });
    requireValid(reconstructed.unsignedXdr === unsignedXdr);
    const transactionHash = tx.hash().toString("hex");
    requireValid(transactionHash === expectedTransactionHash);
    return { unsignedXdr, transactionHash };
  } catch {
    // Unknown runtime shapes and SDK diagnostics must never escape this boundary.
    throw new Error("invalid_unsigned_transaction");
  }
}
