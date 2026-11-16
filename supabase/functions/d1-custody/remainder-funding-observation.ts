import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { HorizonDiscoverySource, type PoolAccountObservation } from "./discovery-source.ts";
import { observeIssuanceAccountingWithHistory } from "./issuance-accounting-context.ts";
import { readAuthenticBeneficiaryClaimSet, calculateCumulativeRemainders } from "./remainder-accounting.ts";
import { readOperatingCredits } from "./operating-credit-reader.ts";
import { observePoolCreation } from "./pool-creation-eligibility.ts";
import { calculateOperatingBudget } from "./operating-budget.ts";
import { calculateRefundFeeEarmarkBudget } from "./refund-fee-earmark-budget.ts";

type Client = Parameters<typeof observeIssuanceAccountingWithHistory>[0];
type Scope = Parameters<typeof observeIssuanceAccountingWithHistory>[1];
type Data = Record<string, unknown>;
export interface RemainderFundingOptions {
  readonly source: Pick<HorizonDiscoverySource, "readAccountAtCheckpoint">;
  readonly now: () => number;
  readonly maximumAgeSeconds: number;
  readonly futureToleranceSeconds: number;
}
const unavailable = () => new CustodyError("remainder_funding_observation_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, keys: string): Data {
  const data = fields(value);
  check(Object.keys(data).sort().join(",") === keys.split(",").sort().join(",")); return data;
}
/** Detached descriptor-only JSON, including output; no caller serialization hooks. */
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
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), n = ds.length.value;
      check(Number.isSafeInteger(n) && n >= 0 && n <= 200000 && Reflect.ownKeys(v).length === n + 1);
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
  const method = d.value; return (...args) => Reflect.apply(method, receiver, args);
}
function money(v: unknown): bigint {
  check(typeof v === "string" && /^(0|[1-9][0-9]{0,18})$/.test(v));
  const n = BigInt(v); check(n <= 9223372036854775807n); return n;
}
/** Authentic current observation ONLY. No candidate, financial receipt or signing permit. */
export async function observeCurrentRemainderFunding(client: Client, configuration: Scope, options: RemainderFundingOptions) {
  let denied = false;
  try {
    const scope = snapshot(configuration);
    exact(scope, "namespace,pool,requestId,authenticatedAdmin");
    check([scope.namespace, scope.requestId].every(v => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v)));
    Keypair.fromPublicKey(scope.pool); Keypair.fromPublicKey(scope.authenticatedAdmin);
    const o = exact(options, "source,now,maximumAgeSeconds,futureToleranceSeconds");
    const maximumAgeSeconds = o.maximumAgeSeconds, futureToleranceSeconds = o.futureToleranceSeconds;
    check(typeof maximumAgeSeconds === "number" && Number.isSafeInteger(maximumAgeSeconds) && maximumAgeSeconds >= 1 && maximumAgeSeconds <= 30);
    check(typeof futureToleranceSeconds === "number" && Number.isSafeInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    const invoke = capture(client, "rpc"), clock = capture(options, "now"), readAccount = capture(o.source, "readAccountAtCheckpoint");
    let last = -1;
    const now = () => {
      const n = clock(); check(typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 253402300799 && n >= last);
      last = n; return n;
    };
    const names = new Set(["d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
      "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_issuance_fee_commitments",
      "d1_load_active_issuance_sequence", "d1_load_transaction_history_state", "d1_list_transaction_records",
      "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit",
      "d1_list_beneficiary_claim_set", "d1_load_beneficiary_claim", "d1_load_refund_outcome", "d1_load_refund_candidate",
      "d1_load_refund_submission_attempt", "d1_load_refund_financial_observation"]);
    const membership = new Map<string, { name: string; args: Data; data: unknown }>();
    const call = async (name: string, parameters: Data) => {
      const args = snapshot(parameters);
      check(names.has(name) && args.p_authorized_by === scope.authenticatedAdmin);
      if (Object.hasOwn(args, "p_namespace")) check(args.p_namespace === scope.namespace);
      if (Object.hasOwn(args, "p_request_id")) check(args.p_request_id === scope.requestId);
      const reply = exact(snapshot(await invoke(name, args)), "data,error");
      if (reply.error !== null) {
        const error = fields(reply.error);
        if (reply.data === null && error.code === "42501" && error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      const key = name + JSON.stringify(args), previous = membership.get(key);
      if (previous) check(same(previous.data, reply.data));
      else { check(membership.size < 10000); membership.set(key, { name, args, data: reply.data }); }
      return reply.data;
    };
    const readonly: Client = Object.freeze({ async rpc(name: string, args: Data) { return { data: await call(name, args), error: null }; } });
    const provider = Object.freeze({ async readAccountAtCheckpoint(context: Parameters<HorizonDiscoverySource["readAccountAtCheckpoint"]>[0]) {
      // A raw source exception (including a forged403) never becomes DB authentication.
      try { return snapshot(await readAccount(snapshot(context))) as PoolAccountObservation; } catch { throw unavailable(); }
    } });
    const startedAt = now();
    const observed = await observeIssuanceAccountingWithHistory(readonly, scope);
    const { context, history } = observed, projection = context.accounting;
    const cp = history.state.checkpoint; check(cp !== null && history.state.coverage_complete);
    const accountContext = snapshot({ pool: scope.pool, firstLedger: history.state.first_ledger, checkpoint: history.state.income_state.checkpoint! });
    const account = await provider.readAccountAtCheckpoint(accountContext);
    now();
    const claimSet = await readAuthenticBeneficiaryClaimSet(readonly,
      { namespace: scope.namespace, pool: scope.pool, authenticatedAdmin: scope.authenticatedAdmin }, { now });
    check(claimSet.count === 1 && same(claimSet.history_state, history.state));
    const receipt = claimSet.receipts[0], claim = receipt.acquisition.claim;
    check(receipt.request_id === scope.requestId && projection.encumbrances.length === 1 && projection.failedIssuances.length === 0);
    const encumbrance = projection.encumbrances[0];
    check(same(claim.original, encumbrance) && money(claim.claimedPrincipalStroops) > 0n);
    const credits = await readOperatingCredits(readonly, scope.namespace, scope.authenticatedAdmin, scope.pool);
    check(same(credits.state.discovery_state, history.state.income_state) && credits.observedCreditStroops === projection.original.observedOperatingCreditStroops);
    const creation = await observePoolCreation(readonly, scope.namespace, scope.authenticatedAdmin, scope.pool, provider);
    check(creation.firstLedger === history.state.first_ledger && creation.creation.ledger === history.state.first_ledger &&
      same(creation.anchor, { sequence: cp.through_ledger, hash: cp.ledger_hash, closedAt: cp.closed_at }));
    const first = history.records[0], proof = creation.creation;
    check(first && first.transactionHash === proof.transactionHash && first.outcome === "success" && first.ledger === proof.ledger &&
      first.closedAt === proof.closedAt && String(BigInt(first.pagingToken) + BigInt(proof.operationIndex + 1)) === proof.operationId);
    // Creation funding must itself be a genuine durable D1OPS credit, not historical donor money.
    check(credits.receipts.some(r => r.observation.operationId === proof.operationId && r.observation.transactionHash === proof.transactionHash &&
      r.observation.funder === proof.funder && r.observation.amountStroops === proof.startingBalanceStroops &&
      r.observation.record.operation.kind === "account_created"));
    const args = { p_request_id: scope.requestId, p_authorized_by: scope.authenticatedAdmin };
    const unsigned = fields(await call("d1_load_unsigned_transaction", args)).transaction;
    const outcome = fields(await call("d1_load_issuance_outcome", args)).outcome;
    const originals = { namespace: scope.namespace, pool: scope.pool, firstLedger: history.state.first_ledger,
      anchor: creation.anchor, transactions: snapshot([...history.records]), operatingCredits: credits.receipts,
      issuances: [{ unsignedJournal: unsigned, outcomeReceipt: outcome }] };
    const cumulative = calculateCumulativeRemainders({ originals, claims: claimSet.receipts, refunds: [] });
    const selected = cumulative.donations.find(d => d.operationId === encumbrance.operationId);
    check(selected && money(selected.remainingProtectedPrincipalStroops) > 0n);
    // No absence-based discharge: all other donations retain their entire gross debt.
    check(cumulative.donations.every(d => d.operationId === selected.operationId || d.remainingProtectedPrincipalStroops === d.amountStroops));
    const claimMember = history.records.find(r => r.transactionHash === claim.observation.transactionHash);
    if (claimMember) check(claimMember.envelopeXdr === claim.observation.envelopeXdr && claimMember.resultXdr === claim.observation.resultXdr &&
      claimMember.ledger === claim.observation.ledger && claimMember.ledgerHash === claim.observation.ledgerHash && claimMember.outcome === "success");
    const recognizedClaim = (hash: string, index: number) => claimMember !== undefined && hash === claimMember.transactionHash && index === claim.claimOperationIndex;
    check(cumulative.unmatchedActivity.every(a => recognizedClaim(a.transactionHash, a.operationIndex)));
    // Bind the actual sequence to every saved pool-sourced transaction. Never assume ledger<<32.
    let sequence: bigint | null = null;
    for (const record of history.records) {
      if (record.source !== scope.pool) continue;
      const initial = record.transactionHash === encumbrance.issuanceTransactionHash;
      const positiveClaim = claimMember !== undefined && record.transactionHash === claimMember.transactionHash;
      check(initial || positiveClaim);
      if (positiveClaim) {
        const tx = TransactionBuilder.fromXDR(record.envelopeXdr, Networks.TESTNET);
        check(tx instanceof Transaction && tx.operations.length === 1 && claim.claimOperationIndex === 0);
      }
      const n = money(record.sequence); check(sequence === null || n === sequence + 1n); sequence = n;
    }
    check(sequence !== null && account.sequence === sequence.toString());
    const commitment = fields(context.held.commitment);
    check(commitment.request_id === scope.requestId && same(context.held.activeOwner, fields(unsigned).reservation));
    const nativeDebt = cumulative.donations.filter(d => d.asset.type === "native").reduce((n, d) => n + money(d.remainingProtectedPrincipalStroops), 0n).toString();
    const issuedObligations = account.issuedBalances.map(b => ({ code: b.code, issuer: b.issuer,
      donorLiabilities: cumulative.donations.filter(d => d.asset.type === "issued" && d.asset.code === b.code && d.asset.issuer === b.issuer)
        .reduce((n, d) => n + money(d.remainingProtectedPrincipalStroops), 0n).toString(), excludedHistorical: "0" }));
    check(cumulative.donations.every(d => d.asset.type === "native" || issuedObligations.some(b =>
      d.asset.type === "issued" && b.code === d.asset.code && b.issuer === d.asset.issuer)));
    const otherRefundOperationIds = cumulative.donations.filter(d => d.operationId !== selected.operationId && money(d.remainingProtectedPrincipalStroops) > 0n).map(d => d.operationId);
    const otherHeldFees = (BigInt(otherRefundOperationIds.length) * money(account.baseFee)).toString();
    const cap = money(commitment.future_refund_fee_stroops), fee = money(account.baseFee);
    check(fee > 0n && cap >= fee);
    // A one-payment future refund; excess selected cap remains earmarked, never released.
    const operating = calculateOperatingBudget({ action: { kind: "unissued_refund", transactionFee: fee.toString() },
      native: { ...account.native, donorLiabilities: nativeDebt, excludedHistorical: "0" }, issuedBalances: account.issuedBalances,
      issuedObligations, approvedTeamCredits: credits.observedCreditStroops, confirmedPoolFeesSpent: context.confirmedPoolFeesSpentStroops,
      otherFutureFees: (money(otherHeldFees) + cap - fee).toString(), baseReserve: account.baseReserve, baseFee: account.baseFee, account: account.account });
    const budget = calculateRefundFeeEarmarkBudget({ kind: "unissued_refund", currentMinimum: operating.currentMinimum,
      selectedRefundFeeCap: cap.toString(), selectedTransactionFee: fee.toString(), allOtherHeldFees: otherHeldFees,
      approvedTeamCredits: credits.observedCreditStroops, confirmedPoolFeesSpent: context.confirmedPoolFeesSpentStroops,
      physicalOperatingCap: operating.physicalCap, baseFee: account.baseFee });
    check(budget.availableOperating === operating.availableOperating && budget.remainingOperating === operating.remainingOperating);
    check(same(await provider.readAccountAtCheckpoint(accountContext), account));
    // Reload ALL observed memberships, including every complete page/credit/claim list.
    for (const entry of membership.values()) await call(entry.name, entry.args);
    const observedAt = now();
    check(account.pool === scope.pool && account.networkPassphrase === Networks.TESTNET && same(account.anchor, creation.anchor) &&
      account.lastModifiedLedger >= proof.ledger && account.lastModifiedLedger <= cp.through_ledger &&
      observedAt - cp.closed_at <= maximumAgeSeconds && cp.closed_at - observedAt <= futureToleranceSeconds &&
      observedAt >= Date.parse(encumbrance.deadline) / 1000);
    const expiresAt = cp.closed_at + maximumAgeSeconds; check(observedAt < expiresAt);
    return snapshot({ kind: "d1_current_remainder_funding_observation" as const, revision: 1 as const,
      executionAuthority: false as const, settlementAuthority: false as const, scope, startedAt, observedAt, expiresAt,
      maximumAgeSeconds, futureToleranceSeconds, accounting: observed, claimSet, credits, creation, account,
      originals, cumulative, selected, otherRefundOperationIds, otherHeldFees, operating, budget,
      membership: [...membership.values()] });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
export type CurrentRemainderFundingObservation = Awaited<ReturnType<typeof observeCurrentRemainderFunding>>;
