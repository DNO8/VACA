import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { parseIncludedTransaction } from "./transaction-observation.ts";
import { parseDiscoveredOperation } from "./discovery.ts";
import type { OperatingCreditReceipt } from "./operating-credit-journal.ts";
type Asset = { type: "native" } | { type: "issued"; code: string; issuer: string };
interface Donation { donor: string; asset: Asset; amountStroops: string; operationId: string; transactionHash: string; confirmedAt: number }
export interface OriginalObligations {
  nativeDonorLiabilityStroops: string; issuedDonorLiabilities: { code: string; issuer: string; amountStroops: string }[];
  donations: Donation[]; observedOperatingCreditStroops: string; operatingOperationIds: string[];
  unexplainedActivity: { transactionHash: string; operationIndex: number; reason: "unexplained_pool_operation" | "unsupported_operation" }[];
}
function valid(v: unknown): asserts v { if (!v) throw new Error("invalid"); }
function snapshot(input: unknown): unknown {
  let nodes = 0, bytes = 8388608;
  function visit(v: unknown, depth: number): unknown {
    valid(++nodes <= 1000000 && depth <= 32 && (bytes -= 8) >= 0);
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { valid(Number.isSafeInteger(v)); return v; }
    if (typeof v === "string") {
      valid(v.length <= bytes && !/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v));
      valid((bytes -= Buffer.byteLength(JSON.stringify(v), "utf8")) >= 0); return v;
    }
    valid(v !== null && typeof v === "object"); const array = Array.isArray(v);
    valid(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype));
    const keys = Reflect.ownKeys(v), d = Object.getOwnPropertyDescriptors(v);
    valid(keys.length <= 1000000 && keys.every(k => typeof k === "string" && "value" in d[k] && (d[k].enumerable || (array && k === "length"))));
    if (array) { const length = d.length.value; valid(length <= 1000000 && keys.length === length + 1);
      return Array.from({ length }, (_, i) => { valid(Object.hasOwn(d, i)); return visit(d[String(i)].value, depth + 1); }); }
    return Object.fromEntries((keys as string[]).sort().map(k => [visit(k, depth + 1), visit(d[k].value, depth + 1)]));
  }
  return visit(input, 0);
}
function same(a: unknown, b: unknown) { return JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b)); }
function exact(v: object, keys: string) { valid(Object.keys(v).sort().join(",") === keys); }
function amount(value: string): bigint {
  valid(typeof value === "string" && /^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(value));
  const n = BigInt(value.replace(".", "")); valid(n > 0n && n <= 9223372036854775807n); return n;
}
function add(a: bigint, b: bigint) { const n = a + b; valid(n <= 9223372036854775807n); return n; }
/** Pure principal accounting, NOT verification of complete/current authorized history.
 * The caller must obtain both inputs from accepted stable backend readers. This
 * never subtracts fees, outgoing transactions, allocation or inferred refunds.
 */
