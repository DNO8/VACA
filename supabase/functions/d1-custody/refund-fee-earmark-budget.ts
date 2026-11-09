import { CustodyError } from "./handler.ts";

export interface RefundFeeEarmarkBudgetInput {
  readonly kind: "issued_refund" | "unissued_refund";
  readonly currentMinimum: string;
  readonly selectedRefundFeeCap: string;
  readonly selectedTransactionFee: string;
  readonly allOtherHeldFees: string;
  readonly approvedTeamCredits: string;
  readonly confirmedPoolFeesSpent: string;
  readonly physicalOperatingCap: string;
  readonly baseFee: string;
}

export interface RefundFeeEarmarkBudget {
  readonly minimumTransactionFee: string;
  readonly protectedSelectedExcess: string;
  readonly requiredOperating: string;
  readonly teamCap: string;
  readonly availableOperating: string;
  readonly remainingOperating: string;
}

const MAX = 9223372036854775807n;
const fields = ["kind", "currentMinimum", "selectedRefundFeeCap", "selectedTransactionFee", "allOtherHeldFees",
  "approvedTeamCredits", "confirmedPoolFeesSpent", "physicalOperatingCap", "baseFee"] as const;
function valid(condition: unknown): asserts condition {
  if (!condition) throw new CustodyError("refund_fee_earmark_unavailable", 503);
}
function bounded(value: bigint): bigint {
  valid(value >= 0n && value <= MAX); return value;
}
function stroops(value: unknown): bigint {
  valid(typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value));
  return bounded(BigInt(value));
}

/** Pure normalized pre-execution arithmetic, not evidence or spending authority.
 * The full selected earmark remains protected; its transaction fee is not added twice.
 * Physical cap exclusions and complete receipt membership belong to the assembler. */
export function calculateRefundFeeEarmarkBudget(
  input: RefundFeeEarmarkBudgetInput,
): Readonly<RefundFeeEarmarkBudget> {
  try {
    valid(input !== null && typeof input === "object" && Object.getPrototypeOf(input) === Object.prototype);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    valid(Reflect.ownKeys(input).length === fields.length);
    valid(Object.keys(descriptors).sort().join(",") === [...fields].sort().join(","));
    valid(Object.values(descriptors).every(d => "value" in d && d.enumerable === true));
    // Read only validated descriptor values, never caller property accessors/hooks.
    const data = Object.fromEntries(fields.map(key => [key, descriptors[key].value]));
    valid(data.kind === "issued_refund" || data.kind === "unissued_refund");
    const minimum = stroops(data.currentMinimum), cap = stroops(data.selectedRefundFeeCap);
    const fee = stroops(data.selectedTransactionFee), other = stroops(data.allOtherHeldFees);
    const credits = stroops(data.approvedTeamCredits), spent = stroops(data.confirmedPoolFeesSpent);
    const physical = stroops(data.physicalOperatingCap), baseFee = stroops(data.baseFee);
    valid(baseFee > 0n);
    const minimumTransactionFee = bounded(baseFee * (data.kind === "issued_refund" ? 2n : 1n));
    valid(fee >= minimumTransactionFee && fee <= cap);
    const requiredOperating = bounded(minimum + other + cap);
    const protectedSelectedExcess = bounded(cap - fee), teamCap = bounded(credits - spent);
    const availableOperating = teamCap < physical ? teamCap : physical;
    valid(availableOperating >= requiredOperating);
    return Object.freeze({
      minimumTransactionFee: minimumTransactionFee.toString(), protectedSelectedExcess: protectedSelectedExcess.toString(),
      requiredOperating: requiredOperating.toString(), teamCap: teamCap.toString(), availableOperating: availableOperating.toString(),
      remainingOperating: bounded(availableOperating - requiredOperating).toString(),
    });
  } catch {
    throw new CustodyError("refund_fee_earmark_unavailable", 503);
  }
}
