import { hash, Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { createCustodyHandler, CustodyError } from "../../functions/d1-custody/handler.ts";
import type { submitInitialIssuance } from "../../functions/d1-custody/initial-issuance-submission.ts";
import { fixture, equal, pool, admin, team, namespace, requestId } from "../fixtures/initial-financial-authorization.ts";

type ObjectDTO = Record<string, unknown>;
type Reply = { data: unknown; error: unknown };
type Signed = ObjectDTO & { transaction_hash: string; envelope_hash: string; signed_xdr: string; reservation: unknown };
const outcomeLoad = "d1_load_issuance_outcome", load = "d1_load_submission_attempt", claim = "d1_claim_submission_attempt";
const signer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101));
const wallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 104));
function object(value: unknown): ObjectDTO {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("fixture object expected");
  return value as ObjectDTO;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw Error("fixture string expected");
  return value;
}
function setup() {
  const f = fixture(), scope = { request_id: requestId, namespace, network: "TESTNET", pool };
  let signed: Signed | null = null, attempt: ObjectDTO | null = null, unsigned: ObjectDTO | null = null, keys = 0;
  const trace: string[] = [], calls: { name: string; args: Record<string, unknown> }[] = [];
  const posts: { url: string; init: RequestInit }[] = [];
  const hooks = {
    unknownClaim: false,
    reply: (_name: string, reply: Reply): Reply => reply,
    transport: async (): Promise<Response> => new Response(JSON.stringify({ hash: signed!.transaction_hash, private_provider: "DO_NOT_LEAK" }), {
      headers: { "content-type": "application/json" },
    }),
  };
  const client: Parameters<typeof submitInitialIssuance>[0] = {
    async rpc(name, args): Promise<Reply> {
      trace.push(name); calls.push({ name, args: structuredClone(args) });
      let data: unknown;
      if (name === outcomeLoad) data = { kind: "d1_issuance_outcome_lookup", revision: 1, ...scope, outcome: null };
      else if (name === load) data = { kind: "d1_submission_attempt_lookup", revision: 1, ...scope, attempt };
      else if (name === "d1_load_signed_transaction") data = { kind: "d1_signed_transaction_lookup", revision: 1, ...scope, transaction: signed };
      else if (name === "d1_load_initial_financial_observation") data = {
        kind: "d1_initial_financial_observation_lookup", revision: 1, ...scope,
        transaction_hash: unsigned!.transaction_hash, snapshot_hash: args.p_snapshot_hash,
        observation: f.h.persisted.get(String(args.p_snapshot_hash)) ?? null,
      };
      else if (name === "d1_record_signed_transaction") {
        const xdr = text(args.p_signed_xdr);
        signed = { kind: "d1_signed_transaction_journal", revision: 1, ...scope, authorized_by: admin,
          transaction_hash: text(unsigned!.transaction_hash), snapshot_hash: args.p_snapshot_hash, signed_xdr: xdr,
          envelope_hash: hash(Buffer.from(xdr, "base64")).toString("hex"), reservation: structuredClone(unsigned!.reservation) };
        data = signed;
      } else if (name === claim) {
        const existed = attempt !== null;
        attempt ??= { kind: "d1_submission_attempt", revision: 1, ...scope, authorized_by: admin,
          transaction_hash: signed!.transaction_hash, envelope_hash: signed!.envelope_hash, snapshot_hash: args.p_snapshot_hash,
          attempt_id: args.p_attempt_id, claimed_at: f.h.now, reservation: structuredClone(unsigned!.reservation) };
        if (hooks.unknownClaim) throw Error("PRIVATE_UNKNOWN_CLAIM");
        data = { kind: "d1_submission_claim", revision: 1, claimed: !existed, attempt };
      } else {
        const reply: Reply = await f.h.client.rpc(name, args);
        if (name === "d1_load_unsigned_transaction") unsigned = object(object(reply.data).transaction);
        return hooks.reply(name, reply);
      }
      return hooks.reply(name, { data: structuredClone(data), error: null });
    },
  };
  const configuration = {
    namespace, pool, now: () => f.h.now, maximumAgeSeconds: 30, futureToleranceSeconds: 2,
    source: { async readAccountAtCheckpoint() { trace.push("account"); return await f.h.source.readAccountAtCheckpoint(); } },
    loadPoolSigner() { trace.push("signer"); keys++; return signer; },
  } satisfies Omit<Parameters<typeof submitInitialIssuance>[1], "requestId" | "authenticatedAdmin">;
  const fetcher: typeof fetch = async (url, init) => {
    trace.push("POST"); posts.push({ url: String(url), init: init! }); return await hooks.transport();
  };
  // A variable permits additive optional route dependencies against the unchanged factory type.
  // No request identity, caller account facts, or authorization-result callback enters this DI.
  const handlerConfiguration = { poolSigner: Keypair.fromPublicKey(pool), now: () => f.h.now,
    issuance: { client, configuration, fetcher } };
  const handler = createCustodyHandler(handlerConfiguration);
  function request(change: ObjectDTO = {}, badSignature = false) {
    const message: ObjectDTO = { version: 1, network: "TESTNET", pool, namespace, action: "issue", request_id: requestId,
      timestamp: f.h.now, payload: {}, wallet: admin, ...change };
    const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
    const signature = (badSignature ? Keypair.fromRawEd25519Seed(Buffer.alloc(32, 102)) : wallet)
      .sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical))).toString("base64");
    return new Request("https://local.invalid/functions/v1/d1-custody/issue", {
      method: "POST", body: JSON.stringify({ ...message, signature }),
    });
  }
  const stored = () => JSON.stringify([f.h.owner, f.h.history, f.h.credit, f.h.records, [...f.h.persisted], signed, attempt]);
  const counters = () => [keys, posts.length, f.h.persisted.size];
  const clear = () => { trace.length = 0; calls.length = 0; f.h.calls.length = 0; };
  const offline = () => {
    const forbidden = (): never => { throw Error("PRIVATE_PROVIDER_FORBIDDEN"); };
    configuration.loadPoolSigner = forbidden; configuration.source.readAccountAtCheckpoint = forbidden; hooks.transport = forbidden;
  };
  return { f, hooks, handler, request, trace, calls, posts, stored, counters, clear, offline,
    get signed() { return signed!; }, get attempt() { return attempt!; }, get keys() { return keys; } };
}
type Harness = ReturnType<typeof setup>;
async function response(reply: Response, status: number, body: unknown) {
  equal(reply.status, status);
  equal([...reply.headers], [["cache-control", "no-store"], ["content-type", "application/json"]]);
  equal(await reply.text(), JSON.stringify(body));
}
async function pending(h: Harness, request = h.request()) {
  const reply = await h.handler(request);
  // Assert status first: the baseline failure must be a real public 404 versus 202.
  equal(reply.status, 202);
  await response(reply, 202, { state: "pending", verification: "unverified", requestId, transactionHash: h.signed.transaction_hash });
}
async function rejected(h: Harness, code: string, status = 503, request = h.request()) {
  const before = h.stored(), counters = h.counters();
  await response(await h.handler(request), status, { error: code });
  equal(h.stored(), before); equal(h.counters(), counters);
}
function requestArguments(h: Harness) {
  const scoped = [outcomeLoad, load, claim, "d1_load_signed_transaction", "d1_record_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"];
  for (const { name, args } of h.calls.filter(c => scoped.includes(c.name))) {
    equal([args.p_request_id, args.p_authorized_by], [requestId, admin]);
    const scope = { p_request_id: requestId, p_authorized_by: admin };
    if ([outcomeLoad, load, "d1_load_signed_transaction", "d1_load_unsigned_transaction"].includes(name)) equal(args, scope);
    if (name === claim) equal(args, { ...scope, p_snapshot_hash: h.attempt.snapshot_hash, p_attempt_id: h.attempt.attempt_id });
    if (name === "d1_record_signed_transaction") equal(args, { ...scope, p_snapshot_hash: h.signed.snapshot_hash, p_signed_xdr: h.signed.signed_xdr });
    if (name === "d1_load_initial_financial_observation") equal(args, { ...scope, p_snapshot_hash: h.signed.snapshot_hash });
  }
}
Deno.test("issue HTTP canonical proof reaches real fresh SDK signing and one durable-claim POST; acknowledgement is only pending", async () => {
  const h = setup(), principal = JSON.stringify([h.f.h.owner, h.f.h.history, h.f.h.credit, h.f.h.records]);
  await pending(h);
  equal([h.keys, h.posts.length, h.f.h.persisted.size], [1, 1, 1]);
  equal(JSON.stringify([h.f.h.owner, h.f.h.history, h.f.h.credit, h.f.h.records]), principal);
  equal(h.trace.slice(0, 2), [outcomeLoad, load]); equal(h.trace.slice(-2), [claim, "POST"]);
  equal(h.trace.indexOf("account") < h.trace.indexOf("signer"), true);
  equal(h.trace.indexOf("d1_record_fresh_initial_financial_observation") < h.trace.indexOf("signer"), true);
  equal(h.trace.indexOf("signer") < h.trace.indexOf("d1_record_signed_transaction"), true);
  equal(h.trace.filter(n => n === claim).length, 1); requestArguments(h);
  const { url, init } = h.posts[0];
  equal([url, init.method, init.redirect, init.credentials], ["https://horizon-testnet.stellar.org/transactions", "POST", "error", "omit"]);
  equal([...new Headers(init.headers)], [["accept", "application/json"], ["content-type", "application/x-www-form-urlencoded"]]);
  equal(init.body, new URLSearchParams({ tx: h.signed.signed_xdr }).toString());
});
Deno.test("issue HTTP existing validated 031 survives fresh proof timestamps and concurrent requests with no provider or resubmission", async () => {
  const h = setup(); await pending(h); h.offline(); h.clear(); h.f.h.now++;
  const before = h.stored(), counters = h.counters();
  await Promise.all([pending(h), pending(h, h.request({ timestamp: h.f.h.now - 1 }))]);
  equal(h.stored(), before); equal(h.counters(), counters); requestArguments(h);
  equal(h.trace.filter(n => n === load).length, 2);
  equal(h.trace.filter(n => ![outcomeLoad, load, "d1_load_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"].includes(n)), []);
});
Deno.test("issue HTTP rejects invalid stale and wrong-scope wallet proofs before any RPC signer or provider", async () => {
  for (const [change, badSignature, code, status] of [
    [{}, true, "invalid_signature", 401], [{ timestamp: 0 }, false, "stale_request", 401],
    [{ namespace: requestId }, false, "invalid_request", 400], [{ pool: team }, false, "invalid_request", 400],
    [{ payload: { amount: "1.0000000" } }, false, "invalid_request", 400],
  ] as const) {
    const h = setup(); await rejected(h, code, status, h.request(change, badSignature));
    equal([h.trace, h.calls, h.f.h.calls, h.counters()], [[], [], [], [0, 0, 0]]);
  }
});
Deno.test("issue HTTP current database admin denial is distinct from dependency exceptions and never reaches signer or network", async () => {
  for (const exactDenial of [true, false]) {
    const h = setup(); h.hooks.reply = () => {
      if (!exactDenial) throw new CustodyError("unauthorized_admin_wallet", 403);
      return { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
    };
    await rejected(h, exactDenial ? "unauthorized_admin_wallet" : "initial_submission_unavailable", exactDenial ? 403 : 503);
    equal(h.trace, [outcomeLoad]); equal(h.f.h.calls, []); equal(h.counters(), [0, 0, 0]); requestArguments(h);
  }
});
Deno.test("issue HTTP refuses forged stored signed envelopes and submission receipts without new financial effects or resubmission", async () => {
  for (const fault of ["signed_xdr", "envelope_hash", "attempt_hash", "attempt_scope"]) {
    const h = setup(); await pending(h); h.offline(); h.clear();
    h.hooks.reply = (name, reply) => {
      const data = object(reply.data);
      if (name === "d1_load_signed_transaction") {
        const signed = object(data.transaction);
        if (fault === "signed_xdr") signed.signed_xdr = "PRIVATE_FORGED_ENVELOPE";
        if (fault === "envelope_hash") signed.envelope_hash = "0".repeat(64);
      }
      if (name === load) {
        const attempt = object(data.attempt);
        if (fault === "attempt_hash") attempt.transaction_hash = "0".repeat(64);
        if (fault === "attempt_scope") attempt.namespace = requestId;
      }
      return reply;
    };
    await rejected(h, "initial_submission_unavailable"); requestArguments(h);
    equal(h.trace.filter(n => ![outcomeLoad, load, "d1_load_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"].includes(n)), []);
  }
});
Deno.test("issue HTTP unknown 031 commit is sanitized and never posts retries reads back resets or releases ownership", async () => {
  const h = setup(); h.hooks.unknownClaim = true;
  const principal = JSON.stringify([h.f.h.owner, h.f.h.history, h.f.h.credit, h.f.h.records]);
  await response(await h.handler(h.request()), 503, { error: "initial_submission_unavailable" });
  equal([h.keys, h.posts.length, h.trace.at(-1)], [1, 0, claim]);
  equal(h.trace.filter(n => n === claim).length, 1); equal(h.trace.filter(n => n === load).length, 1);
  equal(JSON.stringify([h.f.h.owner, h.f.h.history, h.f.h.credit, h.f.h.records]), principal);
  equal(typeof h.attempt.attempt_id, "string"); requestArguments(h);
  h.hooks.unknownClaim = false; h.offline(); h.clear();
  const before = h.stored(); await pending(h); equal(h.stored(), before); equal(h.posts.length, 0);
});
Deno.test("issue HTTP transport failure retains its durable attempt without automatic retry readback or outcome inference", async () => {
  for (const failure of ["throw", "status", "malformed"]) {
    const h = setup(); h.hooks.transport = async () => {
      if (failure === "throw") throw Error("PRIVATE_TRANSPORT_FAILURE");
      return new Response("PRIVATE_PROVIDER_FAILURE", { status: failure === "status" ? 404 : 200, headers: { "content-type": "application/json" } });
    };
    const principal = JSON.stringify([h.f.h.owner, h.f.h.history, h.f.h.credit, h.f.h.records]);
    await response(await h.handler(h.request()), 503, { error: "initial_submission_unavailable" });
    equal([h.keys, h.posts.length, h.trace.at(-1)], [1, 1, "POST"]);
    equal(h.trace.filter(n => n === claim).length, 1); equal(h.trace.filter(n => n === load).length, 1);
    equal(JSON.stringify([h.f.h.owner, h.f.h.history, h.f.h.credit, h.f.h.records]), principal); requestArguments(h);
    h.offline(); h.clear(); const before = h.stored(); await pending(h); equal(h.stored(), before); equal(h.posts.length, 1);
  }
});
