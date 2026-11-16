import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import type { VerifiedDonorPaymentCommand } from "./donor-payment-command.ts";
import { parseIncludedTransaction, type IncludedTransactionObservation } from "./transaction-observation.ts";
import { parseDiscoveredOperation, type DiscoveryRecord } from "./discovery.ts";
import { calculateOriginalObligations } from "./original-obligations.ts";
import type { OperatingCreditReceipt } from "./operating-credit-journal.ts";

export type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export type DonorAsset = { type: "native" } | { type: "issued"; code: string; issuer: string };
export interface DonorPaymentDTO {
  transactionHash: string; operationId: string; donor: string; asset: DonorAsset;
  grossAmount: string; confirmedAt: number; deadline: string;
}
export interface CapturedPageRow {
  namespace: string; from_cursor: string; through_ledger: string; ledger_hash: string; page: string; receipt: string;
}
export interface CapturedRecordRow { namespace: string; paging_token: string; transaction_hash: string; record: string }
export interface CapturedCheckpointRow { namespace: string; checkpoint: string; page_count: string }
export interface CapturedReceiptRow { request_id: string; receipt: string }
/** Raw rows only. Their retention is NOT preparation/allocation/outcome validation. */
export interface CapturedAllocation {
  donation_allocations: { request_id: string; authorized_by: string; transaction_hash: string;
    operation_id: string; allocated_stroops: string; allocated_at: string };
  release_requests: { request_id: string; authorized_by: string; request: string; state: string; reserved_at: string } | null;
  d1_preparations: (CapturedReceiptRow & { namespace: string; input: string }) | null;
  d1_issuance_intents: CapturedReceiptRow | null;
  d1_issuance_sequences: (CapturedReceiptRow & { namespace: string }) | null;
  d1_unsigned_transactions: CapturedReceiptRow | null;
  d1_issuance_fee_commitments: CapturedReceiptRow | null;
  d1_initial_financial_observations: (CapturedReceiptRow & { snapshot_hash: string })[];
  d1_signed_transactions: (CapturedReceiptRow & { snapshot_hash: string }) | null;
  d1_submission_attempts: (CapturedReceiptRow & { attempt_id: string }) | null;
  d1_issuance_outcomes: (CapturedReceiptRow & { attempt_id: string }) | null;
}
export interface CanonicalOwnedCapture {
  kind: "d1_donor_payment_capture"; revision: 1;
  scope: { namespace: string; network: "TESTNET"; pool: string; verifiedDonor: string; transactionHash: string; operationId: string };
  dbReadAt: number;
  payment: { transaction_hash: string; operation_id: string; payment: string; donation_stroops: string; allocated_stroops: string };
  allocations: CapturedAllocation[];
  evidence: {
    d1_pools: { namespace: string; pool: string; first_ledger: string };
    d1_discovery_checkpoints: CapturedCheckpointRow;
    d1_discovery_pages: CapturedPageRow[];
    d1_discovery_operations: (CapturedRecordRow & { operation_id: string })[];
    d1_transaction_checkpoints: CapturedCheckpointRow & { record_count: string };
    d1_transaction_pages: CapturedPageRow[];
    d1_transaction_records: CapturedRecordRow[];
    d1_operating_credit_observations: { namespace: string; operation_id: string; receipt: string }[];
  };
}
export interface CapturedDonorHistory {
  firstLedger: number;
  anchor: { sequence: number; hash: string; closedAt: number };
  transactions: IncludedTransactionObservation[];
  operatingCredits: OperatingCreditReceipt[];
}
export interface ValidatedDonorCapturedHistory {
  capture: CanonicalOwnedCapture; history: CapturedDonorHistory; payment: DonorPaymentDTO;
}
type ObjectValue = Record<string, unknown>;
type Checkpoint = { cursor: string; through_ledger: number; ledger_hash: string; closed_at: number };
const MAX_BYTES = 4194304, MAX_NODES = 160000, UINT64 = 18446744073709551615n, INT64 = 9223372036854775807n;
const unavailable = () => new CustodyError("donor_payment_unavailable", 503);
function valid(v: unknown): asserts v { if (!v) throw unavailable(); }
function exact(v: unknown, keys: string): ObjectValue {
  valid(v !== null && typeof v === "object" && !Array.isArray(v));
  valid(Object.keys(v).sort().join(",") === keys); return v as ObjectValue;
}
function integer(v: unknown, min: number, max: number): number {
  valid(typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max); return v;
}
function decimal(v: unknown, min = 0n, max = INT64): string {
  valid(typeof v === "string" && /^(0|[1-9][0-9]{0,19})$/.test(v) && BigInt(v) >= min && BigInt(v) <= max); return v;
}
function address(v: unknown): string {
  valid(typeof v === "string" && /^G[A-Z2-7]{55}$/.test(v) && Keypair.fromPublicKey(v).publicKey() === v); return v;
}
function digest(v: unknown): string { valid(typeof v === "string" && /^[0-9a-f]{64}$/.test(v)); return v; }
function uuid(v: unknown): string {
  valid(typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)); return v;
}
function list(v: unknown, max = 1000): unknown[] { valid(Array.isArray(v) && v.length <= max); return v; }
function text(v: unknown): string { valid(typeof v === "string"); return v; }
function safeString(v: string) {
  valid(!/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v));
}
/** Copy data descriptors only, before JSON/SDK traversal. Budget includes conservative
 * per-node overhead; a capture below SQL's cap can still exceed this defensive cap. */
