import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { withInitialFinancialAuthorization, type InitialFinancialAuthorization } from "./initial-financial-authorization.ts";

type Client = Parameters<typeof withInitialFinancialAuthorization>[0];
type FinancialConfiguration = Parameters<typeof withInitialFinancialAuthorization>[1];
export type InitialSignerConfiguration = FinancialConfiguration & { readonly loadPoolSigner: (pool: string) => unknown };
export interface InitialSignedIssuance {
  readonly kind: "d1_initial_signed_issuance"; readonly revision: 1;
  readonly authorization: InitialFinancialAuthorization; readonly signedXdr: string;
}
const unavailable = () => new CustodyError("initial_signing_unavailable", 503);
function check(v: unknown): asserts v { if (!v) throw unavailable(); }
/** Internal backend composition only. Never expose the signed artifact before T4 persistence. */
export async function signInitialAuthorizedIssuance(client: Client, configuration: InitialSignerConfiguration): Promise<InitialSignedIssuance> {
  let financial: FinancialConfiguration, clock: () => number;
  try {
    const readClock = configuration.now.bind(configuration); let last = -1;
    clock = () => { const n = readClock(); check(Number.isSafeInteger(n) && n >= 0 && n >= last); last = n; return n; };
    const { namespace, pool, requestId, authenticatedAdmin, source, maximumAgeSeconds, futureToleranceSeconds } = configuration;
    financial = { namespace, pool, requestId, authenticatedAdmin, source, maximumAgeSeconds, futureToleranceSeconds, now: clock };
  } catch { throw unavailable(); }
  // Gate errors retain their own validated 403/503. Provider errors cannot impersonate them.
  return await withInitialFinancialAuthorization(client, financial, async authorization => {
    try {
      const { pool } = authorization.snapshot;
      const fresh = () => check(clock() < authorization.snapshot.expiresAt);
      fresh();
      const signer = await configuration.loadPoolSigner(pool);
      fresh();
      check(signer instanceof Keypair && signer.canSign() && signer.publicKey() === pool);
      const unsigned = TransactionBuilder.fromXDR(authorization.unsignedXdr, Networks.TESTNET);
      check(unsigned instanceof Transaction && unsigned.toEnvelope().switch().name === "envelopeTypeTx" && unsigned.signatures.length === 0 &&
        unsigned.source === pool && unsigned.toXDR() === authorization.unsignedXdr && unsigned.hash().toString("hex") === authorization.transactionHash);
      const body = unsigned.toEnvelope().v1().tx().toXDR("base64");
      fresh(); unsigned.sign(signer); fresh();
      const signedXdr = unsigned.toXDR(), signed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
      check(signed instanceof Transaction && signed.toEnvelope().switch().name === "envelopeTypeTx" && signed.signatures.length === 1 &&
        signed.toEnvelope().v1().tx().toXDR("base64") === body && signed.hash().toString("hex") === authorization.transactionHash);
      const verifier = Keypair.fromPublicKey(pool), signature = signed.signatures[0];
      check(signature.hint().toString("hex") === verifier.signatureHint().toString("hex") && verifier.verify(signed.hash(), signature.signature()));
      fresh();
      return Object.freeze({ kind: "d1_initial_signed_issuance", revision: 1, authorization, signedXdr });
    } catch { throw unavailable(); }
  });
}
