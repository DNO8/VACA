import type { PoolObservationContext } from "./discovery-source.ts";
import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { loadRemainderCandidate, type RemainderCandidateReceipt, type RemainderCandidateScope } from "./remainder-candidate-journal.ts";
import { observeAndSaveRemainderFinancialEvidence, type RemainderFinancialReceipt, type RemainderFundingOptions } from "./remainder-financial-observation.ts";

type Client = Parameters<typeof observeAndSaveRemainderFinancialEvidence>[0];
type Data = Record<string, unknown>;
export type RemainderSigningScope = RemainderCandidateScope;
export interface RemainderSignerConfiguration {
  readonly observation: RemainderFundingOptions;
  readonly loadPoolSigner: (pool: string) => unknown;
}
export interface RemainderSigningClaim {
  readonly kind: "d1_remainder_signing_attempt";
  readonly revision: 2;
  readonly request_id: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly authorized_by: string;
  readonly transaction_hash: string;
  readonly financial_snapshot_hash: string;
  readonly signing_nonce: string;
}
export interface SignedRemainderReceipt extends Omit<RemainderSigningClaim, "kind"> {
  readonly kind: "d1_signed_remainder_transaction";
  readonly unsigned_xdr: string;
  readonly signed_xdr: string;
  readonly envelope_sha256: string;
}
export interface RemainderSigningJournal {
  readonly kind: "d1_remainder_signing_journal_lookup";
  readonly revision: 2;
  readonly request_id: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly candidate: Readonly<RemainderCandidateReceipt> | null;
  readonly claim: Readonly<RemainderSigningClaim> | null;
  readonly transaction: Readonly<SignedRemainderReceipt> | null;
}
export interface RemainderSigningClaimResult extends Omit<RemainderSigningJournal, "kind"> {
  readonly kind: "d1_remainder_signing_claim";
  readonly invoked: boolean;
}
const journalKeys = "kind,revision,request_id,namespace,network,pool,candidate,claim,transaction";
const claimKeys = "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,financial_snapshot_hash,signing_nonce";
const signedKeys = claimKeys + ",unsigned_xdr,signed_xdr,envelope_sha256";
const unavailable = () => new CustodyError("remainder_signing_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const d = fields(value); check(Object.keys(d).sort().join(",") === names.split(",").sort().join(",")); return d;
}
/** Detached, frozen, bounded own-data JSON; never invoke serialization hooks. */
function snapshot<T>(value: T): T {
  let nodes = 0, budget = 33554432;
  const active = new Set<object>();
  function visit(v: unknown, depth: number): unknown {
    check(++nodes <= 200000 && depth <= 60 && (budget -= 8) >= 0);
    if (typeof v === "string") {
      check(v.length <= budget && !/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v));
      check((budget -= new TextEncoder().encode(JSON.stringify(v)).length) >= 0); return v;
    }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return v; }
    check(typeof v === "object" && v !== null && !active.has(v)); active.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      check(Object.getPrototypeOf(v) === Array.prototype);
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), n = ds.length.value;
      check(Number.isSafeInteger(n) && n >= 0 && n <= 200000 && Reflect.ownKeys(v).length === n + 1);
      result = Object.freeze(Array.from({ length: n }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d); return visit(d.value, depth + 1);
      }));
    } else result = Object.freeze(Object.fromEntries(Object.entries(fields(v)).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => {
      visit(k, depth + 1); return [k, visit(x, depth + 1)];
    })));
    active.delete(v); return result;
  }
  return visit(value, 0) as T;
}
const same = (a: unknown, b: unknown) => JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b));
const hash = (v: unknown) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
function address(v: unknown): asserts v is string { check(typeof v === "string"); Keypair.fromPublicKey(v); }
function seconds(v: unknown): asserts v is number {
  check(typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 253402300799);
}
function capture(receiver: unknown, name: string): (...args: unknown[]) => unknown {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, d: PropertyDescriptor | undefined;
  const seen = new Set<object>();
  while (owner !== null) {
    check(!seen.has(owner)); seen.add(owner);
    d = Object.getOwnPropertyDescriptor(owner, name); if (d) break; owner = Object.getPrototypeOf(owner);
  }
  check(d && "value" in d && typeof d.value === "function");
  const fn = d.value; return (...args) => Reflect.apply(fn, receiver, args);
}
/** Synchronous capability capture, shared by both public internal compositions. */
function context(client: Client, configuration: RemainderSigningScope, options: { readonly now: () => number }) {
  const scope = snapshot(configuration); exact(scope, "namespace,pool,requestId,authenticatedAdmin");
  check(uuid(scope.namespace) && uuid(scope.requestId)); address(scope.pool); address(scope.authenticatedAdmin);
  const invoke = capture(client, "rpc"), clock = capture(options, "now");
  const digest = capture(crypto.subtle, "digest"), randomUUID = capture(crypto, "randomUUID");
  let denied = false, last = -1;
  const now = () => { const n = clock(); seconds(n); check(n >= last); last = n; return n; };
  const args = Object.freeze({ p_request_id: scope.requestId, p_authorized_by: scope.authenticatedAdmin });
  const bound = (d: Data, kind: string) => check(d.kind === kind && d.revision === 2 && d.request_id === scope.requestId &&
    d.namespace === scope.namespace && d.network === "TESTNET" && d.pool === scope.pool);
  const rpc = async (name: string, parameters: Data) => {
    const reply = exact(snapshot(await invoke(name, snapshot(parameters))), "data,error");
    if (reply.error !== null) {
      const e = fields(reply.error);
      if (reply.data === null && e.code === "42501" && e.message === "unauthorized_admin_wallet") denied = true;
      throw unavailable();
    }
    return reply.data;
  };
  // All helper-internal RPCs pass this wrapper, so their genuine DB denial survives helper sanitization.
  const capturedClient: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
    return { data: await rpc(name, parameters), error: null };
  } });
  const envelopeHash = async (xdr: string) => Buffer.from(await digest("SHA-256", Buffer.from(xdr, "base64")) as ArrayBuffer).toString("hex");
  const journal = (value: unknown, claiming = false) => {
    const d = exact(value, journalKeys + (claiming ? ",invoked" : ""));
    bound(d, claiming ? "d1_remainder_signing_claim" : "d1_remainder_signing_journal_lookup");
    if (claiming) check(typeof d.invoked === "boolean"); return d;
  };
  const signed = async (value: unknown, candidate: Readonly<RemainderCandidateReceipt>, claim: Data) => {
    const s = exact(value, signedKeys);
    check(same(s, { ...claim, kind: "d1_signed_remainder_transaction", unsigned_xdr: candidate.unsigned_xdr,
      signed_xdr: s.signed_xdr, envelope_sha256: s.envelope_sha256 }));
    check(typeof s.signed_xdr === "string" && s.signed_xdr.length >= 4 && s.signed_xdr.length <= 65536 &&
      Buffer.from(s.signed_xdr, "base64").toString("base64") === s.signed_xdr && hash(s.envelope_sha256));
    const unsigned = TransactionBuilder.fromXDR(candidate.unsigned_xdr, Networks.TESTNET);
    const tx = TransactionBuilder.fromXDR(s.signed_xdr, Networks.TESTNET);
    check(unsigned instanceof Transaction && tx instanceof Transaction && unsigned.signatures.length === 0 &&
      unsigned.toEnvelope().switch().name === "envelopeTypeTx" && tx.toEnvelope().switch().name === "envelopeTypeTx" &&
      unsigned.toXDR() === candidate.unsigned_xdr && tx.toXDR() === s.signed_xdr && tx.signatures.length === 1 &&
      tx.source === scope.pool && tx.sequence === candidate.transaction_sequence && tx.fee === unsigned.fee &&
      tx.timeBounds?.minTime === unsigned.timeBounds?.minTime && tx.timeBounds?.maxTime === candidate.valid_until &&
      tx.toEnvelope().v1().tx().toXDR("base64") === unsigned.toEnvelope().v1().tx().toXDR("base64") &&
      unsigned.hash().toString("hex") === candidate.transaction_hash && tx.hash().toString("hex") === candidate.transaction_hash);
    const verifier = Keypair.fromPublicKey(scope.pool), signature = tx.signatures[0];
    check(signature.hint().toString("hex") === verifier.signatureHint().toString("hex") && verifier.verify(tx.hash(), signature.signature()));
    unsigned.signatures.push(signature);
    check(unsigned.toXDR() === s.signed_xdr && await envelopeHash(s.signed_xdr) === s.envelope_sha256);
    return s;
  };
  const load = async (): Promise<Readonly<RemainderSigningJournal>> => {
    const first = journal(await rpc("d1_load_remainder_signing_journal", args)); //045 FIRST.
    const candidate = await loadRemainderCandidate(capturedClient, scope, { now });
    check(same(first.candidate, candidate));
    if (first.claim === null) check(first.transaction === null);
    else {
      check(candidate !== null);
      const claim = exact(first.claim, claimKeys); bound(claim, "d1_remainder_signing_attempt");
      address(claim.authorized_by); check(hash(claim.financial_snapshot_hash) && uuid(claim.signing_nonce) && claim.transaction_hash === candidate.transaction_hash);
      const a = exact(await rpc("d1_load_remainder_financial_observation", { ...args, p_snapshot_hash: claim.financial_snapshot_hash }),
        "kind,revision,request_id,namespace,network,pool,transaction_hash,snapshot_hash,observation");
      bound(a, "d1_remainder_financial_observation_lookup");
      const evidence = exact(a.observation, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,snapshot_hash,snapshot");
      bound(evidence, "d1_remainder_financial_observation");
      const body = exact(evidence.snapshot, "kind,revision,requestId,namespace,network,pool,observedAt,expiresAt,candidate,funding");
      check(a.snapshot_hash === claim.financial_snapshot_hash && evidence.snapshot_hash === a.snapshot_hash &&
        a.transaction_hash === candidate.transaction_hash && evidence.transaction_hash === a.transaction_hash &&
        evidence.authorized_by === claim.authorized_by && body.kind === "d1_remainder_financial_snapshot" && body.revision === 2 &&
        body.requestId === scope.requestId && body.namespace === scope.namespace && body.network === "TESTNET" && body.pool === scope.pool &&
        same(body.candidate, candidate) && same(fields(body.funding).scope, { ...scope, authenticatedAdmin: claim.authorized_by }));
      // Actual044 authenticates PostgreSQL JSONB hash/membership; no JS substitute or freshness renewal.
      if (first.transaction !== null) await signed(first.transaction, candidate, claim);
    }
    check(same(journal(await rpc("d1_load_remainder_signing_journal", args)), first)); now();
    return snapshot(first) as unknown as Readonly<RemainderSigningJournal>;
  };
  return { scope, args, now, rpc, bound, journal, signed, load, capturedClient, envelopeHash, randomUUID,
    failure: () => denied ? new CustodyError("unauthorized_admin_wallet", 403) : unavailable() };
}
/** Historical authenticated SDK read; expired records are data, NEVER fresh execution authority. */
export async function readRemainderSigningJournal(client: Client, scope: RemainderSigningScope,
  options: { readonly now: () => number }): Promise<Readonly<RemainderSigningJournal>> {
  let c: ReturnType<typeof context> | undefined;
  try { exact(options, "now"); c = context(client, scope, options); return await c.load(); }
  catch { throw c ? c.failure() : unavailable(); }
}
/** Fresh first-claim only. No resume, retry, POST, release or transferable submission permit. */
export async function signAndSaveAuthorizedRemainder(client: Client, scope: RemainderSigningScope,
  configuration: RemainderSignerConfiguration): Promise<Readonly<SignedRemainderReceipt>> {
  let c: ReturnType<typeof context> | undefined;
  try {
    const config = exact(configuration, "observation,loadPoolSigner"), o = exact(config.observation, "source,now,maximumAgeSeconds,futureToleranceSeconds");
    const loadSigner = capture(configuration, "loadPoolSigner"), readAccount = capture(o.source, "readAccountAtCheckpoint");
    const maximumAgeSeconds = o.maximumAgeSeconds, futureToleranceSeconds = o.futureToleranceSeconds;
    check(typeof maximumAgeSeconds === "number" && Number.isSafeInteger(maximumAgeSeconds) && maximumAgeSeconds >= 1 && maximumAgeSeconds <= 30 &&
      typeof futureToleranceSeconds === "number" && Number.isSafeInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    const captured = context(client, scope, config.observation as RemainderFundingOptions); c = captured;
    const { now, args } = captured;
    const observation: RemainderFundingOptions = Object.freeze({ now, maximumAgeSeconds, futureToleranceSeconds,
      source: Object.freeze({ async readAccountAtCheckpoint(input: PoolObservationContext) {
        try { return snapshot(await readAccount(snapshot(input))) as Awaited<ReturnType<RemainderFundingOptions["source"]["readAccountAtCheckpoint"]>>; }
        catch { throw unavailable(); }
      } }) });
    // No key, source call or financial renewal before inspecting permanent045 ownership.
    const first = captured.journal(await captured.rpc("d1_load_remainder_signing_journal", args));
    check(first.candidate !== null && first.claim === null && first.transaction === null);
    const financial: Readonly<RemainderFinancialReceipt> = snapshot(await observeAndSaveRemainderFinancialEvidence(captured.capturedClient, captured.scope, observation));
    const candidate = financial.snapshot.candidate, funding = financial.snapshot.funding;
    check(same(first.candidate, candidate) && financial.authorized_by === captured.scope.authenticatedAdmin &&
      financial.transaction_hash === candidate.transaction_hash && hash(financial.snapshot_hash));
    const fresh = () => {
      const n = now(), deadline = Date.parse(candidate.deadline) / 1000, until = Number(candidate.valid_until);
      seconds(deadline); seconds(until);
      check(n >= deadline && n < until && n >= financial.snapshot.observedAt && n < financial.snapshot.expiresAt &&
        n >= funding.startedAt && n - funding.startedAt <= maximumAgeSeconds && n < funding.expiresAt &&
        financial.snapshot.expiresAt === funding.expiresAt && funding.account.sequence === candidate.source_sequence &&
        BigInt(candidate.source_sequence) + 1n === BigInt(candidate.transaction_sequence));
    };
    fresh();
    const nonce = captured.randomUUID(); check(uuid(nonce));
    const expectedClaim = snapshot({ kind: "d1_remainder_signing_attempt", revision: 2, request_id: captured.scope.requestId,
      namespace: captured.scope.namespace, network: "TESTNET", pool: captured.scope.pool, authorized_by: captured.scope.authenticatedAdmin,
      transaction_hash: candidate.transaction_hash, financial_snapshot_hash: financial.snapshot_hash, signing_nonce: nonce });
    const claimed = captured.journal(await captured.rpc("d1_claim_remainder_signing", { ...args,
      p_snapshot_hash: financial.snapshot_hash, p_signing_nonce: nonce }), true);
    check(claimed.invoked === true && claimed.transaction === null && same(claimed.candidate, candidate) && same(exact(claimed.claim, claimKeys), expectedClaim));
    fresh(); // SQL response delay MUST be checked before invoking the key loader.
    const signer = await loadSigner(captured.scope.pool);
    fresh(); check(signer instanceof Keypair && signer.canSign() && signer.publicKey() === captured.scope.pool);
    const tx = TransactionBuilder.fromXDR(candidate.unsigned_xdr, Networks.TESTNET);
    check(tx instanceof Transaction && tx.signatures.length === 0 && tx.toXDR() === candidate.unsigned_xdr && tx.hash().toString("hex") === candidate.transaction_hash);
    fresh(); tx.sign(signer); fresh();
    const signedXdr = tx.toXDR();
    const envelopeSha256 = await captured.envelopeHash(signedXdr); fresh();
    const expected = snapshot({ ...expectedClaim, kind: "d1_signed_remainder_transaction", unsigned_xdr: candidate.unsigned_xdr,
      signed_xdr: signedXdr, envelope_sha256: envelopeSha256 });
    await captured.signed(expected, candidate, expectedClaim); fresh();
    // Exactly ONE signed write. Any ambiguous/error/malformed acknowledgement exits WITHOUT readback.
    const saved = exact(await captured.rpc("d1_record_signed_remainder", { ...args, p_signing_nonce: nonce,
      p_snapshot_hash: financial.snapshot_hash, p_signed_xdr: signedXdr, p_envelope_sha256: envelopeSha256 }), signedKeys);
    check(same(saved, expected)); fresh();
    const loaded = await captured.load();
    check(same(loaded.candidate, candidate) && same(loaded.claim, expectedClaim) && same(loaded.transaction, expected));
    fresh(); return snapshot(expected) as unknown as Readonly<SignedRemainderReceipt>;
  } catch { throw c ? c.failure() : unavailable(); }
}
