import {
  Account, Asset, Claimant, Keypair, Networks, Operation, TransactionBuilder,
} from "@stellar/stellar-sdk";
import type { Preparation, VerifiedPayment } from "./handler.ts";

export interface IssuanceContext {
  networkPassphrase: string;
  pool: string;
  /** Current pool sequence, not the next transaction sequence. */
  sequence: string;
  /** Total fee in stroops for this one-operation transaction. */
  fee: string;
  /** Explicit whole Unix seconds; no ambient clock is consulted. */
  now: number;
}

function requireValid(condition: boolean): asserts condition {
  if (!condition) throw new Error("invalid_issuance_plan");
}

function address(value: string): void {
  requireValid(typeof value === "string");
  try {
    Keypair.fromPublicKey(value);
  } catch {
    throw new Error("invalid_issuance_plan");
  }
}

function amount(value: string): bigint {
  requireValid(typeof value === "string" && /^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(value));
  const stroops = BigInt(value.replace(".", ""));
  requireValid(stroops > 0n && stroops <= 9223372036854775807n);
  return stroops;
}

function asset(value: VerifiedPayment["asset"]): Asset {
  requireValid(value !== null && typeof value === "object");
  if (value.type === "native") {
    requireValid(Object.keys(value).sort().join(",") === "type");
    return Asset.native();
  }
  requireValid(value.type === "issued" && Object.keys(value).sort().join(",") === "code,issuer,type");
  requireValid(typeof value.code === "string" && /^[A-Za-z0-9]{1,12}$/.test(value.code));
  address(value.issuer);
  return new Asset(value.code, value.issuer);
}

/**
 * Pure, unsigned Testnet plan from the immutable, successfully persisted Preparation.
 * The caller must load that trusted preparation; this is not a public receipt verifier,
 * an issuance ledger, a sequence reservation, or an authorization to sign/submit.
 */
export function planIssuance(
  prepared: Preparation,
  context: IssuanceContext,
): { unsignedXdr: string } {
  requireValid(context.networkPassphrase === Networks.TESTNET);
  address(context.pool);
  address(prepared.payment.pool);
  address(prepared.payment.donor);
  address(prepared.request.donor);
  address(prepared.request.beneficiary);
  requireValid(
    prepared.request.version === 1 && context.pool === prepared.payment.pool &&
      prepared.request.donor === prepared.payment.donor &&
      prepared.request.beneficiary !== context.pool,
  );
  requireValid(
    typeof context.sequence === "string" && /^(0|[1-9][0-9]{0,18})$/.test(context.sequence) &&
      BigInt(context.sequence) < 9223372036854775807n,
  );
  requireValid(
    typeof context.fee === "string" && /^[1-9][0-9]{0,9}$/.test(context.fee) &&
      BigInt(context.fee) >= 100n && BigInt(context.fee) <= 4294967295n,
  );
  requireValid(amount(prepared.request.amount) <= amount(prepared.payment.amount));
  const allocationAsset = asset(prepared.request.asset);
  requireValid(allocationAsset.equals(asset(prepared.payment.asset)));
  requireValid(
    Number.isSafeInteger(prepared.confirmed_at) && prepared.confirmed_at >= 0 &&
      Number.isSafeInteger(context.now) && context.now >= prepared.confirmed_at &&
      typeof prepared.request.deadline === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(prepared.request.deadline),
  );
  const expiry = Date.parse(prepared.request.deadline) / 1000;
  requireValid(
    Number.isSafeInteger(expiry) && expiry === prepared.confirmed_at + 300 &&
      new Date(expiry * 1000).toISOString().replace(".000Z", "Z") === prepared.request.deadline,
  );
  if (context.now >= expiry) throw new Error("issuance_window_exhausted");

  // SDK predicates take absolute UNIX SECONDS, not milliseconds. Ledger maxTime is
  // inclusive, so subtract one second to forbid creation at/after the claim cutoff.
  const beforeExpiry = Claimant.predicateBeforeAbsoluteTime(String(expiry));
  const transaction = new TransactionBuilder(new Account(context.pool, context.sequence), {
    fee: context.fee,
    networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: context.now, maxTime: expiry - 1 },
  }).addOperation(Operation.createClaimableBalance({
    asset: allocationAsset,
    amount: prepared.request.amount,
    claimants: [
      new Claimant(prepared.request.beneficiary, beforeExpiry),
      new Claimant(context.pool, Claimant.predicateNot(beforeExpiry)),
    ],
  })).build();
  return { unsignedXdr: transaction.toXDR() };
}