function snapshot(input: unknown): unknown {
  let nodes = 0, bytes = MAX_BYTES;
  function visit(v: unknown, depth: number): unknown {
    valid(++nodes <= MAX_NODES && depth <= 32 && (bytes -= 8) >= 0);
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { valid(Number.isSafeInteger(v)); return v; }
    if (typeof v === "string") {
      valid(v.length <= bytes); safeString(v);
      valid((bytes -= Buffer.byteLength(JSON.stringify(v), "utf8")) >= 0); return v;
    }
    valid(v !== null && typeof v === "object"); const array = Array.isArray(v);
    valid(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype));
    const keys = Reflect.ownKeys(v), descriptors = Object.getOwnPropertyDescriptors(v);
    valid(keys.length <= MAX_NODES && keys.every(k => typeof k === "string" && "value" in descriptors[k] &&
      (descriptors[k].enumerable || (array && k === "length"))));
    if (array) {
      const length = descriptors.length.value; valid(length <= MAX_NODES && keys.length === length + 1);
      return Array.from({ length }, (_, i) => { valid(Object.hasOwn(descriptors, i)); return visit(descriptors[String(i)].value, depth + 1); });
    }
    return Object.fromEntries((keys as string[]).sort().map(k => [visit(k, depth + 1), visit(descriptors[k].value, depth + 1)]));
  }
  return visit(input, 0);
}
/** JSONB numbers are decimal values, not IEEE-754 values. Prove integrality and
 * safe range with decimal digits/BigInt BEFORE the only Number conversion. */
