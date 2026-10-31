import {
  Account, Asset, Claimant, Keypair, Memo, Networks, Operation, Transaction,
  TransactionBuilder, xdr,
} from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import type { Preparation } from "../../functions/d1-custody/handler.ts";
import { planIssuance } from "../../functions/d1-custody/issuance-plan.ts";
import {
  type UnsignedTransactionInput, validateUnsignedTransaction,
} from "../../functions/d1-custody/unsigned-transaction.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
// Synthetic identities only, never environment keys or ledger clients.
const [pool, donor, beneficiary, issuer] = [1, 2, 3, 4].map((byte) =>
  Keypair.fromRawEd25519Seed(Buffer.alloc(32, byte)).publicKey()
);
const confirmed = 1793102400;
const expiry = confirmed + 300;
function fixture(sequence = "9007199254740993", issued = false) {
  const asset: Preparation["request"]["asset"] = issued
    ? { type: "issued", code: "ABCDEFGHIJKL", issuer } : { type: "native" };
  const prepared: Preparation = {
    request_id: "00000000-0000-4000-8000-000000000001", authorized_by: donor,
    payment: {
      transaction_hash: "a".repeat(64), operation_id: "123", donor, pool,
      asset, amount: "922337203685.4775807",
    },
    request: {
      version: 1, incident_id: "incident-1", donor, beneficiary, asset,
      amount: "1.0000001", deadline: "2026-10-27T12:05:00Z",
    },
    confirmed_at: confirmed, ledger: 900, memo_hash: "b".repeat(64),
  };
  const { unsignedXdr } = planIssuance(prepared, {
    networkPassphrase: Networks.TESTNET, pool, sequence, fee: "100", now: confirmed + 10,
  });
  return {
    prepared, networkPassphrase: Networks.TESTNET, pool, observedSequence: sequence,
    transactionSequence: (BigInt(sequence) + 1n).toString(), unsignedXdr,
    expectedTransactionHash: decode(unsignedXdr).hash().toString("hex"),
  };
}
function decode(value: string) {
  const tx = TransactionBuilder.fromXDR(value, Networks.TESTNET);
  if (!(tx instanceof Transaction)) throw new Error("fixture is not an ordinary transaction");
  return tx;
}
function snapshot(value: unknown): string {
  return JSON.stringify(value);
}
function reject(value: unknown) {
  const before = snapshot(value);
  let caught: unknown;
  try { validateUnsignedTransaction(value as UnsignedTransactionInput); }
  catch (error) { caught = error; }
  equal(caught instanceof Error, true);
  equal((caught as Error)?.constructor, Error);
  equal((caught as Error)?.message, "invalid_unsigned_transaction");
  equal(snapshot(value), before);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function accept(value: UnsignedTransactionInput) {
  const before = snapshot(value);
  equal(validateUnsignedTransaction(freeze(value)), {
    unsignedXdr: value.unsignedXdr, transactionHash: value.expectedTransactionHash,
  });
  equal(snapshot(value), before);
}

Deno.test("saved validator returns exact native/issued bytes and hash with exact bigint boundaries", () => {
  for (const sequence of ["0", "9007199254740993", "9223372036854775806"]) {
    for (const issued of [false, true]) accept(fixture(sequence, issued));
  }
  const input = fixture();
  input.prepared.request.amount = input.prepared.payment.amount;
  input.unsignedXdr = planIssuance(input.prepared, {
    networkPassphrase: Networks.TESTNET, pool, sequence: input.observedSequence,
    fee: "4294967295", now: expiry - 1,
  }).unsignedXdr;
  input.expectedTransactionHash = decode(input.unsignedXdr).hash().toString("hex");
  accept(input);
});

Deno.test("saved validator uses historical time only, including expired evidence, without TTL reset", () => {
  const input = fixture();
  // Fixed year-2000 evidence is already expired; disable the ambient clock entirely.
  input.prepared.confirmed_at = 946684800;
  input.prepared.request.deadline = "2000-01-01T00:05:00Z";
  input.unsignedXdr = planIssuance(input.prepared, {
    networkPassphrase: Networks.TESTNET, pool, sequence: input.observedSequence,
    fee: "100", now: input.prepared.confirmed_at,
  }).unsignedXdr;
  input.expectedTransactionHash = decode(input.unsignedXdr).hash().toString("hex");
  const original = Date.now;
  Date.now = () => { throw new Error("ambient clock forbidden"); };
  try {
    // Time is historical even if current wall time is after expiry; no clock is read.
    accept(input);
    equal(decode(input.unsignedXdr).timeBounds,
      { minTime: "946684800", maxTime: "946685099" });
  } finally { Date.now = original; }
});

Deno.test("saved validator normalizes unknown shapes, mandatory hash and Base64/size/canonical errors", () => {
  for (const value of [null, undefined, [], 1, "x", {}, { prepared: null }]) reject(value);
  const input = fixture();
  for (const unsignedXdr of [
    "", "AAAA", "!!!!", input.unsignedXdr + "\n", " " + input.unsignedXdr,
    input.unsignedXdr + "=", "A".repeat(65536), "A".repeat(65540),
    Buffer.concat([Buffer.from(input.unsignedXdr, "base64"), Buffer.alloc(4)]).toString("base64"),
  ]) reject({ ...input, unsignedXdr });
  // Nonzero unused Base64 padding bits decode to the same bytes, but aren't canonical.
  const padded = Buffer.alloc(1).toString("base64");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const noncanonical = padded.slice(0, -3) +
    alphabet[alphabet.indexOf(padded.at(-3)!) + 1] + "==";
  equal(Buffer.from(noncanonical, "base64").equals(Buffer.from(padded, "base64")), true);
  reject({ ...input, unsignedXdr: noncanonical });
  for (const expectedTransactionHash of [undefined, null, 1, "", "A".repeat(64),
    "a".repeat(63), "g".repeat(64), "0".repeat(64)]) {
    reject({ ...input, expectedTransactionHash });
  }
});

Deno.test("saved validator binds configured Testnet, pool and both reserved sequences", () => {
  const input = fixture();
  for (const patch of [
    { networkPassphrase: Networks.PUBLIC }, { networkPassphrase: "TESTNET" },
    { pool: donor }, { pool: "invalid" },
    ...["01", "-1", "1.0", "9223372036854775807", "9223372036854775808", 1]
      .map((observedSequence) => ({ observedSequence })),
    ...["0", input.observedSequence, "09007199254740994", "9223372036854775808", 1]
      .map((transactionSequence) => ({ transactionSequence })),
    { expectedTransactionHash: TransactionBuilder.fromXDR(input.unsignedXdr, Networks.PUBLIC)
      .hash().toString("hex") },
  ]) reject({ ...input, ...patch });
});

Deno.test("saved validator reuses persisted preparation money, asset and immutable deadline guards", () => {
  for (const change of [
    (p: Preparation) => { p.payment.pool = donor; },
    (p: Preparation) => { p.request.donor = beneficiary; },
    (p: Preparation) => { p.request.beneficiary = pool; },
    (p: Preparation) => { p.request.amount = "1.0000002"; },
    (p: Preparation) => { p.payment.amount = "0.0000001"; },
    (p: Preparation) => { p.request.amount = "1.00000001"; },
    (p: Preparation) => { p.request.asset = { type: "issued", code: "USD", issuer }; },
    (p: Preparation) => { p.confirmed_at += 1; },
    (p: Preparation) => { p.request.deadline = "2026-10-27T12:10:00Z"; },
    (p: Preparation) => { p.request.deadline = "invalid"; },
  ]) {
    const input = fixture(); change(input.prepared); reject(input);
  }
  for (const prepared of [null, {}, { request: {} }, { payment: null }, []]) {
    reject({ ...fixture(), prepared });
  }
});

// Each alternative is valid SDK-produced XDR; its matching hash must NOT bless altered semantics.
function alternative(input: ReturnType<typeof fixture>, tx: Transaction | string) {
  const unsignedXdr = typeof tx === "string" ? tx : tx.toXDR();
  reject({ ...input, unsignedXdr,
    expectedTransactionHash: TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET)
      .hash().toString("hex") });
}
function operation(options: Record<string, unknown> = {}) {
  const before = Claimant.predicateBeforeAbsoluteTime(String(expiry));
  return Operation.createClaimableBalance({
    asset: Asset.native(), amount: "1.0000001",
    claimants: [new Claimant(beneficiary, before), new Claimant(pool, Claimant.predicateNot(before))],
    ...options,
  });
}
function builder(options: Record<string, unknown> = {}, source = pool, sequence = "9007199254740993") {
  return new TransactionBuilder(new Account(source, sequence), {
    networkPassphrase: Networks.TESTNET, fee: "100",
    timebounds: { minTime: confirmed + 10, maxTime: expiry - 1 }, ...options,
  });
}
Deno.test("saved validator rejects altered economics, claimants, predicates, source, fee and timebounds", () => {
  const input = fixture();
  for (const options of [
    { amount: "1.0000002" }, { asset: new Asset("USD", issuer) }, { source: pool },
    { claimants: [new Claimant(donor, Claimant.predicateUnconditional())] },
    { claimants: [new Claimant(pool, Claimant.predicateUnconditional()),
      new Claimant(beneficiary, Claimant.predicateUnconditional())] },
    { claimants: [new Claimant(beneficiary, Claimant.predicateBeforeAbsoluteTime(String(expiry + 1))),
      new Claimant(pool, Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime(String(expiry))))] },
    { claimants: [new Claimant(beneficiary, Claimant.predicateBeforeAbsoluteTime(String(expiry))),
      new Claimant(pool, Claimant.predicateBeforeAbsoluteTime(String(expiry)))] },
    { claimants: [new Claimant(beneficiary, Claimant.predicateBeforeAbsoluteTime(String(expiry))),
      new Claimant(donor, Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime(String(expiry))))] },
  ]) alternative(input, builder().addOperation(operation(options)).build());
  for (const options of [
    { fee: "99" }, { fee: "0" },
    { timebounds: { minTime: confirmed - 1, maxTime: expiry - 1 } },
    { timebounds: { minTime: expiry, maxTime: expiry } },
    { timebounds: { minTime: confirmed, maxTime: expiry } },
    { timebounds: { minTime: confirmed, maxTime: 0 } },
    { timebounds: { minTime: "9007199254740993", maxTime: "9007199254740994" } },
    { memo: Memo.text("extra") },
  ]) alternative(input, builder(options).addOperation(operation()).build());
  alternative(input, builder({}, donor).addOperation(operation()).build());
  alternative(input, builder({}, pool, "9007199254740994").addOperation(operation()).build());
  alternative(input, builder().addOperation(operation()).addOperation(operation()).build());
  alternative(input, builder().addOperation(Operation.payment({
    destination: beneficiary, asset: Asset.native(), amount: "1.0000001",
  })).build());
});

