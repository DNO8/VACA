import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";

export interface DiscoveredOperationInput {
  readonly operation: unknown;
  readonly transaction: unknown;
  readonly pool: string;
  /** Trusted closed-ledger observation, never public request input. */
  readonly anchor: { readonly sequence: number; readonly closedAt: number };
}
type AssetIdentity = { type: "native" } | { type: "issued"; code: string; issuer: string };
type Classification =
  | { kind: "incoming_payment"; donor: string; pool: string; asset: AssetIdentity; amount: string }
  | { kind: "outgoing_payment"; source: string; destination: string; asset: AssetIdentity; amount: string }
  | { kind: "account_created"; funder: string; pool: string; starting_balance: string }
  | { kind: "quarantined"; reason: "unsupported_operation" | "unrelated_payment" | "unrelated_creation" };
export interface DiscoveryRecord {
  paging_token: string;
  ledger: number;
  transaction_hash: string;
  operation_id: string;
  operation: Classification & {
    sdk_type: number; source: string; confirmed_at: number;
    memo: { type: string; value: string | null };
    raw: { operation: Record<string, unknown>; transaction: Record<string, unknown> };
  };
}
function valid(v: unknown): asserts v {
  if (!v) throw new Error("invalid_discovered_operation");
}
function object(v: unknown): Record<string, unknown> {
  valid(v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype);
  return v as Record<string, unknown>;
}
function address(v: unknown): asserts v is string {
  valid(typeof v === "string");
  Keypair.fromPublicKey(v); // M addresses cannot establish an original G donor.
}
function uint32(v: unknown): asserts v is number {
  valid(typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 4294967295);
}
function seconds(v: unknown): asserts v is number {
  valid(typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 253402300799);
}
function amount(v: string): string {
  valid(/^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(v));
  const stroops = BigInt(v.replace(".", ""));
  valid(stroops > 0n && stroops <= 9223372036854775807n);
  return v;
}
/** Bound JSON shape, traversal and conservative JSONB text overhead before storage.
 * SQL's actual JSONB byte guard remains authoritative, not JS byte identity. */
function boundedJSON(v: unknown): void {
  let budget = 16384;
  const visit = (value: unknown, depth: number): void => {
    valid(depth <= 24 && budget > 0);
    budget -= 4; // Covers SQL separators/spaces per node, beyond compact JSON.
    if (value === null || typeof value === "boolean") budget -= 5;
    else if (typeof value === "number") {
      valid(Number.isSafeInteger(value)); budget -= 24;
    } else if (typeof value === "string") {
      valid(!/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value));
      budget -= Buffer.byteLength(JSON.stringify(value), "utf8");
    } else if (Array.isArray(value)) {
      budget -= 2;
      for (const item of value) visit(item, depth + 1);
    } else {
      const obj = object(value);
      budget -= 2;
      for (const key of Reflect.ownKeys(obj)) {
        valid(typeof key === "string");
        const descriptor = Object.getOwnPropertyDescriptor(obj, key)!;
        valid(descriptor.enumerable && "value" in descriptor);
        visit(key, depth + 1); visit(descriptor.value, depth + 1);
      }
    }
    valid(budget >= 0);
  };
  visit(v, 0);
}

/** Pure consistency check, NOT ledger execution/coverage proof or funding authority.
 * Future callers must fetch through pinned trusted Testnet Horizon and establish
 * closed-ledger coverage independently; SDK hashes alone prove no chain execution. */