function exactNumber(lexeme: string): number {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(lexeme)!;
  const fraction = match[3] ?? "", exponent = BigInt(match[4] ?? "0");
  let digits = (match[2] + fraction).replace(/^0+/, "");
  if (!digits) return 0;
  let shift = exponent - BigInt(fraction.length);
  const zeros = /0*$/.exec(digits)![0].length;
  digits = digits.slice(0, digits.length - zeros); shift += BigInt(zeros);
  valid(shift >= 0n && shift <= 16n && BigInt(digits.length) + shift <= 16n);
  const n = BigInt((match[1] || "") + digits) * 10n ** shift;
  valid(n >= -9007199254740991n && n <= 9007199254740991n); return Number(n);
}
function parseJSONB(input: unknown): unknown {
  const source = text(input); let cursor = 0, nodes = 0;
  const stringToken = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  const scalarToken = /(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/y;
  function whitespace() { while (cursor < source.length && /[ \t\r\n]/.test(source[cursor])) cursor++; }
  function token(pattern: RegExp) {
    pattern.lastIndex = cursor; const match = pattern.exec(source); valid(match); cursor = pattern.lastIndex; return match[0];
  }
  function string() { const s: string = JSON.parse(token(stringToken)); safeString(s); return s; }
  function value(depth: number): unknown {
    valid(++nodes <= MAX_NODES && depth <= 32); whitespace();
    if (source[cursor] === '"') return string();
    if (source[cursor] !== "{" && source[cursor] !== "[") {
      const lexeme = token(scalarToken);
      if (lexeme === "true") return true; if (lexeme === "false") return false; if (lexeme === "null") return null;
      return exactNumber(lexeme);
    }
    const object = source[cursor++] === "{", end = object ? "}" : "]";
    const keys = new Set<string>(), entries: [string, unknown][] = [], values: unknown[] = [];
    whitespace(); if (source[cursor] === end) { cursor++; return object ? {} : []; }
    while (true) {
      whitespace();
      if (object) {
        const key = string(); valid(!keys.has(key)); keys.add(key); whitespace(); valid(source[cursor++] === ":");
        entries.push([key, value(depth + 1)]);
      } else values.push(value(depth + 1));
      whitespace(); const separator = source[cursor++]; if (separator === end) break; valid(separator === ",");
    }
    return object ? Object.fromEntries(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : values;
  }
  const result = value(0); whitespace(); valid(cursor === source.length); return result;
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && same((a as ObjectValue)[k], (b as ObjectValue)[k]));
}
function freeze<T>(v: T): Immutable<T> {
  if (v !== null && typeof v === "object") { for (const child of Object.values(v)) freeze(child); Object.freeze(v); }
  return v as Immutable<T>;
}
function checkpoint(value: unknown, firstLedger: number): Checkpoint {
  const c = exact(value, "closed_at,cursor,ledger_hash,through_ledger");
  decimal(c.cursor, 0n, UINT64); integer(c.through_ledger, firstLedger, 4294967295);
  digest(c.ledger_hash); integer(c.closed_at, 0, 253402300799); return c as Checkpoint;
}
function anchor(c: Checkpoint) { return { sequence: c.through_ledger, hash: c.ledger_hash, closedAt: c.closed_at }; }
function sameAnchor(a: Checkpoint, b: Checkpoint) {
  return a.through_ledger === b.through_ledger && a.ledger_hash === b.ledger_hash && a.closed_at === b.closed_at;
}
interface ReplayedJournal { checkpoint: Checkpoint; records: unknown[]; checkpoints: Checkpoint[]; complete: Checkpoint[] }
/** Receipt ordinals reconstruct insertion order, not 054's lexicographic row order.
 * Replay every page from cursor zero, including historical empty pages, and require
 * a final exact empty-tail marker. No coverage_complete flag is consumed. */
function replayJournal(evidence: ObjectValue, transaction: boolean, namespace: string, pool: string, firstLedger: number): ReplayedJournal {
  const prefix = transaction ? "d1_transaction" : "d1_discovery";
  const stored = exact(evidence[prefix + "_checkpoints"], transaction ? "checkpoint,namespace,page_count,record_count" : "checkpoint,namespace,page_count");
  valid(stored.namespace === namespace);
  const final = checkpoint(parseJSONB(stored.checkpoint), firstLedger);
  const rows = list(evidence[prefix + "_pages"], 10000);
  valid(decimal(stored.page_count, 1n) === String(rows.length));
  const pages = rows.map(row => {
    const r = exact(row, "from_cursor,ledger_hash,namespace,page,receipt,through_ledger");
    valid(r.namespace === namespace);
    const p = exact(parseJSONB(r.page), "closed_at,from_cursor,ledger_hash,records,revision,through_ledger,to_cursor");
    valid(p.revision === 1 && p.from_cursor === r.from_cursor && p.ledger_hash === r.ledger_hash);
    valid(decimal(r.through_ledger, 1n, 4294967295n) === String(integer(p.through_ledger, firstLedger, 4294967295)));
    decimal(p.from_cursor, 0n, UINT64); decimal(p.to_cursor, 0n, UINT64);
    const c = checkpoint({ cursor: p.to_cursor, through_ledger: p.through_ledger, ledger_hash: p.ledger_hash, closed_at: p.closed_at }, firstLedger);
    const records = list(p.records, transaction ? 100 : 200);
    const receipt = exact(parseJSONB(r.receipt), transaction ?
      "authorized_by,checkpoint,first_ledger,kind,namespace,network,page,page_count,page_record_count,pool,record_count,revision" :
      "checkpoint_hash,checkpoint_ledger,from_cursor,kind,namespace,network,page_count,pool,record_count,revision,to_cursor");
    valid(receipt.kind === prefix + "_page" && receipt.revision === 1 && receipt.namespace === namespace && receipt.network === "TESTNET" && receipt.pool === pool);
    const ordinal = integer(receipt.page_count, 1, rows.length);
    if (transaction) {
      address(receipt.authorized_by);
      valid(receipt.first_ledger === firstLedger && same(receipt.page, p) && same(receipt.checkpoint, c) && receipt.page_record_count === records.length);
    } else valid(receipt.from_cursor === p.from_cursor && receipt.to_cursor === p.to_cursor && receipt.checkpoint_ledger === c.through_ledger &&
      receipt.checkpoint_hash === c.ledger_hash && receipt.record_count === records.length);
    return { row: r, page: p, checkpoint: c, receipt, records, ordinal };
  }).sort((a, b) => a.ordinal - b.ordinal);
  const records: unknown[] = [], checkpoints: Checkpoint[] = [], complete: Checkpoint[] = [], pageKeys = new Set<string>();
  let previous: Checkpoint | undefined, cursor = "0";
  for (const [i, p] of pages.entries()) {
    valid(p.ordinal === i + 1 && p.page.from_cursor === cursor);
    const c = p.checkpoint, key = JSON.stringify([cursor, c.through_ledger, c.ledger_hash]);
    valid(!pageKeys.has(key)); pageKeys.add(key);
    if (previous) valid(c.through_ledger >= previous.through_ledger && c.closed_at >= previous.closed_at &&
      (c.through_ledger !== previous.through_ledger || sameAnchor(c, previous)));
    for (const value of p.records) {
      let decoded: IncludedTransactionObservation | DiscoveryRecord;
      if (transaction) {
        const r = value as IncludedTransactionObservation;
        decoded = parseIncludedTransaction({ context: r.context, transaction: r.raw.transaction, ledger: r.raw.ledger });
        valid(same(decoded.context, { pool, firstLedger, anchor: anchor(c) }));
      } else {
        const r = value as DiscoveryRecord;
        decoded = parseDiscoveredOperation({ ...r.operation.raw, pool, anchor: anchor(c) });
        valid(decoded.ledger >= firstLedger);
      }
      valid(same(value, decoded));
      const token = transaction ? (decoded as IncludedTransactionObservation).pagingToken : (decoded as DiscoveryRecord).paging_token;
      valid(BigInt(token) > BigInt(cursor)); cursor = token; records.push(decoded);
    }
    valid(c.cursor === cursor && records.length <= 1000);
    if (transaction) valid(p.receipt.record_count === records.length);
    previous = c; checkpoints.push(c);
    if (p.records.length === 0) complete.push(c);
  }
  valid(pages.length > 0 && pages.at(-1)!.records.length === 0 && same(previous, final));
  if (transaction) valid(decimal(stored.record_count) === String(records.length));
  // A bijection: no row may be omitted, substituted, duplicated or invented by a page.
  const recordRows = list(evidence[transaction ? "d1_transaction_records" : "d1_discovery_operations"]);
  valid(recordRows.length === records.length);
  const byToken = new Map<string, unknown>(), identities = new Set<string>();
  for (const value of recordRows) {
    const r = exact(value, transaction ? "namespace,paging_token,record,transaction_hash" : "namespace,operation_id,paging_token,record,transaction_hash");
    valid(r.namespace === namespace); const token = decimal(r.paging_token, 1n, UINT64), hash = digest(r.transaction_hash);
    const decoded = parseJSONB(r.record) as ObjectValue;
    valid(decoded !== null && typeof decoded === "object");
    valid((transaction ? decoded.pagingToken : decoded.paging_token) === token &&
      (transaction ? decoded.transactionHash : decoded.transaction_hash) === hash);
    if (!transaction) valid(r.operation_id === token && decoded.operation_id === token);
    const identity = transaction ? hash : hash + ":" + token;
    valid(!byToken.has(token) && !identities.has(identity)); identities.add(identity); byToken.set(token, decoded);
  }
  for (const value of records) {
    const r = value as ObjectValue, token = (transaction ? r.pagingToken : r.paging_token) as string;
    valid(same(byToken.get(token), value));
  }
  return { checkpoint: final, records, checkpoints, complete };
}
function retainedAllocations(value: unknown): CapturedAllocation[] {
  const allocations = list(value, 100);
  const shapes: Record<string, string> = {
    donation_allocations: "allocated_at,allocated_stroops,authorized_by,operation_id,request_id,transaction_hash",
    release_requests: "authorized_by,request,request_id,reserved_at,state",
    d1_preparations: "input,namespace,receipt,request_id",
    d1_issuance_intents: "receipt,request_id", d1_issuance_sequences: "namespace,receipt,request_id",
    d1_unsigned_transactions: "receipt,request_id", d1_issuance_fee_commitments: "receipt,request_id",
    d1_initial_financial_observations: "receipt,request_id,snapshot_hash", d1_signed_transactions: "receipt,request_id,snapshot_hash",
    d1_submission_attempts: "attempt_id,receipt,request_id", d1_issuance_outcomes: "attempt_id,receipt,request_id",
  };
  let previous = "";
  for (const value of allocations) {
    const allocation = exact(value, Object.keys(shapes).sort().join(","));
    for (const [name, shape] of Object.entries(shapes)) {
      const rows = name === "d1_initial_financial_observations" ? list(allocation[name], 10000) : [allocation[name]];
      for (const row of rows) {
        if (row === null) { valid(name !== "donation_allocations" && name !== "d1_initial_financial_observations"); continue; }
        const r = exact(row, shape);
        for (const [key, column] of Object.entries(r)) {
          text(column);
          if (["input", "receipt", "request"].includes(key)) parseJSONB(column);
          if (key === "allocated_stroops") decimal(column, 1n);
        }
      }
    }
    const id = uuid((allocation.donation_allocations as ObjectValue).request_id); valid(id > previous); previous = id;
  }
  return allocations as CapturedAllocation[];
}

/** Pure private-capture validation. No RPC, authentication substitute, writes,
 * provider, wall clock, current-CB observation, or public absence inference. */
export function validateDonorCapturedHistory(capture: unknown, expected: VerifiedDonorPaymentCommand): Immutable<ValidatedDonorCapturedHistory> {
  try {
    const command = exact(snapshot(expected), "kind,namespace,network,paymentOperationId,paymentTransactionHash,pool,revision,verifiedDonor");
    valid(command.kind === "d1_verified_donor_payment_command" && command.revision === 1 && command.network === "TESTNET");
    const namespace = uuid(command.namespace), pool = address(command.pool), donor = address(command.verifiedDonor);
    const transactionHash = digest(command.paymentTransactionHash), operationId = decimal(command.paymentOperationId, 1n);
    const root = exact(snapshot(capture), "allocations,dbReadAt,evidence,kind,payment,revision,scope");
    valid(root.kind === "d1_donor_payment_capture" && root.revision === 1);
    integer(root.dbReadAt, 0, 253402300799);
    const scope = exact(root.scope, "namespace,network,operationId,pool,transactionHash,verifiedDonor");
    valid(same(scope, { namespace, network: "TESTNET", pool, verifiedDonor: donor, transactionHash, operationId }));
    const owned = exact(root.payment, "allocated_stroops,donation_stroops,operation_id,payment,transaction_hash");
    valid(owned.transaction_hash === transactionHash && owned.operation_id === operationId);
    const gross = decimal(owned.donation_stroops, 1n), allocated = decimal(owned.allocated_stroops);
    valid(BigInt(allocated) <= BigInt(gross));
    const storedPayment = exact(parseJSONB(owned.payment), "amount,asset,donor,operation_id,pool,transaction_hash");
    valid(storedPayment.transaction_hash === transactionHash && storedPayment.operation_id === operationId && storedPayment.pool === pool && storedPayment.donor === donor);
    const allocations = retainedAllocations(root.allocations);
    const evidence = exact(root.evidence, "d1_discovery_checkpoints,d1_discovery_operations,d1_discovery_pages,d1_operating_credit_observations,d1_pools,d1_transaction_checkpoints,d1_transaction_pages,d1_transaction_records");
    const configured = exact(evidence.d1_pools, "first_ledger,namespace,pool");
    valid(configured.namespace === namespace && configured.pool === pool);
    const firstLedger = Number(decimal(configured.first_ledger, 1n, 4294967295n));
    const discovery = replayJournal(evidence, false, namespace, pool, firstLedger);
    const history = replayJournal(evidence, true, namespace, pool, firstLedger);
    valid(sameAnchor(discovery.checkpoint, history.checkpoint));
    // Every transaction-page anchor had complete discovery at that exact anchor.
    for (const c of history.checkpoints) valid(discovery.complete.some(d => sameAnchor(c, d)));
    const transactions = history.records as IncludedTransactionObservation[], discoveries = discovery.records as DiscoveryRecord[];
    const byHash = new Map(transactions.map(r => [r.transactionHash, r]));
    const byOperation = new Map(discoveries.map(r => [r.operation_id, r]));
    for (const r of discoveries) {
      const transaction = byHash.get(r.transaction_hash);
      valid(transaction && transaction.outcome === "success" && same(r.operation.raw.transaction, transaction.raw.transaction));
    }
    const creditIds = new Set<string>();
    const operatingCredits = list(evidence.d1_operating_credit_observations).map(value => {
      const row = exact(value, "namespace,operation_id,receipt"); valid(row.namespace === namespace);
      const id = decimal(row.operation_id, 1n, UINT64); valid(!creditIds.has(id)); creditIds.add(id);
      const receipt = exact(parseJSONB(row.receipt), "authorized_by,kind,observation,revision");
      valid(receipt.kind === "d1_operating_credit_observation" && receipt.revision === 1); address(receipt.authorized_by);
      const o = exact(receipt.observation, "amountStroops,anchor,funder,ledger,namespace,network,operationId,pool,record,transactionHash");
      valid(o.namespace === namespace && o.network === "TESTNET" && o.pool === pool && o.operationId === id && address(o.funder) !== pool);
      decimal(o.amountStroops, 1n); digest(o.transactionHash); integer(o.ledger, firstLedger, history.checkpoint.through_ledger);
      const a = exact(o.anchor, "closedAt,hash,sequence");
      valid(discovery.complete.some(c => same(anchor(c), a) && BigInt(id) <= BigInt(c.cursor)));
      valid(same(byOperation.get(id), o.record));
      return receipt as unknown as OperatingCreditReceipt;
    });
    const canonicalHistory = { firstLedger, anchor: anchor(history.checkpoint), transactions, operatingCredits };
    // Accounting is deliberately AFTER independent page coverage and credit bindings.
    const obligations = calculateOriginalObligations({ namespace, pool, ...canonicalHistory });
    const matches = obligations.donations.filter(d => d.transactionHash === transactionHash && d.operationId === operationId);
    valid(matches.length === 1 && byOperation.has(operationId)); const donation = matches[0];
    valid(donation.donor === donor && donation.amountStroops === gross && same(donation.asset, storedPayment.asset));
    if (donation.asset.type === "issued") { valid(/^[a-zA-Z0-9]{1,12}$/.test(donation.asset.code)); address(donation.asset.issuer); }
    const n = BigInt(gross), grossAmount = `${n / 10000000n}.${String(n % 10000000n).padStart(7, "0")}`;
    valid(storedPayment.amount === grossAmount);
    const confirmedAt = integer(donation.confirmedAt, 0, 253402300499);
    const payment: DonorPaymentDTO = { transactionHash, operationId, donor, asset: donation.asset, grossAmount, confirmedAt,
      deadline: new Date((confirmedAt + 300) * 1000).toISOString().replace(".000Z", "Z") };
    return freeze({ capture: { ...root, allocations } as unknown as CanonicalOwnedCapture, history: canonicalHistory, payment });
  } catch { throw unavailable(); }
}
