import { Keypair, Networks, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { parseIncludedTransaction, type IncludedTransactionObservation } from "./transaction-observation.ts";

export type InitialIssuanceOutcome = Readonly<{
  kind: "d1_initial_issuance_outcome"; revision: 1;
  observation: IncludedTransactionObservation;
} & ({ outcome: "success"; claimableBalanceId: string } | { outcome: "failed"; claimableBalanceId: null })>;
function valid(value: unknown): asserts value { if (!value) throw new Error("invalid"); }
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Pure DTO/XDR consistency evidence, NOT consensus or spending permission.
 * The consumer must obtain savedSignedXdr from the internally validated018/030
 * journal; accepting caller-supplied bytes here does not authorize anything. */
export function parseInitialIssuanceOutcome(pool: string, savedSignedXdr: string, input: unknown): InitialIssuanceOutcome {
  try {
    valid(typeof pool === "string"); const key = Keypair.fromPublicKey(pool);
    valid(typeof savedSignedXdr === "string" && savedSignedXdr.length > 0 && savedSignedXdr.length <= 65536 &&
      Buffer.from(savedSignedXdr, "base64").toString("base64") === savedSignedXdr);
    const tx = TransactionBuilder.fromXDR(savedSignedXdr, Networks.TESTNET);
    valid(tx instanceof Transaction && tx.toEnvelope().switch().name === "envelopeTypeTx" && tx.toXDR() === savedSignedXdr);
    valid(tx.source === pool && tx.operations.length === 1 && tx.operations[0].type === "createClaimableBalance" &&
      (tx.operations[0].source ?? tx.source) === pool);
    valid(tx.signatures.length === 1 && tx.signatures[0].hint().equals(key.signatureHint()) &&
      key.verify(tx.hash(), tx.signatures[0].signature()));
    const observation = parseIncludedTransaction(input);
    valid(observation.context.pool === pool && observation.source === pool && observation.feePayer === pool &&
      observation.transactionHash === tx.hash().toString("hex") && observation.envelopeXdr === savedSignedXdr);
    // The included parser already enforces one matching operation/result and
    // txSuccess/txFailed semantics. Never invent a CB ID for a failed operation.
    if (observation.outcome === "failed") return freeze({ kind: "d1_initial_issuance_outcome", revision: 1,
      observation, outcome: "failed", claimableBalanceId: null });
    const result = xdr.TransactionResult.fromXDR(observation.resultXdr, "base64");
    const id = result.result().results()[0].tr().createClaimableBalanceResult().balanceId().toXDR("hex");
    valid(id === tx.getClaimableBalanceId(0));
    return freeze({ kind: "d1_initial_issuance_outcome", revision: 1, observation, outcome: "success", claimableBalanceId: id });
  } catch { throw new CustodyError("initial_issuance_outcome_unavailable", 503); }
}
