import { Account, Asset, Keypair, Networks, Operation, Transaction, TransactionBuilder, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import type { RefundOriginalPayment } from "./refund-outcome.ts";
import type { IssuanceEncumbrance } from "./issuance-encumbrances.ts";
import type { RemainderCandidateReceipt } from "./remainder-candidate-journal.ts";
import { parseIncludedTransaction, type IncludedTransactionObservation } from "./transaction-observation.ts";

type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
type Data = Record<string, unknown>;
/** Original full-gross payment plus existing018/032 identity names; NOT a receipt or capability. */
export interface RemainderOriginalPayment extends RefundOriginalPayment, Pick<IssuanceEncumbrance,
  "requestId" | "operationId" | "paymentTransactionHash" | "issuanceTransactionHash" | "outcomeHash" | "claimableBalanceId" | "sequence"> {
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
}
export interface RemainderOutcome {
  readonly kind: "d1_remainder_outcome";
  readonly revision: 2;
  readonly candidate: Readonly<RemainderCandidateReceipt>;
  readonly originalPayment: Readonly<RemainderOriginalPayment>;
  readonly observation: IncludedTransactionObservation;
  readonly transactionHash: string;
  readonly envelopeSha256: string;
  readonly operationIndex: 0;
  readonly outcome: "success" | "failed";
  readonly donorRefundedPrincipalStroops: string;
  readonly feePayer: string;
  readonly feeChargedStroops: string;
}
const candidateKeys = "kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,acquisition_hash,claimable_balance_id,claim_set_hash,claim_set_count,history_state,gross_stroops,claimed_stroops,remaining_stroops,asset,donor,deadline,source_sequence,transaction_sequence,valid_until,unsigned_xdr,transaction_hash";
const originalKeys = "donor,asset,grossAmount,confirmedAt,requestId,operationId,paymentTransactionHash,issuanceTransactionHash,outcomeHash,claimableBalanceId,sequence,namespace,network,pool";
function check(value: unknown): asserts value { if (!value) throw new Error("invalid"); }
function exact(value: unknown, keys: string): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const names = Reflect.ownKeys(value), ds = Object.getOwnPropertyDescriptors(value);
  check(names.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  check((names as string[]).sort().join(",") === keys.split(",").sort().join(","));
  return Object.fromEntries(names.map(k => [k, ds[k as string].value]));
}
/** Bounded descriptor-only JSON copy before field access or SDK decode. */
function snapshot<T>(value: T): Frozen<T> {
  let nodes = 0, budget = 1048576;
  const active = new Set<object>();
  function visit(v: unknown, depth: number): unknown {
    check(++nodes <= 20000 && depth <= 32 && (budget -= 8) >= 0);
    if (typeof v === "string") {
      check(v.length <= budget && !/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v));
      check((budget -= Buffer.byteLength(JSON.stringify(v), "utf8")) >= 0); return v;
    }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return v; }
    check(typeof v === "object" && v !== null && !active.has(v)); active.add(v);
    const array = Array.isArray(v), ds = Object.getOwnPropertyDescriptors(v), keys = Reflect.ownKeys(v);
    check(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype) && keys.length <= 20000);
    check(keys.every(k => typeof k === "string" && "value" in ds[k] && (ds[k].enumerable || array && k === "length")));
    let result: unknown;
    if (array) {
      const n = ds.length.value;
      check(Number.isSafeInteger(n) && n >= 0 && n <= 20000 && keys.length === n + 1);
      result = Object.freeze(Array.from({ length: n }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d); return visit(d.value, depth + 1);
      }));
    } else result = Object.freeze(Object.fromEntries((keys as string[]).sort().map(k => [visit(k, depth + 1), visit(ds[k].value, depth + 1)])));
    active.delete(v); return result;
  }
  return visit(value, 0) as Frozen<T>;
}
const same = (a: unknown, b: unknown) => JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b));
function address(v: unknown): asserts v is string { check(typeof v === "string" && Keypair.fromPublicKey(v).publicKey() === v); }
function hash(v: unknown): asserts v is string { check(typeof v === "string" && /^[0-9a-f]{64}$/.test(v)); }
function uuid(v: unknown): asserts v is string { check(typeof v === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v)); }
function integer(v: unknown, maximum = 9223372036854775807n): bigint {
  check(typeof v === "string" && /^(0|[1-9][0-9]{0,19})$/.test(v));
  const n = BigInt(v); check(n <= maximum); return n;
}
function uint(v: unknown, min: number, max: number): asserts v is number {
  check(typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max);
}
function timestamp(v: unknown): number {
  check(typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v));
  const n = Date.parse(v) / 1000; uint(n, 0, 253402300799);
  check(new Date(n * 1000).toISOString().replace(".000Z", "Z") === v); return n;
}
function base64(v: unknown): asserts v is string {
  check(typeof v === "string" && v.length >= 4 && v.length <= 65536 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v) && Buffer.from(v, "base64").toString("base64") === v);
}
/** Pure SDK consistency, not authenticated journal/provider membership or durable settlement.
 * Only an internal genuine observer may supply authentic originals,041/045 and025 inclusion.
 * Unknown/absent/timeout input throws; it never becomes a failed or zero-principal outcome.
 */
