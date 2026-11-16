import { Buffer } from "node:buffer";
import { Keypair, Networks, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { validateDonorIssuancePrefix as validate } from "../../functions/d1-custody/donor-issuance-prefix.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { equal, closedAt, requestId } from "../fixtures/donor-allocation.ts";
import { issuanceCapture, changeReceipt, type IssuanceFixture, type PrefixKey } from "../fixtures/donor-issuance.ts";
function reject(f: IssuanceFixture) {
  const before = JSON.stringify(f);
  let error: unknown; try { validate(f.capture, f.command); } catch (e) { error = e; }
  if (!(error instanceof CustodyError)) throw Error("expected CustodyError");
  equal([error.status, error.code, error.message], [503, "donor_payment_unavailable", "donor_payment_unavailable"]);
  equal(JSON.stringify(f), before);
}
function frozen(v: unknown): void {
  if (v && typeof v === "object") { equal(Object.isFrozen(v), true); Object.values(v).forEach(frozen); }
}
const keys: PrefixKey[] = ["d1_issuance_intents", "d1_issuance_sequences", "d1_unsigned_transactions"];
for (const issued of [false, true]) for (const stage of [0, 1, 2, 3]) {
  Deno.test(`prefix accepts ${issued ? "issued" : "native"} stage ${stage} after expiry`, () => {
    const f = issuanceCapture(stage, issued, ["1.0000000", "2.0000000"]), before = JSON.stringify(f);
    const result = validate(f.capture, f.command); frozen(result);
    equal(result.prefixes.length, 2);
    result.prefixes.forEach((p, i) => {
      equal(p.requestId, requestId(i + 1)); equal(p.intent !== null, stage >= 1);
      equal(p.reservation !== null, stage >= 2); equal(p.unsigned !== null, stage >= 3);
      equal("issuance" in p || "state" in p, false);
      if (p.unsigned) equal(p.unsigned.transactionHash, JSON.parse(f.capture.allocations[i].d1_unsigned_transactions!.receipt).transaction_hash);
    });
    equal(JSON.stringify(f), before); f.capture.allocations.length = 0; equal(result.allocations.length, 2);
  });
}
Deno.test("empty and 100 allocations preserve completeness", () => {
  for (const amounts of [[], Array(100).fill("0.0000001")]) {
    const f = issuanceCapture(3, false, amounts); equal(validate(f.capture, f.command).prefixes.length, amounts.length);
  }
});
Deno.test("sequence, fee and encoded time boundaries remain historical", () => {
  for (const [seq, fee, now] of [["0", "100", closedAt], ["9223372036854775806", "4294967295", closedAt + 299]] as const) {
    const f = issuanceCapture(3, false, undefined, seq, fee, now); equal(validate(f.capture, f.command).prefixes.length, 1);
  }
});
for (const key of keys) {
  const common = ["kind", "revision", "request_id", "namespace", "network", "pool"];
  const fields = key === keys[0] ? [...common, "preparation_input", "preparation"] : key === keys[1]
    ? [...common, "observed_account_sequence", "transaction_sequence", "intent"]
    : [...common, "deadline", "transaction_sequence", "reservation", "unsigned_xdr", "transaction_hash"];
  for (const field of fields) Deno.test(`reject coherent ${key}.${field} substitution`, () => {
    const f = issuanceCapture(); changeReceipt(f, key, r => { r[field] = "wrong"; }); reject(f);
  });
  Deno.test(`reject ${key} missing/extra keys and row identity`, () => {
    for (const field of fields) { const f = issuanceCapture(); changeReceipt(f, key, r => { delete r[field]; }); reject(f); }
    const f = issuanceCapture(); changeReceipt(f, key, r => { r.extra = true; }); reject(f);
    const g = issuanceCapture(); g.capture.allocations[0][key]!.request_id = requestId(99); reject(g);
  });
  Deno.test(`reject ${key} duplicate JSON key`, () => {
    const f = issuanceCapture(), row = f.capture.allocations[0][key]!;
    row.receipt = row.receipt.replace('{', '{"revision":1,'); reject(f);
  });
}
Deno.test("reject missing ancestors and mismatched sequence namespace", () => {
  for (const key of keys.slice(0, 2)) { const f = issuanceCapture(); f.capture.allocations[0][key] = null; reject(f); }
  const f = issuanceCapture(); f.capture.allocations[0].d1_issuance_sequences!.namespace = "99999999-9999-4999-8999-999999999999"; reject(f);
});
Deno.test("reservation-only rejects noncanonical/overflow/incorrect next sequence", () => {
  for (const s of ["01", "-1", "1.0", "9223372036854775807", 100]) {
    const f = issuanceCapture(2); changeReceipt(f, keys[1], r => { r.observed_account_sequence = s; }); reject(f);
  }
  for (const s of ["0101", "102", 101]) {
    const f = issuanceCapture(2); changeReceipt(f, keys[1], r => { r.transaction_sequence = s; }); reject(f);
  }
});
Deno.test("reconstructed SDK body rejects wrong time/fee/memo/operation/predicate/source", () => {
  const mutations: Array<(tx: xdr.Transaction) => void> = [
    t => { t.cond().timeBounds().minTime(xdr.Uint64.fromString(String(closedAt - 1))); },
    t => { t.cond().timeBounds().minTime(xdr.Uint64.fromString(String(closedAt + 300))); },
    t => { t.cond().timeBounds().maxTime(xdr.Uint64.fromString(String(closedAt + 300))); },
    t => { t.fee(99); }, t => { t.memo(xdr.Memo.memoText("wrong")); },
    t => { t.operations([...t.operations(), t.operations()[0]]); },
    t => { t.operations()[0].body().createClaimableBalanceOp().amount(xdr.Int64.fromString("1")); },
    t => { t.operations()[0].body().createClaimableBalanceOp().claimants()[0].v0().predicate(xdr.ClaimPredicate.claimPredicateUnconditional()); },
    t => { t.sourceAccount(xdr.MuxedAccount.keyTypeEd25519(Buffer.alloc(32, 12))); },
  ];
  for (const mutate of mutations) {
    const f = issuanceCapture(); changeReceipt(f, keys[2], r => {
      const envelope = xdr.TransactionEnvelope.fromXDR(r.unsigned_xdr as string, "base64");
      mutate(envelope.v1().tx()); r.unsigned_xdr = envelope.toXDR("base64");
      r.transaction_hash = TransactionBuilder.fromXDR(r.unsigned_xdr as string, Networks.TESTNET).hash().toString("hex");
    }); reject(f);
  }
});
Deno.test("signed or noncanonical unsigned bytes reject", () => {
  const f = issuanceCapture(); changeReceipt(f, keys[2], r => {
    const tx = TransactionBuilder.fromXDR(r.unsigned_xdr as string, Networks.TESTNET);
    tx.sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 111))); r.unsigned_xdr = tx.toXDR();
  }); reject(f);
  const g = issuanceCapture(); changeReceipt(g, keys[2], r => { r.unsigned_xdr += "\n"; }); reject(g);
});
Deno.test("one corrupt allocation rejects whole result", () => {
  const f = issuanceCapture(3, false, ["1.0000000", "2.0000000"]);
  f.capture.allocations[1].d1_unsigned_transactions!.receipt = "{}"; reject(f);
});
Deno.test("later descendants retained without outcome certification", () => {
  const f = issuanceCapture(), raw = f.capture.allocations[0];
  raw.d1_issuance_outcomes = { request_id: requestId(1), attempt_id: requestId(2), receipt: '{"unproved":true}' };
  const result = validate(f.capture, f.command);
  equal(result.allocations[0].raw.d1_issuance_outcomes, raw.d1_issuance_outcomes);
  equal("issuance" in result.allocations[0], false); frozen(result);
});
Deno.test("descriptor-safe outer boundary never invokes receipt getter", () => {
  const f = issuanceCapture(); let calls = 0;
  Object.defineProperty(f.capture.allocations[0].d1_issuance_intents!, "receipt", { enumerable: true, get() { calls++; return "{}"; } });
  const before = Object.getOwnPropertyDescriptors(f.capture.allocations[0].d1_issuance_intents!);
  let error: unknown; try { validate(f.capture, f.command); } catch (e) { error = e; }
  if (!(error instanceof CustodyError)) throw Error("expected CustodyError");
  equal([error.status, error.code, error.message, calls], [503, "donor_payment_unavailable", "donor_payment_unavailable", 0]);
  const after = Object.getOwnPropertyDescriptors(f.capture.allocations[0].d1_issuance_intents!);
  if (after.receipt.get !== before.receipt.get) throw Error("getter identity changed");
  equal([after.receipt.enumerable, after.receipt.configurable], [before.receipt.enumerable, before.receipt.configurable]);
});
