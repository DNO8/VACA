import { validateDonorCapturedHistory } from "../../functions/d1-custody/donor-captured-history.ts";
import type { VerifiedDonorPaymentCommand } from "../../functions/d1-custody/donor-payment-command.ts";
import { parseDiscoveredOperation } from "../../functions/d1-custody/discovery.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { fixture, equal, namespace, pool, donor, admin, hash, closedAt, date, requestId } from "../fixtures/initial-financial-authorization.ts";

/** Actual 054 column encodings; receipts follow 019/024, not fixture state flags. */
function captured() {
  const { h } = fixture();
  const transactions = h.records;
  const payment = transactions[1], id = String(BigInt(payment.pagingToken) + 1n);
  const paymentOperation = { id, paging_token: id, transaction_hash: payment.transactionHash,
    transaction_successful: true, source_account: donor, created_at: date, type: "payment", type_i: 1,
    from: donor, to: pool, amount: "10.0000000", asset_type: "native" };
  const discoveries = [h.receipt.observation.record, parseDiscoveredOperation({ pool,
    anchor: { sequence: 10, closedAt }, operation: paymentOperation, transaction: payment.raw.transaction })];
  function journal(records: unknown[], tokens: string[], transaction: boolean) {
    let previous = "0", count = 0;
    const pages = [...records.map(r => [r]), []].map((entries, i) => {
      const to = tokens[i] ?? previous;
      const page = { revision: 1, from_cursor: previous, to_cursor: to, through_ledger: 10,
        ledger_hash: hash, closed_at: closedAt, records: entries };
      const checkpoint = { cursor: to, through_ledger: 10, ledger_hash: hash, closed_at: closedAt };
      count += entries.length;
      const receipt = transaction ? { kind: "d1_transaction_page", revision: 1, namespace, network: "TESTNET", pool,
        first_ledger: 8, authorized_by: admin, page, checkpoint, page_count: i + 1,
        record_count: count, page_record_count: entries.length } : {
        kind: "d1_discovery_page", revision: 1, namespace, network: "TESTNET", pool,
        from_cursor: previous, to_cursor: to, checkpoint_ledger: 10, checkpoint_hash: hash,
        page_count: i + 1, record_count: entries.length };
      const row = { namespace, from_cursor: previous, through_ledger: "10", ledger_hash: hash,
        page: JSON.stringify(page), receipt: JSON.stringify(receipt) };
      previous = to;
      return row;
    });
    return { pages, checkpoint: { namespace,
      checkpoint: JSON.stringify({ cursor: previous, through_ledger: 10, ledger_hash: hash, closed_at: closedAt }),
      page_count: String(pages.length) } };
  }
  const discovery = journal(discoveries, discoveries.map(r => r.paging_token), false);
  const history = journal(transactions, transactions.map(r => r.pagingToken), true);
  const command: VerifiedDonorPaymentCommand = { kind: "d1_verified_donor_payment_command", revision: 1,
    namespace, network: "TESTNET", pool, verifiedDonor: donor,
    paymentTransactionHash: payment.transactionHash, paymentOperationId: id };
  const capture = { kind: "d1_donor_payment_capture", revision: 1,
    scope: { namespace, network: "TESTNET", pool, verifiedDonor: donor, transactionHash: payment.transactionHash, operationId: id },
    dbReadAt: closedAt + 1,
    payment: { transaction_hash: payment.transactionHash, operation_id: id,
      payment: JSON.stringify({ transaction_hash: payment.transactionHash, operation_id: id,
        donor, pool, amount: "10.0000000", asset: { type: "native" } }),
      donation_stroops: "100000000", allocated_stroops: "0" },
    allocations: [] as unknown[],
    evidence: { d1_pools: { namespace, pool, first_ledger: "8" },
      d1_discovery_checkpoints: discovery.checkpoint, d1_discovery_pages: discovery.pages,
      d1_discovery_operations: discoveries.map(r => ({ namespace, paging_token: r.paging_token,
        transaction_hash: r.transaction_hash, operation_id: r.operation_id, record: JSON.stringify(r) })),
      d1_transaction_checkpoints: { ...history.checkpoint, record_count: String(transactions.length) },
      d1_transaction_pages: history.pages,
      d1_transaction_records: transactions.map(r => ({ namespace, paging_token: r.pagingToken,
        transaction_hash: r.transactionHash, record: JSON.stringify(r) })),
      d1_operating_credit_observations: [{ namespace, operation_id: h.receipt.observation.operationId, receipt: JSON.stringify(h.receipt) }] } };
  return { capture, command };
}
type Capture = ReturnType<typeof captured>["capture"];
function rejected(capture: unknown, command: VerifiedDonorPaymentCommand) {
  let error: unknown;
  try { validateDonorCapturedHistory(capture, command); } catch (e) { error = e; }
  if (!(error instanceof CustodyError)) throw Error("expected CustodyError");
  equal([error.status, error.code, error.message], [503, "donor_payment_unavailable", "donor_payment_unavailable"]);
}
function structuralEqual(a: unknown, b: unknown) {
  function ordered(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(ordered);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, ordered(v)]));
    return v;
  }
  equal(ordered(a), ordered(b));
}
function changeJSON(row: Record<string, unknown>, key: string, change: (v: Record<string, any>) => void) {
  const v = JSON.parse(row[key] as string); change(v); row[key] = JSON.stringify(v);
}
Deno.test("captured SDK original payment: exact historical DTO and detached frozen evidence", () => {
  const { capture, command } = captured(), before = JSON.stringify(capture);
  const result = validateDonorCapturedHistory(capture, command);
  equal(result.payment, { transactionHash: command.paymentTransactionHash, operationId: command.paymentOperationId,
    donor, asset: { type: "native" }, grossAmount: "10.0000000", confirmedAt: closedAt, deadline: "2026-10-27T12:05:00Z" });
  equal(result.history.firstLedger, 8); equal(result.history.anchor, { sequence: 10, hash, closedAt });
  equal(result.history.transactions.length, 2); equal(result.history.operatingCredits.length, 1);
  equal(JSON.stringify(capture), before);
  function frozen(v: unknown) {
    if (v && typeof v === "object") { equal(Object.isFrozen(v), true); for (const child of Object.values(v)) frozen(child); }
  }
  frozen(result);
  capture.payment.donation_stroops = "1"; capture.evidence.d1_transaction_records.length = 0;
  equal(result.capture.payment.donation_stroops, "100000000"); equal(result.history.transactions.length, 2);
});