export function parseRemainderOutcome(
  candidate: Readonly<RemainderCandidateReceipt>, originalPayment: Readonly<RemainderOriginalPayment>,
  savedSignedXdr: string, input: Parameters<typeof parseIncludedTransaction>[0],
): Frozen<RemainderOutcome> {
  try {
    const detached = snapshot({ candidate, originalPayment, savedSignedXdr, input });
    const c = exact(detached.candidate, candidateKeys), p = exact(detached.originalPayment, originalKeys);
    check(c.kind === "d1_remainder_candidate" && c.revision === 2 && c.network === "TESTNET" && p.network === "TESTNET");
    uuid(c.request_id); uuid(c.namespace); address(c.pool); address(c.authorized_by); address(p.donor);
    check(p.requestId === c.request_id && p.namespace === c.namespace && p.pool === c.pool && p.donor === c.donor);
    for (const v of [c.initial_transaction_hash, c.initial_outcome_hash, c.acquisition_hash, c.claim_set_hash, c.transaction_hash, p.paymentTransactionHash]) hash(v);
    check(p.issuanceTransactionHash === c.initial_transaction_hash && p.outcomeHash === c.initial_outcome_hash &&
      p.claimableBalanceId === c.claimable_balance_id && typeof p.claimableBalanceId === "string" && /^00000000[0-9a-f]{64}$/.test(p.claimableBalanceId));
    check(integer(p.operationId, 18446744073709551615n) > 0n);
    uint(c.claim_set_count, 1, 1000);
    const history = exact(c.history_state, "kind,revision,namespace,network,pool,first_ledger,income_state,checkpoint,coverage_complete,page_count,record_count");
    check(history.kind === "d1_transaction_history_state" && history.revision === 1 && history.network === "TESTNET" &&
      history.namespace === c.namespace && history.pool === c.pool && history.coverage_complete === true);
    uint(history.first_ledger, 1, 4294967295); uint(history.page_count, 0, Number.MAX_SAFE_INTEGER); uint(history.record_count, 0, Number.MAX_SAFE_INTEGER);
    const checkpoint = exact(history.checkpoint, "through_ledger,ledger_hash,closed_at,cursor");
    uint(checkpoint.through_ledger, history.first_ledger, 4294967295); uint(checkpoint.closed_at, 0, 253402300799);
    hash(checkpoint.ledger_hash); integer(checkpoint.cursor, 18446744073709551615n);
    const gross = integer(c.gross_stroops), claimed = integer(c.claimed_stroops), remaining = integer(c.remaining_stroops);
    check(gross > 0n && claimed > 0n && remaining > 0n && claimed + remaining === gross &&
      typeof p.grossAmount === "string" && /^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(p.grossAmount) && BigInt(p.grossAmount.replace(".", "")) === gross);
    const asset = exact(p.asset, (p.asset as RefundOriginalPayment["asset"]).type === "native" ? "type" : "type,code,issuer");
    let sdkAsset: Asset;
    if (asset.type === "native") sdkAsset = Asset.native();
    else {
      check(asset.type === "issued" && typeof asset.code === "string" && /^[A-Za-z0-9]{1,12}$/.test(asset.code));
      address(asset.issuer); sdkAsset = new Asset(asset.code, asset.issuer);
    }
    check(same(c.asset, p.asset));
    const confirmedAt = timestamp(p.confirmedAt), deadline = timestamp(c.deadline);
    check(deadline === confirmedAt + 300);
    const until = integer(c.valid_until, 253402300799n); check(until > BigInt(deadline));
    const sourceSequence = integer(c.source_sequence), initialSequence = integer(p.sequence);
    check(initialSequence > 0n && sourceSequence >= initialSequence && sourceSequence < 9223372036854775807n &&
      c.transaction_sequence === (sourceSequence + 1n).toString());
    base64(c.unsigned_xdr); base64(detached.savedSignedXdr);
    const unsigned = TransactionBuilder.fromXDR(c.unsigned_xdr, Networks.TESTNET);
    const signed = TransactionBuilder.fromXDR(detached.savedSignedXdr, Networks.TESTNET);
    check(unsigned instanceof Transaction && signed instanceof Transaction);
    const fee = integer(unsigned.fee, 4294967295n); check(fee > 0n);
    const amount = `${remaining / 10000000n}.${(remaining % 10000000n).toString().padStart(7, "0")}`;
    const expected = new TransactionBuilder(new Account(c.pool, sourceSequence.toString()), { fee: fee.toString(),
      networkPassphrase: Networks.TESTNET, timebounds: { minTime: deadline, maxTime: Number(until) } })
      .addOperation(Operation.payment({ destination: p.donor, asset: sdkAsset, amount })).build();
    // Exact reconstruction excludes memo, extra preconditions, operation sources, CB claims and signatures.
    check(unsigned.toEnvelope().switch().name === "envelopeTypeTx" && signed.toEnvelope().switch().name === "envelopeTypeTx" &&
      unsigned.signatures.length === 0 && unsigned.toXDR() === c.unsigned_xdr && expected.toXDR() === c.unsigned_xdr &&
      signed.toXDR() === detached.savedSignedXdr && signed.signatures.length === 1 &&
      signed.toEnvelope().v1().tx().toXDR("base64") === unsigned.toEnvelope().v1().tx().toXDR("base64") &&
      expected.hash().toString("hex") === c.transaction_hash && signed.hash().toString("hex") === c.transaction_hash);
    const verifier = Keypair.fromPublicKey(c.pool), signature = signed.signatures[0];
    check(signature.signature().length === 64 && signature.hint().toString("hex") === verifier.signatureHint().toString("hex") &&
      verifier.verify(signed.hash(), signature.signature()));
    // Canonical body + single verified signature suffice; never mutate SDK signature getters.
    const observation = parseIncludedTransaction(detached.input);
    check(observation.network === "TESTNET" && observation.context.pool === c.pool && observation.context.firstLedger === history.first_ledger &&
      observation.source === c.pool && observation.feePayer === c.pool &&
      observation.transactionHash === c.transaction_hash && observation.sequence === c.transaction_sequence && observation.envelopeXdr === detached.savedSignedXdr &&
      observation.feeBidStroops === fee.toString() && integer(observation.feeChargedStroops) <= fee &&
      observation.closedAt >= deadline && BigInt(observation.closedAt) <= until &&
      same(observation.operationTypes, [1]) && same(observation.poolOperationSourceIndices, [0]));
    // txFailed is atomic: included native fee is paid, but NONE of the remaining principal is discharged.
    return snapshot({ kind: "d1_remainder_outcome", revision: 2, candidate: detached.candidate, originalPayment: detached.originalPayment,
      observation, transactionHash: c.transaction_hash, envelopeSha256: digest(Buffer.from(detached.savedSignedXdr, "base64")).toString("hex"),
      operationIndex: 0, outcome: observation.outcome, donorRefundedPrincipalStroops: observation.outcome === "success" ? remaining.toString() : "0",
      feePayer: observation.feePayer, feeChargedStroops: observation.feeChargedStroops }) as Frozen<RemainderOutcome>;
  } catch { throw new CustodyError("remainder_outcome_unavailable", 503); }
}
