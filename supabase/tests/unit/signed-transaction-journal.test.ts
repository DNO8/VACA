import { Keypair, Networks, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { ensureInitialSignedIssuance } from "../../functions/d1-custody/signed-transaction-journal.ts";
import { fixture, equal, pool, admin, team, namespace, requestId } from "../fixtures/initial-financial-authorization.ts";
const load = "d1_load_signed_transaction", save = "d1_record_signed_transaction", observation = "d1_load_initial_financial_observation";
const key = () => Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101));
type DTO = Record<string, any>;
type Reply = { data: any; error: unknown };
function setup(issued = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture();
  const scope = { request_id: requestId, namespace, network: "TESTNET", pool };
  const trace: string[] = []; let stored: DTO | null = null, keys = 0, unsigned: DTO;
  const hooks = { reply: (_name: string, reply: Reply): Reply => reply, afterSave: () => {}, actor: admin };
  const client = { async rpc(name: string, args: Record<string, unknown>) {
    trace.push(name); let data: unknown;
    if (name === load) data = { kind: "d1_signed_transaction_lookup", revision: 1, ...scope, transaction: stored };
    else if (name === observation) data = { kind: "d1_initial_financial_observation_lookup", revision: 1, ...scope,
      transaction_hash: unsigned.transaction_hash, snapshot_hash: args.p_snapshot_hash, observation: f.h.persisted.get(String(args.p_snapshot_hash)) ?? null };
    else if (name === save) {
      equal(Object.keys(args).sort(), ["p_authorized_by", "p_request_id", "p_signed_xdr", "p_snapshot_hash"]);
      equal([args.p_request_id, args.p_authorized_by], [requestId, admin]);
      stored = { kind: "d1_signed_transaction_journal", revision: 1, ...scope, authorized_by: hooks.actor,
        transaction_hash: unsigned.transaction_hash, snapshot_hash: args.p_snapshot_hash, signed_xdr: args.p_signed_xdr,
        envelope_hash: Buffer.from(await crypto.subtle.digest("SHA-256", Buffer.from(String(args.p_signed_xdr), "base64"))).toString("hex"), reservation: structuredClone(unsigned.reservation) };
      hooks.afterSave(); data = stored;
    } else {
      const reply = await f.h.client.rpc(name, args);
      if (name === "d1_load_unsigned_transaction") unsigned = structuredClone(reply.data.transaction);
      return hooks.reply(name, reply);
    }
    return hooks.reply(name, { data: structuredClone(data), error: null });
  } };
  const configuration = { ...f.configuration, loadPoolSigner() { keys++; return key(); } };
  return { f, client, configuration, hooks, trace, get stored() { return stored!; }, get keys() { return keys; } };
}
type H = ReturnType<typeof setup>;
const state = (h: H) => JSON.stringify([h.f.h.owner, h.f.h.history, h.f.h.credit, h.f.h.records]);
async function rejected(h: H, status = 503) {
  const before = state(h); let caught: unknown;
  try { await ensureInitialSignedIssuance(h.client, h.configuration); } catch (e) { caught = e; }
  const code = status === 403 ? "unauthorized_admin_wallet" : "signed_transaction_unavailable";
  equal(caught instanceof CustodyError ? [caught.code, caught.status, caught.message] : caught, [code, status, code]); equal(state(h), before);
}
function offline(h: H) {
  h.configuration.now = () => { throw Error("clock forbidden"); };
  h.configuration.loadPoolSigner = () => { throw Error("key forbidden"); };
  h.configuration.source.readAccountAtCheckpoint = async () => { throw Error("source forbidden"); };
  h.trace.length = 0; h.f.h.calls.length = 0;
}
Deno.test("signed journal saves native and issued SDK bytes once; historical replay needs no clock, key or fresh write", async () => {
  for (const issued of [false, true]) {
    const h = setup(issued), before = state(h); h.hooks.actor = team;
    const receipt = await ensureInitialSignedIssuance(h.client, h.configuration);
    equal(receipt, h.stored); equal(receipt.authorized_by, team); equal(h.keys, 1); equal(state(h), before);
    equal(h.trace[0], load); equal(h.trace.filter(n => n === save).length, 1);
    const tx = TransactionBuilder.fromXDR(String(receipt.signed_xdr), Networks.TESTNET);
    if (!(tx instanceof Transaction)) throw Error("envelope");
    equal(tx.signatures.length, 1); equal(key().verify(tx.hash(), tx.signatures[0].signature()), true);
    offline(h); equal(await ensureInitialSignedIssuance(h.client, h.configuration), receipt);
    equal(h.trace, [load, "d1_load_unsigned_transaction", observation]); equal(h.keys, 1);
  }
});
Deno.test("signed journal rejects forged signed bodies networks signatures hints hashes scope reservation and snapshot membership", async () => {
  for (const fault of ["body", "network", "sig", "hint", "hash", "transaction", "namespace", "request", "pool", "reservation", "snapshot", "membership", "unsigned"]) {
    const h = setup(); await ensureInitialSignedIssuance(h.client, h.configuration); offline(h);
    h.hooks.reply = (name, reply) => {
      if (name === load) {
        const r = reply.data.transaction;
        if (["body", "network", "sig", "hint"].includes(fault)) {
          const tx = TransactionBuilder.fromXDR(r.signed_xdr, Networks.TESTNET) as Transaction;
          if (fault === "body") { const env = tx.toEnvelope(); env.v1().tx().fee(101); r.signed_xdr = env.toXDR("base64"); }
          else { tx.signatures.length = 0;
            if (fault === "network") tx.signatures.push(key().signDecorated(TransactionBuilder.fromXDR(r.signed_xdr, Networks.PUBLIC).hash()));
            else tx.signatures.push(new xdr.DecoratedSignature({ hint: fault === "hint" ? Buffer.alloc(4) : key().signatureHint(), signature: fault === "sig" ? Buffer.alloc(64) : key().sign(tx.hash()) }));
            r.signed_xdr = tx.toXDR(); }
        }
        if (fault === "hash") r.envelope_hash = "0".repeat(64);
        if (fault === "transaction") r.transaction_hash = "0".repeat(64);
        if (fault === "namespace") r.namespace = requestId;
        if (fault === "request") r.request_id = namespace;
        if (fault === "pool") r.pool = team;
        if (fault === "reservation") r.reservation.transaction_sequence = "4";
        if (fault === "snapshot") r.snapshot_hash = "0".repeat(64);
      }
      if (name === observation && fault === "membership") reply.data.observation.snapshot.requestId = namespace;
      if (name === "d1_load_unsigned_transaction" && fault === "unsigned") reply.data.transaction.unsigned_xdr = "AAAA";
      return reply;
    };
    await rejected(h); equal(h.keys, 1); equal(h.trace.includes(save), false);
  }
});
Deno.test("signed journal rejects internally consistent signed replacement bytes and signature count changes", async () => {
  for (const fault of ["body", "none", "two"]) {
    const h = setup(); await ensureInitialSignedIssuance(h.client, h.configuration); offline(h);
    const env = TransactionBuilder.fromXDR(h.stored.signed_xdr, Networks.TESTNET).toEnvelope();
    if (fault === "body") env.v1().tx().fee(101);
    const tx = TransactionBuilder.fromXDR(env.toXDR("base64"), Networks.TESTNET) as Transaction;
    tx.signatures.length = 0; if (fault !== "none") tx.sign(key()); if (fault === "two") tx.sign(key());
    h.stored.signed_xdr = tx.toXDR(); h.stored.transaction_hash = tx.hash().toString("hex");
    h.stored.envelope_hash = Buffer.from(await crypto.subtle.digest("SHA-256", Buffer.from(tx.toXDR(), "base64"))).toString("hex");
    await rejected(h); equal(h.trace.includes(save), false);
  }
});
Deno.test("signed journal awaits its one record response before publishing any result", async () => {
  const h = setup(); let entered!: () => void, release!: () => void, finished = false;
  const enteredSave = new Promise<void>(resolve => { entered = resolve; }), response = new Promise<void>(resolve => { release = resolve; });
  const client = { async rpc(name: string, args: Record<string, unknown>) { const reply = await h.client.rpc(name, args); if (name === save) { entered(); await response; } return reply; } };
  const pending = ensureInitialSignedIssuance(client, h.configuration).then(receipt => { finished = true; return receipt; });
  await enteredSave; equal(finished, false); equal(h.trace.at(-1), save); release();
  equal(await pending, h.stored); equal(h.trace.filter(n => n === save).length, 1);
});
Deno.test("signed journal bounds untrusted JSON before private providers without invoking getters", async () => {
  for (const fault of ["getter", "cycle", "alias", "sparse", "bytes", "nodes", "missing", "extra", "namespace", "request", "pool", "network"]) {
    const h = setup(); let reads = 0;
    h.hooks.reply = (name, reply) => {
      if (name !== load) return reply;
      if (fault === "getter") Object.defineProperty(reply.data, "transaction", { enumerable: true, get() { reads++; throw Error("getter"); } });
      if (fault === "cycle") reply.data.bad = reply.data;
      if (fault === "alias") { const a = {}; reply.data.bad = [a, a]; }
      if (fault === "sparse") reply.data.bad = Array(2);
      if (fault === "bytes") reply.data.bad = "x".repeat(2097153);
      if (fault === "nodes") reply.data.bad = Array(20001).fill(null);
      if (fault === "missing") delete reply.data.transaction;
      if (fault === "extra") reply.data.extra = true;
      if (fault === "namespace") reply.data.namespace = requestId;
      if (fault === "request") reply.data.request_id = namespace;
      if (fault === "pool") reply.data.pool = team;
      if (fault === "network") reply.data.network = "PUBLIC";
      return reply;
    };
    await rejected(h); equal([h.keys, reads, h.trace], [0, 0, [load]]);
  }
});
Deno.test("signed journal distinguishes explicit database denial from transport provider and source forged 403", async () => {
  for (const fault of ["db", "transport", "data", "provider", "source"]) {
    const h = setup(), forged = () => { throw new CustodyError("unauthorized_admin_wallet", 403); };
    h.hooks.reply = (name, reply) => {
      if (name !== load) return reply;
      if (fault === "transport") return forged();
      if (fault === "db" || fault === "data") return { data: fault === "db" ? null : {}, error: { code: "42501", message: "unauthorized_admin_wallet" } };
      return reply;
    };
    if (fault === "provider") h.configuration.loadPoolSigner = forged;
    if (fault === "source") h.configuration.source.readAccountAtCheckpoint = forged;
    await rejected(h, fault === "db" ? 403 : 503); equal(h.trace.includes(save), false);
  }
});
Deno.test("signed journal unknown save has one attempt no readback or ownership changes; explicit later replay recovers", async () => {
  const h = setup(); h.hooks.afterSave = () => { throw Error("unknown DO_NOT_LEAK"); };
  await rejected(h); equal(h.trace.at(-1), save); equal(h.trace.filter(n => n === save).length, 1);
  h.hooks.afterSave = () => {}; offline(h); equal(await ensureInitialSignedIssuance(h.client, h.configuration), h.stored);
});
Deno.test("signed journal validates the whole saved receipt and original snapshot before returning", async () => {
  for (const fault of ["actor", "reservation", "snapshot", "envelope", "missingObservation"]) {
    const h = setup(); h.hooks.reply = (name, reply) => {
      if (name === save) { const r = reply.data; if (fault === "actor") r.authorized_by = "bad"; if (fault === "reservation") r.reservation.transaction_sequence = "7";
        if (fault === "snapshot") r.snapshot_hash = "0".repeat(64); if (fault === "envelope") r.envelope_hash = "0".repeat(64); }
      if (name === observation && fault === "missingObservation") reply.data.observation = null;
      return reply;
    };
    await rejected(h); equal(h.trace.filter(n => n === save).length, 1);
  }
});
