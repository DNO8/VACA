import { Networks } from "@stellar/stellar-sdk";
import { CustodyError, type Preparation } from "./handler.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { readTransactionHistory } from "./transaction-history-reader.ts";
import { readOperatingCredits } from "./operating-credit-reader.ts";
import { observePoolCreation } from "./pool-creation-eligibility.ts";
import { calculateOriginalObligations } from "./original-obligations.ts";
import { calculateOperatingBudget } from "./operating-budget.ts";
import { IssuanceFeeCommitmentDatabase } from "./issuance-fee-commitment.ts";

type Client = Parameters<typeof readTransactionHistory>[0];
interface Configuration {
  namespace: string; pool: string; requestId: string; authenticatedAdmin: string;
  now(): number; maximumAgeSeconds: number; futureToleranceSeconds: number;
  source?: Pick<HorizonDiscoverySource, "readAccountAtCheckpoint">;
}
const unavailable = () => new CustodyError("initial_financial_snapshot_unavailable", 503);
function check(v: unknown): asserts v { if (!v) throw unavailable(); }
function object(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === "object" && !Array.isArray(v); }
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  return object(a) && object(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
}
function copy<T>(v: T): T {
  const seen = new Set<object>(); let nodes = 0, characters = 0;
  function visit(x: unknown, depth: number) {
    check(++nodes <= 20000 && depth <= 40);
    if (typeof x === "string") { check((characters += x.length) <= 1048576); return; }
    if (x === null || typeof x === "boolean") return;
    if (typeof x === "number") { check(Number.isFinite(x)); return; }
    check(typeof x === "object" && x !== null && !seen.has(x)); seen.add(x);
    check(Object.getPrototypeOf(x) === (Array.isArray(x) ? Array.prototype : Object.prototype) || Object.getPrototypeOf(x) === null);
    check(Object.getOwnPropertySymbols(x).length === 0);
    if (Array.isArray(x)) check(x.length <= 20000 && Object.keys(x).length === x.length && Object.keys(x).every((k, i) => k === String(i)));
    const ds = Object.getOwnPropertyDescriptors(x); check(Object.keys(ds).length === Object.keys(x).length + (Array.isArray(x) ? 1 : 0));
    for (const [k, d] of Object.entries(ds)) { check(!d.get && !d.set); if (Array.isArray(x) && k === "length") continue; check(d.enumerable && (characters += k.length) <= 1048576); visit(d.value, depth + 1); }
  }
  visit(v, 0); const json = JSON.stringify(v); check(new TextEncoder().encode(json).length <= 1048576); return JSON.parse(json);
}
/** Initial-only read observation. NOT a durable financial authorization or signing token. */
export async function observeInitialFinancialSnapshot(client: Client, input: Configuration) {
  try {
    const { namespace, pool, requestId, authenticatedAdmin, maximumAgeSeconds, futureToleranceSeconds } = input;
    check(Number.isInteger(maximumAgeSeconds) && maximumAgeSeconds > 0 && maximumAgeSeconds <= 30 && Number.isInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    const clock = () => { let now: number; try { now = input.now(); } catch { throw unavailable(); } check(Number.isSafeInteger(now) && now >= 0); return now; };
    const started = clock();
    const allowed = new Set(["d1_load_issuance_fee_commitments", "d1_load_unsigned_transaction", "d1_load_transaction_history_state", "d1_list_transaction_records", "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit"]);
    const readOnly: Client = { async rpc(name, args) {
      check(allowed.has(name)); let result;
      try { result = copy(await client.rpc(name, args)); } catch { throw unavailable(); }
      check(object(result) && Object.hasOwn(result, "data") && Object.hasOwn(result, "error"));
      if (object(result.error) && result.error.message === "unauthorized_admin_wallet") check(result.error.code === "42501");
      return result;
    } };
    const data = async (name: string) => { const r = await readOnly.rpc(name, { p_namespace: namespace, p_authorized_by: authenticatedAdmin });
      if (object(r.error) && r.error.code === "42501" && r.error.message === "unauthorized_admin_wallet") throw new CustodyError("unauthorized_admin_wallet", 403);
      check(r.error === null); return r.data; };
    // Existing-only policy + allowlist ensure that this composition can never write.
    const owner = new IssuanceFeeCommitmentDatabase(readOnly, { pool, futureRefundFee() { throw unavailable(); } });
    const commitment = await owner.record(requestId, authenticatedAdmin);
    check(commitment.namespace === namespace && object(commitment.reservation));
    const history = await readTransactionHistory(readOnly, namespace, authenticatedAdmin, pool);
    check(history.state.checkpoint !== null);
    const cp = history.state.checkpoint, anchor = { sequence: cp.through_ledger, hash: cp.ledger_hash, closedAt: cp.closed_at };
    // Only successful credit-trustline candidates reach the strict pre-principal accounting check.
    // Failed/source-only/other pool activity remains quarantined; actual fees still count.
    check(history.records.every(r => (r.source !== pool && r.poolOperationSourceIndices.length === 0) ||
      (r.outcome === "success" && r.poolOperationSourceIndices.length > 0 && r.poolOperationSourceIndices.every(i => r.operationTypes[i] === 6))));
    const credits = await readOperatingCredits(readOnly, namespace, authenticatedAdmin, pool);
    check(same(credits.state.discovery_state, history.state.income_state));
    const provider = input.source ?? new HorizonDiscoverySource();
    const source: Pick<HorizonDiscoverySource, "readAccountAtCheckpoint"> = { async readAccountAtCheckpoint(context) {
      try { return copy(await provider.readAccountAtCheckpoint(context)); } catch { throw unavailable(); }
    } };
    const creation = await observePoolCreation(readOnly, namespace, authenticatedAdmin, pool, source);
    check(creation.firstLedger === history.state.first_ledger && same(creation.anchor, anchor));
    const obligations = calculateOriginalObligations({ namespace, pool, firstLedger: history.state.first_ledger, anchor, transactions: history.records, operatingCredits: credits.receipts });
    check(obligations.unexplainedActivity.length === 0 && obligations.observedOperatingCreditStroops === credits.observedCreditStroops);
    check(object(commitment.reservation.intent) && object(commitment.reservation.intent.preparation_input));
    const prepared = commitment.reservation.intent.preparation_input as unknown as Preparation;
    check(typeof prepared.payment.amount === "string" && /^(0|[1-9][0-9]*)\.[0-9]{7}$/.test(prepared.payment.amount));
    const originalDonation = obligations.donations.find(d => d.operationId === prepared.payment.operation_id && d.transactionHash === prepared.payment.transaction_hash &&
      d.donor === prepared.payment.donor && same(d.asset, prepared.payment.asset) && d.amountStroops === BigInt(prepared.payment.amount.replace(".", "")).toString() && d.confirmedAt === prepared.confirmed_at);
    check(originalDonation && history.records.some(r => r.transactionHash === originalDonation.transactionHash && r.ledger === prepared.ledger));
    const account = await source.readAccountAtCheckpoint({ pool, firstLedger: history.state.first_ledger, checkpoint: history.state.income_state.checkpoint! });
    check(account.pool === pool && account.networkPassphrase === Networks.TESTNET && same(account.anchor, anchor) && account.sequence === commitment.reservation.observed_account_sequence && account.lastModifiedLedger >= creation.creation.ledger && account.lastModifiedLedger <= anchor.sequence);
    const debt = new Map(obligations.issuedDonorLiabilities.map(a => [a.code + ":" + a.issuer, { code: a.code, issuer: a.issuer, donorLiabilities: a.amountStroops, excludedHistorical: "0" }]));
    for (const a of account.issuedBalances) if (!debt.has(a.code + ":" + a.issuer)) debt.set(a.code + ":" + a.issuer, { code: a.code, issuer: a.issuer, donorLiabilities: "0", excludedHistorical: "0" });
    check(typeof commitment.issuance_fee_stroops === "string" && typeof commitment.future_refund_fee_stroops === "string" && typeof commitment.deadline === "string");
    check(typeof account.baseFee === "string" && /^[1-9][0-9]{0,18}$/.test(account.baseFee) && typeof prepared.request.amount === "string" && /^(0|[1-9][0-9]*)\.[0-9]{7}$/.test(prepared.request.amount));
    const issuedAmount = BigInt(prepared.request.amount.replace(".", "")); check(issuedAmount > 0n && issuedAmount <= BigInt(originalDonation.amountStroops));
    // Gross principal is untouched. Independently provision one payment per positive unissued remainder.
    const unissuedRefundOperationIds = obligations.donations.filter(d => BigInt(d.amountStroops) - (d === originalDonation ? issuedAmount : 0n) > 0n).map(d => d.operationId);
    const unissuedRefundFeeStroops = (BigInt(unissuedRefundOperationIds.length) * BigInt(account.baseFee)).toString();
    const budget = calculateOperatingBudget({ action: { kind: "issue", transactionFee: commitment.issuance_fee_stroops, futureRefundFee: commitment.future_refund_fee_stroops },
      native: { ...account.native, donorLiabilities: obligations.nativeDonorLiabilityStroops, excludedHistorical: "0" }, issuedBalances: account.issuedBalances, issuedObligations: [...debt.values()],
      approvedTeamCredits: credits.observedCreditStroops, confirmedPoolFeesSpent: history.confirmedPoolFeesSpentStroops, otherFutureFees: unissuedRefundFeeStroops, baseReserve: account.baseReserve, baseFee: account.baseFee, account: account.account });
    check(same(await data("d1_load_transaction_history_state"), history.state));
    check(same(await data("d1_load_operating_credit_state"), credits.state));
    check(same(await owner.record(requestId, authenticatedAdmin), commitment));
    const observedAt = clock(), expiresAt = Math.min(anchor.closedAt + maximumAgeSeconds, Date.parse(commitment.deadline) / 1000);
    check(observedAt >= started && observedAt + futureToleranceSeconds >= anchor.closedAt && observedAt < expiresAt);
    return { kind: "d1_initial_financial_snapshot" as const, revision: 1, namespace, network: "TESTNET" as const, pool, requestId, anchor, observedAt, expiresAt,
      commitment, historyState: history.state, creditState: credits.state, creation, account, obligations, originalDonation, unissuedRefundOperationIds, unissuedRefundFeeStroops, budget };
  } catch (error) {
    if (error instanceof CustodyError && error.code === "unauthorized_admin_wallet" && error.status === 403) throw error;
    throw unavailable();
  }
}
