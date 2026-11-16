import { Keypair, Networks, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { signAndSaveAuthorizedRefund, type RefundSignerConfiguration } from "./refund-authorized-signer.ts";
import { observeAndSaveRefundFinancialEvidence } from "./refund-financial-observation.ts";
import { validateRefundAccountBinding } from "./refund-account-observation.ts";

type Client = Parameters<typeof observeAndSaveRefundFinancialEvidence>[0];
type Scope = Parameters<typeof observeAndSaveRefundFinancialEvidence>[1];
type Options = Parameters<typeof observeAndSaveRefundFinancialEvidence>[2];
type Data = Record<string, unknown>;
export interface RefundSubmissionArtifact {
  readonly signedXdr: string; readonly transactionHash: string; readonly attempt: Readonly<Data>;
}
type Result<T> = { readonly kind: "d1_refund_submission_attempt"; readonly revision: 1; readonly attempt: Readonly<Data> } &
  ({ readonly invoked: false } | { readonly invoked: true; readonly value: T });
const unavailable = () => new CustodyError("refund_submission_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const data = fields(value); check(Object.keys(data).sort().join(",") === names.split(",").sort().join(",")); return data;
}
function copy(value: unknown): unknown {
  const active = new Set<object>(); let nodes = 0, characters = 0;
  const visit = (v: unknown, depth: number): unknown => {
    check(++nodes <= 200000 && depth <= 60);
    if (typeof v === "string") { check((characters += v.length) <= 33554432); return v; }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isFinite(v)); return v; }
    check(typeof v === "object" && v !== null && !active.has(v)); active.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      check(Object.getPrototypeOf(v) === Array.prototype);
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), length = ds.length.value;
      check(Number.isSafeInteger(length) && length >= 0 && length <= 200000 && Reflect.ownKeys(v).length === length + 1);
      result = Object.freeze(Array.from({ length }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d); return visit(d.value, depth + 1);
      }));
    } else result = Object.freeze(Object.fromEntries(Object.entries(fields(v)).map(([k, x]) => {
      check((characters += k.length) <= 33554432); return [k, visit(x, depth + 1)];
    })));
    active.delete(v); return result;
  };
  const result = visit(value, 0); check(new TextEncoder().encode(JSON.stringify(result)).length <= 33554432); return result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const data = value as Data; return `{${Object.keys(data).sort().map(k => `${JSON.stringify(k)}:${canonical(data[k])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value); check(typeof encoded === "string"); return encoded;
}
function capture(receiver: unknown, name: string): (...args: unknown[]) => unknown {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, descriptor: PropertyDescriptor | undefined;
  while (owner !== null) { descriptor = Object.getOwnPropertyDescriptor(owner, name); if (descriptor) break; owner = Object.getPrototypeOf(owner); }
  check(descriptor && "value" in descriptor && typeof descriptor.value === "function");
  const method = descriptor.value; return (...args) => Reflect.apply(method, receiver, args);
}
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
/** Server-only closure; no reusable approved DTO or raw-envelope submission entry point. */
export async function withRefundSubmissionAuthorization<T>(
  client: Client, scope: Scope, configuration: RefundSignerConfiguration,
  action: (artifact: RefundSubmissionArtifact) => T | Promise<T>,
): Promise<Result<T>> {
  let denied = false;
  try {
    const input = exact(scope, "namespace,pool,requestId,authenticatedAdmin");
    check(uuid(input.namespace) && uuid(input.requestId) && typeof input.pool === "string" && StrKey.isValidEd25519PublicKey(input.pool) &&
      typeof input.authenticatedAdmin === "string" && StrKey.isValidEd25519PublicKey(input.authenticatedAdmin) && typeof action === "function");
    const capturedScope = Object.freeze({ ...input }) as unknown as Scope, invokeAction = action;
    const config = exact(configuration, "observation,loadPoolSigner"); check(typeof config.loadPoolSigner === "function");
    const signerMethod = config.loadPoolSigner, loadSigner = (pool: string) => Reflect.apply(signerMethod, configuration, [pool]);
    const options = fields(config.observation), hasSource = Object.hasOwn(options, "source");
    exact(options, "now,maximumAgeSeconds,futureToleranceSeconds" + (hasSource ? ",source" : ""));
    const { maximumAgeSeconds, futureToleranceSeconds } = options;
    check(typeof maximumAgeSeconds === "number" && Number.isSafeInteger(maximumAgeSeconds) && maximumAgeSeconds >= 1 && maximumAgeSeconds <= 30 &&
      typeof futureToleranceSeconds === "number" && Number.isSafeInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    const readClock = capture(config.observation, "now"), invoke = capture(client, "rpc");
    const source = options.source === undefined ? new HorizonDiscoverySource() : options.source;
    const readAccount = capture(source, "readAccountAtCheckpoint"), readClaimable = capture(source, "readClaimableBalance");
    let last = -1;
    const clock = () => { const n = readClock(); check(typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n >= last); last = n; return n; };
    const controlled: Options = Object.freeze({ now: clock, maximumAgeSeconds, futureToleranceSeconds,
      source: Object.freeze({ readAccountAtCheckpoint: (...args: Parameters<HorizonDiscoverySource["readAccountAtCheckpoint"]>) =>
        readAccount(...args) as ReturnType<HorizonDiscoverySource["readAccountAtCheckpoint"]>,
        readClaimableBalance: (...args: Parameters<HorizonDiscoverySource["readClaimableBalance"]>) =>
          readClaimable(...args) as ReturnType<HorizonDiscoverySource["readClaimableBalance"]> }) });
    const wrapped: Client = Object.freeze({ async rpc(name: string, parameters: Record<string, unknown>) {
      return copy(await invoke(name, Object.freeze(parameters))) as Awaited<ReturnType<Client["rpc"]>>;
    } });
    const rpc = async (name: string, parameters: Data): Promise<unknown> => {
      const reply = fields(await wrapped.rpc(name, parameters)); check(Object.hasOwn(reply, "data") && Object.hasOwn(reply, "error") && reply.error === null); return reply.data;
    };
    const args = Object.freeze({ p_request_id: capturedScope.requestId, p_authorized_by: capturedScope.authenticatedAdmin });
    const bound = (d: Data, kind: string) => check(d.kind === kind && d.revision === 1 && d.request_id === capturedScope.requestId &&
      d.namespace === capturedScope.namespace && d.network === "TESTNET" && d.pool === capturedScope.pool);
    const lookup = (v: unknown) => { const d = exact(v, "kind,revision,request_id,namespace,network,pool,journal,attempt"); bound(d, "d1_refund_submission_attempt_lookup"); return d; };
    const decode = async (value: unknown) => {
      const j = exact(value, "kind,revision,request_id,namespace,network,pool,candidate,claim,transaction"); bound(j, "d1_refund_signing_journal_lookup");
      const c = exact(j.candidate, "kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,source_sequence,transaction_sequence,deadline,unsigned_xdr,transaction_hash");
      const s = exact(j.transaction, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,financial_snapshot_hash,signing_nonce,signed_xdr,envelope_hash");
      const claim = exact(j.claim, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,financial_snapshot_hash,signing_nonce");
      bound(c, "d1_refund_candidate"); bound(s, "d1_signed_refund_transaction"); bound(claim, "d1_refund_signing_attempt");
      check(typeof s.authorized_by === "string" && StrKey.isValidEd25519PublicKey(s.authorized_by) && claim.authorized_by === s.authorized_by &&
        uuid(s.signing_nonce) && claim.signing_nonce === s.signing_nonce && hash(s.financial_snapshot_hash) && claim.financial_snapshot_hash === s.financial_snapshot_hash &&
        hash(c.transaction_hash) && s.transaction_hash === c.transaction_hash && claim.transaction_hash === c.transaction_hash && hash(s.envelope_hash) &&
        typeof s.signed_xdr === "string" && Buffer.byteLength(s.signed_xdr) <= 65536 && Buffer.from(s.signed_xdr, "base64").toString("base64") === s.signed_xdr &&
        typeof c.unsigned_xdr === "string");
      const unsigned = TransactionBuilder.fromXDR(c.unsigned_xdr, Networks.TESTNET), signed = TransactionBuilder.fromXDR(s.signed_xdr, Networks.TESTNET);
      check(unsigned instanceof Transaction && signed instanceof Transaction && unsigned.toEnvelope().switch().name === "envelopeTypeTx" &&
        signed.toEnvelope().switch().name === "envelopeTypeTx" && unsigned.toXDR() === c.unsigned_xdr && signed.toXDR() === s.signed_xdr &&
        unsigned.signatures.length === 0 && signed.signatures.length === 1 && unsigned.source === capturedScope.pool && signed.source === capturedScope.pool &&
        unsigned.sequence === c.transaction_sequence && signed.sequence === c.transaction_sequence && unsigned.hash().toString("hex") === c.transaction_hash &&
        signed.hash().toString("hex") === c.transaction_hash && unsigned.toEnvelope().v1().tx().toXDR("base64") === signed.toEnvelope().v1().tx().toXDR("base64"));
      const verifier = Keypair.fromPublicKey(capturedScope.pool), signature = signed.signatures[0];
      check(signature.hint().toString("hex") === verifier.signatureHint().toString("hex") && verifier.verify(signed.hash(), signature.signature()));
      const digest = Buffer.from(await crypto.subtle.digest("SHA-256", Buffer.from(s.signed_xdr, "base64"))).toString("hex");
      check(digest === s.envelope_hash); return { candidate: c, signed: s, claim };
    };
    const attempt = (value: unknown, signed: Data): Data => {
      const a = exact(value, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,envelope_hash,snapshot_hash,signing_nonce,attempt_id,claimed_at,expires_at");
      bound(a, "d1_refund_submission_attempt");
      check(uuid(a.attempt_id) && hash(a.snapshot_hash) && typeof a.authorized_by === "string" && StrKey.isValidEd25519PublicKey(a.authorized_by) &&
        a.transaction_hash === signed.transaction_hash && a.envelope_hash === signed.envelope_hash && a.signing_nonce === signed.signing_nonce &&
        typeof a.claimed_at === "number" && Number.isSafeInteger(a.claimed_at) && a.claimed_at >= 0 &&
        typeof a.expires_at === "number" && Number.isSafeInteger(a.expires_at) && a.expires_at > a.claimed_at); return a;
    };
    const historical = async (value: unknown, decoded: Awaited<ReturnType<typeof decode>>): Promise<Result<T>> => {
      const a = attempt(value, decoded.signed);
      const member = exact(await rpc("d1_load_refund_financial_observation", { ...args, p_snapshot_hash: a.snapshot_hash }),
        "kind,revision,request_id,namespace,network,pool,transaction_hash,snapshot_hash,observation");
      bound(member, "d1_refund_financial_observation_lookup");
      const saved = exact(member.observation, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,snapshot_hash,observed_at,expires_at,snapshot");
      bound(saved, "d1_refund_financial_observation");
      check(member.snapshot_hash === a.snapshot_hash && saved.snapshot_hash === a.snapshot_hash && member.transaction_hash === a.transaction_hash &&
        saved.transaction_hash === a.transaction_hash && saved.expires_at === a.expires_at);
      const snapshot = fields(saved.snapshot), funding = fields(snapshot.funding), creation = fields(funding.creationObservation), observation = fields(creation.observation);
      check(canonical(observation.candidate) === canonical(decoded.candidate));
      return Object.freeze({ kind: "d1_refund_submission_attempt", revision: 1, invoked: false, attempt: Object.freeze(a) });
    };
    let loaded = lookup(await rpc("d1_load_refund_submission_attempt", args));
    if (loaded.attempt !== null) return await historical(loaded.attempt, await decode(loaded.journal));
    const initialJournal = fields(loaded.journal);
    if (initialJournal.transaction === null) {
      check(initialJournal.claim === null);
      try { await signAndSaveAuthorizedRefund(wrapped, capturedScope, Object.freeze({ observation: controlled, loadPoolSigner: loadSigner })); }
      catch (error) { denied = error instanceof CustodyError && error.status === 403 && error.code === "unauthorized_admin_wallet" && error.message === error.code; throw error; }
      loaded = lookup(await rpc("d1_load_refund_submission_attempt", args));
    }
    const decoded = await decode(loaded.journal);
    if (loaded.attempt !== null) return await historical(loaded.attempt, decoded);
    let financial: Awaited<ReturnType<typeof observeAndSaveRefundFinancialEvidence>>;
    try { financial = await observeAndSaveRefundFinancialEvidence(wrapped, capturedScope, controlled); }
    catch (error) { denied = error instanceof CustodyError && error.status === 403 && error.code === "unauthorized_admin_wallet" && error.message === error.code; throw error; }
    const observation = financial.snapshot.funding.creationObservation.observation, candidate = observation.candidate;
    check(canonical(candidate) === canonical(decoded.candidate) && financial.transaction_hash === decoded.signed.transaction_hash);
    const fresh = () => { const n = clock(); check(n >= financial.observed_at && n < financial.expires_at);
      validateRefundAccountBinding(candidate, observation.history.state, observation.account,
        { startedAt: financial.observed_at, observedAt: n, maximumAgeSeconds, futureToleranceSeconds }); return n; };
    const nonce = crypto.randomUUID(); check(uuid(nonce)); const before = fresh();
    const acknowledgement = exact(await rpc("d1_claim_refund_submission_attempt", { ...args, p_snapshot_hash: financial.snapshot_hash, p_attempt_id: nonce }), "kind,revision,claimed,attempt");
    check(acknowledgement.kind === "d1_refund_submission_claim" && acknowledgement.revision === 1 && typeof acknowledgement.claimed === "boolean");
    if (!acknowledgement.claimed) return await historical(acknowledgement.attempt, decoded);
    const a = attempt(acknowledgement.attempt, decoded.signed), after = fresh();
    check(a.attempt_id === nonce && a.authorized_by === capturedScope.authenticatedAdmin && a.snapshot_hash === financial.snapshot_hash &&
      a.expires_at === financial.expires_at && typeof a.claimed_at === "number" && a.claimed_at >= before - 2 && a.claimed_at <= after + 2);
    const persisted = lookup(await rpc("d1_load_refund_submission_attempt", args));
    check(canonical(persisted.attempt) === canonical(a) && canonical(persisted.journal) === canonical(loaded.journal));
    const artifact = Object.freeze({ signedXdr: decoded.signed.signed_xdr as string, transactionHash: candidate.transaction_hash, attempt: Object.freeze(a) });
    let consumed = false; check(!consumed); consumed = true;
    fresh(); // No await or caller-owned operation between this check and the ONE action.
    const value = await invokeAction(artifact);
    return Object.freeze({ kind: "d1_refund_submission_attempt", revision: 1, invoked: true, attempt: artifact.attempt, value });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
