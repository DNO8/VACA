import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError, type Preparation, type VerifiedPayment } from "./handler.ts";
import { planIssuance } from "./issuance-plan.ts";
import { validateUnsignedTransaction } from "./unsigned-transaction.ts";

interface Configuration {
  pool: string;
  database: {
    loadUnsignedTransaction(requestId: string, authenticatedAdmin: string): Promise<unknown>;
    saveUnsignedTransaction(requestId: string, authenticatedAdmin: string, unsignedXdr: string, transactionHash: string): Promise<unknown>;
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
    function bound(v: unknown, kind: string): v is Record<string, unknown> {
      return object(v) && v.kind === kind && v.revision === 1 && v.request_id === requestId &&
        uuid(v.namespace) && v.network === "TESTNET" && v.pool === configuration.pool;
    }
    function validateIntent(intent: unknown): asserts intent is Record<string, unknown> & { preparation_input: Preparation } {
      requireReceipt(bound(intent, "d1_issuance_request_intent") &&
        preparation(intent.preparation_input) && intent.preparation_input.request_id === requestId &&
        intent.preparation_input.payment.pool === configuration.pool && object(intent.preparation) &&
        intent.preparation.revision === 1 && intent.preparation.state === "allocated" &&
        intent.preparation.request_id === requestId && object(intent.preparation.allocation));
    }
    function validateReservation(v: unknown): asserts v is Record<string, unknown> & {
      observed_account_sequence: string; transaction_sequence: string;
      intent: Record<string, unknown> & { preparation_input: Preparation };
    } {
      requireReceipt(bound(v, "d1_issuance_sequence_reservation") &&
        sequence(v.observed_account_sequence) &&
        v.transaction_sequence === (BigInt(v.observed_account_sequence) + 1n).toString());
      validateIntent(v.intent);
      requireReceipt(v.namespace === v.intent.namespace);
    }
    // Lookup authenticates current membership even when evidence has expired.
    const lookup = await configuration.database.loadUnsignedTransaction(requestId, authenticatedAdmin);
    requireReceipt(bound(lookup, "d1_unsigned_transaction_lookup") &&
      (lookup.reservation === null || object(lookup.reservation)) &&
      (lookup.transaction === null || object(lookup.transaction)) &&
      (lookup.reservation !== null || lookup.transaction === null));
    const namespace = lookup.namespace;
    let reservation: unknown = lookup.reservation;
    if (reservation !== null) {
      validateReservation(reservation);
      requireReceipt(reservation.namespace === lookup.namespace);
    } else {
      const intent = await configuration.database.registerIssuanceIntent(requestId, authenticatedAdmin);
      validateIntent(intent);
      requireReceipt(intent.namespace === lookup.namespace);
      const observed = await provider(() => configuration.observeAccount(configuration.pool));
      requireReceipt(object(observed) && observed.network === "TESTNET" &&
        observed.pool === configuration.pool && sequence(observed.sequence));
      reservation = await configuration.database.reserveIssuanceSequence(requestId, authenticatedAdmin, observed.sequence);
      validateReservation(reservation);
      requireReceipt(reservation.namespace === lookup.namespace &&
        reservation.observed_account_sequence === observed.sequence && same(reservation.intent, intent));
    }
    // Both paths have validated the same persisted nested preparation and ownership.
    validateReservation(reservation);
    const owned = reservation;
    function validateJournal(journal: unknown) {
      requireReceipt(bound(journal, "d1_unsigned_transaction_journal") &&
        journal.namespace === namespace && same(journal.reservation, owned) &&
        journal.deadline === owned.intent.preparation_input.request.deadline &&
        journal.transaction_sequence === owned.transaction_sequence &&
        typeof journal.unsigned_xdr === "string" && typeof journal.transaction_hash === "string");
      try {
        return validateUnsignedTransaction({ prepared: owned.intent.preparation_input,
          networkPassphrase: Networks.TESTNET, pool: configuration.pool,
          observedSequence: owned.observed_account_sequence, transactionSequence: owned.transaction_sequence,
          unsignedXdr: journal.unsigned_xdr, expectedTransactionHash: journal.transaction_hash });
      } catch { throw new CustodyError("dependency_unavailable", 503); }
    }
    if (lookup.transaction !== null) {
      return { unsignedXdr: validateJournal(lookup.transaction).unsignedXdr, reservation };
    }
    const now = await provider(() => configuration.now());
    // No fee read or first-save attempt after local expiry; never release ownership.
    if (Number.isSafeInteger(now) && now >= Date.parse(owned.intent.preparation_input.request.deadline) / 1000) {
      throw new CustodyError("issuance_window_exhausted", 410);
    }
    const fee = await provider(() => configuration.fee());
    let proposal;
    try {
      proposal = planIssuance(owned.intent.preparation_input, {
        networkPassphrase: Networks.TESTNET, pool: configuration.pool,
        // SDK increments this OBSERVED sequence exactly once, not transaction_sequence.
        sequence: owned.observed_account_sequence, now, fee,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "issuance_window_exhausted") {
        throw new CustodyError("issuance_window_exhausted", 410);
      }
      if (error instanceof Error && error.message === "invalid_issuance_plan") {
        throw new CustodyError("invalid_issuance_plan", 422);
      }
      throw new CustodyError("dependency_unavailable", 503);
    }
    const transactionHash = await provider(() => {
      const hash = TransactionBuilder.fromXDR(proposal.unsignedXdr, Networks.TESTNET).hash().toString("hex");
      return validateUnsignedTransaction({ prepared: owned.intent.preparation_input,
        networkPassphrase: Networks.TESTNET, pool: configuration.pool,
        observedSequence: owned.observed_account_sequence, transactionSequence: owned.transaction_sequence,
        unsignedXdr: proposal.unsignedXdr, expectedTransactionHash: hash }).transactionHash;
    });
    // Await durability once. Unknown outcomes never trigger readback, retry or compensation.
    const saved = await configuration.database.saveUnsignedTransaction(
      requestId, authenticatedAdmin, proposal.unsignedXdr, transactionHash,
    );
    const persisted = validateJournal(saved);
    requireReceipt(persisted.unsignedXdr === proposal.unsignedXdr && persisted.transactionHash === transactionHash);
    return { unsignedXdr: persisted.unsignedXdr, reservation };
  };
}
