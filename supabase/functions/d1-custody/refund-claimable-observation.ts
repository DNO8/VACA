import { CustodyError } from "./handler.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { loadRecoveryRefundCandidate, type RefundCandidateClient, type RefundCandidateScope } from "./refund-candidate-journal.ts";
import { observeIssuanceAccountingWithHistory, type IssuanceAccountingObservation } from "./issuance-accounting-context.ts";
import { captureRefundReadClient, observeSavedRefundAccount, validateRefundAccountBinding,
  type SavedRefundAccountObservation } from "./refund-account-observation.ts";

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
type ClaimableObservation = Awaited<ReturnType<HorizonDiscoverySource["readClaimableBalance"]>>;
type DTO = Record<string, unknown>;
export interface SavedRefundClaimableOptions {
  readonly now: () => number;
  readonly maximumAgeSeconds: number;
  readonly futureToleranceSeconds: number;
  readonly source?: Pick<HorizonDiscoverySource, "readAccountAtCheckpoint" | "readClaimableBalance">;
}
export interface SavedRefundClaimableObservation {
  readonly kind: "d1_saved_refund_claimable_observation";
  readonly revision: 1;
  readonly candidate: SavedRefundAccountObservation["candidate"];
  readonly account: SavedRefundAccountObservation["account"];
  readonly history: IssuanceAccountingObservation["history"];
  readonly accounting: IssuanceAccountingObservation["context"];
  readonly claimableBalance: DeepReadonly<ClaimableObservation> | null;
  readonly observedAt: number;
}
const unavailable = () => new CustodyError("refund_claimable_observation_unavailable", 503);
function requireValue(value: unknown): asserts value { if (!value) throw unavailable(); }
/** Descriptor-only detachment; aliases are copied, not rejected as cycles. */
function snapshot<T>(value: T, active = new Set<object>()): T {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { requireValue(Number.isSafeInteger(value)); return value; }
  requireValue(typeof value === "object" && !active.has(value));
  const array = Array.isArray(value), descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  requireValue(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype));
  requireValue(keys.every(k => typeof k === "string" && "value" in descriptors[k] &&
    (descriptors[k].enumerable || (array && k === "length"))));
  active.add(value);
  let result: unknown;
  if (array) {
    const length = descriptors.length.value;
    requireValue(keys.length === length + 1);
    result = Array.from({ length }, (_, i) => {
      requireValue(Object.hasOwn(descriptors, String(i)));
      return snapshot(descriptors[String(i)].value, active);
    });
  } else {
    result = Object.fromEntries(Object.entries(descriptors).map(([k, d]) => [k, snapshot(d.value, active)]));
  }
  active.delete(value);
  return result as T;
}
function exact(value: unknown, fields: string): asserts value is DTO {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value));
  requireValue(Object.keys(value).sort().join(",") === fields.split(",").sort().join(","));
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && same((a as DTO)[k], (b as DTO)[k]));
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function capture(receiver: unknown, key: string): (...args: unknown[]) => unknown {
  requireValue(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  const seen = new Set<object>();
  let owner: object | null = receiver;
  while (owner !== null) {
    requireValue(!seen.has(owner)); seen.add(owner);
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor) {
      requireValue("value" in descriptor && typeof descriptor.value === "function");
      const method = descriptor.value;
      return (...args) => Reflect.apply(method, receiver, args);
    }
    owner = Object.getPrototypeOf(owner);
  }
  throw unavailable();
}
/** Read consistency only. T3's history companion is an UNVERIFIED dependency.
 * Neither positive presence nor an included failure authorizes refund execution.
 */
