import { Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { observeSavedRefundCreation, type SavedRefundCreationObservation } from "./refund-creation-observation.ts";
import { validateRefundAccountBinding } from "./refund-account-observation.ts";
import { calculateRefundLiquidPrincipal, type RefundLiquidPrincipal } from "./refund-liquid-principal.ts";
import { calculateRefundFeeEarmarkBudget, type RefundFeeEarmarkBudget } from "./refund-fee-earmark-budget.ts";

type Client = Parameters<typeof observeSavedRefundCreation>[0];
type Scope = Parameters<typeof observeSavedRefundCreation>[1];
type Options = Parameters<typeof observeSavedRefundCreation>[2];
export interface SavedRefundFundingObservation {
  readonly kind: "d1_saved_refund_funding_observation";
  readonly revision: 1;
  readonly creationObservation: SavedRefundCreationObservation;
  readonly principal: RefundLiquidPrincipal;
  readonly budget: Readonly<RefundFeeEarmarkBudget>;
  readonly otherUnissuedRefundOperationIds: readonly string[];
  readonly otherUnissuedRefundFeeStroops: string;
  readonly observedAt: number;
}
const unavailable = () => new CustodyError("refund_funding_observation_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** UNVERIFIED source composition, not durable financial authorization.
 * Calls the real observers; callers cannot supply an approved accounting DTO.
 */
export async function observeSavedRefundFunding(client: Client, scope: Scope, options: Options): Promise<SavedRefundFundingObservation> {
  let denied = false;
  try {
    check(options !== null && typeof options === "object" && Object.getPrototypeOf(options) === Object.prototype);
    const descriptors = Object.getOwnPropertyDescriptors(options), keys = Reflect.ownKeys(options);
    check(keys.every(k => typeof k === "string" && "value" in descriptors[k] && descriptors[k].enumerable));
    check(["now", "maximumAgeSeconds", "futureToleranceSeconds"].every(k => Object.hasOwn(descriptors, k)) &&
      keys.length === 3 + (Object.hasOwn(descriptors, "source") ? 1 : 0));
    const now = descriptors.now.value, maximumAgeSeconds = descriptors.maximumAgeSeconds.value;
    const futureToleranceSeconds = descriptors.futureToleranceSeconds.value;
    check(typeof now === "function");
    check(typeof maximumAgeSeconds === "number" && Number.isSafeInteger(maximumAgeSeconds) && maximumAgeSeconds >= 1 && maximumAgeSeconds <= 30);
    check(typeof futureToleranceSeconds === "number" && Number.isSafeInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    let evidence: SavedRefundCreationObservation;
    // T4 captures all remaining inputs/methods before its first await. Its output is frozen.
    try { evidence = await observeSavedRefundCreation(client, scope, options); }
    catch (error) {
      denied = error instanceof CustodyError && error.status === 403 &&
        error.code === "unauthorized_admin_wallet" && error.message === error.code;
      throw error;
    }
    const observation = evidence.observation, { account, candidate, accounting } = observation;
    const projection = accounting.accounting;
    check(projection.unmatchedActivity.length === 0);
    // The genuine T3 observer validates complete credit membership and its joined history.
    const approvedTeamCredits = projection.original.observedOperatingCreditStroops;
    const commitment = object(accounting.held.commitment);
    const prepared = object(object(object(commitment.reservation).intent).preparation_input);
    const payment = object(prepared.payment), paymentAsset = object(payment.asset);
    const sameAsset = (a: typeof projection.donations[number]["asset"]) => a.type === paymentAsset.type &&
      (a.type === "native" || (a.code === paymentAsset.code && a.issuer === paymentAsset.issuer));
    check(typeof payment.amount === "string" && /^(0|[1-9][0-9]*)\.[0-9]{7}$/.test(payment.amount));
    const gross = BigInt(payment.amount.replace(".", "")).toString();
    const selectedDonation = projection.donations.find(d => d.operationId === payment.operation_id &&
      d.transactionHash === payment.transaction_hash && d.donor === payment.donor && sameAsset(d.asset) &&
      d.amountStroops === gross && d.confirmedAt === prepared.confirmed_at);
    check(selectedDonation !== undefined);
    const tx = TransactionBuilder.fromXDR(candidate.unsigned_xdr, Networks.TESTNET);
    check(tx instanceof Transaction && tx.signatures.length === 0 && tx.toXDR() === candidate.unsigned_xdr &&
      tx.source === candidate.pool && tx.sequence === candidate.transaction_sequence && tx.hash().toString("hex") === candidate.transaction_hash);
    const issued = observation.claimableBalance !== null;
    check(tx.operations.length === (issued ? 2 : 1));
    // Current-incarnation creation plus complete, explained history precede these explicit zeros.
    const principal = calculateRefundLiquidPrincipal({
      donations: projection.donations.map(d => ({ operationId: d.operationId, transactionHash: d.transactionHash,
        donor: d.donor, asset: d.asset, amountStroops: d.amountStroops })),
      encumbrances: projection.encumbrances.map(e => ({ operationId: e.operationId, paymentTransactionHash: e.paymentTransactionHash,
        donor: e.donor, asset: e.asset, amountStroops: e.amountStroops, claimableBalanceId: e.claimableBalanceId })),
      currentClaimableBalanceIds: observation.claimableBalance === null ? [] : [observation.claimableBalance.claimableBalanceId],
      native: { ...account.native, excludedHistorical: "0" },
      issuedBalances: account.issuedBalances,
      issuedExclusions: account.issuedBalances.map(a => ({ code: a.code, issuer: a.issuer, excludedHistorical: "0" })),
    });
    // The selected gross refund already includes its unissued remainder in the same payment.
    const otherUnissuedRefundOperationIds = projection.donations.filter(d =>
      d.operationId !== selectedDonation.operationId && BigInt(d.unissuedStroops) > 0n).map(d => d.operationId);
    const otherUnissuedRefundFeeStroops = (BigInt(otherUnissuedRefundOperationIds.length) * BigInt(account.baseFee)).toString();
    const multiplier = 2n + BigInt(account.account.subentry_count) + BigInt(account.account.num_sponsoring) - BigInt(account.account.num_sponsored);
    check(multiplier >= 0n && typeof commitment.future_refund_fee_stroops === "string");
    // T3's genuine 027 adapter requires the COMPLETE lookup list to equal [selected].
    // Multiple commitments fail closed there. No zero is inferred from the 033 owner.
    const budget = calculateRefundFeeEarmarkBudget({ kind: issued ? "issued_refund" : "unissued_refund",
      currentMinimum: (BigInt(account.baseReserve) * multiplier).toString(),
      selectedRefundFeeCap: commitment.future_refund_fee_stroops, selectedTransactionFee: tx.fee,
      allOtherHeldFees: otherUnissuedRefundFeeStroops, approvedTeamCredits,
      confirmedPoolFeesSpent: accounting.confirmedPoolFeesSpentStroops,
      physicalOperatingCap: principal.physicalOperatingCap, baseFee: account.baseFee });
    const observedAt = Reflect.apply(now, options, []);
    check(typeof observedAt === "number" && Number.isSafeInteger(observedAt) && observedAt >= evidence.observedAt);
    validateRefundAccountBinding(candidate, observation.history.state, account,
      { startedAt: evidence.observedAt, observedAt, maximumAgeSeconds, futureToleranceSeconds });
    return freeze({ kind: "d1_saved_refund_funding_observation" as const, revision: 1 as const,
      creationObservation: evidence, principal, budget, otherUnissuedRefundOperationIds, otherUnissuedRefundFeeStroops, observedAt });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
