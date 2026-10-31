import { Keypair, Networks } from "@stellar/stellar-sdk";
import { CustodyError, type Preparation, type VerifiedPayment } from "./handler.ts";
import { planIssuance } from "./issuance-plan.ts";

interface Configuration {
  pool: string;
  database: {
    registerIssuanceIntent(requestId: string, authenticatedAdmin: string): Promise<unknown>;
    reserveIssuanceSequence(requestId: string, authenticatedAdmin: string, sequence: string): Promise<unknown>;
  };
  /** Trusted backend observation only; no consensus, freshness or funding proof implied. */
  observeAccount(pool: string): Promise<unknown>;
  now(): number;
  fee(): string;
}
const uuid = (v: unknown): v is string => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function object(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function requireReceipt(condition: unknown): asserts condition {
  if (!condition) throw new CustodyError("dependency_unavailable", 503);
}
function asset(v: unknown): v is VerifiedPayment["asset"] {
  return object(v) && (v.type === "native" ||
    (v.type === "issued" && typeof v.code === "string" && typeof v.issuer === "string"));
}
function preparation(v: unknown): v is Preparation {
  return object(v) && typeof v.request_id === "string" && typeof v.authorized_by === "string" &&
    object(v.payment) && object(v.request) &&
    [v.payment.transaction_hash, v.payment.operation_id, v.payment.donor, v.payment.pool,
      v.payment.amount, v.request.incident_id, v.request.donor, v.request.beneficiary,
      v.request.amount, v.request.deadline, v.memo_hash].every((s) => typeof s === "string") &&
    typeof v.request.version === "number" && typeof v.confirmed_at === "number" &&
    typeof v.ledger === "number" && asset(v.payment.asset) && asset(v.request.asset);
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  return object(a) && object(b) && Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
}
function sequence(v: unknown): v is string {
  return typeof v === "string" && /^(0|[1-9][0-9]{0,18})$/.test(v) &&
    BigInt(v) < 9223372036854775807n;
}
async function provider<T>(read: () => T | Promise<T>): Promise<T> {
  try { return await read(); }
  catch { throw new CustodyError("dependency_unavailable", 503); }
}

/** Local trusted-backend boundary, NOT wallet authentication or signing authority. */
export function createIssuanceCoordinator(configuration: Configuration) {
  Keypair.fromPublicKey(configuration.pool);
  return async (requestId: string, authenticatedAdmin: string) => {
    if (!uuid(requestId)) throw new CustodyError("invalid_issuance_intent", 422);
    try { Keypair.fromPublicKey(authenticatedAdmin); }
    catch { throw new CustodyError("invalid_issuance_intent", 422); }
    const intent = await configuration.database.registerIssuanceIntent(requestId, authenticatedAdmin);
    requireReceipt(object(intent) && intent.kind === "d1_issuance_request_intent" &&
      intent.revision === 1 && intent.request_id === requestId && uuid(intent.namespace) &&
      intent.network === "TESTNET" && intent.pool === configuration.pool &&
      preparation(intent.preparation_input) && intent.preparation_input.request_id === requestId &&
      intent.preparation_input.payment.pool === configuration.pool && object(intent.preparation) &&
      intent.preparation.revision === 1 && intent.preparation.state === "allocated" &&
      intent.preparation.request_id === requestId && object(intent.preparation.allocation));
    const observed = await provider(() => configuration.observeAccount(configuration.pool));
    requireReceipt(object(observed) && observed.network === "TESTNET" &&
      observed.pool === configuration.pool && sequence(observed.sequence));
    const reservation = await configuration.database.reserveIssuanceSequence(
      requestId, authenticatedAdmin, observed.sequence,
    );
    requireReceipt(object(reservation) && reservation.kind === "d1_issuance_sequence_reservation" &&
      reservation.revision === 1 && reservation.request_id === requestId &&
      reservation.network === "TESTNET" && reservation.pool === configuration.pool &&
      reservation.namespace === intent.namespace &&
      reservation.observed_account_sequence === observed.sequence &&
      reservation.transaction_sequence === (BigInt(observed.sequence) + 1n).toString() &&
      same(reservation.intent, intent));
    // Validate the unknown nested receipt itself; never cast RPC output to trusted types.
    const nested = reservation.intent;
    requireReceipt(object(nested) && preparation(nested.preparation_input));
    const now = await provider(() => configuration.now());
    const fee = await provider(() => configuration.fee());
    try {
      return { ...planIssuance(nested.preparation_input, {
        networkPassphrase: Networks.TESTNET, pool: configuration.pool,
        // SDK increments this OBSERVED sequence exactly once, not transaction_sequence.
        sequence: observed.sequence, now, fee,
      }), reservation };
    } catch (error) {
      if (error instanceof Error && error.message === "issuance_window_exhausted") {
        throw new CustodyError("issuance_window_exhausted", 410);
      }
      if (error instanceof Error && error.message === "invalid_issuance_plan") {
        throw new CustodyError("invalid_issuance_plan", 422);
      }
      throw new CustodyError("dependency_unavailable", 503);
    }
    // No retry, release or compensation: an unknown outcome may already own the source.
  };
}
