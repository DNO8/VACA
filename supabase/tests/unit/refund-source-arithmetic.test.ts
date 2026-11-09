// Source definitions only in this incorporation; no runtime or financial proof is claimed.
import { calculateRefundFeeEarmarkBudget, type RefundFeeEarmarkBudgetInput } from "../../functions/d1-custody/refund-fee-earmark-budget.ts";
import { calculateRefundLiquidPrincipal, type RefundLiquidPrincipalInput } from "../../functions/d1-custody/refund-liquid-principal.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { equal, pool, donor } from "../fixtures/initial-financial-authorization.ts";

const balanceId = "00000000" + "a".repeat(64);
const budget = (): RefundFeeEarmarkBudgetInput => ({ kind: "issued_refund", currentMinimum: "100", selectedRefundFeeCap: "300",
  selectedTransactionFee: "200", allOtherHeldFees: "50", approvedTeamCredits: "1000", confirmedPoolFeesSpent: "100",
  physicalOperatingCap: "700", baseFee: "100" });
const principal = (): RefundLiquidPrincipalInput => ({
  donations: [{ operationId: "42949677057", transactionHash: "b".repeat(64), donor, asset: { type: "native" }, amountStroops: "100" }],
  encumbrances: [{ operationId: "42949677057", paymentTransactionHash: "b".repeat(64), donor, asset: { type: "native" },
    amountStroops: "60", claimableBalanceId: balanceId }],
  currentClaimableBalanceIds: [balanceId], native: { balance: "1000", sellingLiabilities: "20", excludedHistorical: "30" },
  issuedBalances: [], issuedExclusions: [],
});
function rejects(call: () => unknown, code: string) {
  let error: unknown;
  try { call(); } catch (e) { error = e; }
  equal(error instanceof CustodyError ? [error.code, error.status, error.message] : error, [code, 503, code]);
}

Deno.test("refund fee arithmetic protects the entire selected cap for both operation counts", () => {
  for (const kind of ["issued_refund", "unissued_refund"] as const) {
    const input = { ...budget(), kind, selectedTransactionFee: kind === "issued_refund" ? "200" : "100" };
    const before = JSON.stringify(input), result = calculateRefundFeeEarmarkBudget(input);
    equal(result, { minimumTransactionFee: input.selectedTransactionFee, protectedSelectedExcess: kind === "issued_refund" ? "100" : "200",
      requiredOperating: "450", teamCap: "900", availableOperating: "700", remainingOperating: "250" });
    equal(JSON.stringify(input), before); equal(Object.isFrozen(result), true);
  }
});
Deno.test("refund fee arithmetic rejects invalid minimum, cap, available capacity and bounded amounts", () => {
  for (const patch of [{ selectedTransactionFee: "199" }, { selectedRefundFeeCap: "199" }, { physicalOperatingCap: "449" },
    { approvedTeamCredits: "100", confirmedPoolFeesSpent: "101" }, { currentMinimum: "9223372036854775807" },
    { baseFee: "0" }, { baseFee: "01" }, { kind: "other" }, { extra: "unexpected" }]) {
    const input = { ...budget(), ...patch } as RefundFeeEarmarkBudgetInput, before = JSON.stringify(input);
    rejects(() => calculateRefundFeeEarmarkBudget(input), "refund_fee_earmark_unavailable"); equal(JSON.stringify(input), before);
  }
});
Deno.test("refund fee arithmetic never invokes caller getters", () => {
  let reads = 0; const input = budget();
  Object.defineProperty(input, "selectedTransactionFee", { enumerable: true, get() { reads++; return "200"; } });
  rejects(() => calculateRefundFeeEarmarkBudget(input), "refund_fee_earmark_unavailable"); equal(reads, 0);
});
Deno.test("liquid principal preserves original gross with or without positive current CB presence", () => {
  for (const present of [true, false]) {
    const input = { ...principal(), currentClaimableBalanceIds: present ? [balanceId] : [] }, before = JSON.stringify(input);
    const result = calculateRefundLiquidPrincipal(input), donation = result.donations[0];
    equal([donation.amountStroops, donation.encumberedStroops, donation.liquidPrincipalStroops], ["100", present ? "60" : "0", present ? "40" : "100"]);
    equal((BigInt(donation.encumberedStroops) + BigInt(donation.liquidPrincipalStroops)).toString(), "100");
    equal([result.nativeLiquidPrincipalStroops, result.physicalOperatingCap, result.issuedLiquidPrincipal], [present ? "40" : "100", present ? "910" : "850", []]);
    equal(JSON.stringify(input), before); equal([Object.isFrozen(result), Object.isFrozen(donation), Object.isFrozen(donation.asset)], [true, true, true]);
  }
});
Deno.test("issued principal protects asset-specific amounts and historical exclusions", () => {
  const base = principal(), asset = { type: "issued" as const, code: "USD", issuer: pool };
  const input: RefundLiquidPrincipalInput = { ...base, donations: base.donations.map(d => ({ ...d, asset })),
    encumbrances: base.encumbrances.map(e => ({ ...e, asset })), issuedBalances: [{ code: "USD", issuer: pool, balance: "150", sellingLiabilities: "10" }],
    issuedExclusions: [{ code: "USD", issuer: pool, excludedHistorical: "10" }] };
  const before = JSON.stringify(input), result = calculateRefundLiquidPrincipal(input);
  equal([result.nativeLiquidPrincipalStroops, result.physicalOperatingCap], ["0", "950"]);
  equal(result.issuedLiquidPrincipal, [{ code: "USD", issuer: pool, amountStroops: "40" }]); equal(JSON.stringify(input), before);
});
Deno.test("liquid principal rejects duplicate presence, foreign binding, excess encumbrance and underfunding without mutation", () => {
  const base = principal();
  for (const patch of [{ currentClaimableBalanceIds: [balanceId, balanceId] }, { currentClaimableBalanceIds: ["00000000" + "c".repeat(64)] },
    { encumbrances: base.encumbrances.map(e => ({ ...e, paymentTransactionHash: "c".repeat(64) })) },
    { encumbrances: base.encumbrances.map(e => ({ ...e, amountStroops: "101" })) },
    { native: { balance: "89", sellingLiabilities: "20", excludedHistorical: "30" } }]) {
    const input = { ...base, ...patch }, before = JSON.stringify(input);
    rejects(() => calculateRefundLiquidPrincipal(input), "refund_liquid_principal_unavailable"); equal(JSON.stringify(input), before);
  }
  let reads = 0; const input = principal();
  Object.defineProperty(input, "native", { enumerable: true, get() { reads++; throw Error("must not run"); } });
  rejects(() => calculateRefundLiquidPrincipal(input), "refund_liquid_principal_unavailable"); equal(reads, 0);
});
