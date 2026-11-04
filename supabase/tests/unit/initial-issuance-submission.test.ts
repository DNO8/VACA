import { Keypair, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { submitInitialIssuance } from "../../functions/d1-custody/initial-issuance-submission.ts";
import { fixture, equal, pool, admin, team, namespace, requestId } from "../fixtures/initial-financial-authorization.ts";
type DTO = Record<string, any>;
const load = "d1_load_submission_attempt", claim = "d1_claim_submission_attempt";
function setup(issued = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture();
  const scope = { request_id: requestId, namespace, network: "TESTNET", pool }, trace: string[] = [];
  let signed: DTO | null = null, attempt: DTO | null = null, unsigned: DTO, keys = 0;
  const hooks = { lose: false, unknown: false, beforeClaimReply: async () => {},
    reply: async (_init: RequestInit): Promise<Response> => new Response(JSON.stringify({ hash: signed!.transaction_hash, successful: true }), { headers: { "content-type": "application/json" } }) };
  const client = { async rpc(name: string, args: Record<string, unknown>): Promise<{ data: any; error: any }> {
    trace.push(name); let data: unknown;
    if (name === load) data = { kind: "d1_submission_attempt_lookup", revision: 1, ...scope, attempt };
    else if (name === "d1_load_signed_transaction") data = { kind: "d1_signed_transaction_lookup", revision: 1, ...scope, transaction: signed };
    else if (name === "d1_load_initial_financial_observation") data = { kind: "d1_initial_financial_observation_lookup", revision: 1, ...scope,
      transaction_hash: unsigned.transaction_hash, snapshot_hash: args.p_snapshot_hash, observation: f.h.persisted.get(String(args.p_snapshot_hash)) ?? null };
    else if (name === "d1_record_signed_transaction") {
      signed = { kind: "d1_signed_transaction_journal", revision: 1, ...scope, authorized_by: admin, transaction_hash: unsigned.transaction_hash,
        snapshot_hash: args.p_snapshot_hash, signed_xdr: args.p_signed_xdr, envelope_hash: digest(Buffer.from(String(args.p_signed_xdr), "base64")).toString("hex"), reservation: structuredClone(unsigned.reservation) }; data = signed;
    } else if (name === claim) {
      const existed = attempt !== null;
      attempt ??= { kind: "d1_submission_attempt", revision: 1, ...scope, authorized_by: hooks.lose ? team : admin,
        transaction_hash: signed!.transaction_hash, envelope_hash: signed!.envelope_hash, snapshot_hash: args.p_snapshot_hash,
        attempt_id: hooks.lose ? crypto.randomUUID() : args.p_attempt_id, claimed_at: f.h.now, reservation: structuredClone(unsigned.reservation) };
      if (hooks.unknown) throw Error("PRIVATE_UNKNOWN_CLAIM");
      await hooks.beforeClaimReply(); data = { kind: "d1_submission_claim", revision: 1, claimed: !existed && !hooks.lose, attempt };
    } else {
      const r = await f.h.client.rpc(name, args); if (name === "d1_load_unsigned_transaction") unsigned = structuredClone((r.data as DTO).transaction); return r;
    }
    return { data: structuredClone(data), error: null };
  } };
  const configuration = { ...f.configuration, loadPoolSigner() { keys++; return Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)); } };
  const posts: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init) => { trace.push("POST"); posts.push({ url: String(url), init: init! }); return await hooks.reply(init!); };
  const run = () => submitInitialIssuance(client, configuration, fetcher);
  return { f, hooks, configuration, client, posts, trace, run, get signed() { return signed!; }, get attempt() { return attempt!; }, get keys() { return keys; } };
}
type H = ReturnType<typeof setup>;
const state = (h: H) => JSON.stringify([h.f.h.owner, h.f.h.history, h.f.h.credit, h.f.h.records]);
async function reject(h: H) {
  const before = state(h); let error: unknown; try { await h.run(); } catch (e) { error = e; }
  equal(error instanceof CustodyError ? [error.code, error.status, error.message] : error, ["initial_submission_unavailable", 503, "initial_submission_unavailable"]);
  equal(state(h), before);
}
function offline(h: H) {
  const fail = () => { throw Error("private/fresh dependency forbidden"); };
  h.configuration.now = fail; h.configuration.loadPoolSigner = fail; h.configuration.source.readAccountAtCheckpoint = fail;
}
Deno.test("submission internally claims native/issued then posts exact signed form once; replay is offline", async () => {
  for (const issued of [false, true]) {
    const h = setup(issued), before = state(h), r = await h.run();
    equal([r.invoked, h.posts.length, h.keys], [true, 1, 1]);
    const { url, init } = h.posts[0], headers = new Headers(init.headers);
    equal([url, init.method, init.redirect, init.credentials], ["https://horizon-testnet.stellar.org/transactions", "POST", "error", "omit"]);
    equal([...headers], [["accept", "application/json"], ["content-type", "application/x-www-form-urlencoded"]]);
    equal(init.body, new URLSearchParams({ tx: h.signed.signed_xdr }).toString());
    equal(h.trace.slice(-2), [claim, "POST"]); equal(h.trace.filter(n => n === claim).length, 1);
    equal(state(h), before);
    if (r.invoked) equal([r.value.kind, r.value.revision, r.value.verification, r.value.transactionHash], ["d1_initial_submission_response", 1, "unverified", h.signed.transaction_hash]);
    h.trace.length = 0; offline(h); equal((await h.run()).invoked, false); equal(h.posts.length, 1);
    equal(h.trace.includes(claim) || h.trace.includes("d1_record_fresh_initial_financial_observation"), false);
  }
});
Deno.test("submission awaits durable claim; false or unknown acknowledgement never posts", async () => {
  const h = setup(); let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(r => entered = r), barrier = new Promise<void>(r => release = r);
  h.hooks.beforeClaimReply = async () => { entered(); await barrier; };
  const pending = h.run(); await reached; equal(h.posts.length, 0); release(); equal((await pending).invoked, true);
  const lost = setup(); lost.hooks.lose = true; equal((await lost.run()).invoked, false); equal(lost.posts.length, 0);
  const unknown = setup(); unknown.hooks.unknown = true; await reject(unknown); equal(unknown.posts.length, 0);
  unknown.hooks.unknown = false; offline(unknown); equal((await unknown.run()).invoked, false); equal(unknown.posts.length, 0);
});
Deno.test("submission transport status and forged403 errors remain unknown with no retry or readback", async () => {
  for (const status of [201, 400, 403, 404, 429, 500]) {
    const h = setup(); h.hooks.reply = async () => new Response("PRIVATE_PROVIDER_ERROR", { status }); await reject(h);
    equal([h.posts.length, h.trace.at(-1)], [1, "POST"]); equal(h.trace.filter(n => n === claim).length, 1);
  }
  const h = setup(); h.hooks.reply = () => { throw new CustodyError("unauthorized_admin_wallet", 403); }; await reject(h); equal(h.posts.length, 1);
  offline(h); equal((await h.run()).invoked, false); equal(h.posts.length, 1);
});
Deno.test("submission rejects malformed hash JSON UTF8 media type bytes and depth without changing ownership", async () => {
  for (const fault of ["hash", "json", "array", "utf8", "type", "bytes", "depth", "nodes", "unicode", "unsafe"]) {
    const h = setup(); h.hooks.reply = async () => {
      let body: BodyInit = JSON.stringify({ hash: h.signed.transaction_hash });
      if (fault === "hash") body = JSON.stringify({ hash: "a".repeat(64) });
      if (fault === "json") body = "PRIVATE_NOT_JSON";
      if (fault === "array") body = "[]";
      if (fault === "utf8") body = new Uint8Array([255]);
      if (fault === "bytes") body = JSON.stringify({ hash: h.signed.transaction_hash, padding: "x".repeat(131072) });
      if (fault === "depth") body = JSON.stringify({ hash: h.signed.transaction_hash, deep: JSON.parse("[".repeat(30) + "0" + "]".repeat(30)) });
      if (fault === "nodes") body = JSON.stringify({ hash: h.signed.transaction_hash, extra: Array(10001).fill(0) });
      if (fault === "unicode") body = JSON.stringify({ hash: h.signed.transaction_hash, extra: "\uD800" });
      if (fault === "unsafe") body = JSON.stringify({ hash: h.signed.transaction_hash, ledger: Number.MAX_SAFE_INTEGER + 1 });
      return new Response(body, { headers: { "content-type": fault === "type" ? "text/html" : "application/json", "content-length": "1" } });
    }; await reject(h); equal([h.posts.length, h.trace.at(-1)], [1, "POST"]);
  }
});
Deno.test("submission awaits streamed response and freezes opaque acknowledgement without interpreting outcome", async () => {
  const h = setup(); let entered!: () => void, stream!: ReadableStreamDefaultController<Uint8Array>, done = false;
  const reached = new Promise<void>(r => entered = r);
  h.hooks.reply = async () => new Response(new ReadableStream<Uint8Array>({ start(c) { stream = c; entered(); } }), { headers: { "content-type": "application/json; charset=utf-8" } });
  const pending = h.run().then(r => { done = true; return r; }); await reached; equal([done, h.posts.length], [false, 1]);
  stream.enqueue(new TextEncoder().encode(JSON.stringify({ hash: h.signed.transaction_hash, successful: false, ledger: 99, result_xdr: "NOT_PROOF", nested: [1] }))); stream.close();
  const r = await pending; if (!r.invoked) throw Error("expected invocation");
  equal([r.value.verification, r.value.response.successful, Object.hasOwn(r.value, "outcome"), Object.hasOwn(r.value, "claimableBalanceId")], ["unverified", false, false, false]);
  equal([Object.isFrozen(r.value), Object.isFrozen(r.value.response), Object.isFrozen(r.value.response.nested)], [true, true, true]);
  const boundary = setup(); let length = 0;
  boundary.hooks.reply = async () => {
    const overhead = new TextEncoder().encode(JSON.stringify({ hash: boundary.signed.transaction_hash, padding: "" })).length;
    const text = JSON.stringify({ hash: boundary.signed.transaction_hash, padding: "x".repeat(131072 - overhead) });
    length = new TextEncoder().encode(text).length;
    return new Response(text, { headers: { "content-type": "application/json", "content-length": "1" } });
  };
  equal((await boundary.run()).invoked, true); equal(length, 131072);
});
Deno.test("submission whole-request body timeout aborts and cancels once; historical attempt never resubmits", async () => {
  const h = setup(); let cancelled = 0, signal: AbortSignal | null | undefined;
  h.hooks.reply = async init => { signal = init.signal; return new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { "content-type": "application/json" } }); };
  await reject(h); equal([h.posts.length, signal?.aborted, cancelled, h.trace.at(-1)], [1, true, 1, "POST"]);
  offline(h); equal((await h.run()).invoked, false); equal(h.posts.length, 1);
});
