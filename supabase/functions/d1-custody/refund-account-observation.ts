import { Networks, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import type { RefundCandidateReceipt } from "./refund-candidate-journal.ts";
import type { RefundCandidateClient } from "./refund-candidate-journal.ts";
import type { TransactionHistoryState } from "./transaction-ingestion.ts";
import type { PoolAccountObservation } from "./discovery-source.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { loadRecoveryRefundCandidate } from "./refund-candidate-journal.ts";
import { readTransactionHistory } from "./transaction-history-reader.ts";
import type { RefundCandidateScope } from "./refund-candidate-journal.ts";

export interface RefundAccountBindingTiming {
  readonly startedAt: number;
  readonly observedAt: number;
  readonly maximumAgeSeconds: number;
  readonly futureToleranceSeconds: number;
}
type DTO = Record<string, unknown>;
const MAX = 9223372036854775807n, UINT32 = 4294967295;
function valid(v: unknown): asserts v { if (!v) throw new CustodyError("refund_account_observation_unavailable", 503); }
/** Descriptor-only snapshots preserve valid aliases by copying each occurrence. */
function copy(value: unknown, active = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  valid(typeof value === "object" && !active.has(value));
  const array = Array.isArray(value), ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  valid(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype));
  valid(keys.every(k => typeof k === "string" && "value" in ds[k] && (ds[k].enumerable || (array && k === "length"))));
  active.add(value); let result: unknown;
  if (array) {
    const length = ds.length.value; valid(keys.length === length + 1);
    result = Array.from({ length }, (_, i) => { valid(Object.hasOwn(ds, i)); return copy(ds[String(i)].value, active); });
  } else result = Object.fromEntries(Object.entries(ds).map(([k, d]) => [k, copy(d.value, active)]));
  active.delete(value); return result;
}
function exact(v: unknown, keys: string): DTO {
  valid(v !== null && typeof v === "object" && !Array.isArray(v));
  valid(Object.keys(v).sort().join(",") === keys.split(",").sort().join(",")); return v as DTO;
}
function uint(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): asserts v is number {
  valid(typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max);
}
function decimal(v: unknown, min = 0n, max = MAX): bigint {
  valid(typeof v === "string" && /^(0|[1-9][0-9]{0,19})$/.test(v)); const n = BigInt(v); valid(n >= min && n <= max); return n;
}
function address(v: unknown) { valid(typeof v === "string" && StrKey.isValidEd25519PublicKey(v)); }
function hash(v: unknown) { valid(typeof v === "string" && /^[0-9a-f]{64}$/.test(v)); }
function uuid(v: unknown) { valid(typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)); }
function freeze<T>(v: T): T {
  if (v !== null && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v;
}
/** Account-independent window checks can also run before a later provider await. */
function window(candidate: Readonly<RefundCandidateReceipt>, timing: RefundAccountBindingTiming) {
  const c = exact(copy(candidate), "kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,source_sequence,transaction_sequence,deadline,unsigned_xdr,transaction_hash");
  const t = exact(copy(timing), "startedAt,observedAt,maximumAgeSeconds,futureToleranceSeconds");
  valid(c.kind === "d1_refund_candidate" && c.revision === 1 && c.network === "TESTNET");
  uuid(c.namespace); uuid(c.request_id); address(c.pool); address(c.authorized_by);
  hash(c.initial_transaction_hash); hash(c.initial_outcome_hash); hash(c.transaction_hash);
  const sequence = decimal(c.source_sequence, 1n, MAX - 1n); valid(c.transaction_sequence === (sequence + 1n).toString());
  valid(typeof c.deadline === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(c.deadline));
  const cutoff = Date.parse(c.deadline) / 1000; uint(cutoff);
  valid(new Date(cutoff * 1000).toISOString().replace(".000Z", "Z") === c.deadline);
  valid(typeof c.unsigned_xdr === "string" && Buffer.from(c.unsigned_xdr, "base64").toString("base64") === c.unsigned_xdr);
  const tx = TransactionBuilder.fromXDR(c.unsigned_xdr, Networks.TESTNET);
  valid(tx instanceof Transaction && tx.toEnvelope().switch().name === "envelopeTypeTx" && tx.signatures.length === 0 &&
    tx.toXDR() === c.unsigned_xdr && tx.source === c.pool && tx.sequence === c.transaction_sequence && tx.hash().toString("hex") === c.transaction_hash);
  valid(tx.timeBounds !== undefined && tx.timeBounds.minTime === String(cutoff));
  const maxTime = Number(tx.timeBounds.maxTime); uint(maxTime, 1); valid(String(maxTime) === tx.timeBounds.maxTime);
  uint(t.startedAt); uint(t.observedAt); uint(t.maximumAgeSeconds, 1, 30); uint(t.futureToleranceSeconds, 0, 2);
  valid(t.startedAt >= cutoff && t.observedAt >= t.startedAt && t.startedAt < maxTime && t.observedAt < maxTime);
  return { c, t: { startedAt: t.startedAt, observedAt: t.observedAt,
    maximumAgeSeconds: t.maximumAgeSeconds, futureToleranceSeconds: t.futureToleranceSeconds } };
}
function checkpoint(value: unknown, first: number, transaction: boolean) {
  const cp = exact(value, "cursor,through_ledger,ledger_hash,closed_at");
  uint(cp.through_ledger, first, UINT32); uint(cp.closed_at, 0, 253402300799); hash(cp.ledger_hash);
  const cursor = decimal(cp.cursor, 0n, 18446744073709551615n); valid(cursor >> 32n <= BigInt(cp.through_ledger));
  if (transaction && cursor !== 0n) valid((cursor & 4095n) === 0n && ((cursor >> 12n) & 1048575n) > 0n && cursor >> 32n >= BigInt(first));
  return cp;
}
/** Pure normalized binding; no authentication, history provenance or spending authority. */
export function validateRefundAccountBinding(
  candidate: Readonly<RefundCandidateReceipt>, historyState: Readonly<TransactionHistoryState>,
  account: DeepReadonly<PoolAccountObservation>, timing: RefundAccountBindingTiming,
): Readonly<PoolAccountObservation> {
  try {
    const { c, t } = window(candidate, timing);
    const h = exact(copy(historyState), "kind,revision,namespace,network,pool,first_ledger,income_state,checkpoint,coverage_complete,page_count,record_count");
    const binding = (v: DTO) => valid(v.namespace === c.namespace && v.pool === c.pool && v.network === "TESTNET" && v.revision === 1);
    binding(h); valid(h.kind === "d1_transaction_history_state" && h.coverage_complete === true);
    uint(h.first_ledger, 1, UINT32); uint(h.page_count, 1); uint(h.record_count);
    valid(BigInt(h.record_count) <= BigInt(h.page_count) * 100n);
    const income = exact(h.income_state, "kind,revision,namespace,network,pool,first_ledger,checkpoint,coverage_complete");
    binding(income); valid(income.kind === "d1_discovery_state" && income.coverage_complete === true && income.first_ledger === h.first_ledger);
    const cp = checkpoint(h.checkpoint, h.first_ledger, true), icp = checkpoint(income.checkpoint, h.first_ledger, false);
    valid(h.record_count === 0 ? cp.cursor === "0" : cp.cursor !== "0");
    valid(cp.through_ledger === icp.through_ledger && cp.ledger_hash === icp.ledger_hash && cp.closed_at === icp.closed_at);
    // Snapshot immediately: this same primitive is reusable before any future await.
    const a = exact(copy(account), "pool,networkPassphrase,anchor,baseFee,baseReserve,sequence,lastModifiedLedger,native,issuedBalances,account");
    valid(a.pool === c.pool && a.networkPassphrase === Networks.TESTNET && a.sequence === c.source_sequence); decimal(a.sequence);
    const anchor = exact(a.anchor, "sequence,hash,closedAt");
    valid(anchor.sequence === cp.through_ledger && anchor.hash === cp.ledger_hash && anchor.closedAt === cp.closed_at);
    uint(a.lastModifiedLedger, 1, cp.through_ledger as number);
    decimal(a.baseFee, 1n, BigInt(UINT32)); decimal(a.baseReserve, 1n, BigInt(UINT32));
    const native = exact(a.native, "balance,sellingLiabilities"); decimal(native.balance); decimal(native.sellingLiabilities);
    const counts = exact(a.account, "subentry_count,num_sponsoring,num_sponsored");
    Object.values(counts).forEach(n => uint(n, 0, UINT32)); valid(Array.isArray(a.issuedBalances));
    const assets = new Set<string>();
    for (const value of a.issuedBalances) {
      const b = exact(value, "code,issuer,balance,sellingLiabilities");
      valid(typeof b.code === "string" && /^[A-Za-z0-9]{1,12}$/.test(b.code)); address(b.issuer);
      const key = b.code + ":" + b.issuer; valid(!assets.has(key)); assets.add(key); decimal(b.balance); decimal(b.sellingLiabilities);
    }
    // Freshness belongs to the observation endpoint, not the operation's start.
    valid(t.observedAt - (cp.closed_at as number) <= t.maximumAgeSeconds && (cp.closed_at as number) - t.observedAt <= t.futureToleranceSeconds);
    return freeze(a) as unknown as Readonly<PoolAccountObservation>;
  } catch {
    throw new CustodyError("refund_account_observation_unavailable", 503);
  }
}

const refundReadNames = new Set(["d1_load_refund_candidate", "d1_load_issuance_outcome", "d1_load_submission_attempt",
  "d1_load_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_issuance_fee_commitments",
  "d1_load_active_issuance_sequence", "d1_load_transaction_history_state", "d1_list_transaction_records", "d1_load_discovery_state",
  "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit"]);
/** Capture a data method without invoking a getter or losing its original receiver. */
function captureMethod(receiver: unknown, key: string): (...args: unknown[]) => unknown {
  valid(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, descriptor: PropertyDescriptor | undefined;
  while (owner !== null) {
    descriptor = Object.getOwnPropertyDescriptor(owner, key); if (descriptor) break;
    owner = Object.getPrototypeOf(owner);
  }
  valid(descriptor && "value" in descriptor && typeof descriptor.value === "function");
  const method = descriptor.value;
  return (...args) => Reflect.apply(method, receiver, args);
}
/** T4 JSON transport policy is separate from T2's unchanged normalized-data copy. */
function copyReadJSON(value: unknown): unknown {
  const result = copy(value);
  const finite = (v: unknown): void => {
    if (typeof v === "number") valid(Number.isFinite(v));
    else if (v !== null && typeof v === "object") Object.values(v).forEach(finite);
  };
  finite(result); return result;
}
/** Capture a read-only transport boundary, not authentication or ledger proof. */
export function captureRefundReadClient(client: RefundCandidateClient): Readonly<RefundCandidateClient> {
  try {
    const invoke = captureMethod(client, "rpc");
    return Object.freeze({ async rpc(name: string, parameters: Record<string, unknown>) {
      try {
        valid(typeof name === "string" && refundReadNames.has(name));
        valid(parameters !== null && typeof parameters === "object" && Object.getPrototypeOf(parameters) === Object.prototype);
        const captured = copyReadJSON(parameters);
        // Both trusted async invocation and immediate reply copying are inside this catch.
        const reply = await invoke(name, captured);
        return copyReadJSON(reply) as Awaited<ReturnType<RefundCandidateClient["rpc"]>>;
      } catch { throw new CustodyError("refund_account_observation_unavailable", 503); }
    } });
  } catch { throw new CustodyError("refund_account_observation_unavailable", 503); }
}

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export interface SavedRefundAccountOptions {
  readonly now: () => number;
  readonly maximumAgeSeconds: number;
  readonly futureToleranceSeconds: number;
  readonly source?: Pick<HorizonDiscoverySource, "readAccountAtCheckpoint">;
}
export interface SavedRefundAccountObservation {
  readonly kind: "d1_saved_refund_account_observation";
  readonly revision: 1;
  readonly candidate: DeepReadonly<RefundCandidateReceipt>;
  readonly historyState: DeepReadonly<TransactionHistoryState>;
  readonly account: DeepReadonly<PoolAccountObservation>;
  readonly observedAt: number;
}
function sameObservation(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && sameObservation((a as DTO)[k], (b as DTO)[k]));
}
/** Account/history read consistency only; not financial or execution authority. */
export async function observeSavedRefundAccount(
  client: RefundCandidateClient, scope: RefundCandidateScope, options: SavedRefundAccountOptions,
): Promise<SavedRefundAccountObservation> {
  let denied = false;
  try {
    const input = copy(scope) as RefundCandidateScope;
    exact(input, "namespace,pool,requestId,authenticatedAdmin"); uuid(input.namespace); uuid(input.requestId); address(input.pool); address(input.authenticatedAdmin);
    valid(options !== null && typeof options === "object" && Object.getPrototypeOf(options) === Object.prototype);
    const d = Object.getOwnPropertyDescriptors(options), keys = Reflect.ownKeys(options);
    valid(keys.every(k => typeof k === "string" && "value" in d[k] && d[k].enumerable));
    valid(["now", "maximumAgeSeconds", "futureToleranceSeconds"].every(k => Object.hasOwn(d, k)) && keys.length === 3 + (Object.hasOwn(d, "source") ? 1 : 0));
    const maximumAgeSeconds = d.maximumAgeSeconds.value, futureToleranceSeconds = d.futureToleranceSeconds.value;
    uint(maximumAgeSeconds, 1, 30); uint(futureToleranceSeconds, 0, 2);
    const now = captureMethod(options, "now"), source = !d.source || d.source.value === undefined ? new HorizonDiscoverySource() : d.source.value;
    const readAccount = captureMethod(source, "readAccountAtCheckpoint"), readonly = captureRefundReadClient(client);
    const trusted = async <T>(operation: () => Promise<T>): Promise<T> => {
      try { return await operation(); } catch (e) {
        denied = e instanceof CustodyError && e.status === 403 && e.code === "unauthorized_admin_wallet" && e.message === e.code;
        throw e;
      }
    };
    let last = -1;
    const clock = () => { const value = now(); uint(value); valid(value >= last); last = value; return value; };
    const startedAt = clock(), candidate = await trusted(() => loadRecoveryRefundCandidate(readonly, input));
    clock(); valid(candidate !== null);
    const timing = () => ({ startedAt, observedAt: last, maximumAgeSeconds, futureToleranceSeconds });
    const checkWindow = () => window(candidate, timing()); checkWindow();
    // Snapshot complete public history before a clock capability or provider can run.
    const history = copy(await trusted(() => readTransactionHistory(readonly, input.namespace, input.authenticatedAdmin, input.pool))) as Awaited<ReturnType<typeof readTransactionHistory>>;
    clock(); checkWindow();
    const context = copy({ pool: input.pool, firstLedger: history.state.first_ledger, checkpoint: history.state.income_state.checkpoint });
    const account = copy(await readAccount(context)) as PoolAccountObservation;
    // No clock callback or further await may precede the account copy above.
    clock(); checkWindow();
    const candidateAgain = await trusted(() => loadRecoveryRefundCandidate(readonly, input));
    clock(); checkWindow(); valid(sameObservation(candidate, candidateAgain));
    const historyAgain = copy(await trusted(() => readTransactionHistory(readonly, input.namespace, input.authenticatedAdmin, input.pool)));
    clock(); checkWindow(); valid(sameObservation(history, historyAgain));
    const bound = validateRefundAccountBinding(candidate, history.state, account, timing());
    return freeze({ kind: "d1_saved_refund_account_observation" as const, revision: 1 as const,
      candidate, historyState: history.state, account: bound, observedAt: last });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw new CustodyError("refund_account_observation_unavailable", 503);
  }
}
