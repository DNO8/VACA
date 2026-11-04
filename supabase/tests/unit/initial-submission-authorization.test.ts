import { Keypair, TransactionBuilder, Networks, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { withInitialSubmissionAuthorization } from "../../functions/d1-custody/initial-submission-authorization.ts";
import { fixture, equal, pool, admin, team, namespace, requestId } from "../fixtures/initial-financial-authorization.ts";
const load = "d1_load_submission_attempt", claim = "d1_claim_submission_attempt", fresh = "d1_record_fresh_initial_financial_observation";
type DTO = Record<string, any>;
type Reply = { data: any; error: unknown };
function setup(issued = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture();
  const scope = { request_id: requestId, namespace, network: "TESTNET", pool }, trace: string[] = [];
  let signed: DTO | null = null, attempt: DTO | null = null, unsigned: DTO, keys = 0, actions = 0;
  const hooks = { reply: (_name: string, r: Reply): Reply => r, afterClaim: () => {}, afterSigned: () => {}, lose: false };
  const client = { async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
    trace.push(name); let data: unknown;
    if (name === load) data = { kind: "d1_submission_attempt_lookup", revision: 1, ...scope, attempt };
    else if (name === "d1_load_signed_transaction") data = { kind: "d1_signed_transaction_lookup", revision: 1, ...scope, transaction: signed };
    else if (name === fresh) {
      const snapshot = structuredClone(args.p_snapshot), snapshotHash = digest(Buffer.from(JSON.stringify(snapshot))).toString("hex");
      const observation = { kind: "d1_initial_financial_observation", revision: 1, ...scope, authorized_by: admin,
        transaction_hash: unsigned.transaction_hash, snapshot_hash: snapshotHash, snapshot };
      f.h.persisted.set(snapshotHash, observation);
      data = { kind: "d1_fresh_initial_financial_observation", revision: 1, ...scope, authorized_by: admin,
        transaction_hash: unsigned.transaction_hash, snapshot_hash: snapshotHash, validated_at: f.h.now, expires_at: (snapshot as DTO).expiresAt, observation };
    } else if (name === "d1_load_initial_financial_observation") data = { kind: "d1_initial_financial_observation_lookup", revision: 1, ...scope,
      transaction_hash: unsigned.transaction_hash, snapshot_hash: args.p_snapshot_hash, observation: f.h.persisted.get(String(args.p_snapshot_hash)) ?? null };
    else if (name === "d1_record_signed_transaction") {
      signed = { kind: "d1_signed_transaction_journal", revision: 1, ...scope, authorized_by: admin, transaction_hash: unsigned.transaction_hash,
        snapshot_hash: args.p_snapshot_hash, signed_xdr: args.p_signed_xdr, envelope_hash: digest(Buffer.from(String(args.p_signed_xdr), "base64")).toString("hex"), reservation: structuredClone(unsigned.reservation) };
      hooks.afterSigned(); data = signed;
    } else if (name === claim) {
      equal(Object.keys(args).sort(), ["p_request_id", "p_authorized_by", "p_snapshot_hash", "p_attempt_id"].sort());
      equal([args.p_request_id, args.p_authorized_by], [requestId, admin]);
      const exists = attempt !== null;
      attempt ??= { kind: "d1_submission_attempt", revision: 1, ...scope, authorized_by: hooks.lose ? team : admin,
        transaction_hash: signed!.transaction_hash, envelope_hash: signed!.envelope_hash, snapshot_hash: args.p_snapshot_hash,
        attempt_id: hooks.lose ? crypto.randomUUID() : args.p_attempt_id, claimed_at: f.h.now, reservation: structuredClone(unsigned.reservation) };
      hooks.afterClaim(); data = { kind: "d1_submission_claim", revision: 1, claimed: !exists && !hooks.lose, attempt };
    } else {
      const r = await f.h.client.rpc(name, args); if (name === "d1_load_unsigned_transaction") unsigned = structuredClone((r.data as DTO).transaction);
      return hooks.reply(name, r);
    }
    return hooks.reply(name, { data: structuredClone(data), error: null });
  } };
  const configuration = { ...f.configuration, loadPoolSigner() { keys++; return Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101)); } };
  const action = (artifact: DTO) => {
    actions++; equal([artifact.signedXdr, artifact.transactionHash], [signed!.signed_xdr, signed!.transaction_hash]);
    equal(Object.isFrozen(artifact) && Object.isFrozen(artifact.attempt.reservation.intent), true);
    const tx = TransactionBuilder.fromXDR(artifact.signedXdr, Networks.TESTNET); equal(tx.hash().toString("hex"), artifact.transactionHash); return "once";
  };
  return { f, client, configuration, action, hooks, trace, get signed() { return signed!; }, get attempt() { return attempt!; }, get keys() { return keys; }, get actions() { return actions; } };
}
type H = ReturnType<typeof setup>;
const state = (h: H) => JSON.stringify([h.f.h.owner, h.f.h.history, h.f.h.credit, h.f.h.records]);
async function reject(h: H, action = h.action, status = 503) {
  const before = state(h); let error: unknown;
  try { await withInitialSubmissionAuthorization(h.client, h.configuration, action); } catch (e) { error = e; }
  const code = status === 403 ? "unauthorized_admin_wallet" : "initial_submission_unavailable";
  equal(error instanceof CustodyError ? [error.code, error.status, error.message] : error, [code, status, code]); equal(state(h), before);
}
function offline(h: H) {
  const fail = () => { throw Error("private/fresh dependency forbidden"); };
  h.configuration.now = fail; h.configuration.loadPoolSigner = fail; h.configuration.source.readAccountAtCheckpoint = fail;
  h.trace.length = 0;
}
Deno.test("submission gate internally signs native/issued, claims once and invokes only after durable acknowledgement", async () => {
  for (const issued of [false, true]) {
    const h = setup(issued), before = state(h); h.hooks.afterSigned = () => { h.f.h.now++; };
    const result = await withInitialSubmissionAuthorization(h.client, h.configuration, h.action);
    equal([result.invoked, h.actions, h.keys], [true, 1, 1]); if (result.invoked) equal(result.value, "once");
    equal(h.attempt.snapshot_hash !== h.signed.snapshot_hash, true);
    equal(h.trace[0], load); equal(h.trace.filter(n => n === claim).length, 1); equal(state(h), before);
    h.attempt.authorized_by = team; offline(h);
    const historical = await withInitialSubmissionAuthorization(h.client, h.configuration, h.action);
    equal([historical.invoked, historical.attempt.authorized_by, h.actions], [false, team, 1]);
    equal(h.trace.filter(n => [fresh, claim, "account", "d1_record_signed_transaction"].includes(n)), []);
  }
});
Deno.test("submission gate historical attempt requires saved signed bytes and its own actual snapshot membership", async () => {
  for (const fault of ["missingSigned", "membership", "reservation"]) {
    const h = setup(); h.hooks.afterSigned = () => { h.f.h.now++; };
    await withInitialSubmissionAuthorization(h.client, h.configuration, h.action); offline(h);
    h.hooks.reply = (n, r) => {
      if (fault === "missingSigned" && n === "d1_load_signed_transaction") r.data.transaction = null;
      if (fault === "membership" && n === "d1_load_initial_financial_observation" && r.data.snapshot_hash === h.attempt.snapshot_hash) r.data.observation.snapshot.requestId = namespace;
      if (fault === "reservation" && n === load) r.data.attempt.reservation.transaction_sequence = "4";
      return r;
    };
    await reject(h); equal([h.keys, h.actions], [1, 1]); equal(h.trace.includes(claim), false);
  }
});
Deno.test("submission gate losing a concurrent claim preserves original nonce/actor and never invokes", async () => {
  const h = setup(); h.hooks.lose = true;
  const result = await withInitialSubmissionAuthorization(h.client, h.configuration, h.action);
  equal([result.invoked, result.attempt.authorized_by, h.actions], [false, team, 0]); equal(h.trace.filter(n => n === claim).length, 1);
});
Deno.test("submission gate rejects acknowledgement scope hashes nonce actor reservation timestamps and shape", async () => {
  for (const fault of ["request_id", "namespace", "network", "pool", "transaction_hash", "envelope_hash", "snapshot_hash", "attempt_id", "authorized_by", "reservation", "claimed_at", "oldtime", "fraction", "flag", "missing", "extra"]) {
    const h = setup(); h.hooks.reply = (name, r) => {
      if (name !== claim) return r; const a = r.data.attempt;
      if (["request_id", "namespace", "attempt_id"].includes(fault)) a[fault] = crypto.randomUUID();
      else if (fault === "network") a.network = "PUBLIC";
      else if (["pool", "authorized_by"].includes(fault)) a[fault] = team;
      else if (fault === "reservation") a.reservation.transaction_sequence = "4";
      else if (fault === "claimed_at") a.claimed_at = h.f.h.now + 3;
      else if (fault === "oldtime") a.claimed_at = h.f.h.now - 3;
      else if (fault === "fraction") a.claimed_at += 0.5;
      else if (fault === "flag") r.data.claimed = 1;
      else if (fault === "missing") delete a.attempt_id;
      else if (fault === "extra") r.data.extra = true;
      else a[fault] = "0".repeat(64); return r;
    };
    await reject(h); equal(h.actions, 0); equal(h.trace.at(-1), claim);
  }
});
Deno.test("submission gate rejects malformed lookup before key load, clock or fresh writes", async () => {
  for (const fault of ["getter", "cycle", "alias", "sparse", "bytes", "scope", "extra"]) {
    const h = setup(); let reads = 0; offline(h);
    h.hooks.reply = (_name, r) => {
      if (fault === "getter") Object.defineProperty(r.data, "attempt", { enumerable: true, get() { reads++; throw Error("getter"); } });
      if (fault === "cycle") r.data.bad = r.data;
      if (fault === "alias") { const a = {}; r.data.bad = [a, a]; }
      if (fault === "sparse") r.data.bad = Array(2);
      if (fault === "bytes") r.data.bad = "x".repeat(2097153);
      if (fault === "scope") r.data.namespace = requestId;
      if (fault === "extra") r.data.extra = true; return r;
    };
    await reject(h); equal([h.actions, h.keys, reads, h.trace], [0, 0, 0, [load]]);
  }
});
Deno.test("submission gate awaits one claim response and checks expiry and clock rollback before action", async () => {
  const h = setup(); let entered!: () => void, release!: () => void, done = false;
  const reached = new Promise<void>(r => entered = r), barrier = new Promise<void>(r => release = r);
  const client = { async rpc(n: string, a: Record<string, unknown>) { const r = await h.client.rpc(n, a); if (n === claim) { entered(); await barrier; } return r; } };
  const pending = withInitialSubmissionAuthorization(client, h.configuration, h.action).then(r => { done = true; return r; });
  await reached; equal([done, h.actions], [false, 0]); release(); equal((await pending).invoked, true);
  for (const fault of ["expiry", "rollback"]) {
    const x = setup(); x.hooks.afterClaim = () => { x.f.h.now = fault === "expiry" ? (x.f.h.persisted.get(x.attempt.snapshot_hash) as DTO).snapshot.expiresAt : x.f.h.now - 1; };
    await reject(x); equal(x.actions, 0); equal(x.trace.at(-1), claim);
  }
});
Deno.test("submission gate unknown claim/action retains ownership without retry readback or later reinvocation", async () => {
  for (const fault of ["claim", "action"]) {
    const h = setup(); if (fault === "claim") h.hooks.afterClaim = () => { throw Error("unknown DO_NOT_LEAK"); };
    let calls = 0; const action = () => { calls++; throw new CustodyError("unauthorized_admin_wallet", 403); };
    await reject(h, action); equal(calls, fault === "action" ? 1 : 0); equal(h.trace.at(-1), claim);
    h.hooks.afterClaim = () => {}; offline(h);
    equal((await withInitialSubmissionAuthorization(h.client, h.configuration, action)).invoked, false); equal(calls, fault === "action" ? 1 : 0);
  }
});
Deno.test("submission gate accepts only explicit database admin denial, not forged transport/provider/source 403", async () => {
  for (const fault of ["db", "transport", "data", "provider", "source"]) {
    const h = setup(), forged = () => { throw new CustodyError("unauthorized_admin_wallet", 403); };
    h.hooks.reply = (n, r) => n !== load ? r : fault === "transport" ? forged() : ["db", "data"].includes(fault) ? { data: fault === "db" ? null : {}, error: { code: "42501", message: "unauthorized_admin_wallet" } } : r;
    if (fault === "provider") h.configuration.loadPoolSigner = forged;
    if (fault === "source") h.configuration.source.readAccountAtCheckpoint = forged;
    await reject(h, h.action, fault === "db" ? 403 : 503); equal(h.actions, 0); equal(h.trace.includes(claim), false);
  }
});
