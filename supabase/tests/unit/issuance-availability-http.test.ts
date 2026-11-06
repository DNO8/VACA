import { Keypair, TransactionBuilder, Networks, Transaction, xdr, hash } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { createCustodyHandler, type CustodyConfiguration } from "../../functions/d1-custody/handler.ts";
import { withInitialSubmissionAuthorization } from "../../functions/d1-custody/initial-submission-authorization.ts";
import { recordInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome-journal.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { fixture, equal, pool, admin, team, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";

type DTO = Record<string, any>;
type Reply = { data: any; error: unknown };
const load = "d1_load_issuance_outcome", origin = "https://horizon-testnet.stellar.org";
const reads = [load, "d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"];
const wallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 104));
const unavailable = { error: "initial_submission_unavailable" };
const iso = (seconds: number) => new Date(seconds * 1000).toISOString().replace(".000Z", "Z");
async function setup(issued = false, failed = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture();
  const scope = { request_id: requestId, namespace, network: "TESTNET", pool };
  let signed: DTO | null = null, attempt: DTO | null = null, unsigned: DTO | undefined, receipt: DTO | null = null;
  let signing = 0, submissions = 0, accounts = 0;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const hooks = { reply: (_name: string, r: Reply): Reply => r,
    change: (_path: string, dto: DTO, _visit: number): DTO => dto,
    transport: async (_path: string): Promise<Response | undefined> => undefined };
  const client = { async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
    calls.push({ name, args: structuredClone(args) }); let data: unknown;
    if (name === load) data = { kind: "d1_issuance_outcome_lookup", revision: 1, ...scope, outcome: receipt };
    else if (name === "d1_load_submission_attempt") data = { kind: "d1_submission_attempt_lookup", revision: 1, ...scope, attempt };
    else if (name === "d1_load_signed_transaction") data = { kind: "d1_signed_transaction_lookup", revision: 1, ...scope, transaction: signed };
    else if (name === "d1_load_initial_financial_observation") data = { kind: "d1_initial_financial_observation_lookup", revision: 1, ...scope,
      transaction_hash: unsigned!.transaction_hash, snapshot_hash: args.p_snapshot_hash,
      observation: f.h.persisted.get(String(args.p_snapshot_hash)) ?? null };
    else if (name === "d1_record_signed_transaction") data = signed = { kind: "d1_signed_transaction_journal", revision: 1, ...scope,
      authorized_by: admin, transaction_hash: unsigned!.transaction_hash, snapshot_hash: args.p_snapshot_hash,
      signed_xdr: args.p_signed_xdr, envelope_hash: hash(Buffer.from(String(args.p_signed_xdr), "base64")).toString("hex"),
      reservation: structuredClone(unsigned!.reservation) };
    else if (name === "d1_claim_submission_attempt") data = { kind: "d1_submission_claim", revision: 1, claimed: true,
      attempt: attempt = { kind: "d1_submission_attempt", revision: 1, ...scope, authorized_by: admin,
        transaction_hash: signed!.transaction_hash, envelope_hash: signed!.envelope_hash, snapshot_hash: args.p_snapshot_hash,
        attempt_id: args.p_attempt_id, claimed_at: f.h.now, reservation: structuredClone(unsigned!.reservation) } };
    else if (name === "d1_record_issuance_outcome") data = receipt = { kind: "d1_issuance_outcome_journal", revision: 1, ...scope,
      authorized_by: team, attempt_id: attempt!.attempt_id, transaction_hash: signed!.transaction_hash,
      envelope_hash: signed!.envelope_hash, outcome_hash: "d".repeat(64), observed_outcome: structuredClone(args.p_observed_outcome) };
    else {
      // Delegate the ORIGINAL history/discovery throughout real SDK preparation.
      const r = await f.h.client.rpc(name, args);
      if (name === "d1_load_unsigned_transaction") unsigned = structuredClone((r.data as DTO).transaction);
      return hooks.reply(name, r);
    }
    return hooks.reply(name, { data: structuredClone(data), error: null });
  } };
  const configuration = { ...f.configuration, loadPoolSigner() { return Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)); } };
  await withInitialSubmissionAuthorization(client, configuration, () => undefined);
  const tx = TransactionBuilder.fromXDR(signed!.signed_xdr, Networks.TESTNET);
  if (!(tx instanceof Transaction)) throw Error("fixture ordinary transaction expected");
  const inner = failed ? xdr.CreateClaimableBalanceResult.createClaimableBalanceUnderfunded() :
    xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR(tx.getClaimableBalanceId(0), "hex"));
  const operations = [xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(inner))];
  const result = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("100"),
    result: failed ? xdr.TransactionResultResult.txFailed(operations) : xdr.TransactionResultResult.txSuccess(operations),
    ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
  const token = ((11n << 32n) + 4096n).toString(), ledgerHash = "f".repeat(64), time = iso(closedAt + 5);
  const observation = parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: { sequence: 11, hash: ledgerHash, closedAt: closedAt + 5 } },
    ledger: { sequence: 11, hash: ledgerHash, closed_at: time },
    transaction: { hash: tx.hash().toString("hex"), paging_token: token, ledger: 11, created_at: time,
      source_account: pool, source_account_sequence: tx.sequence, fee_account: pool, fee_charged: "100", max_fee: tx.fee,
      successful: !failed, operation_count: 1, envelope_xdr: tx.toXDR(), result_xdr: result } });
  f.h.records.push(observation); f.h.history.record_count++; f.h.history.page_count++;
  Object.assign(f.h.history.checkpoint, { cursor: token, through_ledger: 11, ledger_hash: ledgerHash, closed_at: closedAt + 5 });
  Object.assign(f.h.history.income_state.checkpoint, { ...f.h.history.checkpoint, cursor: (BigInt(token) + 1n).toString() });
  await recordInitialIssuanceOutcome(client, configuration);
  // Start the HTTP-only observation AFTER legitimate SDK receipts exist.
  f.h.now = closedAt + 7;
  configuration.loadPoolSigner = () => { signing++; throw Error("PRIVATE_SIGNER_FORBIDDEN"); };
  configuration.source.readAccountAtCheckpoint = async () => { accounts++; throw Error("PRIVATE_ACCOUNT_FORBIDDEN"); };
  const fetcher: typeof fetch = async () => { submissions++; throw Error("PRIVATE_SUBMISSION_FORBIDDEN"); };
  const p = signed!.reservation.intent.preparation_input, id = tx.getClaimableBalanceId(0);
  const cbPath = "/claimable_balances/" + id, headPath = "/ledgers?limit=1&order=desc";
  const current = { sequence: 12, hash: "e".repeat(64), closed_at: iso(closedAt + 6) };
  const balance = { id, asset: issued ? p.request.asset.code + ":" + p.request.asset.issuer : "native", amount: p.request.amount,
    last_modified_ledger: "11", sponsor: pool, claimants: [
      { destination: p.request.beneficiary, predicate: { abs_before: p.request.deadline } },
      { destination: pool, predicate: { not: { abs_before: p.request.deadline } } },
    ] };
  const paths: string[] = [], visits = new Map<string, number>();
  let rpcCountAtFetch: number | undefined;
  const availabilityFetcher: typeof fetch = async (url, init) => {
    const path = String(url).slice(origin.length); paths.push(path);
    equal(String(url), origin + path);
    const options = init as DTO;
    equal([options?.method, options?.redirect, options?.credentials], ["GET", "error", "omit"]);
    equal([...new Headers(options?.headers)], []); equal(options?.body, undefined);
    equal(options?.signal instanceof AbortSignal, true); equal(options!.signal!.aborted, false);
    if (rpcCountAtFetch === undefined) rpcCountAtFetch = calls.length;
    equal(calls.length, rpcCountAtFetch); // No readback or write after provider work starts.
    equal(calls[0].name, load);
    for (const name of reads) equal(calls.some(c => c.name === name), true);
    equal(["/", headPath, cbPath].includes(path), true);
    const visit = (visits.get(path) ?? 0) + 1; visits.set(path, visit);
    const intercepted = await hooks.transport(path); if (intercepted) return intercepted;
    const raw = path === "/" ? { network_passphrase: Networks.TESTNET, history_latest_ledger: current.sequence } :
      path === headPath ? { _embedded: { records: [structuredClone(current)] } } : structuredClone(balance);
    return Response.json(hooks.change(path, raw, visit));
  };
  function handler(option: unknown = availabilityFetcher, omitted = false) {
    const options = { poolSigner: Keypair.fromPublicKey(pool), now: () => f.h.now,
      issuance: { client, configuration, fetcher, ...(!omitted ? { availabilityFetcher: option } : {}) } };
    return createCustodyHandler(options as unknown as CustodyConfiguration);
  }
  function request(change: DTO = {}, badSignature = false) {
    const message: DTO = { version: 1, network: "TESTNET", pool, namespace, action: "issue", request_id: requestId,
      timestamp: f.h.now, payload: {}, wallet: admin, ...change };
    const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
    const signature = (badSignature ? Keypair.fromRawEd25519Seed(Buffer.alloc(32, 102)) : wallet)
      .sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical))).toString("base64");
    return new Request("https://local.invalid/functions/v1/d1-custody/issue", { method: "POST", body: JSON.stringify({ ...message, signature }) });
  }
  const selected = { state: failed ? "issuance_failed_observed" : "issuance_observed", verification: "persisted_sdk_observation",
    requestId, transactionHash: signed!.transaction_hash, donor: p.payment.donor, beneficiary: p.request.beneficiary,
    asset: p.request.asset, amount: p.request.amount, paymentTransactionHash: p.payment.transaction_hash, deadline: p.request.deadline,
    ...(!failed ? { claimableBalanceId: id } : {}) };
  const availability = { verification: "current_indexer_observation", state: "present", claimableBalanceId: id,
    observedLedger: 12, ledgerHash: current.hash, observedClosedAt: closedAt + 6 };
  const state = () => JSON.stringify([f.h.owner, f.h.history, f.h.credit, f.h.receipt, f.h.records, [...f.h.persisted], signed, attempt, receipt]);
  const counters = () => [signing, submissions, accounts, f.h.persisted.size, f.h.records.length, f.h.history.record_count, f.h.history.page_count];
  calls.length = 0; f.h.calls.length = 0;
  return { f, calls, hooks, handler, request, selected, availability, state, counters, paths, cbPath, headPath, current, balance,
    signed: signed!, receipt: receipt! };
}
type H = Awaited<ReturnType<typeof setup>>;
async function response(h: H, status: number, body: unknown, request = h.request(), handler = h.handler()) {
  const before = h.state(), counters = h.counters(), reply = await handler(request);
  equal(reply.status, status);
  equal([...reply.headers], [["cache-control", "no-store"], ["content-type", "application/json"]]);
  equal(await reply.text(), JSON.stringify(body));
  equal(h.state(), before); equal(h.counters(), counters); equal(h.counters().slice(0, 3), [0, 0, 0]);
  equal(h.calls.filter(c => !c.name.startsWith("d1_load_") && !c.name.startsWith("d1_list_")), []);
  equal(h.f.h.calls.filter(n => !n.startsWith("d1_load_") && !n.startsWith("d1_list_")), []);
  equal(h.paths, ["/", h.headPath, h.cbPath, h.headPath].slice(0, h.paths.length));
  equal(h.paths.length <= 4, true); // No source retry, submission fallback, or terminal inference.
  for (const { name, args } of h.calls.filter(c => reads.includes(c.name))) {
    equal(args, { p_request_id: requestId, p_authorized_by: admin,
      ...(name === "d1_load_initial_financial_observation" ? { p_snapshot_hash: h.signed.snapshot_hash } : {}) });
  }
}
Deno.test("availability HTTP native and issued current presence adds only the exact observational mapping", async () => {
  for (const issued of [false, true]) {
    for (const ledger of [11, "11"]) {
      const h = await setup(issued); h.balance.last_modified_ledger = ledger as any;
      await response(h, 200, { ...h.selected, availability: h.availability });
      equal(h.paths, ["/", h.headPath, h.cbPath, h.headPath]);
    }
  }
});
Deno.test("availability HTTP omitted dependency preserves byte-exact legacy response without current reads", async () => {
  const h = await setup();
  await response(h, 200, h.selected, h.request(), h.handler(undefined, true)); equal(h.paths, []);
});
Deno.test("availability HTTP invalid proof and revoked database admin stop before availability", async () => {
  for (const fault of ["signature", "stale", "admin"]) {
    const h = await setup();
    if (fault === "admin") h.hooks.reply = () => ({ data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } });
    const status = fault === "admin" ? 403 : 401;
    await response(h, status, { error: fault === "admin" ? "unauthorized_admin_wallet" : fault === "stale" ? "stale_request" : "invalid_signature" },
      h.request(fault === "stale" ? { timestamp: 0 } : {}, fault === "signature"));
    equal(h.paths, []); equal(h.calls.map(c => c.name), fault === "admin" ? [load] : []); equal(h.f.h.calls, []);
  }
});
Deno.test("availability HTTP included failure and pending attempt never consult current balance; blocked fresh cannot bypass financial gate", async () => {
  for (const mode of ["failed", "pending", "fresh"]) {
    const h = await setup(false, mode === "failed");
    if (mode !== "failed") h.hooks.reply = (name, r) => {
      if (name === load) r.data.outcome = null;
      if (mode === "fresh" && name === "d1_load_submission_attempt") r.data.attempt = null;
      if (mode === "fresh" && name === "d1_load_signed_transaction") r.data.transaction = null;
      return r;
    };
    if (mode === "fresh") h.f.h.history.coverage_complete = false;
    await response(h, mode === "fresh" ? 503 : mode === "pending" ? 202 : 200,
      mode === "fresh" ? unavailable : mode === "pending" ? { state: "pending", verification: "unverified", requestId,
        transactionHash: h.signed.transaction_hash } : h.selected);
    equal(h.paths, []);
  }
});
Deno.test("availability HTTP corrupt stored SDK proof never reaches Horizon", async () => {
  for (const fault of ["id", "signature", "preparation"]) {
    const h = await setup(); h.hooks.reply = (name, r) => {
      if (name === load && fault === "id") r.data.outcome.observed_outcome.claimableBalanceId = "00000000" + "0".repeat(64);
      if (name === "d1_load_signed_transaction" && fault === "signature") r.data.transaction.signed_xdr = "PRIVATE_FORGED_XDR";
      if (name === "d1_load_unsigned_transaction" && fault === "preparation") r.data.transaction.reservation.intent.preparation_input.request.beneficiary = team;
      return r;
    };
    await response(h, 503, unavailable); equal(h.paths, []);
  }
});
Deno.test("availability HTTP rejects caller identities and economic facts before any read", async () => {
  for (const field of ["claimableBalanceId", "pool", "beneficiary", "asset", "amount", "deadline", "cursor"]) {
    const h = await setup();
    await response(h, 400, { error: "invalid_request" }, h.request({ payload: { [field]: (h.balance as DTO)[field] ?? "PRIVATE_CALLER_FACT" } }));
    equal(h.paths, []); equal(h.calls, []); equal(h.f.h.calls, []);
  }
});
Deno.test("availability HTTP non-function configured dependency fails closed without global fallback", async () => {
  for (const option of [null, {}, true]) {
    const h = await setup(); await response(h, 503, unavailable, h.request(), h.handler(option)); equal(h.paths, []);
  }
});
Deno.test("availability HTTP exact two-claimant asset amount and immutable predicate contradictions fail closed", async () => {
  const faults: Record<string, (b: DTO) => void> = {
    id: b => { b.id = "00000000" + "0".repeat(64); }, version: b => { b.id = "00000001" + b.id.slice(8); },
    asset: b => { b.asset = "USD:" + team; }, assetCode: b => { b.asset = "EUR:" + team; },
    amount: b => { b.amount = "0.9999999"; }, excessiveAmount: b => { b.amount = "1.0000001"; },
    beneficiary: b => { b.claimants[0].destination = team; }, pool: b => { b.claimants[1].destination = team; },
    duplicate: b => { b.claimants[1].destination = b.claimants[0].destination; }, missing: b => { b.claimants.pop(); },
    extra: b => { b.claimants.push(b.claimants[0]); }, deadline: b => { b.claimants[0].predicate.abs_before = iso(closedAt + 301); },
    poolDeadline: b => { b.claimants[1].predicate.not.abs_before = iso(closedAt + 301); },
    noncanonical: b => { b.claimants[0].predicate.abs_before = "2026-10-27T12:05:00+00:00"; },
    epoch: b => { b.claimants[0].predicate.abs_before_epoch = String(closedAt + 301); },
    poolEpoch: b => { b.claimants[1].predicate.not.abs_before_epoch = String(closedAt + 301); },
    unconditional: b => { b.claimants[0].predicate = { unconditional: true }; },
    notBefore: b => { b.claimants[1].predicate = { abs_before: b.claimants[0].predicate.abs_before }; },
    branch: b => { b.claimants[0].predicate.and = []; }, poolBranch: b => { b.claimants[1].predicate.or = []; },
    ledgerZero: b => { b.last_modified_ledger = "0"; }, ledgerAlias: b => { b.last_modified_ledger = "011"; },
    ledgerOverflow: b => { b.last_modified_ledger = "4294967296"; }, ledgerAhead: b => { b.last_modified_ledger = 13; },
    ledgerFraction: b => { b.last_modified_ledger = 11.5; },
  };
  for (const [name, mutate] of Object.entries(faults)) {
    const h = await setup(name === "asset" || name === "assetCode"); mutate(h.balance);
    await response(h, 503, unavailable); equal(h.paths, ["/", h.headPath, h.cbPath]);
  }
});
Deno.test("availability HTTP canonical equivalent epoch metadata and freshness boundaries remain observational", async () => {
  for (const age of [30, -2]) {
    const h = await setup(); h.f.h.now = closedAt + 6 + age;
    for (const claimant of h.balance.claimants) {
      const predicate = claimant.predicate as DTO;
      (predicate.not ?? predicate).abs_before_epoch = String(closedAt + 300);
    }
    await response(h, 200, { ...h.selected, availability: h.availability });
    equal(h.paths.length, 4);
  }
});
Deno.test("availability HTTP wrong network stale future issuance floor and header drift never return presence", async () => {
  for (const fault of ["network", "rootHead", "stale", "future", "belowIssuance", "sequenceDrift", "hashDrift", "timeDrift"]) {
    const h = await setup();
    if (fault === "stale" || fault === "future") h.current.closed_at = iso(h.f.h.now + (fault === "stale" ? -31 : 3));
    if (fault === "belowIssuance") h.current.sequence = 10;
    h.hooks.change = (path, dto, visit) => {
      if (path === "/" && fault === "network") dto.network_passphrase = Networks.PUBLIC;
      if (path === "/" && fault === "rootHead") dto.history_latest_ledger = 13;
      if (path === h.headPath && visit === 2) {
        if (fault === "sequenceDrift") dto._embedded.records[0].sequence++;
        if (fault === "hashDrift") dto._embedded.records[0].hash = "d".repeat(64);
        if (fault === "timeDrift") dto._embedded.records[0].closed_at = iso(closedAt + 7);
      }
      return dto;
    };
    await response(h, 503, unavailable);
  }
});
Deno.test("availability HTTP 404 malformed oversized and whole-body timeout stop without retry or disposition", async () => {
  for (const fault of ["404", "network", "malformed", "oversize", "timeout"]) {
    const h = await setup(); let cancelled = false;
    h.hooks.transport = async path => {
      if (path !== h.cbPath) return undefined;
      if (fault === "404") return new Response("PRIVATE_NOT_FOUND", { status: 404 });
      if (fault === "network") throw Error("PRIVATE_NETWORK_FAILURE");
      if (fault === "malformed") return new Response("PRIVATE_NOT_JSON");
      if (fault === "oversize") return new Response(JSON.stringify({ ...h.balance, private: "x".repeat(1048576) }));
      // Headers arrive immediately; an unclosed body ignores abort. The unchanged
      // whole-fetch/body deadline must cancel it, not merely time out fetch().
      return new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode("{")); },
        cancel() { cancelled = true; } }));
    };
    await response(h, 503, unavailable); equal(h.paths, ["/", h.headPath, h.cbPath]);
    if (fault === "timeout") equal(cancelled, true);
  }
});
