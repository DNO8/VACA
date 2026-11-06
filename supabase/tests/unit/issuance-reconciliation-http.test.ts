import { Keypair, TransactionBuilder, Networks, Transaction, xdr, hash } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { createCustodyHandler, type CustodyConfiguration } from "../../functions/d1-custody/handler.ts";
import { withInitialSubmissionAuthorization } from "../../functions/d1-custody/initial-submission-authorization.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { fixture, equal, pool, admin, team, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";

type DTO = Record<string, any>;
type Reply = { data: any; error: unknown };
const wallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 104));
const outcomeLoad = "d1_load_issuance_outcome", outcomeSave = "d1_record_issuance_outcome";
const historical = ["d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"];
const allowed = [outcomeLoad, outcomeSave, ...historical, "d1_load_discovery_state", "d1_record_discovery_page", "d1_load_transaction_history_state", "d1_record_transaction_page", "d1_list_transaction_records"];
async function setup(failed = false, issued = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture();
  const scope = { request_id: requestId, namespace, network: "TESTNET", pool };
  let signed: DTO | null = null, attempt: DTO | null = null, unsigned: DTO | undefined, receipt: DTO | null = null;
  let preparing = true, privateCalls = 0, incomeReads = 0, transactionReads = 0, discoveryPages = 0;
  let incomeComplete = false, omitTransaction = false;
  const calls: { name: string; args: DTO }[] = [], events: string[] = [];
  const hooks = { reply: (_name: string, r: Reply): Reply => r, afterSave: async (_name: string) => {} };
  const discovery = structuredClone(f.h.history.income_state);
  discovery.checkpoint.cursor = "0";
  const history = () => ({ ...structuredClone(f.h.history), income_state: structuredClone(discovery),
    coverage_complete: f.h.history.coverage_complete && discovery.coverage_complete &&
      f.h.history.checkpoint.through_ledger === discovery.checkpoint.through_ledger &&
      f.h.history.checkpoint.ledger_hash === discovery.checkpoint.ledger_hash && f.h.history.checkpoint.closed_at === discovery.checkpoint.closed_at });
  const client = { async rpc(name: string, args: DTO): Promise<Reply> {
    calls.push({ name, args: structuredClone(args) }); events.push(name);
    if (!preparing && !allowed.includes(name)) throw Error("Forbidden RPC: " + name);
    // Bootstrap financial evidence must retain the original fixture's matching history/credit/discovery state.
    if (preparing && ["d1_load_discovery_state", "d1_load_transaction_history_state", "d1_list_transaction_records"].includes(name)) {
      return await f.h.client.rpc(name, args);
    }
    let data: any;
    if (name === outcomeLoad) data = { kind: "d1_issuance_outcome_lookup", revision: 1, ...scope, outcome: receipt };
    else if (name === "d1_load_submission_attempt") data = { kind: "d1_submission_attempt_lookup", revision: 1, ...scope, attempt };
    else if (name === "d1_load_signed_transaction") data = { kind: "d1_signed_transaction_lookup", revision: 1, ...scope, transaction: signed };
    else if (name === "d1_load_initial_financial_observation") data = { kind: "d1_initial_financial_observation_lookup", revision: 1, ...scope,
      transaction_hash: unsigned!.transaction_hash, snapshot_hash: args.p_snapshot_hash, observation: f.h.persisted.get(String(args.p_snapshot_hash)) ?? null };
    else if (name === "d1_record_signed_transaction") data = signed = { kind: "d1_signed_transaction_journal", revision: 1, ...scope,
      authorized_by: admin, transaction_hash: unsigned!.transaction_hash, snapshot_hash: args.p_snapshot_hash, signed_xdr: args.p_signed_xdr,
      envelope_hash: hash(Buffer.from(String(args.p_signed_xdr), "base64")).toString("hex"), reservation: structuredClone(unsigned!.reservation) };
    else if (name === "d1_claim_submission_attempt") data = { kind: "d1_submission_claim", revision: 1, claimed: true,
      attempt: attempt = { kind: "d1_submission_attempt", revision: 1, ...scope, authorized_by: admin, transaction_hash: signed!.transaction_hash,
        envelope_hash: signed!.envelope_hash, snapshot_hash: args.p_snapshot_hash, attempt_id: args.p_attempt_id, claimed_at: f.h.now, reservation: structuredClone(unsigned!.reservation) } };
    else if (name === "d1_load_discovery_state") data = discovery;
    else if (name === "d1_record_discovery_page") {
      const p = args.p_page;
      discovery.checkpoint = { cursor: p.to_cursor, through_ledger: p.through_ledger, ledger_hash: p.ledger_hash, closed_at: p.closed_at };
      discovery.coverage_complete = p.records.length === 0;
      data = { kind: "d1_discovery_page", revision: 1, namespace, network: "TESTNET", pool, from_cursor: p.from_cursor,
        to_cursor: p.to_cursor, checkpoint_ledger: p.through_ledger, checkpoint_hash: p.ledger_hash, page_count: ++discoveryPages, record_count: p.records.length };
    } else if (name === "d1_load_transaction_history_state") data = history();
    else if (name === "d1_record_transaction_page") {
      const p = args.p_page;
      f.h.records.push(...p.records); f.h.history.record_count += p.records.length; f.h.history.page_count++;
      f.h.history.checkpoint = { cursor: p.to_cursor, through_ledger: p.through_ledger, ledger_hash: p.ledger_hash, closed_at: p.closed_at };
      f.h.history.coverage_complete = p.records.length === 0;
      data = { kind: "d1_transaction_page", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 8, authorized_by: team,
        page: structuredClone(p), checkpoint: structuredClone(f.h.history.checkpoint), page_count: f.h.history.page_count,
        record_count: f.h.history.record_count, page_record_count: p.records.length };
    } else if (name === "d1_list_transaction_records") data = { kind: "d1_transaction_records", revision: 1, namespace, network: "TESTNET", pool,
      from_cursor: args.p_after, next_cursor: f.h.history.checkpoint.cursor, records: f.h.records, has_more: false, history_state: history() };
    else if (name === outcomeSave) data = receipt = { kind: "d1_issuance_outcome_journal", revision: 1, ...scope, authorized_by: team,
      attempt_id: attempt!.attempt_id, transaction_hash: signed!.transaction_hash, envelope_hash: signed!.envelope_hash,
      outcome_hash: "d".repeat(64), observed_outcome: structuredClone(args.p_observed_outcome) };
    else {
      const r = await f.h.client.rpc(name, args);
      if (name === "d1_load_unsigned_transaction") unsigned = structuredClone((r.data as DTO).transaction);
      return hooks.reply(name, r);
    }
    if (!preparing && ["d1_record_discovery_page", "d1_record_transaction_page", outcomeSave].includes(name)) await hooks.afterSave(name);
    return hooks.reply(name, { data: structuredClone(data), error: null });
  } };
  const configuration = { ...f.configuration, loadPoolSigner() { return Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)); } };
  await withInitialSubmissionAuthorization(client, configuration, () => undefined);
  const tx = TransactionBuilder.fromXDR(signed!.signed_xdr, Networks.TESTNET);
  if (!(tx instanceof Transaction)) throw Error("Expected ordinary fixture transaction");
  const inner = failed ? xdr.CreateClaimableBalanceResult.createClaimableBalanceUnderfunded() :
    xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR(tx.getClaimableBalanceId(0), "hex"));
  const results = [xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(inner))];
  const result = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("100"),
    result: failed ? xdr.TransactionResultResult.txFailed(results) : xdr.TransactionResultResult.txSuccess(results),
    ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
  const token = String((11n << 32n) + 4096n), time = new Date((closedAt + 5) * 1000).toISOString().replace(".000Z", "Z");
  const raw = { hash: tx.hash().toString("hex"), paging_token: token, ledger: 11, created_at: time, source_account: pool,
    source_account_sequence: tx.sequence, fee_account: pool, fee_charged: "100", max_fee: tx.fee, successful: !failed,
    operation_count: 1, envelope_xdr: tx.toXDR(), result_xdr: result };
  const source = {
    async readPage(context: DTO) {
      events.push("income"); incomeReads++;
      equal(context, { pool, firstLedger: 8, checkpoint: discovery.checkpoint });
      const records = incomeComplete ? [] : [f.h.receipt.observation.record];
      return { page: { revision: 1, from_cursor: discovery.checkpoint.cursor, to_cursor: records.at(-1)?.paging_token ?? discovery.checkpoint.cursor,
        through_ledger: 10 + incomeReads, ledger_hash: "f".repeat(64), closed_at: closedAt + 5 * incomeReads, records }, complete: records.length === 0 };
    },
    async readTransactionPageAtCheckpoint(context: DTO, cursor: string) {
      events.push("transactions"); transactionReads++;
      equal(context, { pool, firstLedger: 8, checkpoint: discovery.checkpoint }); equal(cursor, f.h.history.checkpoint.cursor);
      const c = context.checkpoint;
      const record = parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: { sequence: c.through_ledger, hash: c.ledger_hash, closedAt: c.closed_at } },
        ledger: { sequence: 11, hash: "f".repeat(64), closed_at: time }, transaction: raw });
      const records = omitTransaction || BigInt(cursor) >= BigInt(token) ? [] : [record];
      return { page: { revision: 1, from_cursor: cursor, to_cursor: records.at(-1)?.pagingToken ?? cursor,
        through_ledger: c.through_ledger, ledger_hash: c.ledger_hash, closed_at: c.closed_at, records }, complete: records.length === 0, account: f.h.account };
    },
  };
  const never = (): never => { privateCalls++; throw Error("PRIVATE_SIGNER_ACCOUNT_SUBMIT_MUST_NOT_RUN"); };
  configuration.loadPoolSigner = never; configuration.source.readAccountAtCheckpoint = never;
  const dependencies: DTO = { client, configuration: { namespace, pool, now: () => f.h.now, source } };
  const options = { poolSigner: Keypair.fromPublicKey(pool), now: () => f.h.now,
    issuance: { client, configuration, fetcher: never as typeof fetch }, reconciliation: dependencies };
  // The baseline intentionally has no reconciliation type/module: only its real HTTP route is tested.
  const handler = () => createCustodyHandler(options as unknown as CustodyConfiguration);
  function request(change: DTO = {}, badSignature = false, path = "reconcile") {
    const message: DTO = { version: 1, network: "TESTNET", pool, namespace, action: "reconcile", request_id: requestId,
      timestamp: f.h.now, payload: {}, wallet: admin, ...change };
    const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
    const signature = (badSignature ? Keypair.fromRawEd25519Seed(Buffer.alloc(32, 102)) : wallet)
      .sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical))).toString("base64");
    return new Request("https://local.invalid/functions/v1/d1-custody/" + path, { method: "POST", body: JSON.stringify({ ...message, signature }) });
  }
  const state = () => JSON.stringify([f.h.owner, f.h.records, f.h.history, [...f.h.persisted], discovery, discoveryPages, signed, attempt, receipt]);
  const counts = () => [incomeReads, transactionReads, privateCalls];
  preparing = false; calls.length = 0; events.length = 0; f.h.calls.length = 0;
  return { f, tx, calls, events, hooks, handler, request, state, counts, options, dependencies, source,
    completeIncome() { incomeComplete = true; }, omitTransaction() { omitTransaction = true; }, clearAttempt() { attempt = null; },
    get receipt() { return receipt; }, get signed() { return signed!; } };
}
type H = Awaited<ReturnType<typeof setup>>;
const unavailable = { error: "issuance_reconciliation_unavailable" };
function body(h: H, stage?: string, failed = false) {
  return stage ? { state: "reconciliation_progress", requestId, transactionHash: h.tx.hash().toString("hex"), stage } :
    { state: "issuance_outcome_recorded", requestId, transactionHash: h.tx.hash().toString("hex"), outcome: failed ? "failed" : "success" };
}
async function response(h: H, status: number, expected: unknown, request = h.request()) {
  h.calls.length = 0; h.events.length = 0;
  const reply = await h.handler()(request);
  equal(reply.status, status); equal([...reply.headers], [["cache-control", "no-store"], ["content-type", "application/json"]]);
  equal(await reply.text(), JSON.stringify(expected)); equal(h.counts()[2], 0);
  for (const { name, args } of h.calls) {
    equal(allowed.includes(name), true);
    const scoped = [outcomeLoad, outcomeSave, ...historical].includes(name);
    const extra = name === "d1_load_initial_financial_observation" ? { p_snapshot_hash: h.signed.snapshot_hash } :
      name === "d1_list_transaction_records" ? { p_after: "0", p_limit: 100 } :
      name === outcomeSave ? { p_observed_outcome: h.receipt!.observed_outcome } :
      name.startsWith("d1_record_") ? { p_page: args.p_page } : {};
    equal(args, { ...(scoped ? { p_request_id: requestId } : { p_namespace: namespace }), p_authorized_by: admin, ...extra });
  }
  equal(h.calls.filter(c => c.name === outcomeLoad).length <= 1, true);
}
async function unchanged(h: H, status: number, expected: unknown, request = h.request()) {
  const before = h.state(), counts = h.counts(); await response(h, status, expected, request);
  equal(h.state(), before); equal(h.counts(), counts);
}
async function nonempty(h: H) { h.completeIncome(); await response(h, 202, body(h, "transactions")); }
async function recorded(h: H, failed = false) { await nonempty(h); await response(h, 200, body(h, undefined, failed)); }