const cases: [string, (c: Capture) => void][] = [
  ["scope namespace", c => { c.scope.namespace = requestId; }],
  ["scope network", c => { c.scope.network = "PUBLIC"; }],
  ["scope pool", c => { c.scope.pool = donor; }],
  ["scope donor", c => { c.scope.verifiedDonor = admin; }],
  ["scope hash", c => { c.scope.transactionHash = hash; }],
  ["scope operation", c => { c.scope.operationId = "1"; }],
  ["unknown envelope", c => { Object.assign(c, { coverage_complete: true }); }],
  ["owned row hash", c => { c.payment.transaction_hash = hash; }],
  ["owned row operation", c => { c.payment.operation_id = "1"; }],
  ["owned donor", c => changeJSON(c.payment, "payment", p => { p.donor = admin; })],
  ["owned pool", c => changeJSON(c.payment, "payment", p => { p.pool = donor; })],
  ["owned amount", c => changeJSON(c.payment, "payment", p => { p.amount = "11.0000000"; })],
  ["owned asset", c => changeJSON(c.payment, "payment", p => { p.asset = { type: "issued", code: "USD", issuer: admin }; })],
  ["stored gross", c => { c.payment.donation_stroops = "100000001"; }],
  ["counter overflow", c => { c.payment.allocated_stroops = "100000001"; }],
  ["missing discovery tail", c => { c.evidence.d1_discovery_pages.pop(); }],
  ["missing history tail", c => { c.evidence.d1_transaction_pages.pop(); }],
  ["record count", c => { c.evidence.d1_transaction_checkpoints.record_count = "1"; }],
  ["page count", c => { c.evidence.d1_discovery_checkpoints.page_count = "2"; }],
  ["cursor", c => changeJSON(c.evidence.d1_transaction_checkpoints, "checkpoint", p => { p.cursor = "0"; })],
  ["anchor", c => changeJSON(c.evidence.d1_discovery_checkpoints, "checkpoint", p => { p.ledger_hash = "b".repeat(64); })],
  ["page gap", c => { c.evidence.d1_transaction_pages[1].from_cursor = "0"; }],
  ["receipt count", c => changeJSON(c.evidence.d1_transaction_pages[0], "receipt", p => { p.record_count = 2; })],
  ["missing row", c => { c.evidence.d1_transaction_records.shift(); }],
  ["duplicate row", c => { c.evidence.d1_transaction_records.push(c.evidence.d1_transaction_records[0]); }],
  ["discovery record substitution", c => { c.evidence.d1_discovery_operations[1].record = c.evidence.d1_discovery_operations[0].record; }],
  ["credit substitution", c => changeJSON(c.evidence.d1_operating_credit_observations[0], "receipt", p => {
    const r = JSON.parse(c.evidence.d1_discovery_operations[1].record);
    Object.assign(p.observation, { operationId: r.operation_id, transactionHash: r.transaction_hash,
      funder: donor, amountStroops: "100000000", record: r });
    c.evidence.d1_operating_credit_observations[0].operation_id = r.operation_id;
  })],
  ["credit discovery mismatch", c => { c.evidence.d1_discovery_operations.shift(); }],
  ["credit anchor", c => changeJSON(c.evidence.d1_operating_credit_observations[0], "receipt", p => { p.observation.anchor.hash = "b".repeat(64); })],
  ["credit unsafe integer lexeme", c => { c.evidence.d1_operating_credit_observations[0].receipt = c.evidence.d1_operating_credit_observations[0].receipt.replace('"ledger":10', '"ledger":9007199254740991.1'); }],
  ["fraction rounded to valid ledger", c => { c.evidence.d1_transaction_checkpoints.checkpoint = c.evidence.d1_transaction_checkpoints.checkpoint.replace('"through_ledger":10', '"through_ledger":10.000000000000000001'); }],
  ["unsafe integer", c => { c.evidence.d1_pools.first_ledger = "9007199254740993"; }],
  ["noncanonical SQL bigint", c => { c.evidence.d1_pools.first_ledger = "8.0"; }],
  ["JSONB object instead of text", c => { Object.assign(c.payment, { payment: JSON.parse(c.payment.payment) }); }],
  ["duplicate JSON key", c => { c.payment.payment = c.payment.payment.replace('"donor":', '"donor":"wrong","donor":'); }],
  ["oversize", c => { c.payment.payment = " ".repeat(4194305); }],
];
for (const [name, change] of cases) Deno.test("capture rejects " + name + " atomically", () => {
  const { capture, command } = captured(); change(capture); const before = JSON.stringify(capture);
  rejected(capture, command); equal(JSON.stringify(capture), before);
});
for (const kind of ["discovery", "transaction"] as const) Deno.test(`${kind} requires empty tail even when page counts agree`, () => {
  const { capture, command } = captured();
  capture.evidence[`d1_${kind}_pages`].pop();
  capture.evidence[`d1_${kind}_checkpoints`].page_count = "2";
  const before = JSON.stringify(capture); rejected(capture, command); equal(JSON.stringify(capture), before);
});
Deno.test("SDK operating credit cannot be selected as an original donation", () => {
  const { capture, command: original } = captured();
  const credit = JSON.parse(capture.evidence.d1_operating_credit_observations[0].receipt).observation;
  const command = { ...original, verifiedDonor: credit.funder, paymentOperationId: credit.operationId, paymentTransactionHash: credit.transactionHash };
  Object.assign(capture.scope, { verifiedDonor: credit.funder, operationId: credit.operationId, transactionHash: credit.transactionHash });
  Object.assign(capture.payment, { transaction_hash: credit.transactionHash, operation_id: credit.operationId,
    donation_stroops: credit.amountStroops, payment: JSON.stringify({ transaction_hash: credit.transactionHash,
      operation_id: credit.operationId, donor: credit.funder, pool, asset: { type: "native" }, amount: "100.0000000" }) });
  const before = JSON.stringify(capture); rejected(capture, command); equal(JSON.stringify(capture), before);
});
Deno.test("null/absence cannot infer public 404", () => {
  const { capture, command } = captured(); rejected(null, command);
  rejected({ ...capture, payment: null, evidence: null, allocations: [] }, command);
});
Deno.test("descriptor boundary never calls getters or coercion hooks", () => {
  const { capture, command } = captured(); let calls = 0;
  Object.defineProperty(capture.payment, "donation_stroops", { enumerable: true, get() { calls++; return "100000000"; } });
  rejected(capture, command); equal(calls, 0);
  const next = captured(); Object.defineProperty(next.command, "pool", { enumerable: true, get() { calls++; return pool; } });
  rejected(next.capture, next.command); equal(calls, 0);
  const hook = captured(); Object.assign(hook.capture.payment, { toJSON() { calls++; return {}; } });
  rejected(hook.capture, hook.command); equal(calls, 0);
});
Deno.test("lossless parsing accepts mathematically exact equivalent integer lexemes", () => {
  const { capture, command } = captured();
  capture.evidence.d1_transaction_checkpoints.checkpoint = capture.evidence.d1_transaction_checkpoints.checkpoint.replace('"through_ledger":10', '"through_ledger":100e-1');
  equal(validateDonorCapturedHistory(capture, command).payment.grossAmount, "10.0000000");
});
Deno.test("retains every raw allocation without claiming allocation provenance", () => {
  const { capture, command } = captured();
  const row = { donation_allocations: { request_id: requestId, authorized_by: admin,
    transaction_hash: command.paymentTransactionHash, operation_id: command.paymentOperationId,
    allocated_stroops: "10000000", allocated_at: "2026-10-27T12:00:01+00:00" },
    release_requests: null, d1_preparations: null, d1_issuance_intents: null, d1_issuance_sequences: null,
    d1_unsigned_transactions: null, d1_issuance_fee_commitments: null, d1_initial_financial_observations: [],
    d1_signed_transactions: null, d1_submission_attempts: null, d1_issuance_outcomes: null };
  capture.allocations.push(row); capture.payment.allocated_stroops = "10000000";
  const result = validateDonorCapturedHistory(capture, command);
  structuralEqual(result.capture.allocations, [row]); equal(Object.isFrozen(result.capture.allocations[0]), true);
  row.donation_allocations.allocated_stroops = "1";
  equal(result.capture.allocations[0].donation_allocations.allocated_stroops, "10000000");
});
