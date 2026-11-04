import { Keypair, Networks, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { signInitialAuthorizedIssuance } from "../../functions/d1-custody/initial-authorized-signer.ts";
import { fixture, equal, pool } from "../fixtures/initial-financial-authorization.ts";
const key = () => Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)); // Ephemeral fixture only.
type F = ReturnType<typeof fixture>;
const expiration = (f: F) => (f.h.persisted.values().next().value as { snapshot: { expiresAt: number } }).snapshot.expiresAt;
async function rejected(f: F, load: () => unknown, code = "initial_signing_unavailable", status = 503, saves = 1, calls = 1) {
  const before = JSON.stringify([f.h.owner, f.h.history, f.h.credit, f.h.records]); let loads = 0, caught: unknown;
  try { await signInitialAuthorizedIssuance(f.h.client, { ...f.configuration, loadPoolSigner: async address => { equal(address, pool); loads++; return await load(); } }); } catch (e) { caught = e; }
  equal(caught instanceof CustodyError ? [caught.code, caught.status, caught.message] : "uncaught", [code, status, code]);
  equal(loads, calls); equal(f.h.persisted.size, saves); equal(JSON.stringify([f.h.owner, f.h.history, f.h.credit, f.h.records]), before);
  const fresh = "d1_record_fresh_initial_financial_observation";
  equal(f.h.calls.filter(c => c !== "account" && !c.startsWith("d1_load_") && !c.startsWith("d1_list_")), Array(saves).fill(fresh));
  if (saves) equal(f.h.calls.slice(f.h.calls.indexOf(fresh)), [fresh]); // No retry/readback/release after save.
}
Deno.test("internal signer gates native and issued bytes before one backend key load and preserves exact unsigned body and hash", async () => {
  for (const issued of [false, true]) {
    const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture(); let loads = 0;
    const result = await signInitialAuthorizedIssuance(f.h.client, { ...f.configuration, async loadPoolSigner(address) { equal(address, pool); equal(f.h.persisted.size, 1); loads++; return key(); } });
    equal(loads, 1); equal([result.kind, result.revision], ["d1_initial_signed_issuance", 1]);
    equal(Object.keys(result).sort(), ["authorization", "kind", "revision", "signedXdr"]);
    const unsigned = TransactionBuilder.fromXDR(result.authorization.unsignedXdr, Networks.TESTNET), signed = TransactionBuilder.fromXDR(result.signedXdr, Networks.TESTNET);
    if (!(unsigned instanceof Transaction) || !(signed instanceof Transaction)) throw Error("wrong envelope");
    equal(unsigned.signatures.length, 0); equal(signed.signatures.length, 1); equal(unsigned.toXDR(), result.authorization.unsignedXdr);
    equal(signed.toEnvelope().v1().tx().toXDR("base64"), unsigned.toEnvelope().v1().tx().toXDR("base64"));
    equal(signed.hash().toString("hex"), result.authorization.transactionHash); equal(signed.source, pool);
    equal(key().verify(signed.hash(), signed.signatures[0].signature()), true); equal(signed.signatures[0].hint().toString("hex"), key().signatureHint().toString("hex"));
    equal(JSON.stringify(result).includes(key().secret()), false); equal(f.h.persisted.size, 1);
  }
});
Deno.test("internal signer never loads a key on admin denial insufficient funds or unknown financial save", async () => {
  const denied = fixture(); denied.h.error = { code: "42501", message: "unauthorized_admin_wallet" }; await rejected(denied, key, "unauthorized_admin_wallet", 403, 0, 0);
  const budget = fixture(); budget.h.account.native.balance = "100000001"; await rejected(budget, key, "initial_financial_authorization_unavailable", 503, 0, 0);
  const unknown = fixture(); unknown.h.beforeResponse = async name => { if (name === "d1_record_fresh_initial_financial_observation") throw Error("unknown outcome"); };
  await rejected(unknown, key, "initial_financial_authorization_unavailable", 503, 1, 0);
});
Deno.test("internal signer sanitizes wrong public-only missing and throwing providers without laundering 403", async () => {
  for (const load of [() => Keypair.fromRawEd25519Seed(Buffer.alloc(32, 102)), () => Keypair.fromPublicKey(pool), () => null,
    () => { throw Error("DO_NOT_LEAK"); }, () => { throw new CustodyError("unauthorized_admin_wallet", 403); }]) await rejected(fixture(), load);
});
Deno.test("internal signer bounds asynchronous key delay and rejects exact expiry or rollback before signing", async () => {
  const valid = fixture(); const result = await signInitialAuthorizedIssuance(valid.h.client, { ...valid.configuration, async loadPoolSigner() { await Promise.resolve(); valid.h.now++; return key(); } }); equal(result.kind, "d1_initial_signed_issuance");
  for (const outcome of ["expire", "rollback"]) {
    const f = fixture(), k = key(); let signatures = 0; const sign = k.sign.bind(k); k.sign = data => { signatures++; return sign(data); };
    await rejected(f, async () => { await Promise.resolve(); f.h.now = outcome === "expire" ? expiration(f) : f.h.now - 1; return k; }); equal(signatures, 0);
  }
});
Deno.test("internal signer rejects expiry or rollback after cryptographic signing without returning the artifact", async () => {
  for (const outcome of ["expire", "rollback"]) {
    const f = fixture(), k = key(), sign = k.sign.bind(k); let signatures = 0;
    k.sign = data => { const signature = sign(data); signatures++; f.h.now = outcome === "expire" ? expiration(f) : f.h.now - 1; return signature; };
    await rejected(f, () => k); equal(signatures, 1);
  }
});
Deno.test("internal signer independently rejects invalid wrong-network and wrong-hint provider signatures", async () => {
  for (const outcome of ["invalid", "network", "hint"]) {
    const f = fixture(), k = key(), sign = k.sign.bind(k), decorate = k.signDecorated.bind(k); let unsigned = "";
    f.h.mutate = (name, data) => { if (name === "d1_load_unsigned_transaction") unsigned = (data as { transaction: { unsigned_xdr: string } }).transaction.unsigned_xdr; };
    if (outcome === "invalid") k.sign = () => Buffer.alloc(64);
    if (outcome === "network") k.sign = () => sign(TransactionBuilder.fromXDR(unsigned, Networks.PUBLIC).hash());
    if (outcome === "hint") k.signDecorated = data => new xdr.DecoratedSignature({ hint: Buffer.alloc(4), signature: decorate(data).signature() });
    await rejected(f, () => k);
  }
});
Deno.test("internal signer checks the clock again after independent signature verification", async () => {
  for (const outcome of ["expire", "rollback"]) {
    const f = fixture(), k = key(), sign = k.sign.bind(k); let signed = false, reads = 0;
    k.sign = data => { const signature = sign(data); signed = true; return signature; };
    f.configuration.now = () => signed && ++reads === 2 ? outcome === "expire" ? expiration(f) : f.h.now - 1 : f.h.now;
    await rejected(f, () => k); equal(reads, 2);
  }
});
Deno.test("internal signer rejects non-integer or non-finite clocks after key retrieval", async () => {
  for (const value of [NaN, Infinity, 0.5]) { const f = fixture(); await rejected(f, () => { f.h.now = value; return key(); }); }
});
