import { Buffer } from "node:buffer";
import { hash } from "@stellar/stellar-sdk";
import vectors from "../fixtures/donor-financial-jsonb-vectors.json" with { type: "json" };
import { validateDonorFinancialDigests as validate } from "../../functions/d1-custody/donor-financial-digest.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { issuanceCapture, type IssuanceFixture } from "../fixtures/donor-issuance.ts";
import { equal, requestId, donor } from "../fixtures/donor-allocation.ts";
const digest = (s: string) => hash(Buffer.from(s, "utf8")).toString("hex");
const vector = vectors.vectors[0];
function fixture(v = vector) {
  const f = issuanceCapture(3, v.issued);
  f.capture.allocations[0].d1_initial_financial_observations.push({ request_id: requestId(1), snapshot_hash: v.hash, receipt: v.receiptText });
  return f;
}
const row = (f: IssuanceFixture) => f.capture.allocations[0].d1_initial_financial_observations[0];
function receiptChange(f: IssuanceFixture, change: (r: Record<string, unknown>) => void) {
  const r = JSON.parse(row(f).receipt), snapshot = r.snapshot; change(r);
  // These envelope mutations use the default PG vector. Do not accidentally
  // invalidate its digest while testing an unrelated envelope binding.
  if (r.snapshot === snapshot) {
    delete r.snapshot; row(f).receipt = JSON.stringify(r).slice(0, -1) + ',"snapshot":' + vector.snapshotText + '}';
  } else row(f).receipt = JSON.stringify(r);
}
// Synthetic mutation helper, NOT a PostgreSQL serializer. Preserve supplied raw snapshot bytes.
function snapshotChange(f: IssuanceFixture, text: string, rehash = true) {
  const r = JSON.parse(row(f).receipt); delete r.snapshot;
  if (rehash) r.snapshot_hash = row(f).snapshot_hash = digest(text);
  row(f).receipt = JSON.stringify(r).slice(0, -1) + ',"snapshot":' + text + '}';
}
function reject(f: IssuanceFixture) {
  const before = JSON.stringify(f); let error: unknown;
  try { validate(f.capture, f.command); } catch (e) { error = e; }
  if (!(error instanceof CustodyError)) throw Error("expected CustodyError");
  equal([error.status, error.code, error.message], [503, "donor_payment_unavailable", "donor_payment_unavailable"]);
  equal(JSON.stringify(f), before); // Includes all stored rows and counters.
}
function frozen(v: unknown): void {
  if (v && typeof v === "object") { equal(Object.isFrozen(v), true); Object.values(v).forEach(frozen); }
}
for (const v of vectors.vectors) Deno.test(`digest accepts exact PostgreSQL ${v.name} after expiry`, () => {
  const f = fixture(v), before = JSON.stringify(f), result = validate(f.capture, f.command);
  equal(v.nestedEqualsStandalone, true); equal(digest(v.snapshotText), v.hash);
  equal(result.financialAssurance, "digest-consistency-only");
  equal(result.financialDigests, [{ requestId: requestId(1), observations: [{ snapshotHash: v.hash, snapshotText: v.snapshotText, receipt: JSON.parse(v.receiptText) }] }]);
  frozen(result); equal(JSON.stringify(f), before);
  equal("issuance" in result || "state" in result.financialDigests[0], false);
  row(f).receipt = "{}"; f.capture.allocations.length = 0;
  equal(result.financialDigests[0].observations[0].snapshotText, v.snapshotText); equal(result.capture.allocations.length, 1);
});
Deno.test("digest preserves native/issued prefixes with zero observations and zero allocations", () => {
  for (const issued of [false, true]) for (const stage of [0, 1, 2, 3]) {
    const f = issuanceCapture(stage, issued), before = JSON.stringify(f), result = validate(f.capture, f.command);
    equal(result.financialDigests, [{ requestId: requestId(1), observations: [] }]);
    equal(result.prefixes[0].unsigned !== null, stage === 3); equal(JSON.stringify(f), before);
  }
  const f = issuanceCapture(3, false, []); equal(validate(f.capture, f.command).financialDigests, []);
});
Deno.test("all snapshots and requests retained; older anchor and differing sign/submit hashes are not reinterpreted", () => {
  const f = issuanceCapture(3, false, ["1.0000000", "1.0000000"]);
  for (const raw of f.capture.allocations) for (const v of vectors.vectors.filter(v => !v.issued)) {
    const r = JSON.parse(v.receiptText), text = v.snapshotText.replaceAll(requestId(1), raw.donation_allocations.request_id);
    r.request_id = raw.donation_allocations.request_id; r.snapshot_hash = digest(text);
    r.transaction_hash = JSON.parse(raw.d1_unsigned_transactions!.receipt).transaction_hash; delete r.snapshot;
    raw.d1_initial_financial_observations.push({ request_id: r.request_id, snapshot_hash: r.snapshot_hash,
      receipt: JSON.stringify(r).slice(0, -1) + ',"snapshot":' + text + '}' });
  }
  const raw = f.capture.allocations[0], hashes = raw.d1_initial_financial_observations.map(r => r.snapshot_hash);
  raw.d1_signed_transactions = { request_id: requestId(1), snapshot_hash: hashes[0], receipt: '{"unvalidated":true}' };
  raw.d1_submission_attempts = { request_id: requestId(1), attempt_id: requestId(3), receipt: JSON.stringify({ snapshot_hash: hashes[1] }) };
  const result = validate(f.capture, f.command); equal(result.financialDigests.map(r => r.observations.length), [2, 2]);
  equal(result.allocations[0].raw.d1_signed_transactions, raw.d1_signed_transactions); frozen(result);
});
const envelopeFields = ["kind", "revision", "request_id", "namespace", "network", "pool", "authorized_by", "transaction_hash", "snapshot_hash", "snapshot"];
for (const key of envelopeFields) Deno.test(`reject observation ${key} substitution/missing member`, () => {
  for (const remove of [false, true]) {
    const replacements: Record<string, unknown> = { revision: 2, request_id: requestId(9), namespace: requestId(9),
      pool: donor, network: "PUBLIC", transaction_hash: "f".repeat(64), snapshot_hash: "f".repeat(64), snapshot: null };
    const f = fixture(); receiptChange(f, r => { if (remove) delete r[key]; else r[key] = replacements[key] ?? "wrong"; }); reject(f);
  }
});
Deno.test("reject extra envelope keys and invalid authorizer checksums/types", () => {
  for (const value of ["G" + "A".repeat(55), "M" + "A".repeat(68), null, 1]) {
    const f = fixture(); receiptChange(f, r => { r.authorized_by = value; }); reject(f);
  }
  const f = fixture(); receiptChange(f, r => { r.extra = true; }); reject(f);
});
Deno.test("valid G authorizer is not a current-admin or same-authorizer assertion", () => {
  const f = fixture(); row(f).receipt = row(f).receipt.replace(JSON.parse(row(f).receipt).authorized_by, donor);
  equal(validate(f.capture, f.command).financialDigests[0].observations.length, 1);
});
for (const key of ["kind", "revision", "requestId", "namespace", "network", "pool"]) Deno.test(`reject hash-consistent snapshot identity ${key}`, () => {
  const f = fixture(), s = JSON.parse(vector.snapshotText); s[key] = "wrong"; snapshotChange(f, JSON.stringify(s)); reject(f);
});
Deno.test("require all and only actual 028 nineteen snapshot keys", () => {
  for (const key of Object.keys(JSON.parse(vector.snapshotText))) {
    const f = fixture(), s = JSON.parse(vector.snapshotText); delete s[key]; snapshotChange(f, JSON.stringify(s)); reject(f);
  }
  const f = fixture(), s = JSON.parse(vector.snapshotText); s.extra = true; snapshotChange(f, JSON.stringify(s)); reject(f);
  const g = fixture(), merged = JSON.parse(vector.snapshotText);
  merged["account,anchor"] = {}; delete merged.account; delete merged.anchor;
  snapshotChange(g, JSON.stringify(merged)); reject(g);
});
Deno.test("reject row/request/hash mismatch and duplicate hash even if unused", () => {
  for (const key of ["request_id", "snapshot_hash"] as const) {
    for (const value of ["wrong", key === "request_id" ? requestId(9) : "f".repeat(64)]) {
      const f = fixture(); row(f)[key] = value; reject(f);
    }
  }
  const f = fixture(); f.capture.allocations[0].d1_initial_financial_observations.push({ ...row(f) }); reject(f);
  const g = fixture(); row(g).snapshot_hash = vector.hash.toUpperCase(); reject(g);
});
Deno.test("reject every missing prefix ancestor and malformed unused observation", () => {
  for (const key of ["d1_preparations", "d1_issuance_intents", "d1_issuance_sequences", "d1_unsigned_transactions"] as const) {
    const f = fixture(); f.capture.allocations[0][key] = null; reject(f);
  }
  const f = fixture(); f.capture.allocations[0].d1_initial_financial_observations.push({ ...row(f), snapshot_hash: "f".repeat(64), receipt: "{}" }); reject(f);
  const g = issuanceCapture(3, false, ["1.0000000", "1.0000000"]);
  g.capture.allocations[1].d1_initial_financial_observations.push({ ...row(f) }); reject(g);
});
Deno.test("whole JSON validation rejects duplicates, trailing bytes, invalid numbers and malformed nested JSON", () => {
  const texts = [vector.receiptText + '{}', vector.receiptText.replace('{', '{"revision":1,'),
    vector.receiptText.replace('"snapshot":', '"snap\\u0073hot":null,"snapshot":'),
    vector.receiptText.replace('"budget": {}', '"budget": {"x":1,"\\u0078":2}'),
    vector.receiptText.replace('"budget": {}', '"budget": [1,]'),
    vector.receiptText.replace('"revision": 1', '"revision": 1.0000000000000001')];
  for (const text of texts) { const f = fixture(); row(f).receipt = text; reject(f); }
  for (const text of ['null', '1', '"string"', '[]', '{}']) { const f = fixture(); snapshotChange(f, text); reject(f); }
});
Deno.test("changed whitespace or numeric lexeme cannot retain original hash", () => {
  for (const text of [vector.snapshotText.replace('{', '{ '), vector.snapshotText.replace('"revision": 1', '"revision": 1.00')]) {
    const f = fixture(); snapshotChange(f, text, false); reject(f);
  }
  const v = vectors.vectors[1], f = fixture(v); snapshotChange(f, v.snapshotText.replace('1200.0000', '1200'), false); reject(f);
});
Deno.test("decoded top-level snapshot key, arbitrary member order and exterior whitespace preserve token", () => {
  for (const first of [false, true]) {
    const f = fixture(), r = JSON.parse(row(f).receipt); delete r.snapshot;
    const rest = JSON.stringify(r).slice(1, -1), member = '"snap\\u0073hot" : \n' + vector.snapshotText;
    row(f).receipt = ' \n{ ' + (first ? member + ',' + rest : rest + ',' + member) + ' }\t';
    equal(validate(f.capture, f.command).financialDigests[0].observations[0].snapshotText, vector.snapshotText);
  }
});
Deno.test("snapshot UTF8 byte ceiling accepts exactly 1 MiB and rejects next byte", () => {
  for (const extra of [0, 1]) {
    const f = fixture(), s = JSON.parse(vector.snapshotText); s.account = { padding: "" };
    const base = JSON.stringify(s), remaining = 1048576 - Buffer.byteLength(base);
    s.account.padding = "é".repeat(Math.floor(remaining / 2)) + "x".repeat(remaining % 2 + extra);
    const text = JSON.stringify(s); equal(Buffer.byteLength(text), 1048576 + extra); snapshotChange(f, text);
    if (extra) reject(f); else equal(validate(f.capture, f.command).financialDigests[0].observations[0].snapshotText, text);
  }
});
Deno.test("matching digest does NOT certify economic/history/credit/commitment/account semantics", () => {
  const f = fixture(), s = JSON.parse(vector.snapshotText);
  for (const key of ["commitment", "historyState", "creditState", "account", "budget", "obligations", "originalDonation"]) s[key] = { unproved: true };
  s.expiresAt = 0; snapshotChange(f, JSON.stringify(s));
  const result = validate(f.capture, f.command); equal(result.financialAssurance, "digest-consistency-only");
  equal("issuance" in result || "financiallyValid" in result, false);
});
Deno.test("descriptor-safe boundary never invokes getters or callbacks and preserves their identity", () => {
  for (const target of ["receipt", "snapshot_hash", "command", "callback"] as const) {
    const f = fixture(); let calls = 0;
    const object = target === "command" ? f.command : row(f), key = target === "command" ? "pool" : target;
    const callback = () => { calls++; return "{}"; };
    Object.defineProperty(object, key, target === "callback" ? { value: callback, enumerable: true } : { get: callback, enumerable: true });
    const before = Object.getOwnPropertyDescriptors(object); let error: unknown;
    try { validate(f.capture, f.command); } catch (e) { error = e; }
    if (!(error instanceof CustodyError)) throw Error("expected CustodyError");
    equal([error.status, error.code, error.message, calls], [503, "donor_payment_unavailable", "donor_payment_unavailable", 0]);
    const after = Object.getOwnPropertyDescriptors(object);
    for (const k of Object.keys(before)) {
      if (before[k].get !== after[k].get || before[k].value !== after[k].value) throw Error("descriptor changed");
    }
  }
});
