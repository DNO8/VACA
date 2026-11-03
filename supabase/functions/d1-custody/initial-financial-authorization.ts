import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { observeInitialFinancialSnapshot } from "./initial-financial-snapshot.ts";
import { createIssuanceCoordinator } from "./issuance-coordinator.ts";

type Client = Parameters<typeof observeInitialFinancialSnapshot>[0];
type Configuration = Parameters<typeof observeInitialFinancialSnapshot>[1];
type Snapshot = Awaited<ReturnType<typeof observeInitialFinancialSnapshot>>;
export interface InitialFinancialAuthorization {
  readonly snapshot: Snapshot; readonly receipt: Record<string, unknown>;
  readonly unsignedXdr: string; readonly transactionHash: string;
}
const unavailable = () => new CustodyError("initial_financial_authorization_unavailable", 503);
function check(v: unknown): asserts v { if (!v) throw unavailable(); }
function object(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === "object" && !Array.isArray(v); }
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  return object(a) && object(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
}
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
/** Trusted backend composition, not an HTTP authentication or caller-supplied receipt API. */
export async function withInitialFinancialAuthorization<T>(client: Client, configuration: Configuration, action: (authorization: InitialFinancialAuthorization) => T | Promise<T>): Promise<T> {
  let denied = false, authorization: InitialFinancialAuthorization;
  try {
    const { namespace, pool, requestId, authenticatedAdmin, source, maximumAgeSeconds, futureToleranceSeconds } = configuration;
    const now = configuration.now.bind(configuration);
    const clock = () => { const n = now(); check(Number.isSafeInteger(n) && n >= 0); return n; };
    const allowed = new Set(["d1_load_issuance_fee_commitments", "d1_load_unsigned_transaction", "d1_load_transaction_history_state", "d1_list_transaction_records", "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit"]);
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const reply = copy(await client.rpc(name, args));
      check(object(reply) && Object.hasOwn(reply, "data") && Object.hasOwn(reply, "error"));
      if (reply.error !== null) {
        if (reply.data === null && object(reply.error) && reply.error.code === "42501" && reply.error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return { data: reply.data, error: null };
    };
    const readOnly: Client = { async rpc(name, args) { check(allowed.has(name)); return await rpc(name, args); } };
    const observed = await observeInitialFinancialSnapshot(readOnly, { namespace, pool, requestId, authenticatedAdmin, source, maximumAgeSeconds, futureToleranceSeconds, now });
    // Generated DTO intentionally aliases its original donation. Normalize only these trusted facts.
    const text = JSON.stringify(observed); check(new TextEncoder().encode(text).length <= 1048576);
    const snapshot = JSON.parse(text) as Snapshot;
    const never = async (): Promise<never> => { throw unavailable(); };
    const unsigned = await createIssuanceCoordinator({ pool,
      database: { async loadUnsignedTransaction(id, admin) { return (await readOnly.rpc("d1_load_unsigned_transaction", { p_request_id: id, p_authorized_by: admin })).data; },
        saveUnsignedTransaction: never, registerIssuanceIntent: never, reserveIssuanceSequence: never },
      observeAccount: never, now() { throw unavailable(); }, fee() { throw unavailable(); },
    })(requestId, authenticatedAdmin);
    check(same(unsigned.reservation, snapshot.commitment.reservation));
    const transactionHash = TransactionBuilder.fromXDR(unsigned.unsignedXdr, Networks.TESTNET).hash().toString("hex");
    const before = clock(); check(before >= snapshot.observedAt && before < snapshot.expiresAt);
    // One awaited save only. An independent outgoing copy cannot mutate the expected SDK facts.
    const receipt = (await rpc("d1_record_fresh_initial_financial_observation", { p_request_id: requestId, p_authorized_by: authenticatedAdmin, p_snapshot: JSON.parse(text) })).data;
    const bound = (v: unknown, kind: string, fields: number): v is Record<string, unknown> => object(v) && Object.keys(v).length === fields && v.kind === kind && v.revision === 1 &&
      v.request_id === requestId && v.namespace === namespace && v.network === "TESTNET" && v.pool === pool && v.transaction_hash === transactionHash;
    check(bound(receipt, "d1_fresh_initial_financial_observation", 12) && receipt.authorized_by === authenticatedAdmin && typeof receipt.snapshot_hash === "string" && /^[0-9a-f]{64}$/.test(receipt.snapshot_hash) && receipt.expires_at === snapshot.expiresAt);
    const original = receipt.observation;
    check(bound(original, "d1_initial_financial_observation", 10) && original.snapshot_hash === receipt.snapshot_hash && typeof original.authorized_by === "string" && same(original.snapshot, snapshot));
    Keypair.fromPublicKey(original.authorized_by);
    const after = clock(); check(after >= before && after < snapshot.expiresAt && typeof receipt.validated_at === "number" && Number.isSafeInteger(receipt.validated_at) && receipt.validated_at >= before - 2 && receipt.validated_at <= after + 2 && receipt.validated_at < snapshot.expiresAt);
    authorization = Object.freeze({ snapshot, receipt, unsignedXdr: unsigned.unsignedXdr, transactionHash });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
  // The owning runtime must sanitize its own action failures. Never retry or release on them.
  return await action(authorization);
}
