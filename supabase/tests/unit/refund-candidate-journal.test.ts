import { Account, Asset, Keypair, Memo, Networks, Operation, Transaction, TransactionBuilder, xdr, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { loadRecoveryRefundCandidate, ensureRecoveryRefundCandidate, type RefundCandidateReceipt } from "../../functions/d1-custody/refund-candidate-journal.ts";
import { planRecoveryRefund } from "../../functions/d1-custody/recovery-refund-plan.ts";
import { parseInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { fixture, equal, pool, admin, team, donor, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";
type DTO = Record<string, any>;
type Reply = { data: any; error: unknown };
const scope = { namespace, pool, requestId, authenticatedAdmin: admin }, cutoff = closedAt + 300;
const configuration = { sourceSequence: "3", feePerOperationStroops: "100", now: cutoff, validUntil: cutoff + 60 };
const allowed = new Set(["d1_load_refund_candidate", "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
  "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_issuance_fee_commitments", "d1_load_active_issuance_sequence",
  "d1_load_transaction_history_state", "d1_list_transaction_records", "d1_load_discovery_state", "d1_load_operating_credit_state",
  "d1_list_operating_credits", "d1_load_operating_credit"]);
async function setup(failed = false, issued = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture();
  const binding = { request_id: requestId, namespace, network: "TESTNET", pool };
  const unsigned = (await f.h.client.rpc("d1_load_unsigned_transaction", {})).data as DTO;
  const journal = unsigned.transaction, reservation = journal.reservation, snapshotHash = "e".repeat(64);
  const tx = TransactionBuilder.fromXDR(journal.unsigned_xdr, Networks.TESTNET);
  if (!(tx instanceof Transaction)) throw Error("ordinary fixture transaction");
  tx.sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)));
  const signed = { kind: "d1_signed_transaction_journal", revision: 1, ...binding, authorized_by: team,
    transaction_hash: journal.transaction_hash, snapshot_hash: snapshotHash, signed_xdr: tx.toXDR(),
    envelope_hash: digest(Buffer.from(tx.toXDR(), "base64")).toString("hex"), reservation };
  const attempt = { kind: "d1_submission_attempt", revision: 1, ...binding, authorized_by: team, transaction_hash: signed.transaction_hash,
    envelope_hash: signed.envelope_hash, snapshot_hash: snapshotHash, attempt_id: "33333333-3333-4333-8333-333333333333", claimed_at: closedAt + 2, reservation };
  const membership = { kind: "d1_initial_financial_observation_lookup", revision: 1, ...binding, transaction_hash: signed.transaction_hash,
    snapshot_hash: snapshotHash, observation: { kind: "d1_initial_financial_observation", revision: 1, ...binding, authorized_by: team,
      transaction_hash: signed.transaction_hash, snapshot_hash: snapshotHash, snapshot: { kind: "d1_initial_financial_snapshot", revision: 1,
        namespace, network: "TESTNET", pool, requestId, commitment: f.h.owner.commitment } } };
  const ledger = 11, hash = "f".repeat(64), time = closedAt + 5, token = ((11n << 32n) + 4096n).toString();
  const inner = failed ? xdr.CreateClaimableBalanceResult.createClaimableBalanceUnderfunded() :
    xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR(tx.getClaimableBalanceId(0), "hex"));
  const results = [xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(inner))];
  const raw = { context: { pool, firstLedger: 8, anchor: { sequence: ledger, hash, closedAt: time } },
    ledger: { sequence: ledger, hash, closed_at: new Date(time * 1000).toISOString().replace(".000Z", "Z") },
    transaction: { hash: tx.hash().toString("hex"), paging_token: token, ledger, created_at: new Date(time * 1000).toISOString().replace(".000Z", "Z"),
      source_account: pool, source_account_sequence: tx.sequence, fee_account: pool, fee_charged: "80", max_fee: tx.fee, successful: !failed,
      operation_count: 1, envelope_xdr: tx.toXDR(), result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("80"),
        result: failed ? xdr.TransactionResultResult.txFailed(results) : xdr.TransactionResultResult.txSuccess(results),
        ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") } };
  f.h.records.push(parseIncludedTransaction(raw)); f.h.history.record_count++; f.h.history.page_count++;
  Object.assign(f.h.history.checkpoint!, { cursor: token, through_ledger: ledger, ledger_hash: hash, closed_at: time });
  Object.assign(f.h.history.income_state.checkpoint, { ...f.h.history.checkpoint, cursor: (BigInt(token) + 1n).toString() });
  f.h.credit.discovery_state = structuredClone(f.h.history.income_state);
  const outcome = { kind: "d1_issuance_outcome_journal", revision: 1, ...binding, authorized_by: team, attempt_id: attempt.attempt_id,
    transaction_hash: signed.transaction_hash, envelope_hash: signed.envelope_hash, outcome_hash: "d".repeat(64),
    observed_outcome: parseInitialIssuanceOutcome(pool, tx.toXDR(), raw) };
  const trace: string[] = [], hooks = { reply: (_name: string, reply: Reply): Reply => reply };
  let lookup: DTO = { kind: "d1_refund_candidate_lookup", revision: 1, ...binding, candidate: null, active_request_id: null };
  const client = { async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
    trace.push(name); if (!allowed.has(name)) throw Error("forbidden RPC: " + name);
    equal(args.p_authorized_by, admin);
    let data: unknown;
    if (name === "d1_load_refund_candidate") { equal(args, { p_request_id: requestId, p_authorized_by: admin }); data = lookup; }
    else if (name === "d1_load_issuance_outcome") data = { kind: "d1_issuance_outcome_lookup", revision: 1, ...binding, outcome };
    else if (name === "d1_load_submission_attempt") data = { kind: "d1_submission_attempt_lookup", revision: 1, ...binding, attempt };
    else if (name === "d1_load_signed_transaction") data = { kind: "d1_signed_transaction_lookup", revision: 1, ...binding, transaction: signed };
    else if (name === "d1_load_initial_financial_observation") data = membership;
    else if (name === "d1_load_active_issuance_sequence") data = reservation;
    else if (name === "d1_load_discovery_state") data = f.h.history.income_state;
    else return hooks.reply(name, await f.h.client.rpc(name, args));
    return hooks.reply(name, { data: structuredClone(data), error: null });
  } };
  const plan = await planRecoveryRefund(client, scope, configuration), plannerTrace = [...trace];
  const candidate: RefundCandidateReceipt = { kind: "d1_refund_candidate", revision: 1, ...binding, network: "TESTNET", authorized_by: team,
    initial_transaction_hash: outcome.transaction_hash, initial_outcome_hash: outcome.outcome_hash, source_sequence: "3", transaction_sequence: "4",
    deadline: plan.deadline, unsigned_xdr: plan.unsignedXdr, transaction_hash: plan.transactionHash };
  lookup = { ...lookup, candidate, active_request_id: requestId }; trace.length = 0;
  const snapshot = () => JSON.stringify([lookup, outcome, signed, attempt, membership, f.h.owner, f.h.history, f.h.credit, f.h.records, [...f.h.persisted]]);
  const counters = () => f.h.calls.filter(n => !n.startsWith("d1_load_") && !n.startsWith("d1_list_")).length;
  return { client, hooks, trace, lookup, candidate, plan, plannerTrace, snapshot, counters, outcome, tx };
}
type H = Awaited<ReturnType<typeof setup>>;
function preserved(h: H, before: string, count: number) {
  equal(h.snapshot(), before); equal(h.counters(), count);
  equal(h.trace[0], "d1_load_refund_candidate"); equal(h.trace.filter(n => n === "d1_load_refund_candidate").length, 1);
  equal(h.trace.every(n => allowed.has(n)), true);
  // A failing validation may stop early, never retry a read or enter a write path.
  equal(h.trace.length <= h.plannerTrace.length + 1, true);
}
async function rejects(h: H, denied = false) {
  const before = h.snapshot(), count = h.counters(); let error: unknown;
  try { await loadRecoveryRefundCandidate(h.client, scope); } catch (e) { error = e; }
  const code = denied ? "unauthorized_admin_wallet" : "refund_candidate_unavailable";
  equal(error instanceof CustodyError ? [error.status, error.code, error.message] : error, [denied ? 403 : 503, code, code]);
  preserved(h, before, count);
}
Deno.test("refund history empty lookup is absence only after current-admin bound lookup, without planner reads", async () => {
  const h = await setup(); h.lookup.candidate = null; h.lookup.active_request_id = null;
  const before = h.snapshot(), count = h.counters();
  equal(await loadRecoveryRefundCandidate(h.client, scope), null);
  equal(h.trace, ["d1_load_refund_candidate"]); preserved(h, before, count);
});
Deno.test("refund history validates native and issued success or included failure as exact full-gross unsigned history", async () => {
  for (const failed of [false, true]) for (const issued of [false, true]) {
    const h = await setup(failed, issued), before = h.snapshot(), count = h.counters();
    const result = await loadRecoveryRefundCandidate(h.client, scope);
    equal(result, h.candidate); equal(Object.keys(result!).sort(), Object.keys(h.candidate).sort());
    equal([Object.isFrozen(result), result === h.candidate], [true, false]);
    equal(h.trace, ["d1_load_refund_candidate", ...h.plannerTrace]); preserved(h, before, count);
    const tx = TransactionBuilder.fromXDR(result!.unsigned_xdr, Networks.TESTNET);
    if (!(tx instanceof Transaction)) throw Error("ordinary refund required");
    const asset = issued ? new Asset("USD", (h.plan.asset as { issuer: string }).issuer) : Asset.native();
    const operations = [...(failed ? [] : [Operation.claimClaimableBalance({ balanceId: h.tx.getClaimableBalanceId(0) })]),
      Operation.payment({ destination: donor, asset, amount: "10.0000000" })];
    equal(tx.toEnvelope().v1().tx().operations().map(op => op.toXDR("base64")), operations.map(op => op.toXDR("base64")));
    equal([tx.source, tx.sequence, tx.fee, tx.signatures.length, tx.hash().toString("hex"), tx.toXDR()],
      [pool, "4", failed ? "100" : "200", 0, result!.transaction_hash, result!.unsigned_xdr]);
    equal([h.plan.grossAmountStroops, h.plan.issuedStroops, h.plan.unissuedStroops],
      ["100000000", failed ? "0" : "10000000", failed ? "100000000" : "90000000"]);
    equal([result!.source_sequence, result!.transaction_sequence, result!.deadline, result!.authorized_by,
      result!.initial_transaction_hash, result!.initial_outcome_hash], ["3", "4", "2026-10-27T12:05:00Z", team, h.outcome.transaction_hash, h.outcome.outcome_hash]);
    // Every receipt field is primitive; freezing the detached root freezes the whole receipt.
    equal(Object.values(result!).every(v => v === null || typeof v !== "object"), true);
  }
});
Deno.test("refund history preserves expired maxTime and original authorizer without clock renewal or rearming", async () => {
  const h = await setup(), before = h.snapshot(), count = h.counters();
  equal(configuration.validUntil < Date.parse("2026-10-28T00:00:00Z") / 1000, true);
  const result = await loadRecoveryRefundCandidate(h.client, scope);
  const tx = TransactionBuilder.fromXDR(result!.unsigned_xdr, Networks.TESTNET);
  if (!(tx instanceof Transaction)) throw Error("ordinary refund required");
  equal([tx.timeBounds?.minTime, tx.timeBounds?.maxTime, result!.authorized_by], [String(cutoff), String(cutoff + 60), team]);
  equal(result, h.candidate); equal(h.trace, ["d1_load_refund_candidate", ...h.plannerTrace]); preserved(h, before, count);
});
Deno.test("refund history rejects malformed or foreign lookup and absence with a foreign child owner", async () => {
  for (const patch of [{ extra: true }, { namespace: requestId }, { request_id: namespace }, { network: "PUBLIC" }, { pool: donor },
    { kind: "other" }, { revision: 2 }, { candidate: false }, { candidate: null, active_request_id: namespace }]) {
    const h = await setup(); Object.assign(h.lookup, patch); await rejects(h); equal(h.trace, ["d1_load_refund_candidate"]);
  }
});
Deno.test("refund history rejects receipt binding mutations and missing or foreign child ownership", async () => {
  for (const patch of [{ extra: true }, { kind: "other" }, { revision: 2 }, { request_id: namespace }, { namespace: requestId },
    { network: "PUBLIC" }, { pool: donor }, { authorized_by: "invalid" }, { initial_transaction_hash: "a".repeat(64) },
    { initial_outcome_hash: "a".repeat(64) }, { source_sequence: "2" }, { transaction_sequence: "5" },
    { deadline: "2026-10-27T12:06:00Z" }, { transaction_hash: "a".repeat(64) }, { unsigned_xdr: "AAAA" }]) {
    const h = await setup(); Object.assign(h.lookup.candidate, patch); await rejects(h);
  }
  for (const owner of [null, namespace]) { const h = await setup(); h.lookup.active_request_id = owner; await rejects(h); }
});
Deno.test("refund history rejects SDK operation, source, time, fee, sequence, signature and envelope contradictions", async () => {
  for (const fault of ["donor", "asset", "amount", "order", "source", "sequence", "minTime", "maxTime", "fee", "memo", "signed", "feeBump", "base64", "network"]) {
    const h = await setup();
    const builder = new TransactionBuilder(new Account(fault === "source" ? donor : pool, fault === "sequence" ? "4" : "3"),
      { fee: fault === "fee" ? "151" : "100", networkPassphrase: fault === "network" ? Networks.PUBLIC : Networks.TESTNET,
        timebounds: { minTime: fault === "minTime" ? cutoff + 1 : cutoff, maxTime: fault === "maxTime" ? cutoff : cutoff + 60 } });
    const claim = Operation.claimClaimableBalance({ balanceId: h.tx.getClaimableBalanceId(0) });
    const pay = Operation.payment({ destination: fault === "donor" ? team : donor, asset: fault === "asset" ? new Asset("USD", team) : Asset.native(),
      amount: fault === "amount" ? "1.0000000" : "10.0000000" });
    if (fault === "order") builder.addOperation(pay).addOperation(claim); else builder.addOperation(claim).addOperation(pay);
    if (fault === "memo") builder.addMemo(Memo.text("changed"));
    const tx = builder.build(); if (fault === "signed") tx.sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)));
    const envelope = fault === "feeBump" ? TransactionBuilder.buildFeeBumpTransaction(team, "100", tx, Networks.TESTNET) : tx;
    h.lookup.candidate.unsigned_xdr = envelope.toXDR() + (fault === "base64" ? "\n" : "");
    h.lookup.candidate.transaction_hash = envelope.hash().toString("hex"); await rejects(h);
  }
});
Deno.test("refund history fails closed on missing or drifting032, parent drift, unknown replies and getter payloads", async () => {
  for (const fault of ["missing032", "drift032", "parent", "404", "getters", "replyExtra", "oversize"]) {
    const h = await setup(); let reads = 0, getters = 0;
    h.hooks.reply = (name, reply) => {
      if (name === "d1_load_issuance_outcome") {
        reads++; if (fault === "missing032") reply.data.outcome = null;
        if (fault === "drift032" && reads > 1) reply.data.outcome.outcome_hash = "a".repeat(64);
      }
      if (name === "d1_load_active_issuance_sequence" && fault === "parent") reply.data.request_id = namespace;
      if (name === "d1_load_refund_candidate") {
        if (fault === "404") return { data: null, error: { code: "404", message: "unknown" } };
        if (fault === "getters") Object.defineProperty(reply.data, "candidate", { enumerable: true, get() { getters++; throw Error("getter"); } });
        if (fault === "replyExtra") Object.assign(reply, { extra: true });
        if (fault === "oversize") reply.data.candidate.unsigned_xdr = "A".repeat(65540);
      }
      return reply;
    };
    await rejects(h); equal(getters, 0);
  }
});
Deno.test("refund history maps only exact returned current-admin denial to403 and sanitizes thrown or forged errors", async () => {
  for (const fault of ["denied", "readDenied", "thrown", "forged", "wrongCode", "nonNullData", "errorGetter"]) {
    const h = await setup(); let getters = 0;
    h.hooks.reply = (name, reply) => {
      if (name !== (fault === "readDenied" ? "d1_load_issuance_outcome" : "d1_load_refund_candidate")) return reply;
      if (fault === "thrown") throw new CustodyError("unauthorized_admin_wallet", 403);
      const error = { code: fault === "wrongCode" ? "403" : "42501", message: "unauthorized_admin_wallet" };
      if (fault === "errorGetter") Object.defineProperty(error, "code", { enumerable: true, get() { getters++; return "42501"; } });
      return fault === "forged" ? { data: null, error: new CustodyError("unauthorized_admin_wallet", 403) } :
        { data: fault === "nonNullData" ? {} : null, error };
    };
    await rejects(h, fault === "denied" || fault === "readDenied"); equal(getters, 0);
  }
});

