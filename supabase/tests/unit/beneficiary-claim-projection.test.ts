import { Account, Asset, Keypair, Networks, Operation, Transaction, TransactionBuilder, xdr, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { projectBeneficiaryClaims } from "../../functions/d1-custody/beneficiary-claim-projection.ts";
import { calculateIssuanceEncumbrances } from "../../functions/d1-custody/issuance-encumbrances.ts";
import { parseInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { planIssuance } from "../../functions/d1-custody/issuance-plan.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { fixture, pool, admin, donor, beneficiary, team, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";
type DTO = Record<string, any>;
function equal(a: unknown, b: unknown) {
  const normalize = (v: any): any => Array.isArray(v) ? v.map(normalize) : v !== null && typeof v === "object" ?
    Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, normalize(x)])) : v;
  if (JSON.stringify(normalize(a)) !== JSON.stringify(normalize(b))) throw Error("public observable mismatch");
}
function result(types: number[], failed = false) {
  const ops = types.map((type, i) => {
    const bytes = Buffer.alloc(12); bytes.writeInt32BE(type, 4); bytes.writeInt32BE(failed && i === 0 ? -1 : 0, 8);
    return xdr.OperationResult.fromXDR(bytes);
  });
  return new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString(String(100 * types.length)),
    result: failed ? xdr.TransactionResultResult.txFailed(ops) : xdr.TransactionResultResult.txSuccess(ops),
    ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
}
function raw(tx: Transaction, types: number[], ledger = 12, time = closedAt + 10, position = 1, failed = false, resultXdr?: string) {
  return { transaction: { hash: tx.hash().toString("hex"), paging_token: ((BigInt(ledger) << 32n) + BigInt(position) * 4096n).toString(),
    ledger, created_at: new Date(time * 1000).toISOString().replace(".000Z", "Z"), source_account: tx.source,
    source_account_sequence: tx.sequence, fee_account: tx.source, fee_charged: String(100 * types.length), max_fee: tx.fee,
    successful: !failed, operation_count: types.length, envelope_xdr: tx.toXDR(), result_xdr: resultXdr ?? result(types, failed) },
    ledger: { sequence: ledger, hash: "f".repeat(64), closed_at: new Date(time * 1000).toISOString().replace(".000Z", "Z") } };
}
async function setup(issued = false, amount = "1.0000000", second = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, amount, "before") : fixture("none", "donation", "100.0000000", false, amount);
  const reply = await f.h.client.rpc("d1_load_unsigned_transaction", {}), journal = (reply.data as DTO).transaction;
  const ids = second ? [requestId, "55555555-5555-4555-8555-555555555555"] : [requestId];
  const issuances: DTO[] = [], observations: DTO[] = [], cbs: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const j = structuredClone(journal), r = j.reservation;
    j.request_id = r.request_id = r.intent.request_id = r.intent.preparation_input.request_id = r.intent.preparation.request_id = ids[i];
    r.observed_account_sequence = String(2 + i); r.transaction_sequence = String(3 + i); j.transaction_sequence = r.transaction_sequence;
    j.unsigned_xdr = planIssuance(r.intent.preparation_input, { networkPassphrase: Networks.TESTNET, pool,
      sequence: r.observed_account_sequence, now: closedAt + 1, fee: "100" }).unsignedXdr;
    const tx = TransactionBuilder.fromXDR(j.unsigned_xdr, Networks.TESTNET); if (!(tx instanceof Transaction)) throw Error("fixture");
    j.transaction_hash = tx.hash().toString("hex"); tx.sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)));
    const cb = tx.getClaimableBalanceId(0); cbs.push(cb);
    const op = xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(
      xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR(cb, "hex"))));
    const resultXdr = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("100"),
      result: xdr.TransactionResultResult.txSuccess([op]), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
    const included = raw(tx, [14], 11, closedAt + 5, i + 1, false, resultXdr);
    const observed = parseInitialIssuanceOutcome(pool, tx.toXDR(), { context: { pool, firstLedger: 8,
      anchor: { sequence: 11, hash: "f".repeat(64), closedAt: closedAt + 5 } }, ...included });
    observations.push(structuredClone(observed.observation));
    issuances.push({ unsignedJournal: j, outcomeReceipt: { kind: "d1_issuance_outcome_journal", revision: 1,
      request_id: ids[i], namespace, network: "TESTNET", pool, authorized_by: admin, attempt_id: i ? namespace : "33333333-3333-4333-8333-333333333333",
      transaction_hash: j.transaction_hash, envelope_hash: digest(Buffer.from(tx.toXDR(), "base64")).toString("hex"),
      outcome_hash: "d".repeat(64), observed_outcome: structuredClone(observed) } });
  }
  const initial: Parameters<typeof calculateIssuanceEncumbrances>[0] = { namespace, pool, firstLedger: 8, anchor: { sequence: 12, hash: "f".repeat(64), closedAt: closedAt + 10 },
    transactions: [...f.h.records, ...observations], operatingCredits: [f.h.receipt], issuances };
  calculateIssuanceEncumbrances(initial); // Prove the baseline fixture before calling the new API.
  const make = (options: { source?: string; explicit?: string; prefix?: boolean; failed?: boolean; ledger?: number; time?: number; position?: number; cb?: string } = {}) => {
    const builder = new TransactionBuilder(new Account(options.source ?? beneficiary, "0"), { networkPassphrase: Networks.TESTNET,
      fee: "100", timebounds: { minTime: 0, maxTime: 0 } });
    if (options.prefix) builder.addOperation(Operation.payment({ destination: donor, amount: "0.0000001", asset: Asset.native() }));
    for (const cb of cbs) builder.addOperation(Operation.claimClaimableBalance({ balanceId: options.cb ?? cb, ...(options.explicit ? { source: options.explicit } : {}) }));
    const tx = builder.build(), types = [...(options.prefix ? [1] : []), ...cbs.map(() => 15)];
    const dto = raw(tx, types, options.ledger, options.time, options.position, options.failed);
    return ids.map((requestId, i) => ({ requestId, operationIndex: i + (options.prefix ? 1 : 0), ...structuredClone(dto) }));
  };
  const claims = make(); parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: initial.anchor }, ...claims[0] });
  return { initial, claims, make, cbs };
}
function reject(input: unknown, serializable = true) {
  const before = serializable ? JSON.stringify(input) : undefined; let caught: unknown;
  try { projectBeneficiaryClaims(input); } catch (e) { caught = e; }
  equal(caught instanceof CustodyError ? [caught.code, caught.status, caught.message] : caught,
    ["beneficiary_claim_projection_unavailable", 503, "beneficiary_claim_projection_unavailable"]);
  if (serializable) equal(JSON.stringify(input), before);
}
Deno.test("positive claims preserve native and issued gross, unissued remainder and immutable inputs", async () => {
  for (const issued of [false, true]) for (const amount of ["1.0000000", "10.0000000"]) {
    const h = await setup(issued, amount), input = { initial: h.initial, claims: h.claims }, before = JSON.stringify(input);
    const basis = calculateIssuanceEncumbrances(h.initial), value = projectBeneficiaryClaims(input), mapped = basis.encumbrances[0];
    equal([value.kind, value.revision, value.basis], ["d1_beneficiary_claim_projection", 1, basis]);
    equal(value.claims, [{ requestId, claimableBalanceId: h.cbs[0], beneficiary, amountStroops: amount.replace(".", ""),
      issuanceTransactionHash: mapped.issuanceTransactionHash, transactionHash: h.claims[0].transaction.hash,
      operationIndex: 0, operationId: (BigInt(h.claims[0].transaction.paging_token) + 1n).toString(), ledger: 12, ledgerHash: "f".repeat(64), closedAt: closedAt + 10 }]);
    const d = value.basis.donations.find(d => d.operationId === mapped.operationId)!;
    equal([d.amountStroops, d.issuedStroops, d.unissuedStroops], ["100000000", amount.replace(".", ""), amount === "1.0000000" ? "90000000" : "0"]);
    equal(JSON.stringify(input), before); equal(Object.isFrozen(value.claims[0]), true); equal(Object.isFrozen(value.basis.original), true);
    h.claims[0].transaction.hash = "0".repeat(64); equal(value.claims[0].transactionHash === h.claims[0].transaction.hash, false);
  }
});
Deno.test("positive claims support explicit personal operation source and multiple selected balances in one transaction", async () => {
  const h = await setup(false, "1.0000000", true), claims = h.make({ source: team, explicit: beneficiary, prefix: true });
  const value = projectBeneficiaryClaims({ initial: h.initial, claims });
  equal(value.claims.map(c => [c.requestId, c.operationIndex, c.beneficiary]), [[requestId, 1, beneficiary], ["55555555-5555-4555-8555-555555555555", 2, beneficiary]]);
  equal(value.claims[0].transactionHash, value.claims[1].transactionHash);
});
Deno.test("invalid claim identity, source, index, network, result and raw metadata fail closed without mutation", async () => {
  const h = await setup();
  for (const fault of ["cb", "source", "index", "negative", "fractional", "network", "failed", "hash", "time", "missing", "empty", "request", "lineage", "basis", "duplicate"]) {
    const input = structuredClone({ initial: h.initial, claims: h.claims }) as DTO, c = input.claims[0];
    if (fault === "cb") input.claims = h.make({ cb: "0".repeat(72) });
    if (fault === "source") input.claims = h.make({ source: pool });
    if (fault === "index") c.operationIndex = 1;
    if (fault === "negative") c.operationIndex = -1;
    if (fault === "fractional") c.operationIndex = 0.5;
    if (fault === "network") c.transaction.hash = TransactionBuilder.fromXDR(c.transaction.envelope_xdr, Networks.PUBLIC).hash().toString("hex");
    if (fault === "failed") input.claims = h.make({ failed: true });
    if (fault === "hash") c.transaction.hash = "0".repeat(64);
    if (fault === "time") c.transaction.created_at = "2026-10-27T12:00:11Z";
    if (fault === "missing") input.claims = null;
    if (fault === "empty") input.claims = [];
    if (fault === "request") c.requestId = namespace;
    if (fault === "lineage") input.initial.issuances[0].unsignedJournal.transaction_hash = "0".repeat(64);
    if (fault === "basis") input.basis = { settled: true };
    if (fault === "duplicate") input.claims.push(structuredClone(c));
    reject(input);
  }
});
Deno.test("claims reject early ordering, inconsistent same-ledger identity, expired validity and unknown head", async () => {
  const h = await setup();
  for (const options of [{ ledger: 11, time: closedAt + 5, position: 1 }, { ledger: 10, time: closedAt + 4 },
    { ledger: 11, time: closedAt + 6 }, { ledger: 13, time: closedAt + 11 }, { ledger: 12, time: closedAt + 300 }, { ledger: 12, time: closedAt + 301 }]) {
    const initial = structuredClone(h.initial); initial.anchor.closedAt = Math.max(initial.anchor.closedAt, options.time);
    reject({ initial, claims: h.make(options) });
  }
  const value = projectBeneficiaryClaims({ initial: h.initial, claims: h.make({ ledger: 11, time: closedAt + 5, position: 2 }) });
  equal(value.claims[0].ledger, 11);
});
Deno.test("hostile projection input cannot execute getters, leak details or mutate the existing accounting basis", async () => {
  const h = await setup(); let reads = 0;
  const getter = { initial: h.initial, get claims() { reads++; throw Error("secret_DO_NOT_LEAK"); } };
  reject(getter, false); equal(reads, 0);
  const cycle: DTO = { initial: h.initial, claims: structuredClone(h.claims) }; cycle.claims[0].transaction.cycle = cycle; reject(cycle, false);
  reject({ initial: h.initial, claims: Array.from({ length: 101 }, () => structuredClone(h.claims[0])) });
  reject({ initial: h.initial, claims: h.claims, oversized: "x".repeat(2097153) });
  const initial = structuredClone(h.initial), extra = parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: initial.anchor }, ...h.claims[0] });
  initial.transactions.push(extra); const expected = calculateIssuanceEncumbrances(initial), value = projectBeneficiaryClaims({ initial, claims: h.claims });
  equal(value.basis, expected); equal(value.basis.unmatchedActivity.length > 0, true);
});
Deno.test("selected nonclaim operation rejects despite a valid claim elsewhere", async () => {
  const h = await setup(), claims = h.make({ prefix: true });
  const context = { pool, firstLedger: 8, anchor: h.initial.anchor };
  equal(parseIncludedTransaction({ context, ...claims[0] }).outcome, "success");
  equal(projectBeneficiaryClaims({ initial: h.initial, claims }).claims[0].operationIndex, 1);
  claims[0].operationIndex = 0;
  reject({ initial: h.initial, claims });
});
Deno.test("same-ledger claim requires the issuance ledger hash", async () => {
  const h = await setup(), claims = h.make({ ledger: 11, time: closedAt + 5, position: 2 });
  equal(projectBeneficiaryClaims({ initial: h.initial, claims }).claims[0].ledger, 11);
  claims[0].ledger.hash = "e".repeat(64);
  const context = { pool, firstLedger: 8, anchor: h.initial.anchor };
  equal(parseIncludedTransaction({ context, ...claims[0] }).outcome, "success");
  reject({ initial: h.initial, claims });
});
