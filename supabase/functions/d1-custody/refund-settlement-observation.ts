import { CustodyError } from "./handler.ts";
import { observeRefundLifecycle } from "./refund-lifecycle-observation.ts";
import { calculateIssuanceEncumbrances } from "./issuance-encumbrances.ts";
import { readOperatingCredits } from "./operating-credit-reader.ts";
import type { RefundCandidateScope } from "./refund-candidate-journal.ts";
import type { RefundHttpResponse } from "./refund-http-contract.ts";

type Client = Parameters<typeof observeRefundLifecycle>[0];
type Lifecycle = Awaited<ReturnType<typeof observeRefundLifecycle>>;
type Data = Record<string, unknown>;
export interface RefundSettlementObservation {
  readonly kind: "d1_refund_settlement_observation";
  readonly revision: 1;
  readonly lifecycle: Lifecycle;
  readonly settled: boolean;
  readonly verification: RefundHttpResponse["verification"];
  readonly settlement: RefundHttpResponse["settlement"];
  readonly basis: "initial_failed_and_full_gross_return" | "original_balance_atomic_pool_claim_and_full_gross_return" | null;
  readonly unresolved: "unstable_lifecycle" | "refund_outcome_unavailable" | "refund_failed" |
    "unmatched_namespace_activity" | "contradictory_history" | "beneficiary_or_remainder_path_unavailable" | null;
  readonly fees: { readonly unit: "native_stroops"; readonly poolHistoryTotal: string;
    readonly initialTransaction: string | null; readonly refundTransaction: string | null };
  readonly executionAuthority: false;
  readonly ownershipReleaseAuthority: false;
}
const unavailable = () => new CustodyError("refund_settlement_observation_unavailable", 503);
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
/** Own-data, detached and frozen inputs/replies; no caller serialization hooks. */
function snapshot<T>(value: T): T {
  const active = new Set<object>(); let nodes = 0, budget = 33554432;
  const visit = (v: unknown, depth: number): unknown => {
    check(++nodes <= 200000 && depth <= 60 && (budget -= 8) >= 0);
    if (typeof v === "string") {
      check(v.length <= budget && (budget -= new TextEncoder().encode(JSON.stringify(v)).length) >= 0); return v;
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
  };
  return visit(value, 0) as T;
}
const same = (a: unknown, b: unknown) => JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b));
function method(receiver: unknown, name: string): (...args: unknown[]) => unknown {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, d: PropertyDescriptor | undefined;
  while (owner !== null) { d = Object.getOwnPropertyDescriptor(owner, name); if (d) break; owner = Object.getPrototypeOf(owner); }
  check(d && "value" in d && typeof d.value === "function");
  const fn = d.value; return (...args) => Reflect.apply(fn, receiver, args);
}
/** Internal read-only accounting; never accept caller-approved observations or claims. */
export async function observeRefundSettlement(client: Client, configuration: RefundCandidateScope,
  options: { readonly now: () => number }): Promise<Readonly<RefundSettlementObservation>> {
  let denied = false;
  try {
    const scope = snapshot(configuration);
    exact(scope, "namespace,pool,requestId,authenticatedAdmin"); exact(fields(options), "now");
    const invoke = method(client, "rpc"), clock = method(options, "now");
    const allowed = new Set(["d1_load_refund_outcome", "d1_load_refund_candidate", "d1_load_refund_submission_attempt",
      "d1_load_refund_financial_observation", "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
      "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_active_issuance_sequence",
      "d1_load_transaction_history_state", "d1_list_transaction_records", "d1_load_discovery_state",
      "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit"]);
    const membership = new Map<string, { name: string; args: Data; data: unknown }>();
    let membershipStable = true;
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      check(allowed.has(name) && parameters.p_authorized_by === scope.authenticatedAdmin);
      if (Object.hasOwn(parameters, "p_request_id")) check(parameters.p_request_id === scope.requestId);
      if (Object.hasOwn(parameters, "p_namespace")) check(parameters.p_namespace === scope.namespace);
      const reply = exact(snapshot(await invoke(name, snapshot(parameters))), "data,error");
      if (reply.error !== null) {
        const error = fields(reply.error);
        if (reply.data === null && error.code === "42501" && error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      const args = snapshot(parameters), key = name + JSON.stringify(args), previous = membership.get(key);
      if (previous) membershipStable = membershipStable && same(previous.data, reply.data);
      else { check(membership.size < 10000); membership.set(key, { name, args, data: reply.data }); }
      return { data: reply.data, error: null };
    } });
    // This genuine reader internally validates018/032/034-038 and SDK inclusion;
    // its final joined reload detects drift without retry or renewed authority.
    const lifecycle = await observeRefundLifecycle(readonly, scope, Object.freeze({ now: () => {
      const value = clock(); check(typeof value === "number"); return value;
    } }));
    const { initial, outcome038, history, donation } = lifecycle;
    const initialOutcome = initial.outcome032?.observed_outcome ?? null;
    const refund = outcome038?.observed_outcome ?? null;
    const fees = Object.freeze({ unit: "native_stroops" as const, poolHistoryTotal: history.confirmedPoolFeesSpentStroops,
      initialTransaction: initialOutcome?.observation.feeChargedStroops ?? null,
      refundTransaction: refund?.observation.feeChargedStroops ?? null });
    let settled = false, basis: RefundSettlementObservation["basis"] = null;
    let unresolved: RefundSettlementObservation["unresolved"] = "refund_outcome_unavailable";
    let beneficiaryClaimedAmount: string | null = null, remainingPrincipalAmount: string | null = null;
    // Failed included transactions prove only zero principal returned by THAT
    // transaction, not zero beneficiary acquisition or zero outstanding gross.
    const donorRefundedAmount = refund?.donorRefundedAmount ?? null;
    if (!lifecycle.joinedStable || lifecycle.ownership.initial033 !== "held" || lifecycle.ownership.refund034 === "unresolved") {
      unresolved = "unstable_lifecycle";
    } else if (refund?.outcome === "failed") {
      unresolved = "refund_failed";
    } else if (refund?.outcome === "success" && initial.outcome032 && initialOutcome) {
      check(outcome038 !== null);
      const cp = history.state.checkpoint; check(cp !== null);
      const accountingInput = { namespace: scope.namespace, pool: scope.pool, firstLedger: history.state.first_ledger,
        anchor: { sequence: cp.through_ledger, hash: cp.ledger_hash, closedAt: cp.closed_at },
        transactions: [...history.records],
        issuances: [{ unsignedJournal: initial.unsigned018, outcomeReceipt: initial.outcome032 }] };
      const accounting = calculateIssuanceEncumbrances({ ...accountingInput, operatingCredits: [] });
      const included = history.records.find(r => r.transactionHash === outcome038.transaction_hash);
      const original = accounting.original.donations.find(d => d.operationId === donation.paymentOperationId &&
        d.transactionHash === donation.paymentTransactionHash);
      check(original && original.amountStroops === BigInt(donation.grossAmount.replace(".", "")).toString());
      const full = included && same(included, refund.observation) && refund.donorRefundedAmount === donation.grossAmount &&
        refund.originalPayment.donor === donation.donor && same(refund.originalPayment.asset, donation.asset) &&
        refund.originalPayment.grossAmount === donation.grossAmount &&
        Date.parse(lifecycle.deadline) === Date.parse(refund.originalPayment.confirmedAt) + 300000 &&
        BigInt(included.pagingToken) > BigInt(initialOutcome.observation.pagingToken);
      const noCreation = initialOutcome.outcome === "failed" && refund.claimedBalanceId === null;
      const originalClaim = initialOutcome.outcome === "success" && refund.claimedBalanceId === initialOutcome.claimableBalanceId &&
        accounting.encumbrances.length === 1 && accounting.encumbrances[0].claimableBalanceId === refund.claimedBalanceId;
      // Genuine parsers permit only payment, or atomic original CB claim +
      // payment. Recognize those exact hash/index pairs, never a global waiver.
      const recognizedRefundIndices = noCreation ? [0] : originalClaim ? [0, 1] : [];
      const unrecognized = (a: typeof accounting.unmatchedActivity[number]) => !(full && recognizedRefundIndices.includes(a.operationIndex) &&
        a.transactionHash === outcome038.transaction_hash && a.reason === "unexplained_pool_operation");
      let unmatched = accounting.unmatchedActivity.filter(unrecognized);
      if (full && (noCreation || originalClaim) && unmatched.length !== 0) {
        // Without genuine operating credits, creation funding is conservatively
        // protected income and pre-donation ChangeTrust remains unexplained.
        // Reuse the complete historical receipt reader and accounting rules;
        // never whitelist setup operations here or assume an absent credit.
        const credits = await readOperatingCredits(readonly, scope.namespace, scope.authenticatedAdmin, scope.pool);
        check(same(credits.state.discovery_state, history.state.income_state));
        const credited = calculateIssuanceEncumbrances({ ...accountingInput, operatingCredits: credits.receipts });
        check(same(credited.original.donations.find(d => d.operationId === original.operationId), original) &&
          same(credited.encumbrances, accounting.encumbrances) && same(credited.failedIssuances, accounting.failedIssuances));
        unmatched = credited.unmatchedActivity.filter(unrecognized);
        // Credit-reader awaits must not hide changed lifecycle, history, receipt
        // membership or admission. These are bounded read-only validations, not
        // a retry, fresh financial authority or an ownership release.
        check(membershipStable);
        for (const entry of membership.values()) {
          await readonly.rpc(entry.name, entry.args);
          check(membershipStable);
        }
      }
      if (!full || (!noCreation && !originalClaim)) unresolved = "contradictory_history";
      else if (unmatched.length !== 0) unresolved = "unmatched_namespace_activity";
      else {
        check(BigInt(donorRefundedAmount!.replace(".", "")) === BigInt(original.amountStroops));
        beneficiaryClaimedAmount = "0.0000000"; remainingPrincipalAmount = "0.0000000";
        settled = true; unresolved = null;
        basis = noCreation ? "initial_failed_and_full_gross_return" : "original_balance_atomic_pool_claim_and_full_gross_return";
      }
    } else if (initialOutcome?.outcome === "success") {
      // J15b raw inclusion is NOT genuine positive acquisition. Beneficiary-only
      // and partial/unissued remainders await their actual backend paths.
      unresolved = "beneficiary_or_remainder_path_unavailable";
    }
    return Object.freeze({ kind: "d1_refund_settlement_observation", revision: 1, lifecycle, settled,
      verification: lifecycle.joinedStable && outcome038 ? "persisted_sdk_observation" : "unverified",
      settlement: Object.freeze({ beneficiaryClaimedAmount, donorRefundedAmount, remainingPrincipalAmount }),
      basis, unresolved, fees, executionAuthority: false, ownershipReleaseAuthority: false });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
