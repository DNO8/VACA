import { Keypair, Networks, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { observeAndSaveRefundFinancialEvidence, type RefundFinancialObservation } from "./refund-financial-observation.ts";
import { validateRefundAccountBinding } from "./refund-account-observation.ts";

type Client = Parameters<typeof observeAndSaveRefundFinancialEvidence>[0];
type Scope = Parameters<typeof observeAndSaveRefundFinancialEvidence>[1];
type Options = Parameters<typeof observeAndSaveRefundFinancialEvidence>[2];
type Data = Record<string, unknown>;
export interface RefundSignerConfiguration {
  readonly observation: Options;
  readonly loadPoolSigner: (pool: string) => unknown;
}
export interface SignedRefundReceipt {
  readonly kind: "d1_signed_refund_transaction"; readonly revision: 1;
  readonly request_id: string; readonly namespace: string; readonly network: "TESTNET";
  readonly pool: string; readonly authorized_by: string; readonly transaction_hash: string;
  readonly financial_snapshot_hash: string; readonly signing_nonce: string;
  readonly signed_xdr: string; readonly envelope_hash: string;
}
export interface PersistedSignedRefund {
  readonly kind: "d1_persisted_signed_refund"; readonly revision: 1;
  readonly financial: Readonly<RefundFinancialObservation>;
  readonly claim: Readonly<Data>;
  readonly receipt: Readonly<SignedRefundReceipt>;
}
const unavailable = () => new CustodyError("refund_signing_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && descriptors[k].enumerable && "value" in descriptors[k]));
  return Object.fromEntries(keys.map(k => [k, descriptors[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const data = fields(value);
  check(Object.keys(data).sort().join(",") === names.split(",").sort().join(",")); return data;
}
function copy(value: unknown, active = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { check(Number.isFinite(value)); return value; }
  check(typeof value === "object" && value !== null && !active.has(value)); active.add(value);
  let result: unknown;
  if (Array.isArray(value)) {
    check(Object.getPrototypeOf(value) === Array.prototype);
    const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value), length = descriptors.length.value;
    check(Number.isSafeInteger(length) && length >= 0 && Reflect.ownKeys(value).length === length + 1);
    result = Object.freeze(Array.from({ length }, (_, i) => {
      const d = descriptors[String(i)]; check(d && d.enumerable && "value" in d); return copy(d.value, active);
    }));
  } else result = Object.freeze(Object.fromEntries(Object.entries(fields(value)).map(([k, v]) => [k, copy(v, active)])));
  active.delete(value); return result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const data = value as Data;
    return `{${Object.keys(data).sort().map(k => `${JSON.stringify(k)}:${canonical(data[k])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value); check(typeof encoded === "string"); return encoded;
}
function capture(receiver: unknown, name: string): (...args: unknown[]) => unknown {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, descriptor: PropertyDescriptor | undefined;
  while (owner !== null) {
    descriptor = Object.getOwnPropertyDescriptor(owner, name); if (descriptor) break;
    owner = Object.getPrototypeOf(owner);
  }
  check(descriptor && "value" in descriptor && typeof descriptor.value === "function");
  const method = descriptor.value; return (...args) => Reflect.apply(method, receiver, args);
}
/** Private fresh-claim-only composition. Existing/unknown claims never invoke a key provider.
 * No caller-approved financial DTO, submission, retry, recovery or HTTP response lives here.
 */
export async function signAndSaveAuthorizedRefund(
  client: Client, scope: Scope, configuration: RefundSignerConfiguration,
): Promise<Readonly<PersistedSignedRefund>> {
  let denied = false;
  try {
    const input = exact(scope, "namespace,pool,requestId,authenticatedAdmin");
    const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
    check(uuid(input.namespace) && uuid(input.requestId) && typeof input.pool === "string" &&
      StrKey.isValidEd25519PublicKey(input.pool) && typeof input.authenticatedAdmin === "string" &&
      StrKey.isValidEd25519PublicKey(input.authenticatedAdmin));
    const capturedScope = Object.freeze({ ...input }) as unknown as Scope;
    const config = exact(configuration, "observation,loadPoolSigner"); check(typeof config.loadPoolSigner === "function");
    const signerMethod = config.loadPoolSigner;
    const loadSigner = (pool: string) => Reflect.apply(signerMethod, configuration, [pool]);
    const options = fields(config.observation), hasSource = Object.hasOwn(options, "source");
    exact(options, "now,maximumAgeSeconds,futureToleranceSeconds" + (hasSource ? ",source" : ""));
    const { maximumAgeSeconds, futureToleranceSeconds } = options;
    check(typeof maximumAgeSeconds === "number" && Number.isSafeInteger(maximumAgeSeconds) && maximumAgeSeconds >= 1 && maximumAgeSeconds <= 30 &&
      typeof futureToleranceSeconds === "number" && Number.isSafeInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    const readClock = capture(config.observation, "now"), invoke = capture(client, "rpc");
    const source = options.source === undefined ? new HorizonDiscoverySource() : options.source;
    const readAccount = capture(source, "readAccountAtCheckpoint");
    const readClaimable = capture(source, "readClaimableBalance");
    let lastObservedAt = -1;
    const clock = () => {
      const n = readClock(); check(typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n >= lastObservedAt);
      lastObservedAt = n; return n;
    };
    const capturedOptions: Options = Object.freeze({ now: clock, maximumAgeSeconds, futureToleranceSeconds,
      source: Object.freeze({ readAccountAtCheckpoint: (...args: Parameters<HorizonDiscoverySource["readAccountAtCheckpoint"]>) =>
        readAccount(...args) as ReturnType<HorizonDiscoverySource["readAccountAtCheckpoint"]>,
        readClaimableBalance: (...args: Parameters<HorizonDiscoverySource["readClaimableBalance"]>) =>
          readClaimable(...args) as ReturnType<HorizonDiscoverySource["readClaimableBalance"]> }) });
    const capturedClient: Client = Object.freeze({ rpc: (name: string, parameters: Record<string, unknown>) =>
      invoke(name, parameters) as ReturnType<Client["rpc"]> });
    const rpcData = async (name: string, parameters: Data): Promise<unknown> => {
      const reply = fields(copy(await invoke(name, Object.freeze(parameters))));
      check(Object.hasOwn(reply, "data") && Object.hasOwn(reply, "error") && reply.error === null); return reply.data;
    };
    const scopeParameters = Object.freeze({ p_request_id: capturedScope.requestId, p_authorized_by: capturedScope.authenticatedAdmin });
    const journal = (value: unknown, claiming = false): Data => {
      const data = exact(value, "kind,revision,request_id,namespace,network,pool,candidate,claim,transaction" + (claiming ? ",invoked" : ""));
      check(data.kind === (claiming ? "d1_refund_signing_claim" : "d1_refund_signing_journal_lookup") && data.revision === 1 &&
        data.request_id === capturedScope.requestId && data.namespace === capturedScope.namespace && data.network === "TESTNET" &&
        data.pool === capturedScope.pool && data.candidate !== null); return data;
    };
    clock();
    const before = journal(await rpcData("d1_load_refund_signing_journal", scopeParameters));
    // Absence is NOT authority: genuine financial composition and positive atomic claim follow.
    check(before.claim === null && before.transaction === null);
    let financial: Readonly<RefundFinancialObservation>;
    try { financial = await observeAndSaveRefundFinancialEvidence(capturedClient, capturedScope, capturedOptions); }
    catch (error) {
      denied = error instanceof CustodyError && error.status === 403 && error.code === "unauthorized_admin_wallet" && error.message === error.code;
      throw error;
    }
    const observation = financial.snapshot.funding.creationObservation.observation;
    const { candidate, account, history } = observation;
    check(canonical(before.candidate) === canonical(candidate));
    const fresh = () => {
      const observedAt = clock(); check(observedAt >= financial.observed_at && observedAt < financial.expires_at);
      validateRefundAccountBinding(candidate, history.state, account,
        { startedAt: financial.observed_at, observedAt, maximumAgeSeconds, futureToleranceSeconds });
    };
    fresh();
    const unsigned = TransactionBuilder.fromXDR(candidate.unsigned_xdr, Networks.TESTNET);
    check(unsigned instanceof Transaction && unsigned.toEnvelope().switch().name === "envelopeTypeTx" && unsigned.signatures.length === 0 &&
      unsigned.toXDR() === candidate.unsigned_xdr && unsigned.source === capturedScope.pool && unsigned.sequence === candidate.transaction_sequence &&
      unsigned.hash().toString("hex") === candidate.transaction_hash && financial.transaction_hash === candidate.transaction_hash);
    const body = unsigned.toEnvelope().v1().tx().toXDR("base64"), nonce = crypto.randomUUID(); check(uuid(nonce));
    fresh();
    const claimed = journal(await rpcData("d1_claim_refund_signing", { ...scopeParameters,
      p_snapshot_hash: financial.snapshot_hash, p_signing_nonce: nonce }), true);
    check(claimed.invoked === true && claimed.transaction === null && canonical(claimed.candidate) === canonical(candidate));
    const claim = exact(claimed.claim, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,financial_snapshot_hash,signing_nonce");
    const expectedClaim = Object.freeze({ kind: "d1_refund_signing_attempt", revision: 1, request_id: capturedScope.requestId,
      namespace: capturedScope.namespace, network: "TESTNET", pool: capturedScope.pool, authorized_by: capturedScope.authenticatedAdmin,
      transaction_hash: candidate.transaction_hash, financial_snapshot_hash: financial.snapshot_hash, signing_nonce: nonce });
    check(canonical(claim) === canonical(expectedClaim));
    // SQL post-insert validation cannot protect the subsequent response/provider delay.
    fresh();
    const signer = await loadSigner(capturedScope.pool);
    fresh();
    check(signer instanceof Keypair && signer.canSign() && signer.publicKey() === capturedScope.pool);
    fresh(); unsigned.sign(signer); fresh();
    const signedXdr = unsigned.toXDR(), signed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
    check(Buffer.byteLength(signedXdr, "utf8") <= 65536 && Buffer.from(signedXdr, "base64").toString("base64") === signedXdr &&
      signed instanceof Transaction && signed.toEnvelope().switch().name === "envelopeTypeTx" && signed.toXDR() === signedXdr &&
      signed.signatures.length === 1 && signed.toEnvelope().v1().tx().toXDR("base64") === body &&
      signed.hash().toString("hex") === candidate.transaction_hash && signed.source === capturedScope.pool);
    const verifier = Keypair.fromPublicKey(capturedScope.pool), signature = signed.signatures[0];
    check(signature.hint().toString("hex") === verifier.signatureHint().toString("hex") && verifier.verify(signed.hash(), signature.signature()));
    fresh();
    const envelopeHash = Buffer.from(await crypto.subtle.digest("SHA-256", Buffer.from(signedXdr, "base64"))).toString("hex");
    fresh();
    const expected: Readonly<SignedRefundReceipt> = Object.freeze({ ...expectedClaim, kind: "d1_signed_refund_transaction", revision: 1,
      network: "TESTNET", signed_xdr: signedXdr, envelope_hash: envelopeHash });
    const saved = exact(await rpcData("d1_record_signed_refund_transaction", { ...scopeParameters,
      p_signing_nonce: nonce, p_signed_xdr: signedXdr, p_transaction_hash: candidate.transaction_hash }),
      "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,financial_snapshot_hash,signing_nonce,signed_xdr,envelope_hash");
    check(canonical(saved) === canonical(expected)); fresh();
    const loaded = journal(await rpcData("d1_load_refund_signing_journal", scopeParameters));
    check(canonical(loaded.candidate) === canonical(candidate) && canonical(loaded.claim) === canonical(expectedClaim) &&
      canonical(loaded.transaction) === canonical(expected));
    fresh();
    return Object.freeze({ kind: "d1_persisted_signed_refund", revision: 1, financial, claim: expectedClaim, receipt: expected });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
