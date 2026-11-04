import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { createIssuanceCoordinator } from "./issuance-coordinator.ts";
import { signInitialAuthorizedIssuance, type InitialSignerConfiguration } from "./initial-authorized-signer.ts";

type Client = Parameters<typeof signInitialAuthorizedIssuance>[0];
type DTO = Record<string, unknown>;
const unavailable = () => new CustodyError("signed_transaction_unavailable", 503);
function check(v: unknown): asserts v { if (!v) throw unavailable(); }
function object(v: unknown): v is DTO { return v !== null && typeof v === "object" && !Array.isArray(v); }
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  return object(a) && object(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
}
// Snapshot untrusted RPC DTOs before reading any field, following the accepted gate's budgets.
function copy<T>(v: T): T {
  const seen = new Set<object>(); let nodes = 0, characters = 0;
  function visit(x: unknown, depth: number) {
    check(++nodes <= 20000 && depth <= 40);
    if (typeof x === "string") { check((characters += x.length) <= 2097152); return; }
    if (x === null || typeof x === "boolean") return;
    if (typeof x === "number") { check(Number.isFinite(x)); return; }
    check(typeof x === "object" && x !== null && !seen.has(x)); seen.add(x);
    check(Object.getPrototypeOf(x) === (Array.isArray(x) ? Array.prototype : Object.prototype) || Object.getPrototypeOf(x) === null);
    check(Object.getOwnPropertySymbols(x).length === 0);
    if (Array.isArray(x)) check(x.length <= 20000 && Object.keys(x).length === x.length && Object.keys(x).every((k, i) => k === String(i)));
    const ds = Object.getOwnPropertyDescriptors(x); check(Object.keys(ds).length === Object.keys(x).length + (Array.isArray(x) ? 1 : 0));
    for (const [k, d] of Object.entries(ds)) { check(!d.get && !d.set); if (Array.isArray(x) && k === "length") continue; check(d.enumerable && (characters += k.length) <= 2097152); visit(d.value, depth + 1); }
  }
  visit(v, 0); const text = JSON.stringify(v); check(new TextEncoder().encode(text).length <= 2097152); return JSON.parse(text);
}
/** Internal evidence only: not an HTTP response, broadcast or fresh execution permission. */
export async function ensureInitialSignedIssuance(client: Client, configuration: InitialSignerConfiguration): Promise<DTO> {
  let denied = false;
  try {
    const { namespace, pool, requestId, authenticatedAdmin } = configuration;
    check([namespace, requestId].every(v => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)));
    Keypair.fromPublicKey(pool); Keypair.fromPublicKey(authenticatedAdmin);
    const args = { p_request_id: requestId, p_authorized_by: authenticatedAdmin };
    const bound = (v: unknown, kind: string, fields: number): v is DTO => object(v) && Object.keys(v).length === fields && v.kind === kind && v.revision === 1 &&
      v.request_id === requestId && v.namespace === namespace && v.network === "TESTNET" && v.pool === pool;
    const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
    const rpc = async (name: string, parameters: Record<string, unknown>) => {
      const reply = copy(await client.rpc(name, parameters));
      check(object(reply) && Object.hasOwn(reply, "data") && Object.hasOwn(reply, "error"));
      if (reply.error !== null) {
        if (reply.data === null && object(reply.error) && reply.error.code === "42501" && reply.error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    const lookup = await rpc("d1_load_signed_transaction", args);
    check(bound(lookup, "d1_signed_transaction_lookup", 7) && (lookup.transaction === null || object(lookup.transaction)));
    // Validate even the preliminary stored shape before invoking any private provider.
    const shape = (v: unknown): v is DTO => bound(v, "d1_signed_transaction_journal", 12) && typeof v.authorized_by === "string" &&
      hash(v.transaction_hash) && hash(v.snapshot_hash) && hash(v.envelope_hash) && object(v.reservation) &&
      typeof v.signed_xdr === "string" && v.signed_xdr.length > 0 && v.signed_xdr.length <= 65536;
    if (lookup.transaction !== null) check(shape(lookup.transaction));
    let receipt: unknown = lookup.transaction, unsignedXdr: string, reservation: unknown, expectedSnapshot: unknown;
    if (receipt !== null) {
      const never = async (): Promise<never> => { throw unavailable(); };
      const unsigned = await createIssuanceCoordinator({ pool, database: {
        async loadUnsignedTransaction(id, admin) { return await rpc("d1_load_unsigned_transaction", { p_request_id: id, p_authorized_by: admin }); },
        saveUnsignedTransaction: never, registerIssuanceIntent: never, reserveIssuanceSequence: never,
      }, observeAccount: never, now() { throw unavailable(); }, fee() { throw unavailable(); } })(requestId, authenticatedAdmin);
      unsignedXdr = unsigned.unsignedXdr; reservation = unsigned.reservation;
    } else {
      // The accepted signer owns the fresh financial gate and key-provider ordering.
      const signed = await signInitialAuthorizedIssuance({ async rpc(name, parameters) { return { data: await rpc(name, parameters), error: null }; } }, configuration);
      unsignedXdr = signed.authorization.unsignedXdr; reservation = signed.authorization.snapshot.commitment.reservation;
      expectedSnapshot = signed.authorization.snapshot;
      receipt = await rpc("d1_record_signed_transaction", { ...args, p_snapshot_hash: signed.authorization.receipt.snapshot_hash, p_signed_xdr: signed.signedXdr });
      check(shape(receipt) && receipt.signed_xdr === signed.signedXdr && receipt.snapshot_hash === signed.authorization.receipt.snapshot_hash);
    }
    check(shape(receipt) && bound(reservation, "d1_issuance_sequence_reservation", 9) && same(receipt.reservation, reservation));
    Keypair.fromPublicKey(receipt.authorized_by as string); // Preserve the original actor, including concurrent exact replay.
    const unsigned = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
    const signed = TransactionBuilder.fromXDR(receipt.signed_xdr as string, Networks.TESTNET);
    check(unsigned instanceof Transaction && signed instanceof Transaction && unsigned.signatures.length === 0 &&
      unsigned.toEnvelope().switch().name === "envelopeTypeTx" && signed.toEnvelope().switch().name === "envelopeTypeTx" &&
      signed.toXDR() === receipt.signed_xdr && signed.source === pool && signed.signatures.length === 1 &&
      signed.toEnvelope().v1().tx().toXDR("base64") === unsigned.toEnvelope().v1().tx().toXDR("base64") &&
      signed.hash().toString("hex") === receipt.transaction_hash && unsigned.hash().toString("hex") === receipt.transaction_hash);
    const verifier = Keypair.fromPublicKey(pool), signature = signed.signatures[0];
    check(signature.hint().toString("hex") === verifier.signatureHint().toString("hex") && verifier.verify(signed.hash(), signature.signature()));
    const envelopeHash = Buffer.from(await crypto.subtle.digest("SHA-256", Buffer.from(receipt.signed_xdr as string, "base64"))).toString("hex");
    check(envelopeHash === receipt.envelope_hash);
    const membership = await rpc("d1_load_initial_financial_observation", { ...args, p_snapshot_hash: receipt.snapshot_hash });
    check(bound(membership, "d1_initial_financial_observation_lookup", 9) && membership.transaction_hash === receipt.transaction_hash && membership.snapshot_hash === receipt.snapshot_hash);
    const observed = membership.observation;
    check(bound(observed, "d1_initial_financial_observation", 10) && observed.transaction_hash === receipt.transaction_hash && observed.snapshot_hash === receipt.snapshot_hash && typeof observed.authorized_by === "string");
    Keypair.fromPublicKey(observed.authorized_by);
    const snapshot = observed.snapshot;
    check(object(snapshot) && snapshot.kind === "d1_initial_financial_snapshot" && snapshot.revision === 1 && snapshot.namespace === namespace && snapshot.network === "TESTNET" &&
      snapshot.pool === pool && snapshot.requestId === requestId && object(snapshot.commitment) && same(snapshot.commitment.reservation, reservation));
    if (expectedSnapshot !== undefined) check(same(snapshot, expectedSnapshot));
    return receipt;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
