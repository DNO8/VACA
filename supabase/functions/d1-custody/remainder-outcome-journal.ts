import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { observeSavedRemainderOutcome, type RemainderOutcomeObservation } from "./remainder-outcome-observation.ts";
import type { RemainderSigningScope } from "./remainder-authorized-signer.ts";
import type { RemainderOutcome } from "./remainder-outcome.ts";
import { TransactionHistoryDatabase } from "./transaction-ingestion.ts";

type Client = Parameters<typeof observeSavedRemainderOutcome>[0];
type Data = Record<string, unknown>;
type Observation = NonNullable<Awaited<ReturnType<typeof observeSavedRemainderOutcome>>>;
/** PRIVATE immutable evidence, never an HTTP DTO or execution/settlement permit. */
export interface RemainderOutcomeReceipt {
  readonly kind: "d1_remainder_outcome_journal";
  readonly revision: 2;
  readonly request_id: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly authorized_by: string;
  readonly attempt_id: string;
  readonly signing_nonce: string;
  readonly transaction_hash: string;
  readonly envelope_sha256: string;
  readonly outcome_hash: string;
  readonly observed_outcome: Readonly<RemainderOutcome>;
  readonly history_state: RemainderOutcomeObservation["history_state"];
}
const receiptKeys = "kind,revision,request_id,namespace,network,pool,authorized_by,attempt_id,signing_nonce,transaction_hash,envelope_sha256,outcome_hash,observed_outcome,history_state";
const unavailable = () => new CustodyError("remainder_outcome_journal_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const keys = Reflect.ownKeys(value); check(keys.length <= 200000);
  const ds = Object.getOwnPropertyDescriptors(value);
  check(keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const d = fields(value); check(Object.keys(d).sort().join(",") === names.split(",").sort().join(",")); return d;
}
/** Detached, frozen own-data JSON: no getters/hooks, sparse arrays, cycles or unbounded metadata. */
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
      const keys = Reflect.ownKeys(v); check(keys.length <= 200001);
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), n = ds.length.value;
      check(Number.isSafeInteger(n) && n >= 0 && n <= 200000 && keys.length === n + 1);
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
async function coordinate(client: Client, configuration: RemainderSigningScope,
  options: { readonly now: () => number }, record: boolean): Promise<Readonly<RemainderOutcomeReceipt> | null> {
  let denied = false;
  try {
    const scope = snapshot(configuration); exact(scope, "namespace,pool,requestId,authenticatedAdmin"); exact(options, "now");
    check(uuid(scope.namespace) && uuid(scope.requestId)); address(scope.pool); address(scope.authenticatedAdmin);
    const invoke = capture(client, "rpc"), clock = capture(options, "now");
    let last = -1;
    const now = () => {
      const n = clock(); check(typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 253402300799 && n >= last);
      last = n; return n;
    };
    const args = Object.freeze({ p_request_id: scope.requestId, p_authorized_by: scope.authenticatedAdmin });
    const reads = new Set(["d1_load_remainder_submission_attempt", "d1_load_remainder_signing_journal",
      "d1_load_remainder_financial_observation", "d1_load_remainder_candidate", "d1_load_beneficiary_claim",
      "d1_list_beneficiary_claim_set", "d1_load_refund_outcome", "d1_load_refund_candidate", "d1_load_refund_submission_attempt",
      "d1_load_refund_financial_observation", "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
      "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_active_issuance_sequence",
      "d1_load_transaction_history_state", "d1_list_transaction_records", "d1_load_issuance_fee_commitments",
      "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit"]);
    const selected = new Set(["d1_load_remainder_submission_attempt", "d1_load_remainder_signing_journal",
      "d1_load_remainder_financial_observation", "d1_load_remainder_candidate"]);
    const captured = new Map<string, { name: string; parameters: Data; data: unknown }>();
    const rpc = async (name: string, parameters: Data) => {
      const p = snapshot(parameters);
      check(p.p_authorized_by === scope.authenticatedAdmin);
      if (Object.hasOwn(p, "p_namespace")) check(p.p_namespace === scope.namespace);
      if (selected.has(name)) check(p.p_request_id === scope.requestId);
      const reply = exact(snapshot(await invoke(name, p)), "data,error");
      if (reply.error !== null) {
        const e = fields(reply.error);
        if (reply.data === null && e.code === "42501" && e.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      check(reads.has(name)); const p = snapshot(parameters);
      const data = await rpc(name, p), key = name + JSON.stringify(p), prior = captured.get(key);
      if (prior) check(same(prior.data, data));
      else { check(captured.size < 10000); captured.set(key, { name, parameters: p, data }); }
      return { data, error: null };
    } });
    const bound = (d: Data, kind: string) => check(d.kind === kind && d.revision === 2 && d.request_id === scope.requestId &&
      d.namespace === scope.namespace && d.network === "TESTNET" && d.pool === scope.pool);
    //047 is tracked separately: our one authorized null->receipt transition is NOT read drift.
    const load = async () => {
      const d = exact(await rpc("d1_load_remainder_outcome", args), "kind,revision,request_id,namespace,network,pool,outcome");
      bound(d, "d1_remainder_outcome_lookup"); return d.outcome;
    };
    const validate = (value: unknown, observed: Observation) => {
      const r = exact(value, receiptKeys); bound(r, "d1_remainder_outcome_journal"); address(r.authorized_by);
      const state = observed.submissionState, signed = state.journal.transaction, attempt = state.attempt;
      check(signed && attempt && state.journal.candidate && uuid(r.attempt_id) && uuid(r.signing_nonce) &&
        hash(r.transaction_hash) && hash(r.envelope_sha256) && hash(r.outcome_hash) && r.attempt_id === attempt.attempt_id &&
        r.signing_nonce === signed.signing_nonce && r.signing_nonce === attempt.signing_nonce &&
        r.transaction_hash === signed.transaction_hash && r.transaction_hash === attempt.transaction_hash &&
        r.transaction_hash === state.journal.candidate.transaction_hash && r.envelope_sha256 === signed.envelope_sha256 &&
        r.envelope_sha256 === attempt.envelope_sha256 && same(r.observed_outcome, observed.outcome));
      return snapshot(r) as unknown as Readonly<RemainderOutcomeReceipt>;
    };
    const prefix = async (receipt: Readonly<RemainderOutcomeReceipt>, observed: Observation) => {
      // Reuse024's actual state validator.047 itself verifies durable empty-page receipts and originals.
      const saved = await new TransactionHistoryDatabase({ async rpc(name, parameters) {
        check(name === "d1_load_transaction_history_state" && parameters.p_namespace === scope.namespace && parameters.p_authorized_by === scope.authenticatedAdmin);
        return { data: receipt.history_state, error: null };
      } }, scope.namespace, scope.authenticatedAdmin, scope.pool, "TESTNET").loadState();
      const current = observed.history.state, old = saved.checkpoint, head = current.checkpoint;
      check(saved.coverage_complete && old && head && saved.first_ledger === current.first_ledger &&
        saved.page_count <= current.page_count && saved.record_count <= current.record_count &&
        old.through_ledger <= head.through_ledger && old.closed_at <= head.closed_at && BigInt(old.cursor) <= BigInt(head.cursor));
      check(old.through_ledger === head.through_ledger ? old.ledger_hash === head.ledger_hash && old.closed_at === head.closed_at : old.closed_at < head.closed_at);
      const records = observed.history.records.filter(r => BigInt(r.pagingToken) <= BigInt(old.cursor));
      check(records.length === saved.record_count && (records.at(-1)?.pagingToken ?? "0") === old.cursor &&
        records.some(r => same(r, observed.outcome.observation)));
      for (const r of records) check(r.context.firstLedger === saved.first_ledger && r.ledger <= old.through_ledger && r.closedAt <= old.closed_at &&
        r.context.anchor.sequence <= old.through_ledger && (r.context.anchor.sequence === old.through_ledger ?
          r.context.anchor.hash === old.ledger_hash && r.context.anchor.closedAt === old.closed_at : r.context.anchor.closedAt < old.closed_at) &&
        (r.ledger !== old.through_ledger || r.ledgerHash === old.ledger_hash && r.closedAt === old.closed_at));
    };
    const observe = async () => snapshot(await observeSavedRemainderOutcome(readonly, scope, { now }));
    const finish = async (expected: unknown) => {
      // Every captured membership/page reloads AFTER all helper/SDK awaits. Not an atomic snapshot.
      for (const e of captured.values()) check(same(await rpc(e.name, e.parameters), e.data));
      check(same(await load(), expected)); now();
    };
    now(); const saved = await load(); //047 FIRST, current admin and original historical membership.
    if (saved === null && !record) { await finish(null); return null; }
    const observed = await observe();
    if (saved !== null) {
      check(observed !== null);
      const receipt = validate(saved, observed); await prefix(receipt, observed);
      await finish(receipt); return receipt; // Old actor retained; no fresh account/043/sequence/window gate.
    }
    if (observed === null) { await finish(null); return null; } // UNKNOWN, never failure0 or retry/release.
    // ONE write only. Error/uncertain/malformed ACK exits before ANY readback or second write.
    const acknowledged = await rpc("d1_record_remainder_outcome", { ...args,
      p_observed_outcome: observed.outcome, p_history_state: observed.history_state });
    const receipt = validate(acknowledged, observed);
    check(receipt.authorized_by === scope.authenticatedAdmin && same(receipt.history_state, observed.history_state));
    check(same(await load(), receipt)); // Exact full14 including SQL's canonical JSONB hash.
    const reloaded = await observe(); check(reloaded !== null);
    const evidence = (o: Observation) => ({ ...o, observedAt: 0, submissionState: { ...o.submissionState, observedAt: 0 } });
    check(same(evidence(reloaded), evidence(observed))); // Whole membership, original, evidence AND current complete history.
    validate(receipt, reloaded); await prefix(receipt, reloaded);
    await finish(receipt); return receipt;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable(); // Helper/clock/crypto arbitrary403 is never trusted as DB authorization.
  }
}
/** Read-only historical SDK evidence. Missing membership is unknown, not a financial zero. */
export async function loadRemainderOutcome(client: Client, scope: RemainderSigningScope,
  options: { readonly now: () => number }): Promise<Readonly<RemainderOutcomeReceipt> | null> {
  return await coordinate(client, scope, options, false);
}
/** Genuine internal observer only; one047 save at most, no uncertain-write readback/retry. */
export async function observeAndSaveRemainderOutcome(client: Client, scope: RemainderSigningScope,
  options: { readonly now: () => number }): Promise<Readonly<RemainderOutcomeReceipt> | null> {
  return await coordinate(client, scope, options, true);
}
