import { calculateOperatingBudget, type OperatingBudgetInput } from "../../functions/d1-custody/operating-budget.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { StrKey } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";

const issuer = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const asset = { code: "USD", issuer };
function input(): OperatingBudgetInput {
  return {
    action: { kind: "issue", transactionFee: "100", futureRefundFee: "200" },
    native: { balance: "10000", sellingLiabilities: "0", donorLiabilities: "0", excludedHistorical: "0" },
    issuedBalances: [], issuedObligations: [],
    approvedTeamCredits: "10000", confirmedPoolFeesSpent: "0", otherFutureFees: "0",
    baseReserve: "1000", baseFee: "100",
    account: { subentry_count: 0, num_sponsoring: 0, num_sponsored: 0 },
  };
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify({ actual, expected }));
}
function reject(value: unknown) {
  const before = JSON.stringify(value);
  let error: unknown;
  try { calculateOperatingBudget(value as OperatingBudgetInput); } catch (e) { error = e; }
  equal(error instanceof CustodyError, true);
  equal([(error as CustodyError).code, (error as CustodyError).message, (error as CustodyError).status],
    ["operating_funds_unavailable", "operating_funds_unavailable", 503]);
  equal(JSON.stringify(value), before);
}
Deno.test("operating budget returns only exact strings and leaves input unchanged", () => {
  const v = input(), before = JSON.stringify(v);
  equal(calculateOperatingBudget(v), {
    currentMinimum: "2000", otherFutureFees: "0", newClaimantReserve: "2000", transactionFee: "100",
    newFutureRefundFee: "200", requiredOperating: "4300", teamCap: "10000", physicalCap: "10000",
    availableOperating: "10000", remainingOperating: "5700",
  });
  equal(JSON.stringify(v), before);
});
Deno.test("team and physical caps independently enforce exact and one-stroop-short boundaries", () => {
  for (const cap of ["team", "physical"]) {
    const v = input();
    v.confirmedPoolFeesSpent = "500";
    if (cap === "team") v.approvedTeamCredits = "4800";
    else v.native.balance = "4300";
    equal(calculateOperatingBudget(v).availableOperating, "4300");
    equal(calculateOperatingBudget(v).remainingOperating, "0");
    if (cap === "team") v.approvedTeamCredits = "4799";
    else v.native.balance = "4299";
    reject(v);
  }
  const v = input(); v.approvedTeamCredits = "499"; v.confirmedPoolFeesSpent = "500"; reject(v);
});
Deno.test("native donation growth and historical funds never create operating credit", () => {
  const v = input();
  v.native = { balance: "15300", sellingLiabilities: "1000", donorLiabilities: "6000", excludedHistorical: "4000" };
  equal(calculateOperatingBudget(v).physicalCap, "4300");
  v.native.balance = "16300"; v.native.donorLiabilities = "7000";
  equal(calculateOperatingBudget(v).physicalCap, "4300");
  v.native.excludedHistorical = "4001"; reject(v);
  v.native.balance = "9223372036854775807"; v.approvedTeamCredits = "4299"; reject(v);
});
Deno.test("two v1 claimant reserves are additional to the sponsorship-adjusted current minimum", () => {
  const v = input();
  v.account = { subentry_count: 3, num_sponsoring: 2, num_sponsored: 4 };
  const r = calculateOperatingBudget(v);
  equal([r.currentMinimum, r.newClaimantReserve, r.requiredOperating], ["3000", "2000", "5300"]);
  v.account = { subentry_count: 0, num_sponsoring: 0, num_sponsored: 2 };
  equal(calculateOperatingBudget(v).currentMinimum, "0");
  v.account.num_sponsored = 3; reject(v);
});
Deno.test("action fees and future commitments differ without refund reserve discounts", () => {
  for (const kind of ["issue", "issued_refund", "unissued_refund"] as const) {
    const v = input(); v.otherFutureFees = "700";
    v.action = kind === "issue" ? { kind, transactionFee: "100", futureRefundFee: "200" } :
      { kind, transactionFee: kind === "issued_refund" ? "200" : "100" };
    const r = calculateOperatingBudget(v);
    equal([r.otherFutureFees, r.newClaimantReserve, r.newFutureRefundFee, r.requiredOperating],
      kind === "issue" ? ["700", "2000", "200", "5000"] :
        ["700", "0", "0", kind === "issued_refund" ? "2900" : "2800"]);
    v.action.transactionFee = kind === "issued_refund" ? "199" : "99"; reject(v);
  }
  const v = input(); v.action = { kind: "issue", transactionFee: "100", futureRefundFee: "199" }; reject(v);
  v.action = { kind: "issue", transactionFee: "300", futureRefundFee: "400" };
  equal(calculateOperatingBudget(v).requiredOperating, "4700");
});
Deno.test("issued assets protect every donor and historical obligation by exact code and issuer", () => {
  const v = input();
  v.issuedBalances = [{ ...asset, balance: "900", sellingLiabilities: "100" }];
  v.issuedObligations = [{ ...asset, donorLiabilities: "500", excludedHistorical: "300" }];
  equal(calculateOperatingBudget(v).availableOperating, "10000");
  v.issuedBalances[0].balance = "899"; reject(v);
  v.issuedBalances[0].balance = "9223372036854775807";
  v.approvedTeamCredits = "4299"; reject(v);
  v.approvedTeamCredits = "10000";
  for (const code of ["usd", "US", "USD "]) {
    const bad = structuredClone(v); bad.issuedBalances[0].code = code; reject(bad);
  }
  const bad = structuredClone(v); bad.issuedBalances = []; reject(bad);
  const missing = structuredClone(v); missing.issuedObligations = []; reject(missing);
  const alias = structuredClone(v);
  alias.issuedBalances[0].issuer = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1)); reject(alias);
  const two = structuredClone(v);
  two.issuedBalances.push({ code: "EUR", issuer, balance: "3", sellingLiabilities: "1" });
  two.issuedObligations.push({ code: "EUR", issuer, donorLiabilities: "1", excludedHistorical: "1" });
  equal(calculateOperatingBudget(two).physicalCap, "10000");
  two.issuedObligations[1].excludedHistorical = "2"; reject(two);
  for (const field of ["issuedBalances", "issuedObligations"] as const) {
    const duplicate = structuredClone(v); duplicate[field].push(duplicate[field][0] as never); reject(duplicate);
  }
});
Deno.test("invalid, overflowing, noncanonical monetary values and counts are sanitized without mutation", () => {
  for (const bad of [0, 1n, null, true, {}, "", "01", "+1", "-1", "1.0", " 1", "1e3", "9223372036854775808"]) {
    const v = input(); (v as unknown as Record<string, unknown>).approvedTeamCredits = bad;
    // BigInt is deliberately not JSON data; compare it separately through a wrapper.
    if (typeof bad === "bigint") {
      let error; try { calculateOperatingBudget(v); } catch (e) { error = e; }
      equal(error instanceof CustodyError, true); equal((error as CustodyError).message, "operating_funds_unavailable");
      equal(v.approvedTeamCredits === (bad as unknown), true);
    } else reject(v);
  }
  for (const field of ["baseReserve", "baseFee"] as const) { const v = input(); v[field] = "0"; reject(v); }
  for (const bad of [-1, 0.5, "0", Number.MAX_SAFE_INTEGER + 1, 4294967296]) {
    const v = input(); v.account.subentry_count = bad as number; reject(v);
  }
  for (const field of ["balance", "sellingLiabilities", "donorLiabilities", "excludedHistorical"] as const) {
    const v = input(); v.native[field] = "01"; reject(v);
  }
  for (const field of ["num_sponsoring", "num_sponsored"] as const) {
    const v = input(); v.account[field] = -1; reject(v);
  }
  const invalidIssuer = input();
  invalidIssuer.issuedBalances = [{ code: "USD", issuer: "bad", balance: "0", sellingLiabilities: "0" }];
  reject(invalidIssuer);
  const zeroFee = input(); zeroFee.action.transactionFee = "0"; reject(zeroFee);
  const overflow = input(); overflow.baseReserve = "9223372036854775807"; reject(overflow);
  const sum = input(); sum.otherFutureFees = "9223372036854775807"; reject(sum);
  for (const value of [null, [], { ...input(), extra: true }, Object.create(input()),
    { ...input(), action: { kind: "unissued_refund", transactionFee: "100", futureRefundFee: "0" } }]) reject(value);
});
