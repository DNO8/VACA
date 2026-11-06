import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { calculateIssuanceEncumbrances, type IssuanceEncumbrances } from "./issuance-encumbrances.ts";
import { recordInitialIssuanceOutcome } from "./initial-issuance-outcome-journal.ts";
import { IssuanceFeeCommitmentDatabase } from "./issuance-fee-commitment.ts";
import { readTransactionHistory } from "./transaction-history-reader.ts";
import { readOperatingCredits } from "./operating-credit-reader.ts";

type Client = Parameters<typeof recordInitialIssuanceOutcome>[0];
type Scope = Parameters<typeof recordInitialIssuanceOutcome>[1];
type DTO = Record<string, unknown>;
export interface IssuanceAccountingContext {
  readonly kind: "d1_issuance_accounting_context";
  readonly revision: 1;
  readonly accounting: IssuanceEncumbrances;
  readonly included: Readonly<{ feeChargedStroops: string; sequence: string; claimableBalanceId: string | null }>;
  readonly confirmedPoolFeesSpentStroops: string;
  readonly held: Readonly<{
    commitment: Readonly<Record<string, unknown>>;
    activeOwner: Readonly<Record<string, unknown>>;
  }>;
}
const unavailable = () => new CustodyError("issuance_accounting_unavailable", 503);
function check(v: unknown): asserts v { if (!v) throw unavailable(); }
function object(v: unknown): v is DTO { return v !== null && typeof v === "object" && !Array.isArray(v); }
/** Bound JSONB before traversal, rejecting getters, hooks, cycles and aliases. */
function copy<T>(v: T): T {
  const seen = new Set<object>(); let nodes = 0, characters = 0;
  function visit(x: unknown, depth: number) {
    check(++nodes <= 20000 && depth <= 40);
    if (typeof x === "string") { check((characters += x.length) <= 2097152); return; }
    if (x === null || typeof x === "boolean") return;
    if (typeof x === "number") { check(Number.isSafeInteger(x)); return; }
    check(typeof x === "object" && x !== null && !seen.has(x)); seen.add(x);
    const array = Array.isArray(x), ds = Object.getOwnPropertyDescriptors(x);
    check(Object.getPrototypeOf(x) === (array ? Array.prototype : Object.prototype) || Object.getPrototypeOf(x) === null);
    check(Object.getOwnPropertySymbols(x).length === 0);
    if (array) check(x.length <= 20000 && Object.keys(x).length === x.length && Object.keys(x).every((k, i) => k === String(i)));
    check(Object.keys(ds).length === Object.keys(x).length + (array ? 1 : 0));
    for (const [k, d] of Object.entries(ds)) {
      check(!d.get && !d.set); if (array && k === "length") continue;
      check(d.enumerable && (characters += k.length) <= 2097152); visit(d.value, depth + 1);
    }
  }
  visit(v, 0); const text = JSON.stringify(v); check(new TextEncoder().encode(text).length <= 2097152); return JSON.parse(text);
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  return object(a) && object(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
}
function freeze<T>(v: T): T {
  if (v !== null && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v;
}
/** Historical SDK observations only, not consensus, settlement or disposition.
 * Current DB admin checks are separate from immutable historical authorizers.
 * There is no provider, clock, signer, write, release or refund path.
 */
export async function observeIssuanceAccountingContext(client: Client, configuration: Scope): Promise<IssuanceAccountingContext> {
  let denied = false;
  try {
    const input = copy(configuration);
    check(object(input) && Object.keys(input).sort().join(",") === "authenticatedAdmin,namespace,pool,requestId");
    const { namespace, pool, requestId, authenticatedAdmin } = input;
    const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
    check(uuid(namespace) && uuid(requestId)); Keypair.fromPublicKey(pool); Keypair.fromPublicKey(authenticatedAdmin);
    const args = { p_request_id: requestId, p_authorized_by: authenticatedAdmin };
    const allowed = new Set(["d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction",
      "d1_load_initial_financial_observation", "d1_load_issuance_fee_commitments", "d1_load_active_issuance_sequence", "d1_load_transaction_history_state",
      "d1_list_transaction_records", "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit"]);
    const stableNames = new Set([...allowed].filter(n => !n.startsWith("d1_list_") && n !== "d1_load_operating_credit"));
    const stable = new Map<string, { name: string; parameters: DTO; data: unknown }>();
    const rpc = async (name: string, parameters: DTO) => {
      // This check precedes the client even when an accepted coordinator wants to save.
      check(allowed.has(name) && parameters.p_authorized_by === authenticatedAdmin);
      if (Object.hasOwn(parameters, "p_namespace")) check(parameters.p_namespace === namespace);
      if (Object.hasOwn(parameters, "p_request_id")) check(parameters.p_request_id === requestId);
      const r = copy(await client.rpc(name, parameters));
      check(object(r) && Object.keys(r).sort().join(",") === "data,error");
      if (r.error !== null) {
        if (r.data === null && object(r.error) && r.error.code === "42501" && r.error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return r.data;
    };
    const load = async (name: string, parameters: DTO) => {
      const data = await rpc(name, parameters);
      if (stableNames.has(name)) {
        const key = name + JSON.stringify(parameters), previous = stable.get(key);
        if (previous) check(same(previous.data, data));
        else stable.set(key, { name, parameters: copy(parameters), data: freeze(copy(data)) });
      }
      return data;
    };
    // Fail before the outcome coordinator can enter its absent032/save branch.
    const lookup = await load("d1_load_issuance_outcome", args);
    check(object(lookup) && object(lookup.outcome));
    let unsigned: DTO | undefined;
    const readonly: Client = { async rpc(name, parameters) {
      const data = name === "d1_load_issuance_outcome" ? copy(lookup) : await load(name, parameters);
      if (name === "d1_load_unsigned_transaction") { check(object(data) && object(data.transaction)); unsigned = freeze(copy(data.transaction)); }
      return { data, error: null };
    } };
    // Accepted validation binds032 to031, signed030, unsigned018 and historical
    // financial membership. Its callbacks/fresh path remain unreachable.
    const outcome = await recordInitialIssuanceOutcome(readonly, input);
    check(unsigned !== undefined);
    const database = new IssuanceFeeCommitmentDatabase(readonly, { pool, futureRefundFee() { throw unavailable(); } });
    const commitment = await database.record(requestId, authenticatedAdmin);
    check(commitment.namespace === namespace && object(commitment.reservation) && same(commitment.reservation, unsigned.reservation));
    const ownerArgs = { p_namespace: namespace, p_authorized_by: authenticatedAdmin };
    const activeOwner = await load("d1_load_active_issuance_sequence", ownerArgs);
    check(object(activeOwner) && activeOwner.namespace === namespace && activeOwner.request_id === requestId && same(activeOwner, unsigned.reservation));
    const history = await readTransactionHistory(readonly, namespace, authenticatedAdmin, pool);
    const credits = await readOperatingCredits(readonly, namespace, authenticatedAdmin, pool);
    check(same(credits.state.discovery_state, history.state.income_state) && history.state.checkpoint !== null);
    const cp = history.state.checkpoint;
    const accounting = calculateIssuanceEncumbrances({ namespace, pool, firstLedger: history.state.first_ledger,
      anchor: { sequence: cp.through_ledger, hash: cp.ledger_hash, closedAt: cp.closed_at }, transactions: history.records,
      operatingCredits: credits.receipts, issuances: [{ unsignedJournal: unsigned, outcomeReceipt: outcome }] });
    check(accounting.original.observedOperatingCreditStroops === credits.observedCreditStroops);
    // Each accepted reader already checks its pages/final state. Recheck the
    // joined selected receipts and states too, without retrying drift. This is
    // consistency evidence across reads, not a database-wide atomic snapshot.
    for (const { name, parameters, data } of stable.values()) check(same(await rpc(name, parameters), data));
    const observed = outcome.observed_outcome;
    return freeze({ kind: "d1_issuance_accounting_context", revision: 1, accounting,
      included: { feeChargedStroops: observed.observation.feeChargedStroops, sequence: observed.observation.sequence, claimableBalanceId: observed.claimableBalanceId },
      confirmedPoolFeesSpentStroops: history.confirmedPoolFeesSpentStroops,
      held: { commitment: copy(commitment), activeOwner: copy(activeOwner) } });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
