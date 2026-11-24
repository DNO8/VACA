import { Account, Asset, Keypair, Memo, MuxedAccount, Networks, Operation, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { parseDiscoveredOperation } from "../../functions/d1-custody/discovery.ts";

const [donor, pool, issuer] = [11, 12, 13].map((n) =>
  Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
const created = "2026-10-27T12:00:00Z";
const closedAt = 1793102400;
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Mismatch: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function fixture(options: { asset?: Asset; memo?: Memo; index?: number; kind?: string; source?: string; destination?: string } = {}) {
  const asset = options.asset ?? Asset.native();
  const source = options.source ?? donor;
  const destination = options.destination ?? pool;
  const index = options.index ?? 0;
  const builder = new TransactionBuilder(new Account(donor, "9007199254740993"), {
    fee: "100", networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 }, memo: options.memo,
  });
  for (let n = 0; n < index; n++) builder.addOperation(Operation.manageData({ name: "other", value: null }));
  builder.addOperation(options.kind === "create" ? Operation.createAccount({ source, destination, startingBalance: "2.0000001" })
    : options.kind === "other" ? Operation.manageData({ name: "unrecognized", value: "keep" })
    : Operation.payment({ source, destination, asset, amount: "922337203685.4775807" }));
  const tx = builder.build();
  const hash = tx.hash().toString("hex");
  const token = ((4294967295n << 32n) + (1n << 12n) + BigInt(index + 1)).toString();
  return {
    pool, anchor: { sequence: 4294967295, closedAt },
    operation: { id: token, paging_token: token, transaction_hash: hash, transaction_successful: true,
      source_account: source, created_at: created,
      ...(options.kind === "create" ? { type: "create_account", type_i: 0, funder: source, account: destination, starting_balance: "2.0000001" }
        : options.kind === "other" ? { type: "manage_data", type_i: 10 }
        : { type: "payment", type_i: 1, from: source, to: destination, amount: "922337203685.4775807",
          ...(asset.isNative() ? { asset_type: "native" } : { asset_type: "credit_alphanum12", asset_code: asset.getCode(), asset_issuer: asset.getIssuer() }) }),
    } as Record<string, unknown>,
    transaction: { hash, paging_token: ((4294967295n << 32n) + (1n << 12n)).toString(),
      ledger: 4294967295, successful: true, operation_count: index + 1,
      created_at: created, envelope_xdr: tx.toXDR() },
  };
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
function reject(v: unknown) {
  const before = JSON.stringify(v);
  let caught: unknown;
  try { parseDiscoveredOperation(freeze(v) as Parameters<typeof parseDiscoveredOperation>[0]); } catch (e) { caught = e; }
  equal(caught instanceof Error && caught.constructor === Error && caught.message === "invalid_discovered_operation", true);
  equal(JSON.stringify(v), before);
}
Deno.test("discovery derives exact native/issued liabilities, multiop uint64 index and original donor without mutation", () => {
  for (const asset of [Asset.native(), new Asset("ABCDEFGHIJKL", issuer)]) {
    const input = fixture({ asset, index: 1, memo: Memo.hash(Buffer.alloc(32, 7)) });
    input.operation.donor = issuer; // Never an authority for the refund destination.
    const before = JSON.stringify(input);
    const record = parseDiscoveredOperation(freeze(input));
    equal(Object.keys(record).sort(), ["ledger", "operation", "operation_id", "paging_token", "transaction_hash"]);
    equal(record.ledger, 4294967295);
    equal(record.operation_id, input.operation.id);
    equal(record.operation.kind, "incoming_payment");
    if (record.operation.kind !== "incoming_payment") throw new Error("classification");
    equal(record.operation.donor, donor);
    equal(record.operation.pool, pool);
    equal(record.operation.amount, "922337203685.4775807");
    equal(record.operation.asset, asset.isNative() ? { type: "native" } : { type: "issued", code: "ABCDEFGHIJKL", issuer });
    equal(record.operation.confirmed_at, closedAt);
    equal(record.operation.memo, { type: "hash", value: Buffer.alloc(32, 7).toString("hex") });
    equal(record.operation.raw, { operation: input.operation, transaction: input.transaction });
    equal(JSON.stringify(input), before);
  }
});
Deno.test("discovery binds the operation TOID to its transaction position without aliasing", () => {
  const aliased = fixture();
  const token = (BigInt(aliased.operation.paging_token as string) + 4096n).toString();
  aliased.operation.id = token;
  aliased.operation.paging_token = token;
  reject(aliased);
  for (const paging_token of [undefined, null, 1, "01", "18446744073709551616",
    (BigInt(fixture().transaction.paging_token) + 1n).toString()]) {
    const input = fixture();
    Object.assign(input.transaction, { paging_token });
    reject(input);
  }
  const zeroPosition = fixture();
  zeroPosition.transaction.paging_token = (4294967295n << 32n).toString();
  zeroPosition.operation.id = (BigInt(zeroPosition.transaction.paging_token) + 1n).toString();
  zeroPosition.operation.paging_token = zeroPosition.operation.id;
  reject(zeroPosition);
});
Deno.test("discovery retains missing/wrong memo incoming liabilities without preparation", () => {
  for (const memo of [undefined, Memo.text("wrong incident")]) {
    const record = parseDiscoveredOperation(fixture({ memo }));
    equal(record.operation.kind, "incoming_payment");
    equal(record.operation.memo, memo ? { type: "text", value: "wrong incident" } : { type: "none", value: null });
  }
});
Deno.test("discovery separates account creation, outgoing/self payments and quarantined unsupported operations", () => {
  const creation = parseDiscoveredOperation(fixture({ kind: "create" })).operation;
  if (creation.kind !== "account_created") throw new Error("classification");
  equal([creation.kind, creation.funder, creation.starting_balance], ["account_created", donor, "2.0000001"]);
  for (const destination of [donor, pool]) {
    const out = parseDiscoveredOperation(fixture({ source: pool, destination })).operation;
    if (out.kind !== "outgoing_payment") throw new Error("classification");
    equal([out.kind, out.source, out.destination], ["outgoing_payment", pool, destination]);
  }
  const other = parseDiscoveredOperation(fixture({ kind: "other" })).operation;
  equal([other.kind, other.sdk_type], ["quarantined", 10]);
  equal(parseDiscoveredOperation(fixture({ destination: issuer })).operation.kind, "quarantined");
});
Deno.test("discovery rejects malformed identity, ledger, anchor, success, time and operation index", () => {
  for (const patch of [
    { id: "01" }, { paging_token: "18446744073709551616" }, { paging_token: "0" },
    { transaction_hash: "A".repeat(64) }, { transaction_successful: false },
    { created_at: "2026-02-30T12:00:00Z" }, { source_account: issuer }, { type_i: 0 },
    { id: (4294967295n << 32n).toString(), paging_token: (4294967295n << 32n).toString() },
    { id: ((4294967295n << 32n) + 3n).toString(), paging_token: ((4294967295n << 32n) + 3n).toString() },
  ]) { const v = fixture(); Object.assign(v.operation, patch); reject(v); }
  for (const patch of [
    { ledger: 4294967294 }, { ledger: 4294967296 }, { hash: "a".repeat(64) },
    { successful: false }, { operation_count: 2 }, { created_at: "2026-10-27T12:00:01Z" },
    { envelope_xdr: "AAAA" },
  ]) { const v = fixture(); Object.assign(v.transaction, patch); reject(v); }
  for (const anchor of [{ sequence: 4294967294, closedAt }, { sequence: 4294967295, closedAt: closedAt + 1 },
    { sequence: 4294967295, closedAt: closedAt - 1 }, { sequence: 4294967295, closedAt: 1.5 }]) reject({ ...fixture(), anchor });
  const wrong = fixture();
  const hash = TransactionBuilder.fromXDR(wrong.transaction.envelope_xdr, Networks.PUBLIC).hash().toString("hex");
  wrong.transaction.hash = hash; wrong.operation.transaction_hash = hash; reject(wrong);
  for (const v of [null, {}, [], { ...fixture(), pool: "invalid" }]) reject(v);
});
Deno.test("discovery rejects payment/create-account DTO contradictions, unsafe muxed identity and fee bumps", () => {
  for (const patch of [{ from: issuer }, { to: issuer }, { amount: "1.0000000" }, { amount: "0.0000000" },
    { asset_type: "credit_alphanum4", asset_code: "USD", asset_issuer: issuer }, { from_muxed: "unsafe" }]) {
    const v = fixture(); Object.assign(v.operation, patch); reject(v);
  }
  const issued = fixture({ asset: new Asset("ABCDEFGHIJKL", issuer) }); issued.operation.asset_issuer = donor; reject(issued);
  const create = fixture({ kind: "create" }); create.operation.starting_balance = "3.0000000"; reject(create);
  const muxed = new MuxedAccount(new Account(donor, "1"), "7").accountId();
  reject(fixture({ source: muxed })); reject(fixture({ destination: muxed }));
  const v = fixture();
  const inner = TransactionBuilder.fromXDR(v.transaction.envelope_xdr, Networks.TESTNET);
  if (!(inner instanceof Transaction)) throw new Error("fixture");
  const bump = TransactionBuilder.buildFeeBumpTransaction(pool, "100", inner, Networks.TESTNET);
  v.transaction.envelope_xdr = bump.toXDR(); v.transaction.hash = bump.hash().toString("hex");
  v.operation.transaction_hash = v.transaction.hash; reject(v);
});
Deno.test("discovery fails closed on oversized unknown operations and non-JSON raw data", () => {
  const v = fixture({ kind: "other" }); v.operation.opaque = "x".repeat(16384); reject(v);
  for (const opaque of [undefined, NaN, 1n, "\u0000", new Date(0)]) {
    const input = fixture(); input.operation.opaque = opaque;
    if (typeof opaque === "bigint") {
      let error: unknown;
      try { parseDiscoveredOperation(input); } catch (e) { error = e; }
      equal((error as Error)?.message, "invalid_discovered_operation");
    } else reject(input);
  }
});
