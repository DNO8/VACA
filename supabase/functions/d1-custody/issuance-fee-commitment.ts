import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError, type Preparation } from "./handler.ts";
import { validateUnsignedTransaction } from "./unsigned-transaction.ts";

type ObjectValue = Record<string, unknown>;
const unavailable = () => new CustodyError("issuance_fee_commitment_unavailable", 503);
function requireValid(v: unknown): asserts v { if (!v) throw unavailable(); }
function object(v: unknown): v is ObjectValue { return v !== null && typeof v === "object" && !Array.isArray(v); }
function uuid(v: unknown): v is string { return typeof v === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v); }
function positive(v: unknown): v is string { return typeof v === "string" && /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n; }
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  return object(a) && object(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
}
function snapshot(v: unknown): unknown {
  const seen = new Set<object>(); let nodes = 0, characters = 0;
  function visit(x: unknown, depth: number) {
    requireValid(++nodes <= 20000 && depth <= 40);
    if (typeof x === "string") { requireValid((characters += x.length) <= 1048576); return; }
    if (x === null || typeof x === "boolean") return;
    if (typeof x === "number") { requireValid(Number.isFinite(x)); return; }
    requireValid(typeof x === "object" && x !== null && !seen.has(x)); seen.add(x);
    requireValid(Object.getPrototypeOf(x) === (Array.isArray(x) ? Array.prototype : Object.prototype) || Object.getPrototypeOf(x) === null);
    requireValid(Object.getOwnPropertySymbols(x).length === 0);
    if (Array.isArray(x)) requireValid(x.length <= 20000 && Object.keys(x).length === x.length && Object.keys(x).every((k, i) => k === String(i)));
    const descriptors = Object.getOwnPropertyDescriptors(x);
    requireValid(Object.keys(descriptors).length === Object.keys(x).length + (Array.isArray(x) ? 1 : 0));
    for (const [key, d] of Object.entries(descriptors)) {
      requireValid(!d.get && !d.set); if (Array.isArray(x) && key === "length") continue;
      requireValid(d.enumerable && (characters += key.length) <= 1048576); visit(d.value, depth + 1);
    }
  }
  visit(v, 0); const json = JSON.stringify(v); requireValid(new TextEncoder().encode(json).length <= 1048576); return JSON.parse(json);
}
interface RpcClient { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>; }
/** Trusted backend policy only; no wallet auth, current funding or signing authority. */
export class IssuanceFeeCommitmentDatabase {
  constructor(private readonly client: RpcClient, private readonly config: { pool: string; futureRefundFee(): string }) {}
  private async rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    let result: unknown;
    try { result = snapshot(await this.client.rpc(name, args)); } catch { throw unavailable(); }
    requireValid(object(result) && Object.hasOwn(result, "data") && Object.hasOwn(result, "error"));
    if (result.error !== null) {
      if (object(result.error) && result.error.code === "42501" && result.error.message === "unauthorized_admin_wallet") throw new CustodyError("unauthorized_admin_wallet", 403);
      throw unavailable();
    }
    return result.data;
  }
  async record(requestId: string, authenticatedAdmin: string): Promise<ObjectValue> {
    try { requireValid(uuid(requestId)); Keypair.fromPublicKey(authenticatedAdmin); Keypair.fromPublicKey(this.config.pool); } catch { throw unavailable(); }
    const args = { p_request_id: requestId, p_authorized_by: authenticatedAdmin };
    const lookup = await this.rpc("d1_load_issuance_fee_commitments", args);
    function bound(v: unknown, kind: string): v is ObjectValue {
      return object(v) && v.kind === kind && v.revision === 1 && v.request_id === requestId && uuid(v.namespace) && v.network === "TESTNET";
    }
    requireValid(bound(lookup, "d1_issuance_fee_commitment_lookup") && lookup.pool === this.config.pool && object(lookup.reservation));
    const unsigned = await this.rpc("d1_load_unsigned_transaction", args);
    requireValid(bound(unsigned, "d1_unsigned_transaction_lookup") && unsigned.namespace === lookup.namespace && unsigned.pool === lookup.pool && same(unsigned.reservation, lookup.reservation));
    const reservation = lookup.reservation, intent = reservation.intent, journal = unsigned.transaction;
    requireValid(bound(reservation, "d1_issuance_sequence_reservation") && reservation.namespace === lookup.namespace && reservation.pool === lookup.pool &&
      bound(intent, "d1_issuance_request_intent") && intent.namespace === lookup.namespace && intent.pool === lookup.pool && object(intent.preparation_input) &&
      intent.preparation_input.request_id === requestId && object(intent.preparation_input.payment) && intent.preparation_input.payment.pool === lookup.pool &&
      object(intent.preparation) && intent.preparation.revision === 1 && intent.preparation.state === "allocated" && intent.preparation.request_id === requestId && object(intent.preparation.allocation));
    const prepared = intent.preparation_input as unknown as Preparation;
    requireValid(bound(journal, "d1_unsigned_transaction_journal") && journal.namespace === lookup.namespace && journal.pool === lookup.pool &&
      same(journal.reservation, reservation) && object(prepared.request) && journal.deadline === prepared.request.deadline && journal.transaction_sequence === reservation.transaction_sequence);
    let fee: string;
    try {
      const valid = validateUnsignedTransaction({ prepared, pool: this.config.pool, networkPassphrase: Networks.TESTNET,
        observedSequence: reservation.observed_account_sequence as string, transactionSequence: reservation.transaction_sequence as string,
        unsignedXdr: journal.unsigned_xdr as string, expectedTransactionHash: journal.transaction_hash as string });
      const tx = TransactionBuilder.fromXDR(valid.unsignedXdr, Networks.TESTNET); requireValid(tx instanceof Transaction); fee = tx.fee;
    } catch { throw unavailable(); }
    const expected = (refund: string, authorizer: string) => ({ kind: "d1_issuance_fee_commitment", revision: 1, request_id: requestId, namespace: lookup.namespace,
      network: "TESTNET", pool: lookup.pool, authorized_by: authorizer, reservation, issuance_fee_stroops: fee, future_refund_fee_stroops: refund, deadline: prepared.request.deadline });
    function validateReceipt(v: unknown): asserts v is ObjectValue {
      requireValid(object(v) && positive(v.future_refund_fee_stroops) && positive(fee) && BigInt(fee) + BigInt(v.future_refund_fee_stroops) <= 9223372036854775807n);
      try { Keypair.fromPublicKey(v.authorized_by as string); } catch { throw unavailable(); }
      requireValid(same(v, expected(v.future_refund_fee_stroops, v.authorized_by as string)));
    }
    requireValid(Array.isArray(lookup.commitments));
    if (lookup.commitment !== null) {
      validateReceipt(lookup.commitment);
      //017 currently permits only one owner/request per namespace. Never ignore another record.
      requireValid(same(lookup.commitments, [lookup.commitment])); return lookup.commitment;
    }
    requireValid(lookup.commitments.length === 0);
    let refund: string; try { refund = this.config.futureRefundFee(); } catch { throw unavailable(); }
    requireValid(positive(refund) && positive(fee) && BigInt(fee) + BigInt(refund) <= 9223372036854775807n);
    const saved = await this.rpc("d1_record_issuance_fee_commitment", { ...args, p_issuance_fee_stroops: fee, p_future_refund_fee_stroops: refund });
    validateReceipt(saved); requireValid(same(saved, expected(refund, authenticatedAdmin)));
    return saved; // One awaited save; no automatic retry, readback, replan or release.
  }
}
