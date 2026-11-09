import { Keypair, TransactionBuilder, Transaction, Networks, Operation, Account, Asset, xdr, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { planRecoveryRefund, type RecoveryRefundConfiguration } from "../../functions/d1-custody/recovery-refund-plan.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { fixture, equal, pool, admin, team, donor, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";
import { savedInitialFixture as setup } from "../fixtures/refund-initial.ts";
const scope = { namespace, pool, requestId, authenticatedAdmin: admin };

type H = Awaited<ReturnType<typeof setup>>;
const cutoff = closedAt + 300;
const configuration = (): RecoveryRefundConfiguration => ({ sourceSequence: "3", feePerOperationStroops: "100", now: cutoff, validUntil: cutoff + 60 });
function unchanged(h: H, before: string, count: number) {
  equal(h.snapshot(), before); equal(h.counters(), count);
  equal(h.trace.every(n => n.startsWith("d1_load_") || n.startsWith("d1_list_")), true);
}
async function rejects(h: H, cfg: RecoveryRefundConfiguration, denied = false) {
  const before = h.snapshot(), count = h.counters(); let error: unknown;
  try { await planRecoveryRefund(h.client, scope, cfg); } catch (e) { error = e; }
  const code = denied ? "unauthorized_admin_wallet" : "recovery_refund_unavailable";
  equal(error instanceof CustodyError ? [error.status, error.code, error.message] : error, [denied ? 403 : 503, code, code]);
  unchanged(h, before, count);
}
Deno.test("recovery plan SDK envelopes refund native/issued full gross atomically; included failure has only Payment", async () => {
  for (const [failed, issued, delay, fee] of [[false, false, 0, "100"], [false, true, 1, "150"], [true, false, 0, "300"], [true, true, 1, "100"]] as const) {
    const h = await setup(failed, issued), cfg = { ...configuration(), now: cutoff + delay, feePerOperationStroops: String(fee) };
    const before = h.snapshot(), count = h.counters(), original = { ...cfg };
    h.hooks.reply = (_n, r) => { cfg.sourceSequence = "0"; cfg.now = 0; cfg.validUntil = 0; cfg.feePerOperationStroops = "9999"; return r; };
    const plan = await planRecoveryRefund(h.client, scope, cfg);
    unchanged(h, before, count); equal(h.trace.filter(n => n === "d1_load_issuance_outcome").length, 2);
    const cb = failed ? null : h.tx.getClaimableBalanceId(0), asset = issued ? new Asset("USD", h.f.h.account.issuedBalances[0].issuer) : Asset.native();
    const operations = [...(cb === null ? [] : [Operation.claimClaimableBalance({ balanceId: cb })]), Operation.payment({ destination: donor, asset, amount: "10.0000000" })];
    const builder = new TransactionBuilder(new Account(pool, original.sourceSequence), { fee, networkPassphrase: Networks.TESTNET,
      timebounds: { minTime: cutoff, maxTime: original.validUntil } });
    operations.forEach(op => builder.addOperation(op)); const expected = builder.build();
    const decoded = TransactionBuilder.fromXDR(plan.unsignedXdr, Networks.TESTNET);
    if (!(decoded instanceof Transaction)) throw Error("ordinary transaction required");
    equal([decoded.source, decoded.sequence, decoded.fee, decoded.signatures.length, decoded.networkPassphrase, decoded.hash().toString("hex")],
      [pool, "4", (BigInt(fee) * BigInt(operations.length)).toString(), 0, Networks.TESTNET, plan.transactionHash]);
    equal([decoded.timeBounds?.minTime, decoded.timeBounds?.maxTime], [String(cutoff), String(original.validUntil)]);
    equal(decoded.toEnvelope().v1().tx().operations().map(op => op.toXDR("base64")), operations.map(op => op.toXDR("base64")));
    equal(decoded.toXDR(), expected.toXDR());
    equal([plan.kind, plan.revision, plan.namespace, plan.requestId, plan.network, plan.source, plan.donor],
      ["d1_recovery_refund_plan", 1, namespace, requestId, "TESTNET", pool, donor]);
    equal(plan.asset.type === "issued" ? [plan.asset.type, plan.asset.code, plan.asset.issuer] : [plan.asset.type], issued ? ["issued", "USD", asset.getIssuer()] : ["native"]);
    equal(Object.keys(plan).sort(), ["kind", "revision", "namespace", "requestId", "network", "source", "donor", "asset", "grossAmountStroops", "issuedStroops",
      "unissuedStroops", "claimableBalanceId", "operationCount", "feeStroops", "sourceSequence", "transactionSequence", "deadline", "validUntil", "unsignedXdr", "transactionHash"].sort());
    equal([plan.grossAmountStroops, plan.issuedStroops, plan.unissuedStroops, plan.claimableBalanceId, plan.operationCount, plan.feeStroops,
      plan.sourceSequence, plan.transactionSequence, plan.deadline, plan.validUntil],
      ["100000000", failed ? "0" : "10000000", failed ? "100000000" : "90000000", cb, operations.length, expected.fee, "3", "4", "2026-10-27T12:05:00Z", original.validUntil]);
    equal([Object.isFrozen(plan), Object.isFrozen(plan.asset), plan.asset === h.unsigned.reservation.intent.preparation_input.payment.asset], [true, true, false]);
  }
});
Deno.test("recovery rejects unknown/missing outcomes, wrong mapping/owner and unmatched activity without fallback or state changes", async () => {
  for (const fault of ["missing032", "404", "unknown", "donor", "asset", "cb", "owner", "deadline", "ambiguous", "unmatched", "denied", "forged403", "notExactDenial"]) {
    const h = await setup(false, false, fault === "unmatched");
    h.hooks.reply = (n, r) => {
      if (n === "d1_load_issuance_outcome" && fault === "missing032") r.data.outcome = null;
      if (n === "d1_load_issuance_outcome" && fault === "cb") r.data.outcome.observed_outcome.claimableBalanceId = "00000000" + "a".repeat(64);
      if (n === "d1_load_active_issuance_sequence" && fault === "owner") r.data.request_id = namespace;
      if (n === "d1_list_transaction_records" && fault === "ambiguous") r.data.records.push(structuredClone(r.data.records[1]));
      if (n === "d1_load_unsigned_transaction") {
        const p = r.data.transaction.reservation.intent.preparation_input;
        if (fault === "donor") p.payment.donor = team;
        if (fault === "asset") p.payment.asset = { type: "issued", code: "USD", issuer: team };
        if (fault === "deadline") p.request.deadline = "2026-10-27T12:10:00Z";
      }
      if (fault === "forged403") throw new CustodyError("unauthorized_admin_wallet", 403);
      if (["404", "unknown", "denied", "notExactDenial"].includes(fault)) return { data: fault === "notExactDenial" ? {} : null,
        error: { code: fault === "404" ? "404" : fault === "unknown" ? "timeout" : "42501", message: "unauthorized_admin_wallet" } };
      return r;
    };
    await rejects(h, configuration(), fault === "denied");
  }
});
Deno.test("recovery validates construction facts, fee commitment, sequence and original deadline without mutations", async () => {
  for (const patch of [{ now: cutoff - 1 }, { now: NaN }, { now: 1.5 }, { now: Number.MAX_SAFE_INTEGER + 1 }, { validUntil: cutoff },
    { validUntil: Number.MAX_SAFE_INTEGER + 1 }, { feePerOperationStroops: "0" }, { feePerOperationStroops: "01" }, { feePerOperationStroops: "151" },
    { feePerOperationStroops: "4294967295" }, { feePerOperationStroops: "4294967296" }, { sourceSequence: "03" }, { sourceSequence: "2" },
    { sourceSequence: "9223372036854775807" }, { sourceSequence: "9223372036854775808" }, { extra: true }]) {
    await rejects(await setup(), { ...configuration(), ...patch });
  }
});
Deno.test("recovery rejects malformed construction configuration before any observation", async () => {
  const { validUntil: _omitted, ...missing } = configuration();
  for (const cfg of [missing, { ...configuration(), extra: true }, { ...configuration(), now: () => cutoff },
    { ...configuration(), sourceSequence: "03" }, { ...configuration(), feePerOperationStroops: "0" }]) {
    const h = await setup(); await rejects(h, cfg as unknown as RecoveryRefundConfiguration); equal(h.trace.length, 0);
  }
});
Deno.test("recovery rejects getters/inherited configuration before observation and never launders getter admin errors", async () => {
  for (const inherited of [false, true]) {
    const h = await setup(); let reads = 0;
    const cfg = inherited ? Object.create(configuration()) : Object.defineProperty(configuration(), "now", { enumerable: true,
      get() { reads++; throw new CustodyError("unauthorized_admin_wallet", 403); } });
    await rejects(h, cfg); equal([reads, h.trace.length], [0, 0]);
  }
});
