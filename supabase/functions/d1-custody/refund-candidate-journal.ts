import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { planRecoveryRefund, type RecoveryRefundConfiguration } from "./recovery-refund-plan.ts";

export type RefundCandidateClient = Parameters<typeof planRecoveryRefund>[0];
export type RefundCandidateScope = Parameters<typeof planRecoveryRefund>[1];
export interface RefundCandidateReceipt {
  readonly kind: "d1_refund_candidate";
  readonly revision: 1;
  readonly request_id: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly authorized_by: string;
  readonly initial_transaction_hash: string;
  readonly initial_outcome_hash: string;
  readonly source_sequence: string;
  readonly transaction_sequence: string;
  readonly deadline: string;
  readonly unsigned_xdr: string;
  readonly transaction_hash: string;
}
type DTO = Record<string, unknown>;
const unavailable = () => new CustodyError("refund_candidate_unavailable", 503);
function check(v: unknown): asserts v { if (!v) throw unavailable(); }
function object(v: unknown): v is DTO { return v !== null && typeof v === "object" && !Array.isArray(v); }
function exact(v: unknown, keys: string): v is DTO {
  return object(v) && Object.keys(v).sort().join(",") === keys.split(",").sort().join(",");
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  return object(a) && object(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
}
/** Descriptor-first JSONB snapshot: no getters, hooks, aliases or exotic prototypes. */
function copy<T>(value: T): T {
  const seen = new Set<object>(); let nodes = 0, characters = 0;
  function visit(v: unknown, depth: number) {
    check(++nodes <= 20000 && depth <= 40);
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "string") { check((characters += v.length) <= 2097152); return; }
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return; }
    check(typeof v === "object" && v !== null && !seen.has(v)); seen.add(v);
    const array = Array.isArray(v), descriptors = Object.getOwnPropertyDescriptors(v);
    check(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype) || Object.getPrototypeOf(v) === null);
    check(Object.getOwnPropertySymbols(v).length === 0);
    if (array) check(v.length <= 20000 && Object.keys(v).length === v.length && Object.keys(v).every((k, i) => k === String(i)));
    check(Object.keys(descriptors).length === Object.keys(v).length + (array ? 1 : 0));
    for (const [key, descriptor] of Object.entries(descriptors)) {
      check("value" in descriptor);
      if (array && key === "length") continue;
      check(descriptor.enumerable && (characters += key.length) <= 2097152); visit(descriptor.value, depth + 1);
    }
  }
  visit(value, 0);
  const text = JSON.stringify(value); check(new TextEncoder().encode(text).length <= 2097152);
  return JSON.parse(text);
}
/** Load immutable history first; only validated absence can construct and save once.
 * A returned candidate is not fresh financial, signing or submission authority. */
