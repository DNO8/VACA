import type { PoolObservationContext } from "./discovery-source.ts";
import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { readRemainderSigningJournal, signAndSaveAuthorizedRemainder, type RemainderSignerConfiguration,
  type RemainderSigningJournal, type RemainderSigningScope, type SignedRemainderReceipt } from "./remainder-authorized-signer.ts";
import { observeAndSaveRemainderFinancialEvidence, type RemainderFundingOptions } from "./remainder-financial-observation.ts";

type Client = Parameters<typeof observeAndSaveRemainderFinancialEvidence>[0];
type Data = Record<string, unknown>;
export interface RemainderSubmissionAttempt {
  readonly kind: "d1_remainder_submission_attempt";
  readonly revision: 2;
  readonly request_id: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly authorized_by: string;
  readonly transaction_hash: string;
  readonly envelope_sha256: string;
  readonly snapshot_hash: string;
  readonly signing_nonce: string;
  readonly attempt_id: string;
  readonly claimed_at: number;
  readonly expires_at: number;
}
export interface RemainderSubmissionArtifact {
  readonly signedXdr: string;
  readonly transactionHash: string;
  readonly attempt: Readonly<RemainderSubmissionAttempt>;
}
export type RemainderSubmissionResult<T> = {
  readonly kind: "d1_remainder_submission_authorization";
  readonly revision: 2;
  readonly attempt: Readonly<RemainderSubmissionAttempt>;
} & ({ readonly invoked: false } | { readonly invoked: true; readonly value: T });
const attemptKeys = "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,envelope_sha256,snapshot_hash,signing_nonce,attempt_id,claimed_at,expires_at";
const unavailable = () => new CustodyError("remainder_submission_unavailable", 503);
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
/** Own-data JSON only: detach and bound before any helper, comparison or serialization. */
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
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
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
/** Private at-most-once callback composition, never a reusable permit or HTTP DTO. */
export async function authorizeRemainderSubmission<T>(client: Client, configuration: RemainderSigningScope,
  signerConfiguration: RemainderSignerConfiguration,
  sendCallback: (artifact: RemainderSubmissionArtifact) => T | Promise<T>): Promise<RemainderSubmissionResult<T>> {
  let denied = false;
  try {
    const scope = snapshot(configuration); exact(scope, "namespace,pool,requestId,authenticatedAdmin");
    check(uuid(scope.namespace) && uuid(scope.requestId)); address(scope.pool); address(scope.authenticatedAdmin);
    check(typeof sendCallback === "function"); const send = sendCallback;
    const config = exact(signerConfiguration, "observation,loadPoolSigner");
    const o = exact(config.observation, "source,now,maximumAgeSeconds,futureToleranceSeconds");
    const invoke = capture(client, "rpc"), clock = capture(config.observation, "now");
    const readAccount = capture(o.source, "readAccountAtCheckpoint"), loadSigner = capture(signerConfiguration, "loadPoolSigner");
    const randomUUID = capture(crypto, "randomUUID"), digest = capture(crypto.subtle, "digest");
    const maximumAgeSeconds = o.maximumAgeSeconds, futureToleranceSeconds = o.futureToleranceSeconds;
    check(typeof maximumAgeSeconds === "number" && Number.isSafeInteger(maximumAgeSeconds) && maximumAgeSeconds >= 1 && maximumAgeSeconds <= 30 &&
      typeof futureToleranceSeconds === "number" && Number.isSafeInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    let last = -1;
    const now = () => { const n = clock(); seconds(n); check(n >= last); last = n; return n; };
    const args = Object.freeze({ p_request_id: scope.requestId, p_authorized_by: scope.authenticatedAdmin });
    const rpc = async (name: string, parameters: Data) => {
      const reply = exact(snapshot(await invoke(name, snapshot(parameters))), "data,error");
      if (reply.error !== null) {
        const e = fields(reply.error);
        if (reply.data === null && e.code === "42501" && e.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    const wrapped: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      return { data: await rpc(name, parameters), error: null };
    } });
    const observation: RemainderFundingOptions = Object.freeze({ now, maximumAgeSeconds, futureToleranceSeconds,
      source: Object.freeze({ async readAccountAtCheckpoint(input: PoolObservationContext) {
        try { return snapshot(await readAccount(snapshot(input))) as Awaited<ReturnType<RemainderFundingOptions["source"]["readAccountAtCheckpoint"]>>; }
        catch { throw unavailable(); }
      } }) });
    const bound = (d: Data, kind: string) => check(d.kind === kind && d.revision === 2 && d.request_id === scope.requestId &&
      d.namespace === scope.namespace && d.network === "TESTNET" && d.pool === scope.pool);
    const lookup = (value: unknown) => {
      const d = exact(value, "kind,revision,request_id,namespace,network,pool,journal,attempt");
      bound(d, "d1_remainder_submission_attempt_lookup"); return d;
    };
    const joint = async (loaded: Data): Promise<Readonly<RemainderSigningJournal>> => {
      const journal = snapshot(await readRemainderSigningJournal(wrapped, scope, { now }));
      check(same(loaded.journal, journal));
      if (journal.transaction) {
        const signed = journal.transaction;
        check(Buffer.from(await digest("SHA-256", Buffer.from(signed.signed_xdr, "base64")) as ArrayBuffer).toString("hex") === signed.envelope_sha256);
      }
      return journal;
    };
    const attempt = (value: unknown, signed: Readonly<SignedRemainderReceipt>): Readonly<RemainderSubmissionAttempt> => {
      const a = exact(value, attemptKeys); bound(a, "d1_remainder_submission_attempt");
      address(a.authorized_by); seconds(a.claimed_at); seconds(a.expires_at);
      check(uuid(a.attempt_id) && uuid(a.signing_nonce) && hash(a.snapshot_hash) && a.claimed_at < a.expires_at &&
        a.transaction_hash === signed.transaction_hash && a.envelope_sha256 === signed.envelope_sha256 && a.signing_nonce === signed.signing_nonce);
      return Object.freeze({ kind: "d1_remainder_submission_attempt", revision: 2, request_id: scope.requestId,
        namespace: scope.namespace, network: "TESTNET", pool: scope.pool, authorized_by: a.authorized_by,
        transaction_hash: signed.transaction_hash, envelope_sha256: signed.envelope_sha256, snapshot_hash: a.snapshot_hash,
        signing_nonce: a.signing_nonce, attempt_id: a.attempt_id, claimed_at: a.claimed_at, expires_at: a.expires_at });
    };
    const membership = async (a: Readonly<RemainderSubmissionAttempt>, journal: Readonly<RemainderSigningJournal>) => {
      const m = exact(await rpc("d1_load_remainder_financial_observation", { ...args, p_snapshot_hash: a.snapshot_hash }),
        "kind,revision,request_id,namespace,network,pool,transaction_hash,snapshot_hash,observation");
      bound(m, "d1_remainder_financial_observation_lookup");
      const b = exact(m.observation, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,snapshot_hash,snapshot");
      bound(b, "d1_remainder_financial_observation");
      const s = exact(b.snapshot, "kind,revision,requestId,namespace,network,pool,observedAt,expiresAt,candidate,funding");
      seconds(s.observedAt); seconds(s.expiresAt);
      check(m.snapshot_hash === a.snapshot_hash && b.snapshot_hash === a.snapshot_hash && m.transaction_hash === a.transaction_hash &&
        b.transaction_hash === a.transaction_hash && b.authorized_by === a.authorized_by && s.kind === "d1_remainder_financial_snapshot" &&
        s.revision === 2 && s.requestId === scope.requestId && s.namespace === scope.namespace && s.network === "TESTNET" && s.pool === scope.pool &&
        same(s.candidate, journal.candidate) && same(fields(s.funding).scope, { ...scope, authenticatedAdmin: a.authorized_by }) &&
        a.claimed_at >= s.observedAt && a.expires_at === s.expiresAt);
      return b;
    };
    const historical = async (loaded: Data, journal: Readonly<RemainderSigningJournal>): Promise<RemainderSubmissionResult<T>> => {
      check(journal.transaction && journal.claim && journal.candidate);
      const a = attempt(loaded.attempt, journal.transaction); await membership(a, journal);
      return Object.freeze({ kind: "d1_remainder_submission_authorization", revision: 2, invoked: false, attempt: a });
    };
    let loaded = lookup(await rpc("d1_load_remainder_submission_attempt", args)); //046 FIRST, before any provider/key/financial action.
    let journal = await joint(loaded);
    if (loaded.attempt !== null) return await historical(loaded, journal);
    check(journal.candidate !== null);
    if (journal.transaction === null) {
      check(journal.claim === null); // Existing unknown signing ownership NEVER permits re-signing.
      await signAndSaveAuthorizedRemainder(wrapped, scope, Object.freeze({ observation, loadPoolSigner: (pool: string) => loadSigner(pool) }));
      loaded = lookup(await rpc("d1_load_remainder_submission_attempt", args)); journal = await joint(loaded);
      if (loaded.attempt !== null) return await historical(loaded, journal);
    }
    const signed = journal.transaction, candidate = journal.candidate;
    check(signed && candidate && journal.claim);
    const financial = snapshot(await observeAndSaveRemainderFinancialEvidence(wrapped, scope, observation));
    check(same(financial.snapshot.candidate, candidate) && financial.authorized_by === scope.authenticatedAdmin &&
      financial.transaction_hash === signed.transaction_hash && hash(financial.snapshot_hash));
    const funding = financial.snapshot.funding;
    const tx = TransactionBuilder.fromXDR(signed.signed_xdr, Networks.TESTNET);
    check(tx instanceof Transaction && tx.toXDR() === signed.signed_xdr && tx.hash().toString("hex") === candidate.transaction_hash);
    const fresh = () => {
      const n = now(), deadline = Date.parse(candidate.deadline) / 1000, until = Number(candidate.valid_until);
      seconds(deadline); seconds(until);
      const cp = funding.accounting.history.state.checkpoint; check(cp);
      check(tx.timeBounds?.minTime === String(deadline) && tx.timeBounds.maxTime === candidate.valid_until &&
        n >= deadline && n < until && n >= financial.snapshot.observedAt && n < financial.snapshot.expiresAt &&
        n >= funding.startedAt && n >= funding.observedAt && n - funding.startedAt <= maximumAgeSeconds &&
        n < funding.expiresAt && financial.snapshot.expiresAt === funding.expiresAt && funding.expiresAt === cp.closed_at + maximumAgeSeconds &&
        n - cp.closed_at < maximumAgeSeconds && cp.closed_at - n <= futureToleranceSeconds &&
        funding.account.sequence === candidate.source_sequence && BigInt(candidate.source_sequence) + 1n === BigInt(candidate.transaction_sequence));
      return n;
    };
    // Independently use the pre-await captured digest over decoded persisted bytes; J22b already verifies signature/body.
    check(Buffer.from(await digest("SHA-256", Buffer.from(signed.signed_xdr, "base64")) as ArrayBuffer).toString("hex") === signed.envelope_sha256);
    fresh(); const nonce = randomUUID(); check(uuid(nonce));
    const acknowledgement = exact(await rpc("d1_claim_remainder_submission_attempt", { ...args,
      p_snapshot_hash: financial.snapshot_hash, p_attempt_nonce: nonce }), "kind,revision,claimed,attempt");
    check(acknowledgement.kind === "d1_remainder_submission_claim" && acknowledgement.revision === 2 && acknowledgement.claimed === true);
    const a = attempt(acknowledgement.attempt, signed), after = fresh();
    check(a.attempt_id === nonce && a.authorized_by === scope.authenticatedAdmin && a.snapshot_hash === financial.snapshot_hash &&
      a.claimed_at >= financial.snapshot.observedAt && a.claimed_at <= after && a.expires_at === financial.snapshot.expiresAt);
    // No readback until ALL positive acknowledgement checks pass. False/racing/unknown exits closed.
    const persisted = lookup(await rpc("d1_load_remainder_submission_attempt", args));
    check(same(persisted.attempt, a) && same(persisted.journal, journal));
    const reloaded = await joint(persisted);
    check(same(reloaded, journal) && same(await membership(a, reloaded), financial));
    const artifact = Object.freeze({ signedXdr: signed.signed_xdr, transactionHash: signed.transaction_hash, attempt: a });
    fresh(); // AFTER every RPC/digest await. No await or external operation before the ONE callback.
    const value = await send(artifact);
    return Object.freeze({ kind: "d1_remainder_submission_authorization", revision: 2, invoked: true, attempt: a, value });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