Deno.test("saved validator rejects signed, fee-bump, legacy, advanced preconditions and extra signers", () => {
  const input = fixture();
  const tx = decode(input.unsignedXdr);
  tx.signatures.push(new xdr.DecoratedSignature({
    hint: Buffer.alloc(4), signature: Buffer.alloc(64),
  }));
  alternative(input, tx);
  alternative(input, TransactionBuilder.buildFeeBumpTransaction(
    donor, "100", decode(input.unsignedXdr), Networks.TESTNET,
  ).toXDR());
  const envelope = decode(input.unsignedXdr).toEnvelope();
  const v1 = envelope.v1().tx();
  const legacy = new xdr.TransactionV0({
    sourceAccountEd25519: Buffer.from(Keypair.fromPublicKey(pool).rawPublicKey()),
    fee: v1.fee(), seqNum: v1.seqNum(), timeBounds: v1.cond().timeBounds(),
    memo: v1.memo(), operations: v1.operations(), ext: xdr.TransactionV0Ext.fromXDR(Buffer.alloc(4)),
  });
  alternative(input, xdr.TransactionEnvelope.envelopeTypeTxV0(
    new xdr.TransactionV0Envelope({ tx: legacy, signatures: [] }),
  ).toXDR("base64"));
  for (const changed of [
    builder().setLedgerbounds(1, 1000),
    builder().setMinAccountSequence("1"),
    builder().setMinAccountSequenceAge(1),
    builder().setMinAccountSequenceLedgerGap(1),
    builder().setExtraSigners([donor]),
  ]) alternative(input, changed.addOperation(operation()).build());
});
