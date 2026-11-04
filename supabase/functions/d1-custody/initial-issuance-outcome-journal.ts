import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { withInitialSubmissionAuthorization } from "./initial-submission-authorization.ts";
import { parseInitialIssuanceOutcome, type InitialIssuanceOutcome } from "./initial-issuance-outcome.ts";
import { readTransactionHistory } from "./transaction-history-reader.ts";
import type { InitialSignerConfiguration } from "./initial-authorized-signer.ts";
type Client = Parameters<typeof withInitialSubmissionAuthorization>[0];
type Scope = Pick<InitialSignerConfiguration, "namespace" | "pool" | "requestId" | "authenticatedAdmin">;
type DTO = Record<string, unknown>;
export type InitialIssuanceOutcomeReceipt = Readonly<{
  kind: "d1_issuance_outcome_journal"; revision: 1; request_id: string; namespace: string;
  network: "TESTNET"; pool: string; authorized_by: string; attempt_id: string;
  transaction_hash: string; envelope_hash: string; outcome_hash: string; observed_outcome: InitialIssuanceOutcome;
}>;
const unavailable = () => new CustodyError("initial_issuance_journal_unavailable", 503);
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
    if (typeof x === "number") { check(Number.isSafeInteger(x)); return; }
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
  if (v !== null && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v;
}
/** Internal SDK consistency evidence, not consensus, HTTP output or settlement.
 * Neither history nor first observation can invoke a signer, submit or release. */
export async function recordInitialIssuanceOutcome(client: Client, configuration: Scope): Promise<InitialIssuanceOutcomeReceipt> {
  let denied = false;
  try {
    const { namespace, pool, requestId, authenticatedAdmin } = configuration;
    const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
    const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
    check(uuid(namespace) && uuid(requestId)); Keypair.fromPublicKey(pool); Keypair.fromPublicKey(authenticatedAdmin);
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
    const lookup = await rpc("d1_load_issuance_outcome", args);
    check(bound(lookup, "d1_issuance_outcome_lookup", 7) && (lookup.outcome === null || object(lookup.outcome)));
    let signed: DTO | undefined;
    // Reuse the accepted historical SDK gate, but deny EVERY write before it
    // reaches the client; absent artifacts cannot turn this into fresh issuance.
    const reads = new Set(["d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"]);
    const readonly: Client = { async rpc(name, parameters) {
      check(reads.has(name)); const data = await rpc(name, parameters);
      if (name === "d1_load_signed_transaction") { check(object(data) && object(data.transaction)); signed = freeze(copy(data.transaction)); }
      return { data, error: null };
    } };
    const never = (): never => { throw unavailable(); };
    const gate = await withInitialSubmissionAuthorization(readonly, { namespace, pool, requestId, authenticatedAdmin,
      maximumAgeSeconds: 30, futureToleranceSeconds: 2, // Legacy type fields; the fresh path is unreachable.
      now: never, source: { readAccountAtCheckpoint: never }, loadPoolSigner: never }, never);
    check(gate.invoked === false && signed !== undefined);
    const saved = signed, attempt = gate.attempt; check(typeof saved.signed_xdr === "string");
    const savedXdr = saved.signed_xdr;
    const decode = (value: unknown) => {
      check(object(value) && object(value.observation) && object(value.observation.raw));
      const o = value.observation; check(object(o.raw));
      const result = parseInitialIssuanceOutcome(pool, savedXdr, { context: o.context, transaction: o.raw.transaction, ledger: o.raw.ledger });
      check(same(result, value)); return result;
    };
    const validate = (value: unknown, expected: unknown) => {
      check(bound(value, "d1_issuance_outcome_journal", 12) && value.attempt_id === attempt.attempt_id &&
        value.transaction_hash === attempt.transaction_hash && value.transaction_hash === saved.transaction_hash &&
        value.envelope_hash === attempt.envelope_hash && value.envelope_hash === saved.envelope_hash && hash(value.outcome_hash) &&
        uuid(value.attempt_id) && hash(value.transaction_hash) && hash(value.envelope_hash) && typeof value.authorized_by === "string");
      Keypair.fromPublicKey(value.authorized_by); // Preserve an original concurrent/historical actor.
      const decoded = decode(value.observed_outcome); check(same(decoded, expected));
      const receipt: InitialIssuanceOutcomeReceipt = { kind: "d1_issuance_outcome_journal", revision: 1, request_id: requestId, namespace,
        network: "TESTNET", pool, authorized_by: value.authorized_by, attempt_id: value.attempt_id,
        transaction_hash: value.transaction_hash, envelope_hash: value.envelope_hash, outcome_hash: value.outcome_hash, observed_outcome: decoded };
      return freeze(receipt);
    };
    if (lookup.outcome !== null) return validate(lookup.outcome, decode(lookup.outcome.observed_outcome));
    const history = await readTransactionHistory({ async rpc(name, parameters) { return { data: await rpc(name, parameters), error: null }; } }, namespace, authenticatedAdmin, pool);
    const observation = history.records.find(r => r.transactionHash === saved.transaction_hash); check(observation !== undefined);
    const outcome = parseInitialIssuanceOutcome(pool, savedXdr, { context: observation.context, transaction: observation.raw.transaction, ledger: observation.raw.ledger });
    check(same(outcome.observation, observation));
    // No automatic readback or retry after this one potentially durable write.
    return validate(await rpc("d1_record_issuance_outcome", { ...args, p_observed_outcome: outcome }), outcome);
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