export function calculateOriginalObligations(input: { namespace: string; pool: string; firstLedger: number;
  anchor: { sequence: number; hash: string; closedAt: number }; transactions: unknown[]; operatingCredits: unknown[];
}): OriginalObligations {
  try {
    const data = snapshot(input) as typeof input, { namespace, pool, firstLedger, anchor } = data;
    valid(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(namespace)); Keypair.fromPublicKey(pool);
    valid(Number.isSafeInteger(firstLedger) && firstLedger > 0 && anchor.sequence >= firstLedger && anchor.sequence <= 4294967295);
    valid(/^[0-9a-f]{64}$/.test(anchor.hash) && anchor.closedAt >= 0 && anchor.closedAt <= 253402300799);
    valid(Array.isArray(data.transactions) && data.transactions.length <= 1000 && Array.isArray(data.operatingCredits) && data.operatingCredits.length <= 1000);
    const incomes = new Map<string, Donation & { envelope: string; ledger: number }>();
    const result: OriginalObligations = { nativeDonorLiabilityStroops: "0", issuedDonorLiabilities: [], donations: [], observedOperatingCreditStroops: "0", operatingOperationIds: [], unexplainedActivity: [] };
    const hashes = new Set<string>(); let previous = 0n;
    for (const value of data.transactions) {
      const stored = value as ReturnType<typeof parseIncludedTransaction>;
      const record = parseIncludedTransaction({ context: stored.context, transaction: stored.raw.transaction, ledger: stored.raw.ledger });
      valid(same(stored, record) && record.context.pool === pool && record.context.firstLedger === firstLedger);
      const a = record.context.anchor;
      valid(a.sequence <= anchor.sequence && a.closedAt <= anchor.closedAt && (a.sequence === anchor.sequence ? a.hash === anchor.hash && a.closedAt === anchor.closedAt : a.closedAt < anchor.closedAt));
      valid(BigInt(record.pagingToken) > previous && !hashes.has(record.transactionHash)); previous = BigInt(record.pagingToken); hashes.add(record.transactionHash);
      if (record.outcome === "failed") continue;
      const tx = TransactionBuilder.fromXDR(record.envelopeXdr, Networks.TESTNET); valid(tx instanceof Transaction);
      for (let i = 0; i < tx.operations.length; i++) {
        const op = tx.operations[i], source = op.source ?? tx.source;
        if (source === pool) { result.unexplainedActivity.push({ transactionHash: record.transactionHash, operationIndex: i, reason: "unexplained_pool_operation" }); continue; }
        if (op.type !== "payment" && op.type !== "createAccount") {
          // Other-account manageData cannot move pool principal; unknown effects must be reconciled.
          if (op.type !== "manageData") result.unexplainedActivity.push({ transactionHash: record.transactionHash, operationIndex: i, reason: "unsupported_operation" });
          continue;
        }
        if (op.destination !== pool) continue;
        const asset: Asset = op.type === "createAccount" || op.asset.isNative() ? { type: "native" } : { type: "issued", code: op.asset.getCode(), issuer: op.asset.getIssuer()! };
        const value = amount(op.type === "createAccount" ? op.startingBalance : op.amount);
        const id = String(BigInt(record.pagingToken) + BigInt(i + 1));
        incomes.set(id, { donor: source, asset, amountStroops: value.toString(), operationId: id, transactionHash: record.transactionHash, confirmedAt: record.closedAt, envelope: record.envelopeXdr, ledger: record.ledger });
      }
    }
    const excluded = new Set<string>(); let creditTotal = 0n;
    for (const value of data.operatingCredits) {
      const r = value as OperatingCreditReceipt; exact(r, "authorized_by,kind,observation,revision");
      valid(r.kind === "d1_operating_credit_observation" && r.revision === 1); Keypair.fromPublicKey(r.authorized_by);
      const o = r.observation; exact(o, "amountStroops,anchor,funder,ledger,namespace,network,operationId,pool,record,transactionHash");
      valid(o.namespace === namespace && o.pool === pool && o.network === "TESTNET" && !excluded.has(o.operationId));
      const income = incomes.get(o.operationId); valid(income !== undefined && income.asset.type === "native" && income.donor === o.funder && income.amountStroops === o.amountStroops && income.transactionHash === o.transactionHash && income.ledger === o.ledger);
      valid(o.anchor.sequence >= income.ledger && o.anchor.sequence <= anchor.sequence && o.anchor.closedAt >= income.confirmedAt && o.anchor.closedAt <= anchor.closedAt && /^[0-9a-f]{64}$/.test(o.anchor.hash));
      valid(o.anchor.sequence === anchor.sequence ? o.anchor.hash === anchor.hash && o.anchor.closedAt === anchor.closedAt : o.anchor.closedAt < anchor.closedAt);
      const decoded = parseDiscoveredOperation({ ...o.record.operation.raw, pool, anchor: o.anchor });
      const op = decoded.operation;
      valid(same(decoded, o.record) && decoded.operation_id === o.operationId && decoded.transaction_hash === income.transactionHash && decoded.ledger === income.ledger);
      valid(op.raw.transaction.envelope_xdr === income.envelope && op.memo.type === "text" && op.memo.value === "D1OPS" && op.source === income.donor &&
        (op.kind === "account_created" || (op.kind === "incoming_payment" && op.asset.type === "native")));
      excluded.add(o.operationId); creditTotal = add(creditTotal, BigInt(income.amountStroops)); result.operatingOperationIds.push(o.operationId);
    }
    let native = 0n; const issued = new Map<string, { code: string; issuer: string; amount: bigint }>();
    for (const income of incomes.values()) {
      if (excluded.has(income.operationId)) continue;
      const { envelope: _envelope, ledger: _ledger, ...donation } = income; result.donations.push(donation);
      if (income.asset.type === "native") native = add(native, BigInt(income.amountStroops));
      else { const key = income.asset.code + ":" + income.asset.issuer, old = issued.get(key); issued.set(key, { code: income.asset.code, issuer: income.asset.issuer, amount: add(old?.amount ?? 0n, BigInt(income.amountStroops)) }); }
    }
    result.nativeDonorLiabilityStroops = native.toString(); result.observedOperatingCreditStroops = creditTotal.toString();
    result.issuedDonorLiabilities = [...issued.values()].sort((a, b) => (a.code + ":" + a.issuer).localeCompare(b.code + ":" + b.issuer)).map(a => ({ code: a.code, issuer: a.issuer, amountStroops: a.amount.toString() }));
    return snapshot(result) as OriginalObligations;
  } catch { throw new CustodyError("donor_obligations_unavailable", 503); }
}
