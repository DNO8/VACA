import { StrKey } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";

interface AssetKey { code: string; issuer: string }
export interface OperatingBudgetInput {
  action:
    | { kind: "issue"; transactionFee: string; futureRefundFee: string }
    | { kind: "issued_refund" | "unissued_refund"; transactionFee: string };
  native: { balance: string; sellingLiabilities: string; donorLiabilities: string; excludedHistorical: string };
  issuedBalances: (AssetKey & { balance: string; sellingLiabilities: string })[];
  issuedObligations: (AssetKey & { donorLiabilities: string; excludedHistorical: string })[];
  approvedTeamCredits: string;
  confirmedPoolFeesSpent: string;
  /** Already excludes the selected refund's released commitment; never a new discount. */
  otherFutureFees: string;
  baseReserve: string;
  baseFee: string;
  account: { subentry_count: number; num_sponsoring: number; num_sponsored: number };
}
export interface OperatingBudget {
  currentMinimum: string;
  otherFutureFees: string;
  newClaimantReserve: string;
  transactionFee: string;
  newFutureRefundFee: string;
  requiredOperating: string;
  teamCap: string;
  physicalCap: string;
  availableOperating: string;
  remainingOperating: string;
}
const MAX = 9223372036854775807n;
function requireValid(condition: boolean): asserts condition {
  if (!condition) throw new CustodyError("operating_funds_unavailable", 503);
}
function bounded(value: bigint): bigint {
  requireValid(value >= 0n && value <= MAX);
  return value;
}
function stroops(value: unknown, positive = false): bigint {
  requireValid(typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value));
  const result = bounded(BigInt(value));
  requireValid(!positive || result > 0n);
  return result;
}
/** Reject extra keys, inherited fields, accessors, and scalar coercion. */
function shape(value: unknown, keys: string): void {
  requireValid(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireValid(Reflect.ownKeys(value).length === keys.split(",").length);
  requireValid(Object.keys(descriptors).sort().join(",") === keys.split(",").sort().join(","));
  requireValid(Object.values(descriptors).every((d) => "value" in d && d.enumerable === true));
}
function count(value: unknown): bigint {
  requireValid(typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4294967295);
  return BigInt(value);
}
function assetKey(value: AssetKey): string {
  requireValid(typeof value.code === "string" && /^[A-Za-z0-9]{1,12}$/.test(value.code));
  requireValid(typeof value.issuer === "string" && StrKey.isValidEd25519PublicKey(value.issuer));
  return value.code + ":" + value.issuer;
}

/**
 * Pure normalized arithmetic, NOT funding proof, authorization, or runtime readiness.
 * All monetary inputs/outputs are canonical nonnegative int64 stroop strings.
 * The later trusted assembler must derive every input from complete coverage,
 * provenance, current ledger state, and durable fee commitments. See the API doc.
 */
export function calculateOperatingBudget(input: OperatingBudgetInput): OperatingBudget {
  try {
    shape(input, "action,native,issuedBalances,issuedObligations,approvedTeamCredits,confirmedPoolFeesSpent,otherFutureFees,baseReserve,baseFee,account");
    shape(input.native, "balance,sellingLiabilities,donorLiabilities,excludedHistorical");
    shape(input.account, "subentry_count,num_sponsoring,num_sponsored");
    requireValid(input.action !== null && typeof input.action === "object");
    const issue = input.action.kind === "issue";
    shape(input.action, issue ? "kind,transactionFee,futureRefundFee" : "kind,transactionFee");
    requireValid(issue || input.action.kind === "issued_refund" || input.action.kind === "unissued_refund");
    const baseReserve = stroops(input.baseReserve, true), baseFee = stroops(input.baseFee, true);
    const multiplier = 2n + count(input.account.subentry_count) + count(input.account.num_sponsoring) - count(input.account.num_sponsored);
    requireValid(multiplier >= 0n);
    const currentMinimum = bounded(baseReserve * multiplier);
    // CAP-0023: v1 creates TWO claimants, each requiring one base reserve.
    const newClaimantReserve = issue ? bounded(2n * baseReserve) : 0n;
    const transactionFee = stroops(input.action.transactionFee, true);
    requireValid(transactionFee >= (input.action.kind === "issued_refund" ? 2n : 1n) * baseFee);
    const newFutureRefundFee = input.action.kind === "issue" ? stroops(input.action.futureRefundFee, true) : 0n;
    requireValid(!issue || newFutureRefundFee >= 2n * baseFee);
    const otherFutureFees = stroops(input.otherFutureFees);
    const requiredOperating = bounded(currentMinimum + otherFutureFees + newClaimantReserve + transactionFee + newFutureRefundFee);
    const teamCap = bounded(stroops(input.approvedTeamCredits) - stroops(input.confirmedPoolFeesSpent));
    const nativeProtected = bounded(stroops(input.native.sellingLiabilities) + stroops(input.native.donorLiabilities) + stroops(input.native.excludedHistorical));
    const physicalCap = bounded(stroops(input.native.balance) - nativeProtected);

    requireValid(Array.isArray(input.issuedBalances) && Array.isArray(input.issuedObligations));
    const balances = new Map<string, bigint>();
    for (const entry of input.issuedBalances) {
      shape(entry, "code,issuer,balance,sellingLiabilities");
      const key = assetKey(entry);
      requireValid(!balances.has(key));
      balances.set(key, bounded(stroops(entry.balance) - stroops(entry.sellingLiabilities)));
    }
    const obligations = new Set<string>();
    for (const entry of input.issuedObligations) {
      shape(entry, "code,issuer,donorLiabilities,excludedHistorical");
      const key = assetKey(entry);
      requireValid(!obligations.has(key) && balances.has(key));
      obligations.add(key);
      const protectedAmount = bounded(stroops(entry.donorLiabilities) + stroops(entry.excludedHistorical));
      requireValid(balances.get(key)! >= protectedAmount);
    }
    // Even a zero obligation must be explicit; missing facts are not zero liabilities.
    requireValid(balances.size === obligations.size);
    const availableOperating = teamCap < physicalCap ? teamCap : physicalCap;
    requireValid(availableOperating >= requiredOperating);
    return {
      currentMinimum: String(currentMinimum), otherFutureFees: String(otherFutureFees),
      newClaimantReserve: String(newClaimantReserve), transactionFee: String(transactionFee),
      newFutureRefundFee: String(newFutureRefundFee), requiredOperating: String(requiredOperating),
      teamCap: String(teamCap), physicalCap: String(physicalCap), availableOperating: String(availableOperating),
      remainingOperating: String(availableOperating - requiredOperating),
    };
  } catch {
    throw new CustodyError("operating_funds_unavailable", 503);
  }
}
