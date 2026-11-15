import fixture from "../fixtures/donor-read-r1-vectors.json" with { type: "json" };
import { hash, Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { deepStrictEqual as eq, ok } from "node:assert";

// Offline fixture integrity / SDK interoperability only. This is NOT a donor codec.
type Edit = { path: string[]; value?: unknown; remove?: boolean };
type Input = { utf8?: string; hex?: string; recipe?: string; base?: string;
  byte?: number; totalBytes?: number; count?: number; edits?: Edit[] };
const bases: Record<string, unknown> = fixture.bases;
function expand(input: Input): Buffer {
  if (input.utf8 !== undefined) return Buffer.from(input.utf8, "utf8");
  if (input.hex !== undefined) return Buffer.from(input.hex, "hex");
  if (input.recipe === "repeat-byte") return Buffer.alloc(input.count!, input.byte!);
  if (input.recipe === "pad-utf8") {
    const base = Buffer.from(JSON.stringify(bases[input.base!]));
    return Buffer.concat([base, Buffer.alloc(input.totalBytes! - base.length, input.byte!)]);
  }
  const value = structuredClone(fixture.bases.response);
  if (input.recipe === "allocation-count") {
    value.allocations = Array.from({ length: input.count! }, (_, i) => ({
      ...structuredClone(fixture.bases.response.allocations[0]),
      requestId: "33333333-3333-4333-8333-" + String(i + 1).padStart(12, "0"),
    }));
  } else {
    eq(input.recipe, "response-edits");
    for (const edit of input.edits!) {
      let parent: unknown = value;
      for (const key of edit.path.slice(0, -1)) parent = (parent as Record<string, unknown>)[key];
      const target = parent as Record<string, unknown>, key = edit.path.at(-1)!;
      if (edit.remove) delete target[key]; else target[key] = edit.value;
    }
  }
  return Buffer.from(JSON.stringify(value));
}
const byId = (id: string) => { const c = fixture.cases.find(c => c.id === id); ok(c, id); return c; };
const requestValue = (id: string) => JSON.parse(expand(byId(id).input).toString("utf8"));
const digest = (bytes: Buffer) => hash(bytes).toString("hex");
const signer = Keypair.fromRawEd25519Seed(Buffer.from(fixture.keys[0].seedHex, "hex"));
const other = Keypair.fromPublicKey(fixture.keys[2].address);
Deno.test("r1 inventory: all 147 expanded inputs match literal byte counts and SHA256", () => {
  eq(fixture.schema, "d1-donor-read-offline-vectors/r1");
  eq(fixture.counts, { total: 147, request: 58, dto: 67, limit: 6, error: 16 });
  eq(new Set(fixture.cases.map(c => c.id)).size, 147);
  for (const domain of ["request", "dto", "limit", "error"]) {
    eq(fixture.cases.filter(c => c.domain === domain).length, fixture.counts[domain as keyof typeof fixture.counts]);
  }
  for (const c of fixture.cases) {
    const bytes = expand(c.input);
    eq(bytes.length, c.expectedInputBytes, c.id); eq(digest(bytes), c.expectedInputSHA256, c.id);
    eq(c.proposedContractExpected.status, "UNEXECUTED", c.id);
  }
});
Deno.test("r1 public fictional key seeds agree with SDK addresses and raw Ed25519 keys", () => {
  ok(fixture.warning.includes("NOT FOR FUNDS"));
  for (const key of fixture.keys) {
    const sdk = Keypair.fromRawEd25519Seed(Buffer.from(key.seedHex, "hex"));
    eq(sdk.publicKey(), key.address); eq(sdk.rawPublicKey().toString("hex"), key.publicKeyHex);
  }
  eq(fixture.serverClock, 1700000000); eq(fixture.scope.pool, fixture.keys[1].address);
});
Deno.test("r1 51 Node reference digests/signatures cross-check SDK; wrong key/message reject", () => {
  let count = 0;
  for (const c of fixture.cases) {
    if (c.canonicalJSON === null) {
      eq(c.expectedSHA256digest, null); eq(c.expectedEd25519signature, null);
      ok(c.cryptographicExpected.reason); continue;
    }
    count++;
    // Only fixtures explicitly marked canonicalizable enter JSON.parse. No duplicate detector here.
    const body = JSON.parse(expand(c.input).toString("utf8"));
    const { signature: _signature, ...unsigned } = body;
    const canonical = JSON.stringify(Object.fromEntries(Object.keys(unsigned).sort().map(k => [k, unsigned[k]])));
    eq(canonical, c.canonicalJSON, c.id);
    const bytes = Buffer.from("Stellar Signed Message:\n" + canonical);
    eq(digest(bytes), c.expectedSHA256digest, c.id);
    const message = Buffer.from(c.expectedSHA256digest!, "hex");
    const signature = Buffer.from(c.expectedEd25519signature!, "base64");
    eq(signer.sign(message).toString("base64"), c.expectedEd25519signature, c.id);
    eq(signer.verify(message, signature), true, c.id); eq(other.verify(message, signature), false, c.id);
    const changed = Buffer.from(message); changed[0] ^= 1;
    eq(signer.verify(changed, signature), false, c.id);
    if (c.cryptographicExpected.wireSignatureHex != null) {
      const key = Keypair.fromPublicKey(body.wallet);
      let valid = false;
      try { valid = key.verify(message, Buffer.from(c.cryptographicExpected.wireSignatureHex, "hex")); }
      catch { /* SDK rejects non-64-byte signatures; not donor validation. */ }
      eq(valid, c.cryptographicExpected.wireSignatureValid, c.id);
    }
  }
  eq(count, 51);
});
Deno.test("r1 adapter message is canonical JSON; exactly one LF prefix/hash, never raw body", () => {
  const base = byId("request-valid");
  eq(fixture.prefixHex, "5374656c6c6172205369676e6564204d6573736167653a0a");
  eq(base.expectedSHA256digest, "c97678c3f7cd2a853d15a84200eb0741fadde4372870bbf0accb5e5c4ebde0b5");
  for (const id of ["request-reordered-whitespace", "request-escaped-key-and-value", "request-parsed-timestamp-exponent", "request-parsed-timestamp-decimal"]) {
    const c = byId(id); eq(c.canonicalJSON, base.canonicalJSON); eq(c.expectedEd25519signature, base.expectedEd25519signature);
    ok(!expand(c.input).equals(expand(base.input)));
  }
  for (const message of [base.canonicalJSON!, "Stellar Signed Message:\\n" + base.canonicalJSON,
    "Stellar Signed Message:\r\n" + base.canonicalJSON, "Stellar Signed Message:\nStellar Signed Message:\n" + base.canonicalJSON]) {
    ok(digest(Buffer.from(message)) !== base.expectedSHA256digest);
  }
  eq(Object.keys(requestValue("request-valid")).length, 11);
  eq(typeof requestValue("request-valid").payment_operation_id, "string");
  eq(requestValue("operation-id-overflow").payment_operation_id, "9223372036854775808");
});
Deno.test("r1 malformed raw witnesses remain undecoded and duplicate escapes remain intact", () => {
  for (const id of ["duplicate-top", "escaped-duplicate-top", "duplicate-nested", "escaped-duplicate-nested", "invalid-json", "fatal-utf8", "request-bytes-8193"]) {
    const c = byId(id); eq(c.canonicalJSON, null); eq(c.cryptographicExpected.result, "undefined");
  }
  ok(expand(byId("escaped-duplicate-top").input).toString().includes('"ver\\u0073ion"'));
  ok(expand(byId("escaped-duplicate-nested").input).toString().includes('"\\u0078"'));
  eq(expand(byId("fatal-utf8").input).toString("hex"), "7b22c328223a317d");
  const bad = byId("base64-padding-bits"), base = byId("request-valid");
  eq(bad.cryptographicExpected.wireSignatureHex, base.cryptographicExpected.wireSignatureHex);
  ok(requestValue(bad.id).signature !== requestValue(base.id).signature);
});
Deno.test("r1 recipes preserve 1:N and exact caps; this does not execute endpoint limits", () => {
  for (const n of [100, 101]) eq(JSON.parse(expand(byId("allocation-count-" + n).input).toString()).allocations.length, n);
  for (const [prefix, values] of [["request", [8192, 8193]], ["response", [65536, 65537]], ["internal-evidence", [4194304, 4194305]]] as const) {
    for (const n of values) eq(expand(byId(prefix + "-bytes-" + n).input).length, n);
  }
  eq(expand(byId("backend-error-3").input), expand(byId("backend-error-4").input));
  for (const c of fixture.cases.filter(c => c.domain === "error")) {
    eq(c.proposedContractExpected.releaseHold, false); eq(c.proposedContractExpected.financialRetry, false);
    eq(Object.keys(JSON.parse(expand(c.input).toString())), ["error"]);
  }
});
