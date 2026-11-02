import { Keypair, Networks, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";

type Context = { pool: string; firstLedger: number; anchor: { sequence: number; hash: string; closedAt: number } };
export interface IncludedTransactionObservation {
  network: "TESTNET"; transactionHash: string; source: string; sequence: string; feePayer: string;
  feeChargedStroops: string; feeBidStroops: string; outcome: "success" | "failed";
  ledger: number; ledgerHash: string; closedAt: number; pagingToken: string;
  envelopeXdr: string; resultXdr: string; operationTypes: number[]; poolOperationSourceIndices: number[];
  raw: { transaction: Record<string, unknown>; ledger: Record<string, unknown> }; context: Context;
}
function valid(v: unknown): asserts v { if (!v) throw new Error("invalid"); }
function object(v: unknown): Record<string, unknown> {
  valid(v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype);
  return v as Record<string, unknown>;
}
/** Local strict snapshot: the existing journal snapshot is private. Bound traversal
 * and bytes before SDK decoding; never invoke input accessors or JSON hooks. */
function snapshot(input: unknown): unknown {
  let nodes = 0, budget = 131072;
  function visit(v: unknown, depth: number): unknown {
    valid(++nodes <= 20000 && depth <= 28 && (budget -= 8) >= 0);
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { valid(Number.isSafeInteger(v)); return v; }
    if (typeof v === "string") {
      valid(v.length <= budget && !/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v));
      valid((budget -= Buffer.byteLength(JSON.stringify(v), "utf8")) >= 0); return v;
    }
    valid(v !== null && typeof v === "object");
    const array = Array.isArray(v);
    valid(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype));
    const keys = Reflect.ownKeys(v), descriptors = Object.getOwnPropertyDescriptors(v);
    valid(keys.length <= 20000 && keys.every(k => typeof k === "string" && "value" in descriptors[k] &&
      (descriptors[k].enumerable || (array && k === "length"))));
    if (array) {
      const length = descriptors.length.value;
      valid(length <= 20000 && keys.length === length + 1);
      return Array.from({ length }, (_, i) => { valid(Object.hasOwn(descriptors, i)); return visit(descriptors[String(i)].value, depth + 1); });
    }
    return Object.fromEntries((keys as string[]).map(k => [visit(k, depth + 1), visit(descriptors[k].value, depth + 1)]));
  }
  return visit(input, 0);
}
function address(v: unknown): asserts v is string { valid(typeof v === "string"); Keypair.fromPublicKey(v); }
function integer(v: unknown, min: number, max: number): asserts v is number {
  valid(typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max);
}
function decimal(v: unknown, min = 0n, max = 9223372036854775807n): string {
  valid(typeof v === "string" && /^(0|[1-9][0-9]{0,19})$/.test(v) && BigInt(v) >= min && BigInt(v) <= max); return v;
}
function digest(v: unknown): asserts v is string { valid(typeof v === "string" && /^[0-9a-f]{64}$/.test(v)); }
function timestamp(v: unknown): number {
  valid(typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v));
  const n = Date.parse(v) / 1000; integer(n, 0, 253402300799);
  valid(new Date(n * 1000).toISOString().replace(".000Z", "Z") === v); return n;
}
function base64(v: unknown): string {
  valid(typeof v === "string" && v.length > 0 && v.length <= 65536 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v) &&
    Buffer.from(v, "base64").toString("base64") === v); return v;
}
/** DTO/XDR consistency only; not network signature verification or chain consensus.
 * Only txSuccess/txFailed establish an included observation in this API. */
