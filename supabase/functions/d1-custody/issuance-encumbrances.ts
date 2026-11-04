import { Keypair, Networks, Transaction, TransactionBuilder, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError, type Preparation } from "./handler.ts";
import { calculateOriginalObligations, type OriginalObligations } from "./original-obligations.ts";
import { validateUnsignedTransaction } from "./unsigned-transaction.ts";
import { parseInitialIssuanceOutcome } from "./initial-issuance-outcome.ts";
import type { IncludedTransactionObservation } from "./transaction-observation.ts";
type DTO = Record<string, unknown>;
type Donation = OriginalObligations["donations"][number];
type Input = Parameters<typeof calculateOriginalObligations>[0] & { issuances: unknown[] };
type Frozen<T> = { readonly [K in keyof T]: Frozen<T[K]> };
export interface IssuanceEncumbrance {
  requestId: string; attemptId: string; outcomeHash: string; authorizedBy: string;
  donor: string; beneficiary: string; asset: Donation["asset"]; amountStroops: string;
  operationId: string; paymentTransactionHash: string; deadline: string;
  issuanceTransactionHash: string; claimableBalanceId: string; feeChargedStroops: string; sequence: string;
}
export type IssuanceEncumbrances = Frozen<{
  kind: "d1_issuance_encumbrances"; revision: 1; original: OriginalObligations;
  donations: (Donation & { issuedStroops: string; unissuedStroops: string })[];
  encumbrances: IssuanceEncumbrance[];
  failedIssuances: { requestId: string; transactionHash: string; attemptId: string; feeChargedStroops: string; sequence: string }[];
  unmatchedActivity: OriginalObligations["unexplainedActivity"];
}>;
function valid(v: unknown): asserts v { if (!v) throw Error("invalid"); }
function copy(input: unknown): unknown {
  let nodes = 0, bytes = 8388608;
  function visit(v: unknown, depth: number): unknown {
    valid(++nodes <= 1000000 && depth <= 32 && (bytes -= 8) >= 0);
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { valid(Number.isSafeInteger(v)); return v; }
    if (typeof v === "string") {
      valid(v.length <= bytes && !/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v));
      valid((bytes -= Buffer.byteLength(JSON.stringify(v), "utf8")) >= 0); return v;
    }
    valid(v !== null && typeof v === "object"); const array = Array.isArray(v), ds = Object.getOwnPropertyDescriptors(v), keys = Reflect.ownKeys(v);
    valid(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype));
    valid(keys.every(k => typeof k === "string" && "value" in ds[k] && (ds[k].enumerable || (array && k === "length"))));
    if (array) { const n = ds.length.value; valid(n <= 1000000 && keys.length === n + 1);
      return Array.from({ length: n }, (_, i) => { valid(Object.hasOwn(ds, i)); return visit(ds[String(i)].value, depth + 1); }); }
    return Object.fromEntries((keys as string[]).sort().map(k => [visit(k, depth + 1), visit(ds[k].value, depth + 1)]));
  }
  return visit(input, 0);
}
function exact(v: unknown, keys: string): DTO {
  valid(v !== null && typeof v === "object" && !Array.isArray(v));
  valid(Object.keys(v).sort().join(",") === keys.split(",").sort().join(",")); return v as DTO;
}
function same(a: unknown, b: unknown) { return JSON.stringify(copy(a)) === JSON.stringify(copy(b)); }
function uuid(v: unknown): asserts v is string { valid(typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)); }
function hash(v: unknown): asserts v is string { valid(typeof v === "string" && /^[0-9a-f]{64}$/.test(v)); }
function key(v: unknown): asserts v is string { valid(typeof v === "string"); Keypair.fromPublicKey(v); }
function amount(v: unknown): bigint {
  valid(typeof v === "string" && /^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(v));
  const n = BigInt(v.replace(".", "")); valid(n > 0n && n <= 9223372036854775807n); return n;
}
function freeze<T>(v: T): Frozen<T> { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v as Frozen<T>; }
/** Pure projection of trusted persisted018/T4h evidence, NOT authentication,
 * current CB state, principal discharge or permission to spend/release/retry. */