// Additional source definitions only; no SDK/SQL execution is claimed here.
Deno.test("candidate ensure preserves existing expired history without saving or replacing construction facts", async () => {
  const h = await setup(), before = h.snapshot(), count = h.counters();
  const result = await ensureRecoveryRefundCandidate(h.client, scope, { ...configuration, sourceSequence: "8", now: cutoff + 10000, validUntil: cutoff + 10060 });
  equal(result, h.candidate); equal(Object.isFrozen(result), true); preserved(h, before, count);
});
Deno.test("candidate ensure constructs only after validated absence and requests one immutable save", async () => {
  const h = await setup(); h.lookup.candidate = null; h.lookup.active_request_id = null;
  const before = h.snapshot(), count = h.counters(), calls: string[] = [];
  let saved: RefundCandidateReceipt | null = null, saves = 0;
  const client = { async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
    calls.push(name);
    if (name !== "d1_record_refund_candidate") return h.client.rpc(name, args);
    saves++;
    equal(args, { p_request_id: requestId, p_authorized_by: admin, p_unsigned_xdr: h.plan.unsignedXdr, p_transaction_hash: h.plan.transactionHash });
    saved = structuredClone(h.candidate); return { data: structuredClone(saved), error: null };
  } };
  const result = await ensureRecoveryRefundCandidate(client, scope, configuration);
  equal(result, h.candidate); equal(saved, h.candidate); equal(saves, 1); equal(calls[0], "d1_load_refund_candidate");
  equal(calls.at(-1), "d1_record_refund_candidate"); equal(calls.filter(n => n === "d1_load_refund_candidate").length, 1);
  equal(Object.isFrozen(result), true); equal(h.snapshot(), before); equal(h.counters(), count);
});
Deno.test("candidate ensure never retries or reads back a potentially committed ambiguous save", async () => {
  for (const fault of ["lost", "malformed", "thrown403", "denied"] as const) {
    const h = await setup(); h.lookup.candidate = null; h.lookup.active_request_id = null;
    const before = h.snapshot(), count = h.counters(), calls: string[] = [];
    let saves = 0, saved: RefundCandidateReceipt | null = null;
    const client = { async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
      calls.push(name); if (name !== "d1_record_refund_candidate") return h.client.rpc(name, args);
      saves++;
      if (fault === "denied") return { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
      saved = structuredClone(h.candidate);
      if (fault === "lost") throw Error("reply lost after commit");
      if (fault === "thrown403") throw new CustodyError("unauthorized_admin_wallet", 403);
      return { data: {}, error: null };
    } };
    let error: unknown; try { await ensureRecoveryRefundCandidate(client, scope, configuration); } catch (e) { error = e; }
    const code = fault === "denied" ? "unauthorized_admin_wallet" : "refund_candidate_unavailable";
    equal(error instanceof CustodyError ? [error.code, error.status, error.message] : error, [code, fault === "denied" ? 403 : 503, code]);
    equal(saves, 1); equal(saved, fault === "denied" ? null : h.candidate); equal(calls.at(-1), "d1_record_refund_candidate");
    equal(calls.filter(n => n === "d1_load_refund_candidate").length, 1); equal(h.snapshot(), before); equal(h.counters(), count);
  }
});
Deno.test("candidate ensure rejects malformed construction before reading or saving", async () => {
  for (const getter of [false, true]) {
    const h = await setup(), before = h.snapshot(), count = h.counters(); let reads = 0;
    const cfg = { ...configuration, sourceSequence: getter ? "3" : "03" };
    if (getter) Object.defineProperty(cfg, "now", { enumerable: true, get() { reads++; throw Error("getter must not run"); } });
    let error: unknown; try { await ensureRecoveryRefundCandidate(h.client, scope, cfg); } catch (e) { error = e; }
    equal(error instanceof CustodyError ? [error.code, error.status, error.message] : error, ["refund_candidate_unavailable", 503, "refund_candidate_unavailable"]);
    equal([reads, h.trace.length], [0, 0]); equal(h.snapshot(), before); equal(h.counters(), count);
  }
});
