import { Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { captured, closedAt, namespace, pool } from "./donor-allocation.ts";
import { planIssuance } from "../../functions/d1-custody/issuance-plan.ts";
import type { Preparation } from "../../functions/d1-custody/handler.ts";

/** Real 016/017/018 receipt shapes over genuine SDK-backed allocation evidence. */
export function issuanceCapture(stage = 3, issued = false, amounts = ["1.0000000"],
  sequence = "100", fee = "500", now = closedAt + 2) {
  const f = captured(issued, amounts);
  f.capture.dbReadAt = closedAt + 600; // Historical replay after expiry, never plan time.
  for (const raw of f.capture.allocations) {
    const preparation = raw.d1_preparations!;
    const input: Preparation = JSON.parse(preparation.input);
    const common = { revision: 1, request_id: input.request_id, namespace, network: "TESTNET", pool };
    const intent = { ...common, kind: "d1_issuance_request_intent", preparation_input: input,
      preparation: JSON.parse(preparation.receipt) };
    const reservation = { ...common, kind: "d1_issuance_sequence_reservation", intent,
      observed_account_sequence: sequence, transaction_sequence: String(BigInt(sequence) + 1n) };
    const { unsignedXdr } = planIssuance(input, { networkPassphrase: Networks.TESTNET, pool, sequence, fee, now });
    const unsigned = { ...common, kind: "d1_unsigned_transaction_journal", reservation,
      deadline: input.request.deadline, transaction_sequence: reservation.transaction_sequence,
      unsigned_xdr: unsignedXdr, transaction_hash: TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET).hash().toString("hex") };
    if (stage >= 1) raw.d1_issuance_intents = { request_id: input.request_id, receipt: JSON.stringify(intent) };
    if (stage >= 2) raw.d1_issuance_sequences = { request_id: input.request_id, namespace, receipt: JSON.stringify(reservation) };
    if (stage >= 3) raw.d1_unsigned_transactions = { request_id: input.request_id, receipt: JSON.stringify(unsigned) };
  }
  return f;
}
export type IssuanceFixture = ReturnType<typeof issuanceCapture>;
export type PrefixKey = "d1_issuance_intents" | "d1_issuance_sequences" | "d1_unsigned_transactions";
/** Keep descendant receipts coherent, so leaf tests cannot pass via stale parents. */
export function changeReceipt(f: IssuanceFixture, key: PrefixKey, change: (r: Record<string, unknown>) => void) {
  const raw = f.capture.allocations[0], row = raw[key]!;
  const receipt = JSON.parse(row.receipt); change(receipt); row.receipt = JSON.stringify(receipt);
  if (key === "d1_issuance_intents" && raw.d1_issuance_sequences) {
    const sequence = JSON.parse(raw.d1_issuance_sequences.receipt);
    sequence.intent = receipt; raw.d1_issuance_sequences.receipt = JSON.stringify(sequence);
  }
  if (key !== "d1_unsigned_transactions" && raw.d1_unsigned_transactions) {
    const unsigned = JSON.parse(raw.d1_unsigned_transactions.receipt);
    unsigned.reservation = JSON.parse(raw.d1_issuance_sequences!.receipt);
    raw.d1_unsigned_transactions.receipt = JSON.stringify(unsigned);
  }
}
