import assert from "node:assert/strict";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { Buffer } from "node:buffer";
import { Keypair, Networks, Transaction, TransactionBuilder, hash } from "@stellar/stellar-sdk";
import { createCustodyDeploymentHost } from "../../functions/d1-custody/deployment-host.ts";
import { fixture, pool, team, admin, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";
import { savedInitialFixture } from "../fixtures/refund-initial.ts";
import { automaticFixture, manualRequest, cutoff } from "../fixtures/automatic-refund.ts";
type DTO = Record<string, any>;
const poolKey = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101));
const adminKey = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 104));
const scope = { revision: 1, namespace, network: "TESTNET", pool, request_id: requestId };
const origin = "https://horizon-testnet.stellar.org";
const birth = String((10n << 32n) + 4097n);
function request(now: number) {
  const m: DTO = { version: 1, network: "TESTNET", pool, namespace, action: "issue", request_id: requestId,
    timestamp: now, payload: {}, wallet: admin };
  const text = "{" + Object.keys(m).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(m[k])).join(",") + "}";
  return new Request("https://offline.invalid/functions/v1/d1-custody/issue", { method: "POST",
    body: JSON.stringify({ ...m, signature: adminKey.sign(hash(Buffer.from("Stellar Signed Message:\n" + text))).toString("base64") }) });
}
function host(client: { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }, fetcher: typeof fetch,
  now: () => number, readSecret: () => string) {
  return createCustodyDeploymentHost({ client: { async rpc(name, args) {
    const reply = await client.rpc(name, args); assert.equal(reply.error, null);
    return { data: reply.data, error: null };
  } }, fetcher, now, readSecret, pool, namespace,
    firstLedger: 10, creationOperationId: birth, teamFunders: [team] });
}
function accountDTO(a: DTO) {
  const amount = (s: string) => (BigInt(s) / 10000000n) + "." + (BigInt(s) % 10000000n).toString().padStart(7, "0");
  return { id: pool, account_id: pool, sequence: a.sequence, last_modified_ledger: a.lastModifiedLedger,
    ...a.account, signers: [{ type: "ed25519_public_key", key: pool, weight: 1 }],
    thresholds: { low_threshold: 1, med_threshold: 1, high_threshold: 1 }, balances: [{ asset_type: "native",
      balance: amount(a.native.balance), selling_liabilities: amount(a.native.sellingLiabilities), buying_liabilities: "0.0000000" }] };
}
function header(a: DTO) {
  return { sequence: a.anchor.sequence, hash: a.anchor.hash,
    closed_at: new Date(a.anchor.closedAt * 1000).toISOString().replace(".000Z", "Z"),
    base_fee_in_stroops: Number(a.baseFee), base_reserve_in_stroops: Number(a.baseReserve) };
}
async function expect(r: Response, status: number, body: unknown) {
  assert.equal(r.status, status); assert.deepEqual(await r.json(), body);
  assert.equal(r.headers.get("cache-control"), "no-store");
}
function fresh(wrongKey = false) {
  const f = fixture(), events: string[] = [];
  f.h.history.first_ledger = 10; f.h.history.income_state.first_ledger = 10;
  f.h.credit.discovery_state.first_ledger = 10;
  f.h.records = f.h.records.map(r => parseIncludedTransaction({ ...r.raw, context: { ...r.context, firstLedger: 10 } }));
  const discovery = f.h.history.income_state;
  let signed: DTO | null = null, attempt: DTO | null = null, unsigned: DTO;
  let credit: DTO | null = null, commitment: DTO | null = null;
  const expectedCommitment = structuredClone(f.h.owner.commitment);
  const client = { async rpc(name: string, args: Record<string, unknown>) {
    events.push(name); assert.equal(args.p_authorized_by, admin);
    let data: unknown;
    switch (name) {
      case "d1_load_issuance_outcome": data = { kind: "d1_issuance_outcome_lookup", ...scope, outcome: null }; break;
      case "d1_load_submission_attempt": data = { kind: "d1_submission_attempt_lookup", ...scope, attempt }; break;
      case "d1_load_discovery_state": data = discovery; break;
      case "d1_record_discovery_page": {
        const p = args.p_page as DTO;
        assert.deepEqual(p.records, []);
        data = { kind: "d1_discovery_page", revision: 1, namespace, network: "TESTNET", pool,
          from_cursor: p.from_cursor, to_cursor: p.to_cursor, checkpoint_ledger: p.through_ledger,
          checkpoint_hash: p.ledger_hash, page_count: 1, record_count: 0 }; break;
      }
      case "d1_record_transaction_page": {
        const p = args.p_page as DTO; assert.deepEqual(p.records, []);
        data = { kind: "d1_transaction_page", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 10,
          authorized_by: admin, page: p, checkpoint: f.h.history.checkpoint,
          page_count: f.h.history.page_count, record_count: f.h.history.record_count, page_record_count: 0 }; break;
      }
      case "d1_load_operating_credit": data = { kind: "d1_operating_credit_lookup", revision: 1, namespace,
        network: "TESTNET", pool, operation_id: birth, receipt: credit }; break;
      case "d1_record_operating_credit":
        assert.deepEqual(args.p_observation, f.h.receipt.observation);
        data = credit = { kind: "d1_operating_credit_observation", revision: 1, authorized_by: admin, observation: args.p_observation }; break;
      case "d1_load_issuance_fee_commitments": data = { ...f.h.owner, commitment, commitments: commitment ? [commitment] : [] }; break;
      case "d1_record_issuance_fee_commitment":
        assert.equal(args.p_issuance_fee_stroops, "100"); assert.equal(args.p_future_refund_fee_stroops, "300");
        data = commitment = expectedCommitment; break;
      case "d1_load_signed_transaction": data = { kind: "d1_signed_transaction_lookup", ...scope, transaction: signed }; break;
      case "d1_load_initial_financial_observation": data = { kind: "d1_initial_financial_observation_lookup", ...scope,
        transaction_hash: unsigned!.transaction_hash, snapshot_hash: args.p_snapshot_hash,
        observation: f.h.persisted.get(String(args.p_snapshot_hash)) }; break;
      case "d1_record_signed_transaction": data = signed = { kind: "d1_signed_transaction_journal", ...scope,
        authorized_by: admin, transaction_hash: unsigned!.transaction_hash, snapshot_hash: args.p_snapshot_hash,
        signed_xdr: args.p_signed_xdr, envelope_hash: hash(Buffer.from(String(args.p_signed_xdr), "base64")).toString("hex"),
        reservation: unsigned!.reservation }; break;
      case "d1_claim_submission_attempt": data = { kind: "d1_submission_claim", revision: 1, claimed: true,
        attempt: attempt = { kind: "d1_submission_attempt", ...scope, authorized_by: admin,
          transaction_hash: signed!.transaction_hash, envelope_hash: signed!.envelope_hash, snapshot_hash: args.p_snapshot_hash,
          attempt_id: args.p_attempt_id, claimed_at: f.h.now, reservation: unsigned!.reservation } }; break;
      default: {
        const reply = await f.h.client.rpc(name, args);
        if (name === "d1_load_unsigned_transaction") unsigned = (reply.data as DTO).transaction;
        return reply;
      }
    }
    return { data: JSON.parse(JSON.stringify(data)), error: null };
  } };
  const fetcher: typeof fetch = async (input, init) => {
    const u = new URL(String(input)); assert.equal(u.origin, origin); events.push(((init && "method" in init ? init.method : undefined) ?? "GET") + " " + u.pathname);
    if ((init && "method" in init ? init.method : undefined) === "POST") {
      assert.equal(u.pathname, "/transactions");
      const tx = TransactionBuilder.fromXDR(new URLSearchParams(String(init && "body" in init ? init.body : undefined)).get("tx")!, Networks.TESTNET);
      assert(tx instanceof Transaction); assert(poolKey.verify(tx.hash(), tx.signatures[0].signature()));
      return Response.json({ hash: tx.hash().toString("hex") });
    }
    if (u.pathname === "/") return Response.json({ network_passphrase: Networks.TESTNET, history_elder_ledger: 10, history_latest_ledger: 10 });
    if (u.pathname === "/ledgers") return Response.json({ _embedded: { records: [header(f.h.account)] } });
    if (u.pathname === `/accounts/${pool}`) return Response.json(accountDTO(f.h.account));
    if (u.pathname === `/accounts/${pool}/operations` || u.pathname === `/accounts/${pool}/transactions`)
      return Response.json({ _embedded: { records: [] } });
    if (u.pathname === `/operations/${birth}`) return Response.json(f.h.receipt.observation.record.operation.raw.operation);
    if (u.pathname === `/transactions/${f.h.receipt.observation.transactionHash}`)
      return Response.json(f.h.receipt.observation.record.operation.raw.transaction);
    throw Error("unexpected transport " + u);
  };
  const handler = host(client, fetcher, () => f.h.now, () => {
    events.push("secret"); return wrongKey ? adminKey.secret() : poolKey.secret();
  });
  return { f, handler, events, get signed() { return signed!; },
    state: () => JSON.stringify([credit, commitment, signed, attempt, [...f.h.persisted]]) };
}
Deno.test("T2 completion: fresh authenticated preflight order, lazy signer, valid attempt replay", async () => {
  const h = fresh(); assert.equal(h.events.length, 0);
  const response = await h.handler(request(h.f.h.now));
  assert.equal(response.status, 202, JSON.stringify(h.events));
  await expect(response, 202, { state: "pending", verification: "unverified", requestId, transactionHash: h.signed.transaction_hash });
  const order = ["d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_discovery_state",
    "d1_record_discovery_page", "d1_load_transaction_history_state", "d1_record_transaction_page",
    "d1_load_operating_credit", "d1_record_operating_credit", "d1_load_discovery_state", `GET /accounts/${pool}`,
    "d1_load_unsigned_transaction", "d1_load_issuance_fee_commitments", "d1_record_issuance_fee_commitment",
    "d1_record_fresh_initial_financial_observation", "secret", "d1_record_signed_transaction", "d1_claim_submission_attempt", "POST /transactions"];
  let index = -1;
  for (const event of order) { index = h.events.indexOf(event, index + 1); assert(index >= 0, event + JSON.stringify(h.events)); }
  assert.equal(h.events.filter(x => x === "secret").length, 1);
  const before = hash(Buffer.from(h.state())).toString("hex"); h.events.length = 0; h.f.h.now++;
  await expect(await h.handler(request(h.f.h.now)), 202,
    { state: "pending", verification: "unverified", requestId, transactionHash: h.signed.transaction_hash });
  assert.equal(hash(Buffer.from(h.state())).toString("hex"), before);
  assert(h.events.every(x => ["d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
    "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"].includes(x)), JSON.stringify(h.events));
});
Deno.test("T2 completion: wrong-pool secret rejected after authorization without signing journal or send", async () => {
  const h = fresh(true); assert.equal(h.events.length, 0);
  await expect(await h.handler(request(h.f.h.now)), 503, { error: "initial_submission_unavailable" });
  assert(h.events.includes("d1_record_fresh_initial_financial_observation"));
  assert.equal(h.events.filter(x => x === "secret").length, 1);
  assert(!h.events.includes("d1_record_signed_transaction")); assert(!h.events.includes("d1_claim_submission_attempt"));
  assert(!h.events.includes("POST /transactions"));
});
Deno.test("T2 completion: genuine saved outcome skips fresh preflight and signing", async () => {
  const h = await savedInitialFixture(true, false, false, true);
  const fail = (): never => { throw Error("fresh capability forbidden"); };
  const handler = host(h.client, fail, () => closedAt + 6, fail);
  const before = hash(Buffer.from(h.snapshot())).toString("hex"); h.trace.length = 0;
  const p = h.unsigned.reservation.intent.preparation_input;
  await expect(await handler(request(closedAt + 6)), 200, { state: "issuance_failed_observed", verification: "persisted_sdk_observation",
    requestId, transactionHash: h.unsigned.transaction_hash, donor: p.payment.donor, beneficiary: p.request.beneficiary,
    asset: p.request.asset, amount: p.request.amount, paymentTransactionHash: p.payment.transaction_hash, deadline: p.request.deadline });
  assert.equal(hash(Buffer.from(h.snapshot())).toString("hex"), before);
  assert(h.trace.every(x => ["d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
    "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"].includes(x)), JSON.stringify(h.trace));
});
Deno.test("T2 completion: actual entrypoint missing configuration returns startup 503", async () => {
  const oldGet = Deno.env.get, oldServe = Deno.serve;
  let captured!: (request: Request) => Response | Promise<Response>;
  try {
    Deno.env.get = () => undefined;
    Deno.serve = ((handler: typeof captured) => { captured = handler; return {}; }) as typeof Deno.serve;
    await import("../../functions/d1-custody/deployment-index.ts");
    assert.equal(typeof captured, "function");
    await expect(await captured(new Request("https://offline.invalid/functions/v1/d1-custody/config")), 503, { error: "custody_unavailable" });
  } finally { Deno.env.get = oldGet; Deno.serve = oldServe; }
});
Deno.test("T2 completion: manual forwarding uses request-time expiry after clock advance", async () => {
  const h = await automaticFixture(false, false, true); h.control.executeRefund = true;
  let clock = cutoff - 100, secrets = 0, posts = 0;
  const discovery = (await h.client.rpc("d1_load_discovery_state", { p_authorized_by: admin })).data as DTO;
  const account = await h.source.readAccountAtCheckpoint({ pool, firstLedger: 10, checkpoint: discovery.checkpoint });
  const initial = h.model.d1_load_unsigned_transaction.transaction.reservation.intent.preparation_input;
  const fetcher: typeof fetch = async (input, init) => {
    const u = new URL(String(input)); assert.equal(u.origin, origin);
    if ((init && "method" in init ? init.method : undefined) === "POST") { posts++; return h.fetcher(input, init); }
    if (u.pathname === "/") return Response.json({ network_passphrase: Networks.TESTNET, history_elder_ledger: 10, history_latest_ledger: 13 });
    if (u.pathname === "/ledgers") return Response.json({ _embedded: { records: [header(account)] } });
    if (u.pathname === `/accounts/${pool}`) return Response.json(accountDTO(account));
    if (u.pathname === `/accounts/${pool}/operations` || u.pathname === `/accounts/${pool}/transactions`)
      return Response.json({ _embedded: { records: [] } });
    if (u.pathname.startsWith("/claimable_balances/")) return Response.json({ id: u.pathname.split("/").at(-1),
      asset: "native", amount: initial.request.amount, last_modified_ledger: 11,
      claimants: [{ destination: initial.request.beneficiary, predicate: { abs_before: initial.request.deadline } },
        { destination: pool, predicate: { not: { abs_before: initial.request.deadline } } }] });
    throw Error("unexpected transport " + u);
  };
  const handler = host(h.client, fetcher, () => clock, () => { secrets++; return poolKey.secret(); });
  assert.equal(secrets, 0); clock = cutoff;
  const response = await handler(manualRequest("refund", clock));
  assert.equal(response.status, 202, JSON.stringify({ body: await response.clone().text(), calls: h.calls }));
  const body = await response.json(); assert.equal(body.state, "unknown"); assert.equal(body.requestId, requestId);
  assert.equal(secrets, 1); assert.equal(posts, 1);
  const tx = TransactionBuilder.fromXDR(h.model.d1_load_refund_signing_journal.transaction.signed_xdr, Networks.TESTNET);
  assert(tx instanceof Transaction); assert.equal(tx.timeBounds!.maxTime, String(clock + 60));
  assert.equal(tx.fee, "200"); assert.equal(tx.operations.length, 2);
});