export function parseIncludedTransaction(input: unknown): IncludedTransactionObservation {
  try {
    const root = object(snapshot(input)), context = object(root.context), anchor = object(context.anchor);
    const dto = object(root.transaction), ledger = object(root.ledger);
    address(context.pool); integer(context.firstLedger, 1, 4294967295);
    integer(anchor.sequence, context.firstLedger, 4294967295); digest(anchor.hash); integer(anchor.closedAt, 0, 253402300799);
    integer(ledger.sequence, context.firstLedger, anchor.sequence); digest(ledger.hash);
    const closedAt = timestamp(ledger.closed_at);
    valid(closedAt <= anchor.closedAt && (ledger.sequence !== anchor.sequence || (ledger.hash === anchor.hash && closedAt === anchor.closedAt)));
    valid(dto.ledger === ledger.sequence && dto.created_at === ledger.closed_at);
    const pagingToken = decimal(dto.paging_token, 1n, 18446744073709551615n), token = BigInt(pagingToken);
    valid(token >> 32n === BigInt(ledger.sequence) && (token & 4095n) === 0n && ((token >> 12n) & 1048575n) > 0n);
    const envelopeXdr = base64(dto.envelope_xdr), resultXdr = base64(dto.result_xdr);
    const tx = TransactionBuilder.fromXDR(envelopeXdr, Networks.TESTNET);
    valid(tx instanceof Transaction && tx.toEnvelope().switch().name === "envelopeTypeTx" && tx.toXDR() === envelopeXdr);
    digest(dto.hash); valid(tx.hash().toString("hex") === dto.hash);
    address(tx.source); decimal(tx.sequence, 1n);
    valid(dto.source_account === tx.source && decimal(dto.source_account_sequence, 1n) === tx.sequence && dto.fee_account === tx.source &&
      dto.source_account_muxed === undefined && dto.fee_account_muxed === undefined);
    const feeBidStroops = decimal(tx.fee, 1n);
    valid(decimal(dto.max_fee, 1n) === feeBidStroops && dto.operation_count === tx.operations.length && tx.operations.length > 0);
    const result = xdr.TransactionResult.fromXDR(resultXdr, "base64");
    valid(result.toXDR("base64") === resultXdr && result.ext().switch() === 0);
    const feeChargedStroops = decimal(result.feeCharged().toString());
    valid(decimal(dto.fee_charged) === feeChargedStroops && BigInt(feeChargedStroops) <= BigInt(feeBidStroops));
    const code = result.result().switch().name;
    valid(code === "txSuccess" || code === "txFailed");
    const success = code === "txSuccess";
    valid(typeof dto.successful === "boolean" && dto.successful === success);
    const results = result.result().results(), operations = tx.toEnvelope().v1().tx().operations();
    valid(results.length === operations.length);
    const operationTypes: number[] = [], poolOperationSourceIndices: number[] = [];
    let failed = false;
    for (let i = 0; i < operations.length; i++) {
      const type = operations[i].body().switch().value, source = tx.operations[i].source ?? tx.source;
      // Classic operation results have zero success and negative failure codes.
      // Soroban and future operation/result semantics require a separate contract.
      valid(type >= 0 && type <= 23); address(source);
      const decoded = tx.operations[i];
      if ("destination" in decoded) address(decoded.destination);
      if ("from" in decoded) address(decoded.from);
      operationTypes.push(type); if (source === context.pool) poolOperationSourceIndices.push(i);
      const op = results[i], outer = op.switch().value;
      if (outer === 0) {
        valid(op.tr().switch().value === type);
        const inner = op.tr().value() as { switch(): { value: number } };
        const status = inner.switch().value;
        valid(Number.isInteger(status) && status <= 0);
        if (status < 0) failed = true;
        if (success) valid(status === 0);
      } else { valid(!success && outer < 0); failed = true; }
    }
    valid(success || failed);
    return { network: "TESTNET", transactionHash: dto.hash, source: tx.source, sequence: tx.sequence,
      feePayer: tx.source, feeChargedStroops, feeBidStroops, outcome: success ? "success" : "failed",
      ledger: ledger.sequence, ledgerHash: ledger.hash, closedAt, pagingToken, envelopeXdr, resultXdr,
      operationTypes, poolOperationSourceIndices, raw: { transaction: dto, ledger }, context: context as Context };
  } catch { throw new CustodyError("transaction_observation_unavailable", 503); }
}
