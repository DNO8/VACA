import { Account, Asset, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError, type Preparation } from "./handler.ts";
import { observeIssuanceAccountingContext } from "./issuance-accounting-context.ts";

type Client = Parameters<typeof observeIssuanceAccountingContext>[0];
type Scope = Parameters<typeof observeIssuanceAccountingContext>[1];
export interface RecoveryRefundConfiguration {
  readonly sourceSequence: string;
  readonly feePerOperationStroops: string;
  readonly now: number;
  readonly validUntil: number;
}
export interface RecoveryRefundPlan {
  readonly kind: "d1_recovery_refund_plan";
  readonly revision: 1;
  readonly namespace: string;
  readonly requestId: string;
  readonly network: "TESTNET";
  readonly source: string;
  readonly donor: string;
  readonly asset: Readonly<Preparation["payment"]["asset"]>;
  readonly grossAmountStroops: string;
  readonly issuedStroops: string;
  readonly unissuedStroops: string;
  readonly claimableBalanceId: string | null;
  readonly operationCount: 1 | 2;
  readonly feeStroops: string;
  readonly sourceSequence: string;
  readonly transactionSequence: string;
  readonly deadline: string;
  readonly validUntil: number;
  readonly unsignedXdr: string;
  readonly transactionHash: string;
}
const unavailable = () => new CustodyError("recovery_refund_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function snapshot(configuration: RecoveryRefundConfiguration): RecoveryRefundConfiguration {
  check(configuration !== null && typeof configuration === "object" && Object.getPrototypeOf(configuration) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(configuration);
  check(Reflect.ownKeys(configuration).length === 4 && Object.keys(descriptors).sort().join(",") === "feePerOperationStroops,now,sourceSequence,validUntil");
  check(Object.values(descriptors).every(d => "value" in d && d.enumerable));
  const sourceSequence: unknown = descriptors.sourceSequence.value, feePerOperationStroops: unknown = descriptors.feePerOperationStroops.value;
  const now: unknown = descriptors.now.value, validUntil: unknown = descriptors.validUntil.value;
  check(typeof sourceSequence === "string" && /^[1-9][0-9]{0,18}$/.test(sourceSequence) && BigInt(sourceSequence) < 9223372036854775807n);
  check(typeof feePerOperationStroops === "string" && /^[1-9][0-9]{0,9}$/.test(feePerOperationStroops) && BigInt(feePerOperationStroops) <= 4294967295n);
  check(typeof now === "number" && Number.isSafeInteger(now) && now >= 0);
  check(typeof validUntil === "number" && Number.isSafeInteger(validUntil) && validUntil > now);
  return { sourceSequence, feePerOperationStroops, now, validUntil };
}
function sameAsset(a: Readonly<Preparation["payment"]["asset"]>, b: Readonly<Preparation["payment"]["asset"]>): boolean {
  return a.type === "native" ? b.type === "native" : b.type === "issued" && a.code === b.code && a.issuer === b.issuer;
}
/** Internal unsigned construction only, not refund eligibility or authorization.
 * The accepted observer owns historical SDK validation and current DB admin checks.
 * No account observation, signer, write, release, retry or submission occurs here.
 */
export async function planRecoveryRefund(
  client: Client, scope: Scope, configuration: RecoveryRefundConfiguration,
): Promise<RecoveryRefundPlan> {
  let denied = false;
  try {
    const cfg = snapshot(configuration);
    const context = await observeIssuanceAccountingContext(client, scope).catch(error => {
      // Only this accepted observer's denial can become an admin response.
      denied = error instanceof CustodyError && error.status === 403 && error.code === "unauthorized_admin_wallet" && error.message === error.code;
      throw unavailable();
    });
    const { accounting, included, held } = context, owner = held.activeOwner;
    const intent = owner.intent as Record<string, unknown>;
    const prepared = intent.preparation_input as Preparation;
    const { payment, request } = prepared;
    check(typeof owner.namespace === "string" && typeof owner.pool === "string" && typeof owner.request_id === "string");
    const namespace = owner.namespace, source = owner.pool, requestId = owner.request_id;
    check(prepared.request_id === requestId && payment.pool === source && request.donor === payment.donor);
    check(accounting.unmatchedActivity.length === 0 && cfg.sourceSequence === included.sequence);
    const matches = accounting.donations.filter(d => d.operationId === payment.operation_id && d.transactionHash === payment.transaction_hash);
    check(matches.length === 1);
    const donation = matches[0];
    check(donation.donor === payment.donor && sameAsset(donation.asset, payment.asset) && sameAsset(donation.asset, request.asset));
    const gross = BigInt(donation.amountStroops), issued = BigInt(donation.issuedStroops), unissued = BigInt(donation.unissuedStroops);
    check(gross > 0n && gross <= 9223372036854775807n && issued >= 0n && unissued >= 0n && gross === issued + unissued);
    check(BigInt(payment.amount.replace(".", "")) === gross && donation.confirmedAt === prepared.confirmed_at);
    const deadline = request.deadline, cutoff = Date.parse(deadline) / 1000;
    check(Number.isSafeInteger(cutoff) && cutoff === prepared.confirmed_at + 300 && cfg.now >= cutoff && held.commitment.deadline === deadline);
    const claimableBalanceId = included.claimableBalanceId;
    if (claimableBalanceId !== null) {
      check(/^00000000[0-9a-f]{64}$/.test(claimableBalanceId) && accounting.encumbrances.length === 1 && accounting.failedIssuances.length === 0);
      const selected = accounting.encumbrances[0];
      check(selected.requestId === requestId && selected.operationId === donation.operationId && selected.paymentTransactionHash === donation.transactionHash &&
        selected.donor === donation.donor && selected.beneficiary === request.beneficiary && sameAsset(selected.asset, donation.asset) &&
        selected.claimableBalanceId === claimableBalanceId && selected.deadline === deadline && selected.sequence === included.sequence &&
        BigInt(selected.amountStroops) === issued && issued === BigInt(request.amount.replace(".", "")) && issued > 0n);
    } else {
      check(accounting.encumbrances.length === 0 && accounting.failedIssuances.length === 1 && issued === 0n && unissued === gross);
      const failed = accounting.failedIssuances[0];
      check(failed.requestId === requestId && failed.sequence === included.sequence);
    }
    const operationCount = claimableBalanceId === null ? 1 : 2;
    const totalFee = BigInt(cfg.feePerOperationStroops) * BigInt(operationCount);
    check(typeof held.commitment.future_refund_fee_stroops === "string" && totalFee <= 4294967295n && totalFee <= BigInt(held.commitment.future_refund_fee_stroops));
    const asset: RecoveryRefundPlan["asset"] = Object.freeze(donation.asset.type === "native" ? { type: "native" as const } :
      { type: "issued" as const, code: donation.asset.code, issuer: donation.asset.issuer });
    const sdkAsset = asset.type === "native" ? Asset.native() : new Asset(asset.code, asset.issuer);
    const amount = `${gross / 10000000n}.${(gross % 10000000n).toString().padStart(7, "0")}`;
    const builder = new TransactionBuilder(new Account(source, cfg.sourceSequence), { fee: cfg.feePerOperationStroops,
      networkPassphrase: Networks.TESTNET, timebounds: { minTime: cutoff, maxTime: cfg.validUntil } });
    if (claimableBalanceId !== null) builder.addOperation(Operation.claimClaimableBalance({ balanceId: claimableBalanceId }));
    builder.addOperation(Operation.payment({ destination: donation.donor, asset: sdkAsset, amount }));
    const transaction = builder.build();
    check(transaction.signatures.length === 0 && transaction.fee === totalFee.toString() && transaction.sequence === (BigInt(cfg.sourceSequence) + 1n).toString());
    return Object.freeze({ kind: "d1_recovery_refund_plan", revision: 1, namespace, requestId, network: "TESTNET", source,
      donor: donation.donor, asset, grossAmountStroops: gross.toString(), issuedStroops: issued.toString(), unissuedStroops: unissued.toString(),
      claimableBalanceId, operationCount, feeStroops: transaction.fee, sourceSequence: cfg.sourceSequence, transactionSequence: transaction.sequence,
      deadline, validUntil: cfg.validUntil, unsignedXdr: transaction.toXDR(), transactionHash: transaction.hash().toString("hex") });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