Deno.test("reconcile HTTP native and issued progress uses one page per explicit call, refreshed anchors, then existing issue mapping", async () => {
  for (const issued of [false, true]) {
    const h = await setup(false, issued), owner = JSON.stringify(h.f.h.owner), persisted = h.f.h.persisted.size;
    await response(h, 202, body(h, "discovery")); equal(h.counts(), [1, 0, 0]);
    equal(h.calls.at(-1)!.name, "d1_record_discovery_page");
    await nonempty(h); equal(h.counts(), [2, 1, 0]); equal(h.calls.at(-1)!.name, "d1_record_transaction_page");
    const cursor = h.f.h.history.checkpoint.cursor, records = JSON.stringify(h.f.h.records);
    await response(h, 200, body(h)); equal(h.counts(), [3, 2, 0]);
    equal([h.f.h.history.checkpoint.cursor, JSON.stringify(h.f.h.records)], [cursor, records]);
    const order = h.events;
    equal(order.indexOf("d1_load_submission_attempt") < order.indexOf(outcomeLoad), true);
    equal(order.indexOf("d1_record_discovery_page") < order.indexOf("d1_load_transaction_history_state"), true);
    equal(order.indexOf("d1_record_transaction_page") < order.indexOf(outcomeSave), true);
    equal(h.calls.filter(c => c.name === outcomeSave).length, 1);
    equal([JSON.stringify(h.f.h.owner), h.f.h.persisted.size], [owner, persisted]);
    await unchanged(h, 200, body(h)); equal(h.calls.every(c => [outcomeLoad, ...historical].includes(c.name)), true);
    const p = h.signed.reservation.intent.preparation_input;
    await unchanged(h, 200, { state: "issuance_observed", verification: "persisted_sdk_observation", requestId,
      transactionHash: h.tx.hash().toString("hex"), donor: p.payment.donor, beneficiary: p.request.beneficiary,
      asset: p.request.asset, amount: p.request.amount, paymentTransactionHash: p.payment.transaction_hash,
      deadline: p.request.deadline, claimableBalanceId: h.tx.getClaimableBalanceId(0) }, h.request({ action: "issue" }, false, "issue"));
  }
});
Deno.test("reconcile HTTP included failure records no CB or refund/retry/release authority", async () => {
  const h = await setup(true); await recorded(h, true);
  equal(h.receipt!.observed_outcome.claimableBalanceId, null); await unchanged(h, 200, body(h, undefined, true));
});
Deno.test("reconcile HTTP absent 031 cannot create, sign, claim or submit even with fresh-capable fixture prerequisites", async () => {
  const h = await setup(); h.clearAttempt(); await unchanged(h, 503, unavailable);
  equal(h.calls.map(c => c.name), ["d1_load_submission_attempt"]);
});
Deno.test("reconcile HTTP cross-action, invalid, stale and wrong-scope proofs perform zero RPC or source effects", async () => {
  for (const [change, bad, path, status, code] of [
    [{ action: "issue" }, false, "reconcile", 400, "invalid_request"], [{}, false, "issue", 400, "invalid_request"],
    [{}, true, "reconcile", 401, "invalid_signature"], [{ timestamp: 0 }, false, "reconcile", 401, "stale_request"],
    [{ namespace: requestId }, false, "reconcile", 400, "invalid_request"], [{ pool: team }, false, "reconcile", 400, "invalid_request"],
  ] as const) {
    const h = await setup(); await unchanged(h, status, { error: code }, h.request(change, bad, path)); equal(h.calls, []);
  }
});
Deno.test("reconcile HTTP missing explicit dependencies, pool mismatch and revoked admin stop before provider or writes", async () => {
  for (const fault of ["source", "readPage", "readTransactionPageAtCheckpoint", "pool", "admin"]) {
    const h = await setup();
    if (fault === "source") delete h.dependencies.configuration.source;
    else if (fault === "pool") h.dependencies.configuration.pool = team;
    else if (fault === "admin") h.hooks.reply = () => ({ data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } });
    else delete (h.source as DTO)[fault];
    await unchanged(h, fault === "admin" ? 403 : 503, fault === "admin" ? { error: "unauthorized_admin_wallet" } : unavailable);
    equal(h.calls.map(c => c.name), fault === "admin" ? ["d1_load_submission_attempt"] : []);
  }
});
Deno.test("reconcile HTTP unknown committed 019, 024 and 032 saves stop at that call without readback or retry", async () => {
  for (const name of ["d1_record_discovery_page", "d1_record_transaction_page", outcomeSave]) {
    const h = await setup(); h.completeIncome();
    if (name === outcomeSave) await nonempty(h);
    h.hooks.afterSave = async n => { if (n === name) throw Error("UNKNOWN_ALREADY_COMMITTED_PRIVATE_RECEIPT"); };
    const before = h.state(); await response(h, 503, unavailable);
    equal(h.state() === before, false); equal(h.calls.at(-1)!.name, name); equal(h.calls.filter(c => c.name === name).length, 1);
    equal(h.receipt !== null, name === outcomeSave);
    h.hooks.afterSave = async () => {};
    if (name === outcomeSave) await unchanged(h, 200, body(h));
  }
});
Deno.test("reconcile HTTP awaits discovery and transaction acknowledgements before advancing to the next stage", async () => {
  for (const name of ["d1_record_discovery_page", "d1_record_transaction_page"]) {
    const h = await setup(); h.completeIncome(); let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    h.hooks.afterSave = n => n === name ? new Promise<void>(resolve => { release = resolve; entered(); }) : Promise.resolve();
    let done = false;
    const pending = response(h, 202, body(h, "transactions")).then(() => { done = true; });
    await Promise.race([waiting, pending]);
    try { equal(done, false); equal(h.calls.at(-1)!.name, name);
      equal(h.counts()[1], name === "d1_record_discovery_page" ? 0 : 1);
    } finally { release?.(); }
    await pending; equal(h.receipt, null);
  }
});
Deno.test("reconcile HTTP stale/drifting source, malformed history and missing transaction never become false completion", async () => {
  for (const fault of ["stale", "drift", "missing", "history"]) {
    const h = await setup(); h.completeIncome();
    if (fault === "missing") h.omitTransaction();
    if (fault === "stale") { const read = h.source.readPage; h.source.readPage = async c => { const r = await read(c); r.page.through_ledger = 9; return r; }; }
    if (fault === "drift") { const read = h.source.readTransactionPageAtCheckpoint; h.source.readTransactionPageAtCheckpoint = async (c, n) => { const r = await read(c, n); r.page.ledger_hash = "b".repeat(64); return r; }; }
    if (fault === "history") h.hooks.reply = (n, r) => { if (n === "d1_load_transaction_history_state") r.data.pool = team; return r; };
    await response(h, 503, unavailable); equal(h.receipt, null); equal(h.calls.some(c => c.name === outcomeSave), false);
    equal(h.counts()[0], 1); equal(h.counts()[1], fault === "drift" || fault === "missing" ? 1 : 0);
  }
});
Deno.test("reconcile HTTP bounded getter-free exact scoped 032 lookup and corrupt existing SDK evidence fail closed", async () => {
  for (const fault of ["getter", "scope", "bytes", "unknown", "signature"]) {
    const h = await setup(); await recorded(h); let getters = 0;
    h.hooks.reply = (n, r) => {
      if (n === outcomeLoad) {
        if (fault === "getter") Object.defineProperty(r.data, "outcome", { enumerable: true, get() { getters++; throw Error("PRIVATE"); } });
        if (fault === "scope") r.data.namespace = requestId;
        if (fault === "bytes") r.data.outcome = "x".repeat(2097153);
        if (fault === "unknown") return { data: null, error: { message: "PRIVATE_UNKNOWN" } };
      }
      if (n === "d1_load_signed_transaction" && fault === "signature") r.data.transaction.signed_xdr = h.tx.toEnvelope().toXDR("base64").slice(4);
      return r;
    };
    await unchanged(h, 503, unavailable); equal(getters, 0); equal(h.calls.every(c => [outcomeLoad, ...historical].includes(c.name)), true);
  }
});
