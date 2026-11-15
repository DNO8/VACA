import fixture from "../fixtures/donor-read-r1-vectors.json" with { type: "json" };
import { deepStrictEqual as eq, ok } from "node:assert";
import { Buffer } from "node:buffer";
import { hash, Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { verifyDonorPaymentCommand } from "../../functions/d1-custody/donor-payment-command.ts";

const url = "http://local.invalid/functions/v1/d1-custody/donor-payment-status";
const configuration = { ...fixture.scope, now: () => fixture.serverClock };
const base = fixture.bases.request;
const raw = JSON.stringify(base);
const request = (body: BodyInit | null = raw, suffix = "", method = "POST") =>
  new Request(url + suffix, { method, body });
const expected = (body = base) => ({
  kind: "d1_verified_donor_payment_command", revision: 1, network: "TESTNET",
  namespace: body.namespace, pool: body.pool,
  paymentTransactionHash: body.payment_transaction_hash,
  paymentOperationId: body.payment_operation_id, verifiedDonor: body.wallet,
});
async function reject(r: Request, code = "invalid_request", status = 400,
  config = configuration, used = true) {
  const before = JSON.stringify(config);
  let error: unknown;
  try { await verifyDonorPaymentCommand(r, config); } catch (e) { error = e; }
  ok(error instanceof CustodyError);
  eq([error.status, error.code, error.message], [status, code, code]);
  eq(r.bodyUsed, used);
  eq(JSON.stringify(config), before);
}
const requests = fixture.cases.filter(c => c.domain === "request");
eq(requests.length, 58);
for (const c of requests) Deno.test(`donor actual codec r1: ${c.id}`, async () => {
  const input = c.input;
  let bytes: Buffer;
  if (input.utf8 !== undefined) bytes = Buffer.from(input.utf8);
  else if (input.hex !== undefined) bytes = Buffer.from(input.hex, "hex");
  else {
    eq(input.recipe, "pad-utf8"); eq(input.base, "request");
    bytes = Buffer.from(raw.padEnd(input.totalBytes!, String.fromCharCode(input.byte!)));
  }
  eq(bytes.length, c.expectedInputBytes);
  eq(hash(bytes).toString("hex"), c.expectedInputSHA256);
  const copy = Buffer.from(bytes), before = JSON.stringify(c);
  const r = request(new Uint8Array(bytes)), expectation = c.proposedContractExpected;
  if (expectation.result === "accept_authentication_only") {
    const result = await verifyDonorPaymentCommand(r, configuration);
    eq(result, expected(JSON.parse(bytes.toString()))); eq(Object.isFrozen(result), true);
    eq(r.bodyUsed, true);
  } else {
    eq(expectation.result, "reject");
    await reject(r, expectation.body!.error, expectation.httpStatus!);
  }
  eq(bytes, copy); eq(JSON.stringify(c), before);
});
Deno.test("donor method and query gates do not consume input or invoke clock", async () => {
  let calls = 0;
  const config = { ...configuration, now: () => { calls++; return fixture.serverClock; } };
  for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]) {
    await reject(request(null, "", method), "method_not_allowed", 405, config, false);
  }
  for (const suffix of ["?", "?x=1", "?%71=1"]) {
    await reject(request(raw, suffix), "invalid_request", 400, config, false);
  }
  eq(calls, 0);
});
Deno.test("donor malformed grammar and deep escaped duplicates fail before clock", async () => {
  let calls = 0;
  const config = { ...configuration, now: () => { calls++; return fixture.serverClock; } };
  for (const text of ["", "null", "[]", "true", "1", "{}{}", raw + "x", raw + "\u00a0",
    raw.replace('"version":1', '"version":01'), raw.replace('"version":1', '"version":1.'),
    raw.replace('"version":1', '"version":1e+'), raw.replace('"payload":{}', '"payload":{"x":true,}'),
    raw.replace('"payload":{}', '"payload":[1,]'), raw.replace('"TESTNET"', '"TEST\\qNET"'),
    raw.replace('"TESTNET"', '"TEST\nNET"'), raw.replace('"TESTNET"', '"TEST\\u00zzNET"'),
    raw.replace('"payload":{}', '"payload":{"a":[{"x":1,"\\u0078":2}]}'),
    raw.replace('"payload":{}', '"payload":' + '['.repeat(33) + '0' + ']'.repeat(33)),
    raw.replace('"payload":{}', '"payload":{"__proto__":0,"__pr\\u006fto__":1}')]) {
    await reject(request(text), "invalid_request", 400, config);
  }
  await reject(request(null), "invalid_request", 400, config, false);
  eq(calls, 0);
});
Deno.test("donor streams bound bytes, cancel overflow once, preserve chunks and release locks", async () => {
  for (const cancelThrows of [false, true]) {
    const bytes = new Uint8Array(8193).fill(32), before = bytes.slice();
    let pulls = 0, cancels = 0, clocks = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) { pulls++; c.enqueue(bytes); },
      cancel() { cancels++; if (cancelThrows) throw new Error("private cancellation"); },
    }, { highWaterMark: 0 });
    await reject(request(stream), "invalid_request", 400,
      { ...configuration, now: () => { clocks++; return fixture.serverClock; } });
    eq([pulls, cancels, clocks, stream.locked], [1, 1, 0, false]); eq(bytes, before);
  }
  const bytes = Buffer.from(raw.padEnd(8192, " "));
  let cursor = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(c) {
    if (cursor === bytes.length) c.close(); else c.enqueue(bytes.subarray(cursor, ++cursor));
  } });
  eq(await verifyDonorPaymentCommand(request(stream), configuration), expected());
  eq(stream.locked, false);
  for (const bytes of [new Uint8Array([0xc3, 0x28]), new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(raw)])]) {
    await reject(request(bytes));
  }
  const failed = new ReadableStream<Uint8Array>({ pull() { throw new Error("private stream"); } });
  await reject(request(failed)); eq(failed.locked, false);
});
Deno.test("donor rejects invalid trusted configuration and clock without leaking errors", async () => {
  for (const changes of [{ pool: "invalid" }, { pool: base.pool.toLowerCase() },
    { namespace: "invalid" }, { namespace: "AAAAAAAA-1111-4111-8111-111111111111" },
    { now: null }, { pool: 1 }, { namespace: null }]) {
    await reject(request(), "donor_payment_unavailable", 503,
      { ...configuration, ...changes } as typeof configuration, false);
  }
  for (const field of ["pool", "namespace", "now"]) {
    const config = { ...configuration };
    Object.defineProperty(config, field, { get() { throw new CustodyError("private", 403); }, enumerable: false });
    await reject(request(), "donor_payment_unavailable", 503, config, false);
  }
  for (const value of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, "1700000000", null]) {
    await reject(request(), "donor_payment_unavailable", 503,
      { ...configuration, now: () => value } as typeof configuration);
  }
  await reject(request(), "donor_payment_unavailable", 503,
    { ...configuration, now: () => { throw new CustodyError("private", 403); } });
});
Deno.test("donor captures scope and clock before await; immutable result contains no authority", async () => {
  let calls = 0;
  const config = { ...configuration, now() { eq(this, config); calls++; return fixture.serverClock; } };
  const r = request();
  const pending = verifyDonorPaymentCommand(r, config);
  config.pool = fixture.keys[2].address; config.namespace = "invalid";
  config.now = () => { throw new Error("replacement must not run"); };
  const result = await pending;
  eq(result, expected()); eq(calls, 1); eq(Object.isFrozen(result), true);
  eq(Reflect.set(result, "verifiedDonor", fixture.keys[2].address), false);
  eq(Reflect.set(result, "paymentOperationId", "1"), false); eq(result, expected());
});
Deno.test("donor accepts timestamp numeric boundaries and rejects malformed field alternatives", async () => {
  const signer = Keypair.fromRawEd25519Seed(Buffer.from(fixture.keys[0].seedHex, "hex"));
  for (const timestamp of [0, Number.MAX_SAFE_INTEGER]) {
    const { signature: _, ...unsigned } = { ...base, timestamp };
    const canonical = JSON.stringify(Object.fromEntries(Object.keys(unsigned).sort()
      .map(k => [k, unsigned[k as keyof typeof unsigned]])));
    const signature = signer.sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical))).toString("base64");
    eq(await verifyDonorPaymentCommand(request(JSON.stringify({ ...unsigned, signature })),
      { ...configuration, now: () => timestamp }), expected());
  }
  for (const changes of [{ payment_operation_id: "+1" }, { payment_operation_id: "-1" },
    { payment_operation_id: "1.0" }, { payment_operation_id: "1e1" }, { payment_operation_id: "1 " },
    { payment_transaction_hash: "a".repeat(63) }, { payment_transaction_hash: "g".repeat(64) },
    { wallet: base.wallet.toLowerCase() }, { wallet: base.wallet.slice(0, -1) + "A" },
    { payload: [] }, { payload: null }, { timestamp: "1700000000" }, { version: "1" }]) {
    await reject(request(JSON.stringify({ ...base, ...changes })));
  }
});