export async function ensureRecoveryRefundCandidate(
  client: RefundCandidateClient, configuration: RefundCandidateScope, construction: RecoveryRefundConfiguration,
): Promise<Readonly<RefundCandidateReceipt>> {
  let denied = false;
  try {
    // Both snapshots and scalar checks precede the first asynchronous boundary.
    const scope = copy(configuration), cfg = copy(construction);
    check(exact(scope, "namespace,pool,requestId,authenticatedAdmin"));
    check(exact(cfg, "sourceSequence,feePerOperationStroops,now,validUntil"));
    const { namespace, pool, requestId, authenticatedAdmin } = scope;
    const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
    check(uuid(namespace) && uuid(requestId)); Keypair.fromPublicKey(pool); Keypair.fromPublicKey(authenticatedAdmin);
    check(typeof cfg.sourceSequence === "string" && /^[1-9][0-9]{0,18}$/.test(cfg.sourceSequence) && BigInt(cfg.sourceSequence) < 9223372036854775807n);
    check(typeof cfg.feePerOperationStroops === "string" && /^[1-9][0-9]{0,9}$/.test(cfg.feePerOperationStroops) && BigInt(cfg.feePerOperationStroops) <= 4294967295n);
    check(typeof cfg.now === "number" && Number.isSafeInteger(cfg.now) && cfg.now >= 0);
    check(typeof cfg.validUntil === "number" && Number.isSafeInteger(cfg.validUntil) && cfg.validUntil > cfg.now);
    const args = { p_request_id: requestId, p_authorized_by: authenticatedAdmin };
    const rpc = async (name: string, parameters: DTO) => {
      const reply = copy(await client.rpc(name, parameters));
      check(exact(reply, "data,error"));
      if (reply.error !== null) {
        // Never promote a helper-thrown403 into database authentication evidence.
        if (reply.data === null && exact(reply.error, "code,message") && reply.error.code === "42501" &&
          reply.error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    let captured: unknown;
    const readonly: RefundCandidateClient = { async rpc(name, parameters) {
      check((name === "d1_load_refund_candidate" || reads.has(name)) && parameters.p_authorized_by === authenticatedAdmin);
      if (Object.hasOwn(parameters, "p_request_id")) check(parameters.p_request_id === requestId);
      if (Object.hasOwn(parameters, "p_namespace")) check(parameters.p_namespace === namespace);
      const data = await rpc(name, parameters);
      if (name === "d1_load_issuance_outcome") {
        if (captured === undefined) captured = copy(data);
        else check(same(captured, data));
      }
      return { data, error: null };
    } };
    const existing = await loadRecoveryRefundCandidate(readonly, scope);
    if (existing !== null) return existing;
    // The accepted planner alone validates historical economics and actual032 payload.
    const plan = await planRecoveryRefund(readonly, scope, cfg);
    check(object(captured) && object(captured.outcome));
    check(plan.namespace === namespace && plan.requestId === requestId && plan.network === "TESTNET" && plan.source === pool);
    const expected = {
      kind: "d1_refund_candidate", revision: 1, request_id: requestId, namespace, network: "TESTNET", pool,
      initial_transaction_hash: captured.outcome.transaction_hash, initial_outcome_hash: captured.outcome.outcome_hash,
      source_sequence: plan.sourceSequence, transaction_sequence: plan.transactionSequence, deadline: plan.deadline,
      unsigned_xdr: plan.unsignedXdr, transaction_hash: plan.transactionHash,
    };
    // No retry/readback after this potentially committed call, even if its reply is lost.
    const saved = await rpc("d1_record_refund_candidate", { ...args, p_unsigned_xdr: plan.unsignedXdr, p_transaction_hash: plan.transactionHash });
    check(exact(saved, "kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,source_sequence,transaction_sequence,deadline,unsigned_xdr,transaction_hash"));
    check(typeof saved.authorized_by === "string"); Keypair.fromPublicKey(saved.authorized_by);
    // Another legitimate concurrent actor may own identical immutable history.
    for (const [key, value] of Object.entries(expected)) check(saved[key] === value);
    return Object.freeze(copy(saved)) as unknown as Readonly<RefundCandidateReceipt>;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}

const reads = new Set(["d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction",
  "d1_load_initial_financial_observation", "d1_load_issuance_fee_commitments", "d1_load_active_issuance_sequence", "d1_load_transaction_history_state",
  "d1_list_transaction_records", "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit"]);

/** Validate immutable unsigned history, never fresh eligibility or authority to spend.
 * No clock, provider, key, save, release, retry or owner-reactivation path exists. */
export async function loadRecoveryRefundCandidate(
  client: RefundCandidateClient, configuration: RefundCandidateScope,
): Promise<Readonly<RefundCandidateReceipt> | null> {
  let denied = false;
  try {
    const scope = copy(configuration);
    check(exact(scope, "namespace,pool,requestId,authenticatedAdmin"));
    const { namespace, pool, requestId, authenticatedAdmin } = scope;
    const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
    const hash = (v: unknown) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
    check(uuid(namespace) && uuid(requestId)); Keypair.fromPublicKey(pool); Keypair.fromPublicKey(authenticatedAdmin);
    const args = { p_request_id: requestId, p_authorized_by: authenticatedAdmin };
    const rpc = async (name: string, parameters: DTO) => {
      const reply = copy(await client.rpc(name, parameters));
      check(exact(reply, "data,error"));
      if (reply.error !== null) {
        if (reply.data === null && exact(reply.error, "code,message") && reply.error.code === "42501" &&
          reply.error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    const bound = (v: DTO) => v.revision === 1 && v.request_id === requestId && v.namespace === namespace && v.network === "TESTNET" && v.pool === pool;
    const lookup = await rpc("d1_load_refund_candidate", args);
    check(exact(lookup, "kind,revision,request_id,namespace,network,pool,candidate,active_request_id") &&
      lookup.kind === "d1_refund_candidate_lookup" && bound(lookup));
    if (lookup.candidate === null) { check(lookup.active_request_id === null); return null; }
    check(lookup.active_request_id === requestId);
    const candidate = lookup.candidate;
    check(exact(candidate, "kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,source_sequence,transaction_sequence,deadline,unsigned_xdr,transaction_hash") &&
      candidate.kind === "d1_refund_candidate" && bound(candidate));
    check(typeof candidate.authorized_by === "string"); Keypair.fromPublicKey(candidate.authorized_by);
    check(hash(candidate.initial_transaction_hash) && hash(candidate.initial_outcome_hash) && hash(candidate.transaction_hash));
    const sourceSequence = candidate.source_sequence;
    check(typeof sourceSequence === "string" && /^[1-9][0-9]{0,18}$/.test(sourceSequence) && BigInt(sourceSequence) < 9223372036854775807n);
    check(candidate.transaction_sequence === (BigInt(sourceSequence) + 1n).toString());
    const deadline = candidate.deadline;
    check(typeof deadline === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(deadline));
    const cutoff = Date.parse(deadline) / 1000;
    check(Number.isSafeInteger(cutoff) && cutoff >= 0 && new Date(cutoff * 1000).toISOString().replace(".000Z", "Z") === deadline);
    const unsignedXdr = candidate.unsigned_xdr;
    check(typeof unsignedXdr === "string" && unsignedXdr.length >= 4 && unsignedXdr.length <= 65536 &&
      Buffer.from(unsignedXdr, "base64").toString("base64") === unsignedXdr);
    const transaction = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
    check(transaction instanceof Transaction && transaction.toEnvelope().switch().name === "envelopeTypeTx" &&
      transaction.signatures.length === 0 && transaction.toXDR() === unsignedXdr && transaction.source === pool &&
      transaction.sequence === candidate.transaction_sequence && transaction.hash().toString("hex") === candidate.transaction_hash);
    const count = transaction.operations.length;
    check((count === 1 || count === 2) && /^[1-9][0-9]*$/.test(transaction.fee));
    const fee = BigInt(transaction.fee);
    check(fee <= 4294967295n && fee % BigInt(count) === 0n);
    const feePerOperationStroops = (fee / BigInt(count)).toString();
    check(transaction.timeBounds !== undefined && transaction.timeBounds.minTime === String(cutoff));
    const validUntil = Number(transaction.timeBounds.maxTime);
    check(Number.isSafeInteger(validUntil) && validUntil > cutoff && String(validUntil) === transaction.timeBounds.maxTime);
    let captured: unknown;
    const readonly: RefundCandidateClient = { async rpc(name, parameters) {
      check(reads.has(name) && parameters.p_authorized_by === authenticatedAdmin);
      if (Object.hasOwn(parameters, "p_request_id")) check(parameters.p_request_id === requestId);
      if (Object.hasOwn(parameters, "p_namespace")) check(parameters.p_namespace === namespace);
      const data = await rpc(name, parameters);
      if (name === "d1_load_issuance_outcome") {
        if (captured === undefined) captured = copy(data);
        else check(same(captured, data));
      }
      return { data, error: null };
    } };
    // Historical construction time preserves expired bytes; it is NOT the current clock.
    const plan = await planRecoveryRefund(readonly, scope, { sourceSequence, feePerOperationStroops, now: cutoff, validUntil });
    // Only successful accepted SDK validation makes this captured032 payload usable.
    check(object(captured) && object(captured.outcome));
    check(candidate.initial_transaction_hash === captured.outcome.transaction_hash && candidate.initial_outcome_hash === captured.outcome.outcome_hash);
    check(plan.namespace === namespace && plan.requestId === requestId && plan.network === "TESTNET" && plan.source === pool &&
      plan.sourceSequence === sourceSequence && plan.transactionSequence === candidate.transaction_sequence && plan.deadline === deadline &&
      plan.validUntil === validUntil && plan.feeStroops === transaction.fee && plan.operationCount === count &&
      plan.unsignedXdr === unsignedXdr && plan.transactionHash === candidate.transaction_hash);
    // All fourteen validated fields are primitive: a detached frozen root is recursive.
    return Object.freeze(copy(candidate)) as unknown as Readonly<RefundCandidateReceipt>;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
