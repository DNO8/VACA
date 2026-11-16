import { hash, Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { parseCapturedJSONB, validateDonorCapturedHistory, type CapturedAllocation, type Immutable,
  type ValidatedDonorCapturedHistory } from "./donor-captured-history.ts";
import type { VerifiedDonorPaymentCommand } from "./donor-payment-command.ts";
import { CustodyError, type Preparation } from "./handler.ts";

export interface ValidatedDonorAllocation {
  requestId: string; beneficiary: string; amount: string; preparation: Preparation; raw: CapturedAllocation;
}
export interface ValidatedDonorCapturedAllocations extends ValidatedDonorCapturedHistory {
  allocations: ValidatedDonorAllocation[];
}
type ObjectValue = Record<string, unknown>;
const INT64 = 9223372036854775807n;
function valid(v: unknown): asserts v { if (!v) throw new CustodyError("donor_payment_unavailable", 503); }
function exact(v: unknown, keys: string): ObjectValue {
  valid(v !== null && typeof v === "object" && !Array.isArray(v));
  valid(Object.keys(v).sort().join(",") === keys); return v as ObjectValue;
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && same((a as ObjectValue)[k], (b as ObjectValue)[k]));
}
function address(v: unknown): string {
  valid(typeof v === "string" && /^G[A-Z2-7]{55}$/.test(v) && Keypair.fromPublicKey(v).publicKey() === v); return v;
}
function stroops(v: unknown): bigint {
  valid(typeof v === "string" && /^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(v));
  const n = BigInt(v.replace(".", "")); valid(n > 0n && n <= INT64); return n;
}
/** 054 uses PostgreSQL timestamp text; 015 receipts use UTC milliseconds.
 * Compare instants without accepting Date.parse's invalid-calendar normalization. */
function receiptTime(value: string): string {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  valid(m && !value.startsWith("0000"));
  const local = m[1] + "." + (m[2] ?? "").padEnd(3, "0") + "Z";
  valid(new Date(local).toISOString() === local);
  if (m[3] !== "Z") valid(Number(m[5]) <= 15 && Number(m[6]) <= 59);
  const utc = new Date(value).toISOString(); valid(/^\d{4}-/.test(utc)); return utc;
}
function freeze<T>(v: T): Immutable<T> {
  if (v !== null && typeof v === "object" && !Object.isFrozen(v)) {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v as Immutable<T>;
}

/** Private historical derivative only, not a public DTO or issuance verdict.
 * Outer history validation owns descriptor/byte limits, ownership and SDK replay.
 * Only its detached snapshot may reach the exported lossless JSONB parser. */
export function validateDonorCapturedAllocations(capture: unknown, expected: VerifiedDonorPaymentCommand): Immutable<ValidatedDonorCapturedAllocations> {
  try {
    const context = validateDonorCapturedHistory(capture, expected);
    const { capture: owned, payment, history } = context;
    const original = parseCapturedJSONB(owned.payment.payment);
    const transaction = history.transactions.find(t => t.transactionHash === payment.transactionHash);
    valid(transaction && transaction.outcome === "success");
    // History already certifies this exact SDK envelope/result and operation identity.
    const tx = TransactionBuilder.fromXDR(transaction.envelopeXdr, Networks.TESTNET);
    valid(tx instanceof Transaction);
    let allocated = 0n;
    const allocations = owned.allocations.map(raw => {
      const row = raw.donation_allocations, reservation = raw.release_requests, stored = raw.d1_preparations;
      valid(reservation && stored);
      const id = row.request_id, authorizer = address(row.authorized_by);
      valid(reservation.request_id === id && stored.request_id === id && stored.namespace === owned.scope.namespace);
      valid(row.transaction_hash === payment.transactionHash && row.operation_id === payment.operationId);
      valid(reservation.authorized_by === authorizer && reservation.state === "reserved");
      const input = exact(parseCapturedJSONB(stored.input), "authorized_by,confirmed_at,ledger,memo_hash,payment,request,request_id");
      valid(input.request_id === id && input.authorized_by === authorizer && same(input.payment, original));
      const request = exact(input.request, "amount,asset,beneficiary,deadline,donor,incident_id,version");
      valid(request.version === 1 && typeof request.incident_id === "string" && /^[!-~]([ -~]{0,254}[!-~])?$/.test(request.incident_id));
      valid(request.donor === payment.donor && same(request.asset, payment.asset));
      const beneficiary = address(request.beneficiary), amount = request.amount;
      const amountStroops = stroops(amount);
      valid(row.allocated_stroops === String(amountStroops));
      valid(same(parseCapturedJSONB(reservation.request), request));
      valid(input.confirmed_at === payment.confirmedAt && payment.confirmedAt >= 1 && payment.confirmedAt <= 99999999999 &&
        payment.confirmedAt <= owned.dbReadAt && input.ledger === transaction.ledger && request.deadline === payment.deadline);
      const memo = hash(Buffer.from("vaca.d1.donation.v1\n" + request.incident_id)).toString("hex");
      valid(input.memo_hash === memo && tx.memo.type === "hash" && tx.memo.value !== null &&
        Buffer.from(tx.memo.value).toString("hex") === memo);
      // Reconstruct the complete 015 receipt, including the real legacy allocator
      // reservation/payment receipt. A placeholder allocation:{} is never proof.
      valid(same(parseCapturedJSONB(stored.receipt), { revision: 1, state: "allocated", request_id: id, allocation: {
        reservation: { request_id: id, authorized_by: authorizer, request, state: "reserved", reserved_at: receiptTime(reservation.reserved_at) },
        payment: original, allocated_amount: amount, state: "allocated", allocated_at: receiptTime(row.allocated_at),
      } }));
      allocated += amountStroops;
      valid(allocated <= INT64 && allocated <= BigInt(owned.payment.donation_stroops));
      return { requestId: id, beneficiary, amount: amount as string, preparation: input as unknown as Preparation, raw };
    });
    valid(String(allocated) === owned.payment.allocated_stroops);
    // Outer validation already enforces unique, canonical, lexicographically sorted IDs.
    // Retained issuance descendants have shape/JSON safety only, NOT provenance.
    return freeze({ ...context, allocations });
  } catch { throw new CustodyError("donor_payment_unavailable", 503); }
}