export function parseDiscoveredOperation(input: DiscoveredOperationInput): DiscoveryRecord {
  try {
    address(input.pool);
    uint32(input.anchor.sequence); seconds(input.anchor.closedAt);
    const op = object(input.operation), txDTO = object(input.transaction);
    boundedJSON({ operation: op, transaction: txDTO });
    valid(typeof op.paging_token === "string" && /^[1-9][0-9]{0,19}$/.test(op.paging_token));
    const token = BigInt(op.paging_token);
    valid(token <= 18446744073709551615n && op.id === op.paging_token);
    const ledger = Number(token >> 32n), index = Number(token & 4095n) - 1;
    uint32(txDTO.ledger);
    valid(txDTO.ledger === ledger && ledger > 0 && ledger <= input.anchor.sequence && index >= 0);
    valid(typeof txDTO.paging_token === "string" && /^[1-9][0-9]{0,19}$/.test(txDTO.paging_token));
    const transactionToken = BigInt(txDTO.paging_token);
    // Horizon TOIDs encode ledger[32], transaction position[20], operation[12].
    // Binding only ledger/index would alias the same payment under another TOID.
    valid(transactionToken <= 18446744073709551615n && (transactionToken & 4095n) === 0n &&
      ((transactionToken >> 12n) & 1048575n) > 0n && transactionToken >> 32n === BigInt(ledger) &&
      token === transactionToken + BigInt(index + 1));
    valid(typeof txDTO.hash === "string" && /^[0-9a-f]{64}$/.test(txDTO.hash) && op.transaction_hash === txDTO.hash);
    valid(op.transaction_successful === true && txDTO.successful === true);
    valid(typeof txDTO.created_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(txDTO.created_at));
    const confirmed = Date.parse(txDTO.created_at) / 1000;
    seconds(confirmed);
    valid(new Date(confirmed * 1000).toISOString().replace(".000Z", "Z") === txDTO.created_at &&
      op.created_at === txDTO.created_at && confirmed <= input.anchor.closedAt &&
      (ledger !== input.anchor.sequence || confirmed === input.anchor.closedAt));
    const envelope = txDTO.envelope_xdr;
    valid(typeof envelope === "string" && envelope.length <= 65536 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(envelope));
    const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET);
    valid(tx instanceof Transaction && tx.toEnvelope().switch().name === "envelopeTypeTx" &&
      tx.toXDR() === envelope && tx.hash().toString("hex") === txDTO.hash &&
      txDTO.operation_count === tx.operations.length && index < tx.operations.length);
    const decoded = tx.operations[index];
    const sdkType = tx.toEnvelope().v1().tx().operations()[index].body().switch().value;
    valid(op.type_i === sdkType);
    const source = decoded.source ?? tx.source;
    address(source);
    valid(op.source_account === source && !op.source_account_muxed && !op.from_muxed && !op.to_muxed);
    const memoValue = tx.memo.value;
    const memo = { type: tx.memo.type, value: memoValue === null ? null :
      typeof memoValue === "string" ? memoValue :
        Buffer.from(memoValue).toString(tx.memo.type === "text" ? "utf8" : "hex") };
    if (tx.memo.type === "text" && memoValue !== null && typeof memoValue !== "string") {
      valid(Buffer.from(memo.value!, "utf8").equals(Buffer.from(memoValue)));
    }
    let classification: Classification = { kind: "quarantined", reason: "unsupported_operation" };
    if (decoded.type === "payment") {
      address(decoded.destination);
      const asset: AssetIdentity = decoded.asset.isNative() ? { type: "native" } :
        { type: "issued", code: decoded.asset.getCode(), issuer: decoded.asset.getIssuer()! };
      const expectedType = asset.type === "native" ? "native" :
        asset.code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
      valid(op.type === "payment" && op.from === source && op.to === decoded.destination &&
        op.amount === amount(decoded.amount) && op.asset_type === expectedType);
      if (asset.type === "issued") valid(op.asset_code === asset.code && op.asset_issuer === asset.issuer);
      else valid(op.asset_code === undefined && op.asset_issuer === undefined);
      classification = source === input.pool ? { kind: "outgoing_payment", source,
        destination: decoded.destination, asset, amount: decoded.amount } :
        decoded.destination === input.pool ? { kind: "incoming_payment", donor: source,
          pool: input.pool, asset, amount: decoded.amount } : { kind: "quarantined", reason: "unrelated_payment" };
    } else if (decoded.type === "createAccount") {
      address(decoded.destination);
      valid(op.type === "create_account" && op.funder === source && op.account === decoded.destination &&
        op.starting_balance === amount(decoded.startingBalance));
      classification = decoded.destination === input.pool ? { kind: "account_created", funder: source,
        pool: input.pool, starting_balance: decoded.startingBalance } : { kind: "quarantined", reason: "unrelated_creation" };
    }
    const operation = { ...classification, sdk_type: sdkType, source, confirmed_at: confirmed,
      memo, raw: { operation: op, transaction: txDTO } };
    boundedJSON(operation);
    return { paging_token: op.paging_token, ledger, transaction_hash: txDTO.hash,
      operation_id: op.paging_token, operation };
  } catch {
    throw new Error("invalid_discovered_operation");
  }
}
