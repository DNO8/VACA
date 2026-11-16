import { validateDonorCapturedAllocations } from "../../functions/d1-custody/donor-allocation-projection.ts";
import { validateDonorCapturedHistory, type CanonicalOwnedCapture } from "../../functions/d1-custody/donor-captured-history.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { captured, equal, donor, admin, beneficiary, requestId, closedAt } from "../fixtures/donor-allocation.ts";

type Row = CanonicalOwnedCapture["allocations"][number];
function json(row: object, key: string, change: (v: any) => void) {
  const r = row as Record<string, string>, v = JSON.parse(r[key]); change(v); r[key] = JSON.stringify(v);
}
function rejected(capture: unknown, command: ReturnType<typeof captured>["command"]) {
  let error: unknown;
  try { validateDonorCapturedAllocations(capture, command); } catch (e) { error = e; }
  if (!(error instanceof CustodyError)) throw Error("expected CustodyError");
  equal([error.status, error.code, error.message], [503, "donor_payment_unavailable", "donor_payment_unavailable"]);
}
function frozen(v: unknown) {
  if (v && typeof v === "object") { equal(Object.isFrozen(v), true); Object.values(v).forEach(frozen); }
}
for (const issued of [false, true]) Deno.test(`SDK ${issued ? "issued" : "native"} preserves mixed 1:N allocations and uncertified descendants`, () => {
  const { capture, command } = captured(issued, ["0.0000001", "1.0000000", "8.9999999"]);
  // Deliberately not valid issuance evidence: retention must not certify it.
  capture.allocations[1].d1_issuance_outcomes = { request_id: requestId(2), attempt_id: "unverified", receipt: '{"untrusted":true}' };
  const before = JSON.stringify(capture), result = validateDonorCapturedAllocations(capture, command);
  equal(result.allocations.map(a => [a.requestId, a.beneficiary, a.amount]),
    ["0.0000001", "1.0000000", "8.9999999"].map((a, i) => [requestId(i + 1), beneficiary, a]));
  equal(result.payment.grossAmount, "10.0000000"); equal(result.payment.confirmedAt, closedAt);
  equal(result.payment.deadline, "2026-10-27T12:05:00Z"); equal(result.payment.asset, JSON.parse(capture.payment.payment).asset);
  equal(result.allocations.map(a => a.raw), capture.allocations);
  equal(result.allocations[0].preparation, JSON.parse(capture.allocations[0].d1_preparations!.input));
  equal(Object.hasOwn(result.allocations[1], "issuance"), false);
  equal(JSON.stringify(capture), before); frozen(result);
  capture.allocations[0].donation_allocations.allocated_stroops = "2";
  equal(result.allocations[0].raw.donation_allocations.allocated_stroops, "1");
});
Deno.test("empty complete allocation set is valid only at zero", () => {
  const { capture, command } = captured(false, []);
  equal(validateDonorCapturedAllocations(capture, command).allocations, []);
  capture.payment.allocated_stroops = "1"; rejected(capture, command);
});
const cases: [string, (r: Row, c: CanonicalOwnedCapture) => void][] = [
  ["missing request", r => { r.release_requests = null; }],
  ["missing preparation", r => { r.d1_preparations = null; }],
  ["request ID", r => { r.release_requests!.request_id = requestId(9); }],
  ["preparation ID", r => { r.d1_preparations!.request_id = requestId(9); }],
  ["namespace", r => { r.d1_preparations!.namespace = requestId(9); }],
  ["allocation hash", r => { r.donation_allocations.transaction_hash = "b".repeat(64); }],
  ["allocation operation", r => { r.donation_allocations.operation_id = "1"; }],
  ["allocation authorizer", r => { r.donation_allocations.authorized_by = donor; }],
  ["request authorizer", r => { r.release_requests!.authorized_by = donor; }],
  ["request state", r => { r.release_requests!.state = "issued"; }],
  ["row amount", r => { r.donation_allocations.allocated_stroops = "2"; }],
  ["int64 overflow", r => { r.donation_allocations.allocated_stroops = "9223372036854775808"; }],
  ["counter", (_, c) => { c.payment.allocated_stroops = "2"; }],
  ["counter greater than gross", (_, c) => { c.payment.allocated_stroops = "100000001"; }],
  ["valid but different incident", r => {
    json(r.release_requests!, "request", v => { v.incident_id = "incident-2"; });
    json(r.d1_preparations!, "input", v => { v.request.incident_id = "incident-2"; });
    json(r.d1_preparations!, "receipt", v => { v.allocation.reservation.request.incident_id = "incident-2"; });
  }],
  ["reserved timestamp", r => { r.release_requests!.reserved_at = "2026-02-30T12:00:01+00:00"; }],
  ["allocated timestamp", r => { r.donation_allocations.allocated_at = "garbage"; }],
  ["request JSON mismatch", r => json(r.release_requests!, "request", v => { v.beneficiary = donor; })],
  ["placeholder allocation receipt", r => json(r.d1_preparations!, "receipt", v => { v.allocation = {}; })],
  ["receipt revision", r => json(r.d1_preparations!, "receipt", v => { v.revision = 2; })],
  ["receipt ID", r => json(r.d1_preparations!, "receipt", v => { v.request_id = requestId(9); })],
  ["receipt payment", r => json(r.d1_preparations!, "receipt", v => { v.allocation.payment.donor = admin; })],
  ["receipt amount", r => json(r.d1_preparations!, "receipt", v => { v.allocation.allocated_amount = "2.0000000"; })],
  ["receipt reservation", r => json(r.d1_preparations!, "receipt", v => { v.allocation.reservation.authorized_by = donor; })],
  ["receipt time", r => json(r.d1_preparations!, "receipt", v => { v.allocation.allocated_at = "2026-10-27T12:00:02.123Z"; })],
  ["duplicate JSON key", r => { r.d1_preparations!.input = r.d1_preparations!.input.replace('"ledger":10', '"ledger":10,"ledger":10'); }],
  ["unsafe fractional JSON number", r => { r.d1_preparations!.input = r.d1_preparations!.input.replace('"ledger":10', '"ledger":10.000000000000000001'); }],
  ["unsafe JSON integer", r => { r.d1_preparations!.input = r.d1_preparations!.input.replace('"ledger":10', '"ledger":9007199254740993'); }],
];
for (const [field, value] of Object.entries({ request_id: requestId(9), authorized_by: donor, confirmed_at: closedAt + 1,
  ledger: 9, memo_hash: "b".repeat(64), extra: true })) {
  cases.push(["input " + field, r => json(r.d1_preparations!, "input", v => { v[field] = value; })]);
}
for (const [field, value] of Object.entries({ transaction_hash: "b".repeat(64), operation_id: "1", donor: admin,
  pool: donor, amount: "9.0000000", asset: { type: "native", extra: true } })) {
  cases.push(["original " + field, r => json(r.d1_preparations!, "input", v => { v.payment[field] = value; })]);
}
// Coherently change every request copy, so these tests exercise content validation rather than equality alone.
for (const [field, value] of Object.entries({ version: 2, incident_id: " different", donor: admin, beneficiary: "G".repeat(56),
  asset: { type: "issued", code: "BAD!", issuer: admin }, amount: "01.0000000", deadline: "2026-10-27T12:05:01Z", extra: true })) {
  cases.push(["coherent request " + field, r => {
    json(r.release_requests!, "request", v => { v[field] = value; });
    json(r.d1_preparations!, "input", v => { v.request[field] = value; });
    json(r.d1_preparations!, "receipt", v => { v.allocation.reservation.request[field] = value; });
  }]);
}
for (const [name, change] of cases) Deno.test("rejects " + name + " without mutation", () => {
  const { capture, command } = captured(); change(capture.allocations[0], capture);
  const before = JSON.stringify(capture); rejected(capture, command); equal(JSON.stringify(capture), before);
});
for (const memo of ["none", "wrong"] as const) Deno.test("original SDK memo " + memo + " is not preparation provenance", () => {
  const { capture, command } = captured(false, ["1.0000000"], memo);
  equal(validateDonorCapturedHistory(capture, command).payment.grossAmount, "10.0000000");
  rejected(capture, command);
});
Deno.test("rejects duplicate/unsorted allocation IDs and a malformed later parent atomically", () => {
  const { capture, command } = captured(false, ["1.0000000", "2.0000000"]);
  capture.allocations.reverse(); rejected(capture, command); capture.allocations.reverse();
  capture.allocations[1].d1_preparations = null; rejected(capture, command);
  capture.allocations[1] = structuredClone(capture.allocations[0]); rejected(capture, command);
});
Deno.test("descriptor-safe boundary preserves hostile input and does not infer absence", () => {
  const { capture, command } = captured(); let calls = 0;
  Object.defineProperty(capture.allocations[0], "d1_preparations", { enumerable: true, get() { calls++; return null; } });
  rejected(capture, command); equal(calls, 0); rejected(null, command);
  const next = captured(); Object.assign(next.capture.allocations[0], { toJSON() { calls++; return {}; } });
  rejected(next.capture, next.command); equal(calls, 0);
});
Deno.test("coherent oversized allocations cannot hide behind a valid aggregate counter", () => {
  const { capture, command } = captured(false, ["6.0000000", "5.0000000"]);
  capture.payment.allocated_stroops = "100000000";
  const before = JSON.stringify(capture); rejected(capture, command); equal(JSON.stringify(capture), before);
});
Deno.test("exact integer JSONB lexemes and equivalent SQL timezone preserve historical evidence", () => {
  const { capture, command } = captured();
  capture.allocations[0].d1_preparations!.input = capture.allocations[0].d1_preparations!.input.replace('"ledger":10', '"ledger":100e-1');
  capture.allocations[0].donation_allocations.allocated_at = "2026-10-27T09:00:01.123-03:00";
  equal(validateDonorCapturedAllocations(capture, command).allocations[0].amount, "1.0000000");
  const empty = captured(false, [], "none");
  equal(validateDonorCapturedAllocations(empty.capture, empty.command).allocations, []);
});
Deno.test("existing history still retains missing parents without certifying them", () => {
  const { capture, command } = captured(); capture.allocations[0].d1_preparations = null;
  equal(validateDonorCapturedHistory(capture, command).capture.allocations, capture.allocations);
  rejected(capture, command);
});
