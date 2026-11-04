import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { ensureInitialSignedIssuance } from "./signed-transaction-journal.ts";
import { withInitialFinancialAuthorization } from "./initial-financial-authorization.ts";
import type { InitialSignerConfiguration } from "./initial-authorized-signer.ts";
type Client = Parameters<typeof ensureInitialSignedIssuance>[0];
type DTO = Record<string, unknown>;
export interface InitialSubmissionArtifact {
  readonly signedXdr: string; readonly transactionHash: string; readonly attempt: Readonly<DTO>;
}
type Result<T> = { readonly kind: "d1_initial_submission_attempt"; readonly revision: 1; readonly attempt: Readonly<DTO> } &
  ({ readonly invoked: false } | { readonly invoked: true; readonly value: T });
const unavailable = () => new CustodyError("initial_submission_unavailable", 503);
function check(v: unknown): asserts v { if (!v) throw unavailable(); }
function object(v: unknown): v is DTO { return v !== null && typeof v === "object" && !Array.isArray(v); }
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  return object(a) && object(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
}
function copy<T>(v: T): T {
  const seen = new Set<object>(); let nodes = 0, characters = 0;
  function visit(x: unknown, depth: number) {
    check(++nodes <= 20000 && depth <= 40);
    if (typeof x === "string") { check((characters += x.length) <= 2097152); return; }
    if (x === null || typeof x === "boolean") return;
    if (typeof x === "number") { check(Number.isFinite(x)); return; }
    check(typeof x === "object" && x !== null && !seen.has(x)); seen.add(x);
    check(Object.getPrototypeOf(x) === (Array.isArray(x) ? Array.prototype : Object.prototype) || Object.getPrototypeOf(x) === null);
    check(Object.getOwnPropertySymbols(x).length === 0);
    if (Array.isArray(x)) check(x.length <= 20000 && Object.keys(x).length === x.length && Object.keys(x).every((k, i) => k === String(i)));
    const ds = Object.getOwnPropertyDescriptors(x); check(Object.keys(ds).length === Object.keys(x).length + (Array.isArray(x) ? 1 : 0));
    for (const [k, d] of Object.entries(ds)) { check(!d.get && !d.set); if (Array.isArray(x) && k === "length") continue; check(d.enumerable && (characters += k.length) <= 2097152); visit(d.value, depth + 1); }
  }
  visit(v, 0); const text = JSON.stringify(v); check(new TextEncoder().encode(text).length <= 2097152); return JSON.parse(text);
}
function freeze<T>(v: T): T {
  if (v !== null && typeof v === "object") { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v;
}
/** Internal backend composition only. A historical receipt never invokes the action. */
export async function withInitialSubmissionAuthorization<T>(client: Client, configuration: InitialSignerConfiguration,
  action: (artifact: InitialSubmissionArtifact) => T | Promise<T>): Promise<Result<T>> {
  let denied = false, last: number | undefined;
  try {
    const { namespace, pool, requestId, authenticatedAdmin } = configuration;
    const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
    const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
    check(uuid(namespace) && uuid(requestId) && typeof action === "function"); Keypair.fromPublicKey(pool); Keypair.fromPublicKey(authenticatedAdmin);
    const clock = () => { const n = configuration.now(); check(Number.isSafeInteger(n) && n >= 0 && (last === undefined || n >= last)); last = n; return n; };
    const args = { p_request_id: requestId, p_authorized_by: authenticatedAdmin };
    const bound = (v: unknown, kind: string, fields: number): v is DTO => object(v) && Object.keys(v).length === fields && v.kind === kind && v.revision === 1 &&
      v.request_id === requestId && v.namespace === namespace && v.network === "TESTNET" && v.pool === pool;
    const rpc = async (name: string, parameters: Record<string, unknown>) => {
      const r = copy(await client.rpc(name, parameters));
      check(object(r) && Object.hasOwn(r, "data") && Object.hasOwn(r, "error"));
      if (r.error !== null) {
        if (r.data === null && object(r.error) && r.error.code === "42501" && r.error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return r.data;
    };
    const wrapped: Client = { async rpc(name, parameters) { return { data: await rpc(name, parameters), error: null }; } };
    const shape = (a: unknown): a is DTO => bound(a, "d1_submission_attempt", 13) && uuid(a.attempt_id) && hash(a.snapshot_hash) && hash(a.transaction_hash) && hash(a.envelope_hash) &&
      typeof a.authorized_by === "string" && typeof a.claimed_at === "number" && Number.isSafeInteger(a.claimed_at) && a.claimed_at >= 0 && object(a.reservation);
    const validate = (a: unknown, signed: DTO): a is DTO => {
      check(shape(a) && a.transaction_hash === signed.transaction_hash && a.envelope_hash === signed.envelope_hash && same(a.reservation, signed.reservation));
      Keypair.fromPublicKey(a.authorized_by as string); return true;
    };
    const historical = async (attempt: DTO, signed: DTO): Promise<Result<T>> => {
      validate(attempt, signed);
      const membership = await rpc("d1_load_initial_financial_observation", { ...args, p_snapshot_hash: attempt.snapshot_hash });
      check(bound(membership, "d1_initial_financial_observation_lookup", 9) && membership.transaction_hash === attempt.transaction_hash && membership.snapshot_hash === attempt.snapshot_hash);
      const observation = membership.observation;
      check(bound(observation, "d1_initial_financial_observation", 10) && observation.transaction_hash === attempt.transaction_hash && observation.snapshot_hash === attempt.snapshot_hash && typeof observation.authorized_by === "string");
      Keypair.fromPublicKey(observation.authorized_by);
      const snapshot = observation.snapshot;
      check(object(snapshot) && snapshot.kind === "d1_initial_financial_snapshot" && snapshot.revision === 1 && snapshot.namespace === namespace && snapshot.network === "TESTNET" &&
        snapshot.pool === pool && snapshot.requestId === requestId && object(snapshot.commitment) && same(snapshot.commitment.reservation, attempt.reservation));
      return freeze({ kind: "d1_initial_submission_attempt", revision: 1, invoked: false, attempt: copy(attempt) });
    };
    const lookup = await rpc("d1_load_submission_attempt", args);
    check(bound(lookup, "d1_submission_attempt_lookup", 7) && (lookup.attempt === null || shape(lookup.attempt)));
    if (lookup.attempt !== null) {
      const never = (): never => { throw unavailable(); };
      const signed = await ensureInitialSignedIssuance(wrapped, { ...configuration, now: never, loadPoolSigner: never, source: { readAccountAtCheckpoint: never } });
      return await historical(lookup.attempt as DTO, signed);
    }
    const controlled = { ...configuration, now: clock };
    const signed = await ensureInitialSignedIssuance(wrapped, controlled);
    return await withInitialFinancialAuthorization(wrapped, controlled, async authorization => {
      check(signed.transaction_hash === authorization.transactionHash && same(signed.reservation, authorization.snapshot.commitment.reservation));
      const before = clock(); check(before >= authorization.snapshot.observedAt && before < authorization.snapshot.expiresAt);
      const nonce = crypto.randomUUID();
      const acknowledgement = await rpc("d1_claim_submission_attempt", { ...args, p_snapshot_hash: authorization.receipt.snapshot_hash, p_attempt_id: nonce });
      check(object(acknowledgement) && Object.keys(acknowledgement).length === 4 && acknowledgement.kind === "d1_submission_claim" && acknowledgement.revision === 1 && typeof acknowledgement.claimed === "boolean");
      const attempt = acknowledgement.attempt; check(validate(attempt, signed));
      if (!acknowledgement.claimed) return await historical(attempt, signed);
      check(attempt.attempt_id === nonce && attempt.authorized_by === authenticatedAdmin && attempt.snapshot_hash === authorization.receipt.snapshot_hash);
      const after = clock();
      check(after < authorization.snapshot.expiresAt && typeof attempt.claimed_at === "number" && attempt.claimed_at >= before - 2 && attempt.claimed_at <= after + 2 && attempt.claimed_at < authorization.snapshot.expiresAt);
      const artifact = freeze({ signedXdr: signed.signed_xdr as string, transactionHash: authorization.transactionHash, attempt: copy(attempt) });
      check(clock() < authorization.snapshot.expiresAt); // No await between this check and invocation.
      const value = await action(artifact);
      return Object.freeze({ kind: "d1_initial_submission_attempt" as const, revision: 1 as const, invoked: true as const, attempt: freeze(attempt), value });
    });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