export async function observeSavedRefundClaimableBalance(
  client: RefundCandidateClient, scope: RefundCandidateScope, options: SavedRefundClaimableOptions,
): Promise<SavedRefundClaimableObservation> {
  let denied = false;
  try {
    const input = snapshot(scope);
    exact(input, "namespace,pool,requestId,authenticatedAdmin");
    requireValue(options !== null && typeof options === "object" && Object.getPrototypeOf(options) === Object.prototype);
    const descriptors = Object.getOwnPropertyDescriptors(options), keys = Reflect.ownKeys(options);
    requireValue(keys.every(k => typeof k === "string" && "value" in descriptors[k] && descriptors[k].enumerable));
    requireValue(["now", "maximumAgeSeconds", "futureToleranceSeconds"].every(k => Object.hasOwn(descriptors, k)) &&
      keys.length === 3 + (Object.hasOwn(descriptors, "source") ? 1 : 0));
    const maximumAgeSeconds = descriptors.maximumAgeSeconds.value, futureToleranceSeconds = descriptors.futureToleranceSeconds.value;
    requireValue(typeof maximumAgeSeconds === "number" && Number.isSafeInteger(maximumAgeSeconds) && maximumAgeSeconds >= 1 && maximumAgeSeconds <= 30);
    requireValue(typeof futureToleranceSeconds === "number" && Number.isSafeInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    const now = capture(options, "now");
    const source = descriptors.source?.value === undefined ? new HorizonDiscoverySource() : descriptors.source.value;
    const readAccount = capture(source, "readAccountAtCheckpoint"), readBalance = capture(source, "readClaimableBalance");
    const readClient = captureRefundReadClient(client);
    let last = -1;
    const clock = () => {
      const value = now();
      requireValue(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value >= last);
      last = value;
      return value;
    };
    // Only accepted readers classify a current-admin denial, never provider errors.
    const trusted = async <T>(operation: () => Promise<T>): Promise<T> => {
      try { return await operation(); } catch (error) {
        denied = error instanceof CustodyError && error.status === 403 &&
          error.code === "unauthorized_admin_wallet" && error.message === error.code;
        throw error;
      }
    };
    const startedAt = clock();
    const accountSource: Pick<HorizonDiscoverySource, "readAccountAtCheckpoint"> = {
      readAccountAtCheckpoint: context => readAccount(context) as ReturnType<HorizonDiscoverySource["readAccountAtCheckpoint"]>,
    };
    const base = snapshot(await trusted(() => observeSavedRefundAccount(readClient, input,
      { now: clock, maximumAgeSeconds, futureToleranceSeconds, source: accountSource })));
    clock();
    const timing = () => ({ startedAt, observedAt: last, maximumAgeSeconds, futureToleranceSeconds });
    const boundAccount = () => validateRefundAccountBinding(base.candidate, base.historyState, base.account, timing());
    boundAccount();
    const before = snapshot(await trusted(() => observeIssuanceAccountingWithHistory(readClient, input)));
    clock(); boundAccount();
    const { context, history } = before, cp = history.state.checkpoint;
    requireValue(cp !== null && same(history.state, base.historyState));
    requireValue(history.state.namespace === input.namespace && history.state.pool === input.pool &&
      history.state.first_ledger === base.historyState.first_ledger);
    requireValue(base.account.anchor.sequence === cp.through_ledger && base.account.anchor.hash === cp.ledger_hash &&
      base.account.anchor.closedAt === cp.closed_at && context.confirmedPoolFeesSpentStroops === history.confirmedPoolFeesSpentStroops);
    const { candidate } = base, accounting = context.accounting;
    let claimableBalance: ClaimableObservation | null = null;
    if (context.included.claimableBalanceId === null) {
      requireValue(accounting.encumbrances.length === 0 && accounting.failedIssuances.length === 1);
      const failed = accounting.failedIssuances[0];
      requireValue(failed.requestId === input.requestId && failed.transactionHash === candidate.initial_transaction_hash &&
        failed.feeChargedStroops === context.included.feeChargedStroops && failed.sequence === context.included.sequence);
    } else {
      requireValue(accounting.encumbrances.length === 1 && accounting.failedIssuances.length === 0);
      const selected = accounting.encumbrances[0];
      requireValue(selected.requestId === input.requestId && selected.issuanceTransactionHash === candidate.initial_transaction_hash &&
        selected.outcomeHash === candidate.initial_outcome_hash && selected.deadline === candidate.deadline &&
        selected.claimableBalanceId === context.included.claimableBalanceId && selected.sequence === context.included.sequence &&
        selected.feeChargedStroops === context.included.feeChargedStroops);
      requireValue(/^[1-9][0-9]*$/.test(selected.amountStroops));
      const stroops = BigInt(selected.amountStroops);
      requireValue(stroops <= 9223372036854775807n);
      const amount = (stroops / 10000000n).toString() + "." + (stroops % 10000000n).toString().padStart(7, "0");
      const contextForBalance = freeze({ pool: input.pool, claimableBalanceId: selected.claimableBalanceId,
        beneficiary: selected.beneficiary, asset: snapshot(selected.asset), amount, deadline: selected.deadline,
        minimumLedger: cp.through_ledger, now: clock, maximumAgeSeconds, futureToleranceSeconds });
      // Copy immediately after await, before any caller clock or another reader.
      const reply = snapshot(await readBalance(contextForBalance));
      exact(reply, "verification,state,claimableBalanceId,observedLedger,ledgerHash,observedClosedAt");
      clock(); boundAccount();
      requireValue(reply.verification === "current_indexer_observation" && reply.state === "present" &&
        reply.claimableBalanceId === selected.claimableBalanceId && reply.observedLedger === cp.through_ledger &&
        reply.ledgerHash === cp.ledger_hash && reply.observedClosedAt === cp.closed_at);
      claimableBalance = reply as unknown as ClaimableObservation;
    }
    const after = snapshot(await trusted(() => observeIssuanceAccountingWithHistory(readClient, input)));
    clock(); boundAccount(); requireValue(same(before, after));
    const finalCandidate = snapshot(await trusted(() => loadRecoveryRefundCandidate(readClient, input)));
    clock(); requireValue(same(candidate, finalCandidate));
    const account = boundAccount();
    if (claimableBalance !== null) {
      requireValue(last - claimableBalance.observedClosedAt <= maximumAgeSeconds &&
        claimableBalance.observedClosedAt - last <= futureToleranceSeconds);
    }
    return freeze({ kind: "d1_saved_refund_claimable_observation" as const, revision: 1 as const,
      candidate, account, history, accounting: context, claimableBalance, observedAt: last });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