export function calculateIssuanceEncumbrances(input: Input): IssuanceEncumbrances {
  try {
    const data = exact(copy(input), "namespace,pool,firstLedger,anchor,transactions,operatingCredits,issuances") as unknown as Input;
    valid(Array.isArray(data.issuances) && data.issuances.length <= 1000);
    const { namespace, pool, firstLedger, anchor, transactions, operatingCredits } = data;
    const original = calculateOriginalObligations({ namespace, pool, firstLedger, anchor, transactions, operatingCredits });
    const records = new Map((transactions as IncludedTransactionObservation[]).map(r => [r.transactionHash, r]));
    const used = new Set<string>(), recognized = new Set<string>(), totals = new Map<string, bigint>();
    const encumbrances: IssuanceEncumbrance[] = [], failedIssuances: { requestId: string; transactionHash: string; attemptId: string; feeChargedStroops: string; sequence: string }[] = [];
    const scope = (v: DTO, kind: string, id: string) => valid(v.kind === kind && v.revision === 1 && v.request_id === id && v.namespace === namespace && v.pool === pool && v.network === "TESTNET");
    for (const value of data.issuances) {
      const entry = exact(value, "unsignedJournal,outcomeReceipt");
      const j = exact(entry.unsignedJournal, "kind,revision,request_id,namespace,network,pool,reservation,deadline,transaction_sequence,unsigned_xdr,transaction_hash");
      uuid(j.request_id); const id = j.request_id; scope(j, "d1_unsigned_transaction_journal", id);
      const r = exact(j.reservation, "kind,revision,request_id,namespace,network,pool,observed_account_sequence,transaction_sequence,intent"); scope(r, "d1_issuance_sequence_reservation", id);
      const intent = exact(r.intent, "kind,revision,request_id,namespace,network,pool,preparation_input,preparation"); scope(intent, "d1_issuance_request_intent", id);
      const p = exact(intent.preparation_input, "request_id,authorized_by,confirmed_at,ledger,memo_hash,payment,request");
      valid(p.request_id === id); key(p.authorized_by);
      const allocated = exact(intent.preparation, "revision,state,request_id,allocation"); valid(allocated.revision === 1 && allocated.state === "allocated" && allocated.request_id === id);
      const payment = exact(p.payment, "transaction_hash,operation_id,donor,pool,amount,asset");
      const request = exact(p.request, "version,incident_id,donor,beneficiary,amount,asset,deadline");
      const donation = original.donations.find(d => d.operationId === payment.operation_id && d.transactionHash === payment.transaction_hash);
      valid(donation && payment.pool === pool && payment.donor === donation.donor && request.donor === donation.donor &&
        same(payment.asset, donation.asset) && same(request.asset, donation.asset) && amount(payment.amount) === BigInt(donation.amountStroops) &&
        p.confirmed_at === donation.confirmedAt && p.ledger === records.get(donation.transactionHash)?.ledger);
      key(request.beneficiary); valid(typeof request.deadline === "string" && Date.parse(request.deadline) / 1000 === donation.confirmedAt + 300 && j.deadline === request.deadline);
      valid(typeof j.unsigned_xdr === "string" && typeof r.observed_account_sequence === "string" && typeof r.transaction_sequence === "string" && j.transaction_sequence === r.transaction_sequence); hash(j.transaction_hash);
      validateUnsignedTransaction({ prepared: p as unknown as Preparation, pool, networkPassphrase: Networks.TESTNET,
        observedSequence: r.observed_account_sequence, transactionSequence: r.transaction_sequence, unsignedXdr: j.unsigned_xdr, expectedTransactionHash: j.transaction_hash });
      const receipt = exact(entry.outcomeReceipt, "kind,revision,request_id,namespace,network,pool,authorized_by,attempt_id,transaction_hash,envelope_hash,outcome_hash,observed_outcome");
      scope(receipt, "d1_issuance_outcome_journal", id); key(receipt.authorized_by); uuid(receipt.attempt_id);
      hash(receipt.transaction_hash); hash(receipt.envelope_hash); hash(receipt.outcome_hash); valid(receipt.transaction_hash === j.transaction_hash);
      for (const token of ["request:" + id, "attempt:" + receipt.attempt_id, "transaction:" + receipt.transaction_hash]) { valid(!used.has(token)); used.add(token); }
      const record = records.get(receipt.transaction_hash); valid(record !== undefined);
      const decoded = parseInitialIssuanceOutcome(pool, record.envelopeXdr, { context: record.context, ...record.raw });
      valid(same(decoded.observation, record) && same(decoded, receipt.observed_outcome) && digest(Buffer.from(record.envelopeXdr, "base64")).toString("hex") === receipt.envelope_hash);
      const unsigned = TransactionBuilder.fromXDR(j.unsigned_xdr, Networks.TESTNET), signed = TransactionBuilder.fromXDR(record.envelopeXdr, Networks.TESTNET);
      valid(unsigned instanceof Transaction && signed instanceof Transaction && signed.toEnvelope().v1().tx().toXDR("base64") === unsigned.toEnvelope().v1().tx().toXDR("base64"));
      if (decoded.outcome === "failed") { failedIssuances.push({ requestId: id, transactionHash: record.transactionHash, attemptId: receipt.attempt_id, feeChargedStroops: record.feeChargedStroops, sequence: record.sequence }); continue; }
      valid(!used.has("cb:" + decoded.claimableBalanceId)); used.add("cb:" + decoded.claimableBalanceId);
      const issued = amount(request.amount), total = (totals.get(donation.operationId) ?? 0n) + issued;
      valid(total <= BigInt(donation.amountStroops)); totals.set(donation.operationId, total); recognized.add(record.transactionHash);
      encumbrances.push({ requestId: id, attemptId: receipt.attempt_id, outcomeHash: receipt.outcome_hash, authorizedBy: receipt.authorized_by,
        donor: donation.donor, beneficiary: request.beneficiary, asset: donation.asset, amountStroops: issued.toString(), operationId: donation.operationId,
        paymentTransactionHash: donation.transactionHash, deadline: request.deadline, issuanceTransactionHash: record.transactionHash,
        claimableBalanceId: decoded.claimableBalanceId, feeChargedStroops: record.feeChargedStroops, sequence: record.sequence });
    }
    return freeze({ kind: "d1_issuance_encumbrances" as const, revision: 1 as const, original,
      donations: original.donations.map(d => ({ ...d, issuedStroops: (totals.get(d.operationId) ?? 0n).toString(), unissuedStroops: (BigInt(d.amountStroops) - (totals.get(d.operationId) ?? 0n)).toString() })),
      encumbrances, failedIssuances, unmatchedActivity: original.unexplainedActivity.filter(a => a.operationIndex !== 0 || !recognized.has(a.transactionHash)) });
  } catch { throw new CustodyError("issuance_encumbrances_unavailable", 503); }
}
