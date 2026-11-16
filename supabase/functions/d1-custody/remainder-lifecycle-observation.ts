import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { observeRefundLifecycle } from "./refund-lifecycle-observation.ts";
import { readRemainderSubmissionState } from "./remainder-outcome-observation.ts";
import { loadRemainderOutcome } from "./remainder-outcome-journal.ts";
import { readAuthenticBeneficiaryClaimSet, calculateCumulativeRemainders, type PrincipalRefundFact } from "./remainder-accounting.ts";
import { readOperatingCredits } from "./operating-credit-reader.ts";
import { REMAINDER_SAFE_ACTIONS, type RemainderHttpResponse, type RemainderState, type RemainderReason } from "./remainder-http-contract.ts";
import type { RemainderSigningScope } from "./remainder-authorized-signer.ts";

type Client = Parameters<typeof observeRefundLifecycle>[0];
type Data = Record<string, unknown>;
export interface RemainderLifecycleObservation {
  readonly kind: "d1_remainder_lifecycle_observation";
  readonly revision: 2;
  readonly scope: RemainderSigningScope;
  readonly observedAt: number;
  readonly response: Readonly<RemainderHttpResponse>;
  readonly executionAuthority: false;
  readonly settlementAuthority: false;
}
const unavailable = () => new CustodyError("remainder_lifecycle_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const keys = Reflect.ownKeys(value), ds = Object.getOwnPropertyDescriptors(value);
  check(keys.length <= 200000 && keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const d = fields(value); check(Object.keys(d).sort().join(",") === names.split(",").sort().join(",")); return d;
}
/** Bounded detached own-data JSON, never getters, hooks, cycles or mutable aliases. */
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
      const keys = Reflect.ownKeys(v), ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), n = ds.length.value;
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
function stroops(v: unknown): bigint {
  check(typeof v === "string" && /^(0|[1-9][0-9]{0,18})$/.test(v));
  const n = BigInt(v); check(n <= 9223372036854775807n); return n;
}
function money(v: string): string {
  const n = stroops(v); return `${n / 10000000n}.${(n % 10000000n).toString().padStart(7, "0")}`;
}
/** DB-only status composition. No acquisition, ingestion, current money gate or provider. */
export async function observeRemainderLifecycle(client: Client, configuration: RemainderSigningScope,
  options: { readonly now: () => number }): Promise<Readonly<RemainderLifecycleObservation>> {
  let denied = false;
  try {
    const scope = snapshot(configuration); exact(scope, "namespace,pool,requestId,authenticatedAdmin"); exact(options, "now");
    check([scope.namespace, scope.requestId].every(v => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v)));
    Keypair.fromPublicKey(scope.pool); Keypair.fromPublicKey(scope.authenticatedAdmin);
    const invoke = capture(client, "rpc"), clock = capture(options, "now");
    let last = -1;
    const now = () => {
      const n = clock(); check(typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 253402300799 && n >= last);
      last = n; return n;
    };
    const reads = new Set(["d1_load_remainder_outcome", "d1_load_remainder_submission_attempt", "d1_load_remainder_signing_journal",
      "d1_load_remainder_financial_observation", "d1_load_remainder_candidate", "d1_load_beneficiary_claim", "d1_list_beneficiary_claim_set",
      "d1_load_refund_outcome", "d1_load_refund_candidate", "d1_load_refund_submission_attempt", "d1_load_refund_financial_observation",
      "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction",
      "d1_load_initial_financial_observation", "d1_load_active_issuance_sequence", "d1_load_transaction_history_state",
      "d1_list_transaction_records", "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits",
      "d1_load_operating_credit", "d1_load_issuance_fee_commitments"]);
    const selectedReads = new Set(["d1_load_remainder_outcome", "d1_load_remainder_submission_attempt",
      "d1_load_remainder_signing_journal", "d1_load_remainder_financial_observation", "d1_load_remainder_candidate"]);
    const captured = new Map<string, { name: string; parameters: Data; data: unknown }>();
    const rpc = async (name: string, parameters: Data) => {
      const p = snapshot(parameters); check(reads.has(name) && p.p_authorized_by === scope.authenticatedAdmin);
      if (Object.hasOwn(p, "p_namespace")) check(p.p_namespace === scope.namespace);
      if (selectedReads.has(name)) check(p.p_request_id === scope.requestId);
      // Other donors' original requests are necessary for the complete authentic039 set.
      const reply = exact(snapshot(await invoke(name, p)), "data,error");
      if (reply.error !== null) {
        const e = fields(reply.error);
        if (reply.data === null && e.code === "42501" && e.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      const p = snapshot(parameters), data = await rpc(name, p), key = name + JSON.stringify(p), prior = captured.get(key);
      if (prior) check(same(prior.data, data));
      else { check(captured.size < 10000); captured.set(key, { name, parameters: p, data }); }
      return { data, error: null };
    } });
    now();
    const lifecycle = await observeRefundLifecycle(readonly, scope, { now });
    check(lifecycle.joinedStable);
    const { donation, deadline, history } = lifecycle;
    check(/^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(donation.grossAmount));
    const grossStroops = stroops(BigInt(donation.grossAmount.replace(".", "")).toString());
    check(grossStroops > 0n);
    const cutoff = Date.parse(deadline) / 1000; check(Number.isSafeInteger(cutoff));
    let state: RemainderState = "blocked", reason: RemainderReason = "remainder_protected";
    let verification: RemainderHttpResponse["verification"] = "unverified";
    let refund: RemainderHttpResponse["refund"] = null;
    let candidateUntil: number | null = null, pendingUntil: number | null = null;
    let beneficiaryClaimedAmount: string | null = null, donorRefundedAmount: string | null = null, remainingPrincipalAmount: string | null = null;
    const legacy = lifecycle.candidate034 !== null || lifecycle.signingClaim036 !== null || lifecycle.signed036 !== null ||
      lifecycle.attempt037 !== null || lifecycle.outcome038 !== null;
    if (now() < cutoff) { state = "not_due"; reason = "deadline_not_reached"; }
    else if (!legacy && lifecycle.ownership.initial033 === "held" && lifecycle.ownership.refund034 === "absent" &&
      lifecycle.initial.outcome032?.observed_outcome.outcome === "success") {
      const setScope = { namespace: scope.namespace, pool: scope.pool, authenticatedAdmin: scope.authenticatedAdmin };
      const rawSet = (await readonly.rpc("d1_list_beneficiary_claim_set",
        { p_namespace: scope.namespace, p_authorized_by: scope.authenticatedAdmin })).data;
      // Null is unavailable membership, not an authenticated empty claim set.
      if (rawSet !== null) {
        const claims = await readAuthenticBeneficiaryClaimSet(readonly, setScope, { now });
        check(same(claims.history_state, history.state));
        const selected = claims.receipts.find(r => r.request_id === scope.requestId);
        if (selected) {
          const claim = selected.acquisition.claim, original = claim.original;
          check(original.operationId === donation.paymentOperationId && original.paymentTransactionHash === donation.paymentTransactionHash &&
            original.donor === donation.donor && same(original.asset, donation.asset) && original.deadline === deadline &&
            original.issuanceTransactionHash === lifecycle.initial.outcome032.transaction_hash &&
            original.outcomeHash === lifecycle.initial.outcome032.outcome_hash &&
            original.claimableBalanceId === lifecycle.initial.outcome032.observed_outcome.claimableBalanceId &&
            stroops(claim.originalGrossStroops) === grossStroops && stroops(claim.claimedPrincipalStroops) > 0n);
          beneficiaryClaimedAmount = money(claim.claimedPrincipalStroops);
          const submission = await readRemainderSubmissionState(readonly, scope, { now });
          const saved = await loadRemainderOutcome(readonly, scope, { now });
          const { candidate, claim: signingClaim, transaction } = submission.journal;
          if (candidate) {
            candidateUntil = Number(candidate.valid_until);
            refund = { transactionHash: candidate.transaction_hash, amount: money(candidate.remaining_stroops), claimableBalanceId: null };
          }
          if (saved) {
            check(candidate && transaction && submission.attempt);
            const outcome = saved.observed_outcome, included = history.records.find(r => r.transactionHash === saved.transaction_hash);
            check(included && same(included, outcome.observation) && same(outcome.candidate, candidate) &&
              outcome.transactionHash === saved.transaction_hash && outcome.operationIndex === 0 && included.envelopeXdr === transaction.signed_xdr &&
              outcome.originalPayment.operationId === original.operationId && outcome.originalPayment.paymentTransactionHash === original.paymentTransactionHash &&
              outcome.originalPayment.donor === original.donor && same(outcome.originalPayment.asset, original.asset));
            const returned = stroops(outcome.donorRefundedPrincipalStroops);
            check(outcome.outcome === "success" ? returned === stroops(candidate.remaining_stroops) : returned === 0n);
            verification = "persisted_sdk_observation";
            state = outcome.outcome === "success" ? "refund_observed" : "refund_failed_observed";
            reason = outcome.outcome === "success" ? null : "refund_failed";
            donorRefundedAmount = money(outcome.donorRefundedPrincipalStroops);
            // Only qualified047 + exact current025 SDK inclusion creates this PRIVATE fact.
            const fact: PrincipalRefundFact = { operationId: original.operationId, paymentTransactionHash: original.paymentTransactionHash,
              donor: original.donor, asset: original.asset, transactionHash: included.transactionHash, operationIndex: 0,
              outcome: outcome.outcome, returnedPrincipalStroops: outcome.donorRefundedPrincipalStroops, claimedBalanceId: null };
            const issuances: { unsignedJournal: unknown; outcomeReceipt: unknown }[] = [
              { unsignedJournal: lifecycle.initial.unsigned018, outcomeReceipt: lifecycle.initial.outcome032 }];
            for (const member of claims.receipts) {
              if (member.request_id === scope.requestId) continue;
              const other = await observeRefundLifecycle(readonly, { ...scope, requestId: member.request_id }, { now });
              check(other.joinedStable && same(other.history, history) && other.initial.outcome032?.observed_outcome.outcome === "success");
              issuances.push({ unsignedJournal: other.initial.unsigned018, outcomeReceipt: other.initial.outcome032 });
            }
            const credits = await readOperatingCredits(readonly, scope.namespace, scope.authenticatedAdmin, scope.pool);
            check(same(credits.state.discovery_state, history.state.income_state));
            const cp = history.state.checkpoint; check(cp && history.state.coverage_complete);
            const originals = { namespace: scope.namespace, pool: scope.pool, firstLedger: history.state.first_ledger,
              anchor: { sequence: cp.through_ledger, hash: cp.ledger_hash, closedAt: cp.closed_at }, transactions: [...history.records],
              operatingCredits: credits.receipts, issuances };
            // Opaque pure-accounting evidence cannot turn positive inclusion into whole-donation settlement.
            let cumulative: ReturnType<typeof calculateCumulativeRemainders> | null = null;
            try { cumulative = calculateCumulativeRemainders({ originals, claims: claims.receipts, refunds: [fact] }); }
            catch { /* Keep authenticated claim/refund totals; remaining stays unknown and protected. */ }
            if (cumulative !== null) {
              const selectedPrincipal = cumulative.donations.find(d => d.operationId === original.operationId);
              check(selectedPrincipal && selectedPrincipal.amountStroops === claim.originalGrossStroops &&
                selectedPrincipal.verifiedBeneficiaryPrincipalStroops === claim.claimedPrincipalStroops &&
                selectedPrincipal.observedReturnedPrincipalStroops === outcome.donorRefundedPrincipalStroops && !selectedPrincipal.returnUnresolved);
              // Recognize ONLY authentic claims and this047 payment index0. Never waive arbitrary pool outgoing activity.
              const unresolved = cumulative.unmatchedActivity.filter(a => {
                if (a.reason === "unexplained_pool_operation" && a.transactionHash === included.transactionHash && a.operationIndex === 0) return false;
                return !claims.receipts.some(r => {
                  const c = r.acquisition.claim, member = history.records.find(h => h.transactionHash === c.observation.transactionHash);
                  return member !== undefined && same(member, c.observation) && a.transactionHash === member.transactionHash && a.operationIndex === c.claimOperationIndex;
                });
              });
              if (unresolved.length === 0) {
                remainingPrincipalAmount = money(selectedPrincipal.remainingProtectedPrincipalStroops);
                if (outcome.outcome === "success" && stroops(selectedPrincipal.remainingProtectedPrincipalStroops) === 0n) state = "settled";
              }
            }
          } else if (submission.attempt) {
            check(candidate && transaction);
            pendingUntil = Math.min(submission.attempt.expires_at, Number(candidate.valid_until));
            state = now() < pendingUntil ? "pending" : "unknown";
            reason = state === "pending" ? null : "outcome_unresolved";
          } else if (signingClaim && !transaction) { state = "unknown"; reason = "outcome_unresolved"; }
          else if (candidate && now() >= Number(candidate.valid_until)) { reason = "financial_precondition_unavailable"; }
          else { state = "not_started"; reason = null; }
          // No047 is NEVER a zero refund; no pure [] projection asserts post-attempt liability.
        }
      }
    }
    // Reload all captured membership/pages, including whole025/039 AND047, after every helper await.
    // This is drift detection, NOT an atomic database snapshot or financial permit.
    for (const entry of captured.values()) check(same(await rpc(entry.name, entry.parameters), entry.data));
    const observedAt = now();
    // A boundary crossed during status reads cannot retain a stale not_due label.
    if (state === "not_due" && observedAt >= cutoff) { state = "blocked"; reason = "financial_precondition_unavailable"; }
    if (state === "not_started" && candidateUntil !== null && observedAt >= candidateUntil) {
      state = "blocked"; reason = "financial_precondition_unavailable";
    }
    if (state === "pending" && pendingUntil !== null && observedAt >= pendingUntil) { state = "unknown"; reason = "outcome_unresolved"; }
    const response: RemainderHttpResponse = { version: 2, network: "TESTNET", namespace: scope.namespace, pool: scope.pool,
      requestId: scope.requestId, state, verification, deadline, donation,
      refund, settlement: { beneficiaryClaimedAmount, donorRefundedAmount, remainingPrincipalAmount },
      safeActions: REMAINDER_SAFE_ACTIONS[state], reason };
    return snapshot({ kind: "d1_remainder_lifecycle_observation", revision: 2, scope, observedAt, response,
      executionAuthority: false, settlementAuthority: false });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable(); // Arbitrary helper/SDK/clock403 never becomes authenticated DB denial.
  }
}
