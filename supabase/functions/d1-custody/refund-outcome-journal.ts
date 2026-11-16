import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { observeSavedRefundOutcome } from "./refund-outcome-observation.ts";
import { TransactionHistoryDatabase } from "./transaction-ingestion.ts";
import type { RefundOutcome } from "./refund-outcome.ts";
import type { RefundCandidateScope } from "./refund-candidate-journal.ts";

type Client = Parameters<typeof observeSavedRefundOutcome>[0];
type Observation = Awaited<ReturnType<typeof observeSavedRefundOutcome>>;
type Data = Record<string, unknown>;
export interface RefundOutcomeReceipt {
  readonly kind: "d1_refund_outcome_journal";
  readonly revision: 1;
  readonly request_id: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly authorized_by: string;
  readonly attempt_id: string;
  readonly signing_nonce: string;
  readonly transaction_hash: string;
  readonly envelope_hash: string;
  readonly initial_transaction_hash: string;
  readonly initial_outcome_hash: string;
  readonly outcome_hash: string;
  readonly observed_outcome: Readonly<RefundOutcome>;
  readonly history_state: Observation["history"]["state"];
}
const unavailable = () => new CustodyError("refund_outcome_journal_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const data = fields(value);
  check(Object.keys(data).sort().join(",") === names.split(",").sort().join(",")); return data;
}
/** Detached own-data JSON only; no getters, hooks, sparse arrays or unbounded traversal. */
function snapshot<T>(value: T): T {
  const active = new Set<object>(); let nodes = 0, characters = 0;
  const visit = (v: unknown, depth: number): unknown => {
    check(++nodes <= 200000 && depth <= 60);
    if (typeof v === "string") { check((characters += v.length) <= 33554432); return v; }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return v; }
    check(typeof v === "object" && v !== null && !active.has(v)); active.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      check(Object.getPrototypeOf(v) === Array.prototype);
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), length = ds.length.value;
      check(Number.isSafeInteger(length) && length >= 0 && length <= 200000 && Reflect.ownKeys(v).length === length + 1);
      result = Object.freeze(Array.from({ length }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d); return visit(d.value, depth + 1);
      }));
    } else {
      result = Object.freeze(Object.fromEntries(Object.entries(fields(v)).map(([k, x]) => {
        check((characters += k.length) <= 33554432); return [k, visit(x, depth + 1)];
      })));
    }
    active.delete(v); return result;
  };
  const result = visit(value, 0);
  check(new TextEncoder().encode(JSON.stringify(result)).length <= 33554432); return result as T;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const data = value as Data;
    return `{${Object.keys(data).sort().map(k => `${JSON.stringify(k)}:${canonical(data[k])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value); check(typeof encoded === "string"); return encoded;
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function address(v: unknown): asserts v is string { check(typeof v === "string"); Keypair.fromPublicKey(v); }
function captureRPC(client: Client): Client["rpc"] {
  check(client !== null && (typeof client === "object" || typeof client === "function"));
  let owner: object | null = client, descriptor: PropertyDescriptor | undefined;
  while (owner !== null) {
    descriptor = Object.getOwnPropertyDescriptor(owner, "rpc");
    if (descriptor) break;
    owner = Object.getPrototypeOf(owner);
  }
  check(descriptor && "value" in descriptor && typeof descriptor.value === "function");
  const method = descriptor.value;
  return (name, parameters) => Reflect.apply(method, client, [name, parameters]);
}
async function coordinate(client: Client, configuration: RefundCandidateScope, record: boolean): Promise<Readonly<RefundOutcomeReceipt> | null> {
  let denied = false;
  try {
    const input = exact(snapshot(configuration), "namespace,pool,requestId,authenticatedAdmin");
    const { namespace, pool, requestId, authenticatedAdmin } = input;
    check(uuid(namespace) && uuid(requestId)); address(pool); address(authenticatedAdmin);
    const scope = Object.freeze({ namespace, pool, requestId, authenticatedAdmin });
    const invoke = captureRPC(client);
    const args = Object.freeze({ p_request_id: requestId, p_authorized_by: authenticatedAdmin });
    const reads = new Set(["d1_load_refund_submission_attempt", "d1_load_refund_financial_observation",
      "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
      "d1_load_unsigned_transaction", "d1_load_initial_financial_observation",
      "d1_load_transaction_history_state", "d1_list_transaction_records"]);
    const rpc = async (name: string, parameters: Data): Promise<unknown> => {
      const reply = exact(snapshot(await invoke(name, snapshot(parameters))), "data,error");
      if (reply.error !== null) {
        const error = fields(reply.error);
        if (reply.data === null && error.code === "42501" && error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      check(reads.has(name) && parameters.p_authorized_by === authenticatedAdmin);
      if (Object.hasOwn(parameters, "p_request_id")) check(parameters.p_request_id === requestId);
      if (Object.hasOwn(parameters, "p_namespace")) check(parameters.p_namespace === namespace);
      return { data: await rpc(name, parameters), error: null };
    } });
    const bound = (d: Data, kind: string) => check(d.kind === kind && d.revision === 1 &&
      d.request_id === requestId && d.namespace === namespace && d.network === "TESTNET" && d.pool === pool);
    const load = async (): Promise<unknown> => {
      const lookup = exact(await rpc("d1_load_refund_outcome", args), "kind,revision,request_id,namespace,network,pool,outcome");
      bound(lookup, "d1_refund_outcome_lookup"); return lookup.outcome;
    };
    const validate = async (value: unknown, observation: Observation): Promise<Readonly<RefundOutcomeReceipt>> => {
      const receipt = exact(value, "kind,revision,request_id,namespace,network,pool,authorized_by,attempt_id,signing_nonce,transaction_hash,envelope_hash,initial_transaction_hash,initial_outcome_hash,outcome_hash,observed_outcome,history_state");
      bound(receipt, "d1_refund_outcome_journal"); address(receipt.authorized_by);
      const { candidate, signedTransaction, submissionAttempt, outcome, history } = observation;
      check(uuid(receipt.attempt_id) && uuid(receipt.signing_nonce) && hash(receipt.transaction_hash) &&
        hash(receipt.envelope_hash) && hash(receipt.initial_transaction_hash) && hash(receipt.initial_outcome_hash) && hash(receipt.outcome_hash));
      check(receipt.attempt_id === submissionAttempt.attempt_id && receipt.signing_nonce === signedTransaction.signing_nonce &&
        receipt.transaction_hash === candidate.transaction_hash && receipt.envelope_hash === signedTransaction.envelope_hash &&
        receipt.initial_transaction_hash === candidate.initial_transaction_hash && receipt.initial_outcome_hash === candidate.initial_outcome_hash &&
        same(receipt.observed_outcome, outcome));
      // Reuse024's full state validator on the actual stored038 state, not a
      // fabricated checkpoint. This projection cannot reach a database write.
      check(receipt.history_state !== null);
      const historical = new TransactionHistoryDatabase({ async rpc(name, parameters) {
        check(name === "d1_load_transaction_history_state" && parameters.p_namespace === namespace && parameters.p_authorized_by === authenticatedAdmin);
        return { data: receipt.history_state, error: null };
      } }, namespace, authenticatedAdmin, pool, "TESTNET");
      const saved = await historical.loadState(), current = history.state;
      check(saved.coverage_complete && saved.checkpoint !== null && current.checkpoint !== null &&
        saved.first_ledger === current.first_ledger && saved.page_count <= current.page_count && saved.record_count <= current.record_count);
      const old = saved.checkpoint, next = current.checkpoint, included = outcome.observation;
      check(old.through_ledger <= next.through_ledger && old.closed_at <= next.closed_at && BigInt(old.cursor) <= BigInt(next.cursor));
      check(old.through_ledger === next.through_ledger ? old.ledger_hash === next.ledger_hash && old.closed_at === next.closed_at : old.closed_at < next.closed_at);
      check(included.ledger <= old.through_ledger && BigInt(included.pagingToken) <= BigInt(old.cursor) &&
        included.context.firstLedger === saved.first_ledger && included.context.anchor.sequence <= old.through_ledger && included.context.anchor.closedAt <= old.closed_at);
      check(included.context.anchor.sequence === old.through_ledger ? included.context.anchor.hash === old.ledger_hash &&
        included.context.anchor.closedAt === old.closed_at : included.context.anchor.closedAt < old.closed_at);
      const prefix = history.records.filter(r => BigInt(r.pagingToken) <= BigInt(old.cursor));
      check(prefix.length === saved.record_count && prefix[prefix.length - 1]?.pagingToken === old.cursor &&
        prefix.every(r => r.ledger <= old.through_ledger && r.closedAt <= old.closed_at));
      // SQL hashes PostgreSQL jsonb::text, not JavaScript JSON. Preserve its
      // syntax-checked immutable hash; compare full payloads rather than renew it.
      return snapshot(receipt) as unknown as Readonly<RefundOutcomeReceipt>;
    };
    const saved = await load(); // Always038 first, including explicit later recovery.
    if (saved === null && !record) return null;
    const observation = await observeSavedRefundOutcome(readonly, scope);
    if (saved !== null) {
      const receipt = await validate(saved, observation);
      check(same(await load(), receipt)); return receipt; // Historical path never writes.
    }
    // Only the genuine internally generated J13 payload reaches the one write.
    // A thrown/ambiguous reply or invalid acknowledgement exits before readback.
    const acknowledged = await rpc("d1_record_refund_outcome", { ...args,
      p_observed_outcome: observation.outcome, p_history_state: observation.history.state });
    const receipt = await validate(acknowledged, observation);
    check(same(receipt.history_state, observation.history.state));
    check(same(await load(), receipt));
    const reloaded = await observeSavedRefundOutcome(readonly, scope);
    check(same(reloaded.candidate, observation.candidate) && same(reloaded.signingClaim, observation.signingClaim) &&
      same(reloaded.signedTransaction, observation.signedTransaction) && same(reloaded.submissionAttempt, observation.submissionAttempt));
    await validate(receipt, reloaded);
    check(same(await load(), receipt)); return receipt;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
/** Read-only historical evidence, never signing/submission or settlement authority. */
export async function loadRefundOutcome(client: Client, scope: RefundCandidateScope): Promise<Readonly<RefundOutcomeReceipt> | null> {
  return await coordinate(client, scope, false);
}
/** Load-first, one awaited038 save at most; unknown writes never retry/read back. */
export async function recordRefundOutcome(client: Client, scope: RefundCandidateScope): Promise<Readonly<RefundOutcomeReceipt>> {
  const receipt = await coordinate(client, scope, true); check(receipt !== null); return receipt;
}
