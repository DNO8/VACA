import { hash, Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import type { VerifiedDonorPaymentCommand } from "./donor-payment-command.ts";
import { parseCapturedJSONB, type DonorPaymentDTO, type Immutable } from "./donor-captured-history.ts";
import { validateDonorIssuanceArtifacts } from "./donor-issuance-artifacts.ts";
import { parseInitialIssuanceOutcome } from "./initial-issuance-outcome.ts";
import { CustodyError } from "./handler.ts";

export type DonorIssuanceDTO =
  | { state: "not_recorded"; transactionHash: null; claimableBalanceId: null }
  | { state: "failed_observed"; transactionHash: string; claimableBalanceId: null }
  | { state: "succeeded_observed"; transactionHash: string; claimableBalanceId: string };
export interface DonorPaymentStatusDTO {
  version: 1; network: "TESTNET"; namespace: string; pool: string;
  payment: DonorPaymentDTO;
  allocations: { requestId: string; beneficiary: string; amount: string; issuance: DonorIssuanceDTO }[];
  snapshot: { kind: "stored_allocations"; readAt: number; completeness: "all_stored_allocations" };
}
type ObjectValue = Record<string, unknown>;
const RECEIPT_KEYS = ["kind", "revision", "request_id", "namespace", "network", "pool", "authorized_by",
  "attempt_id", "transaction_hash", "envelope_hash", "outcome_hash", "observed_outcome"];
const unavailable = () => new CustodyError("donor_payment_unavailable", 503);
function valid(v: unknown): asserts v { if (!v) throw unavailable(); }
function object(v: unknown): ObjectValue {
  valid(v !== null && typeof v === "object" && !Array.isArray(v)); return v as ObjectValue;
}
function exact(v: unknown, keys: string[]): ObjectValue {
  const result = object(v), actual = Object.keys(result).sort(), expected = [...keys].sort();
  valid(actual.length === expected.length && actual.every((key, i) => key === expected[i])); return result;
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && same((a as ObjectValue)[k], (b as ObjectValue)[k]));
}
function freeze<T>(v: T): Immutable<T> {
  if (v !== null && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v as Immutable<T>;
}
function digest(v: unknown): string { valid(typeof v === "string" && /^[0-9a-f]{64}$/.test(v)); return v; }

/** Extract only a raw span, AFTER parseCapturedJSONB validated the entire bounded
 * receipt. Strings are atomic: braces/escaped keys inside them cannot select a
 * different member. Never reconstruct PostgreSQL JSONB text with JSON.stringify. */
function observedOutcomeToken(source: string): string {
  let cursor = 0;
  function whitespace() { while (cursor < source.length && /[ \t\r\n]/.test(source[cursor])) cursor++; }
  function string() {
    cursor++;
    while (cursor < source.length) {
      if (source[cursor] === "\\") cursor += 2;
      else if (source[cursor++] === '"') return;
    }
    valid(false);
  }
  function value() {
    if (source[cursor] === '"') { string(); return; }
    if (source[cursor] === "{" || source[cursor] === "[") {
      let depth = 0;
      do {
        const c = source[cursor];
        if (c === '"') { string(); continue; }
        if (c === "{" || c === "[") depth++;
        if (c === "}" || c === "]") depth--;
        cursor++;
      } while (depth > 0 && cursor < source.length);
    } else while (cursor < source.length && !/[\s,}\]]/.test(source[cursor])) cursor++;
  }
  whitespace(); valid(source[cursor++] === "{");
  while (cursor < source.length) {
    whitespace(); const keyStart = cursor; string();
    const key: string = JSON.parse(source.slice(keyStart, cursor));
    whitespace(); valid(source[cursor++] === ":"); whitespace();
    const start = cursor; value();
    if (key === "observed_outcome") return source.slice(start, cursor);
    whitespace(); if (source[cursor++] !== ",") break;
  }
  throw unavailable();
}

/** S4/S14/S15: pure historical r1 projection, not an HTTP/authentication boundary,
 * current-CB observation, financial reauthorization or settlement instruction.
 * The host must supply the actual 054 capture and an independently verified command. */
export function projectDonorPaymentStatus(
  capture: unknown, expected: VerifiedDonorPaymentCommand,
): Immutable<DonorPaymentStatusDTO> {
  let context: ReturnType<typeof validateDonorIssuanceArtifacts>;
  try {
    // This predecessor detaches data descriptors, bounds the whole capture and
    // validates history, every allocation, prefix, digest and signed/attempt row.
    context = validateDonorIssuanceArtifacts(capture, expected);
  } catch (error) {
    // Only a genuine predecessor error can carry an already-certified absence.
    // Current predecessors fail closed with 503; null 054 data never creates 404.
    if (error instanceof CustodyError && error.code === "payment_not_found" &&
      error.status === 404 && error.message === "payment_not_found") throw error;
    throw unavailable();
  }
  try {
    const { namespace, pool } = context.capture.scope;
    const records = new Map(context.history.transactions.map(record => [record.transactionHash, record]));
    valid(records.size === context.history.transactions.length && context.allocations.length <= 100 &&
      context.artifacts.length === context.allocations.length);
    let previous = "";
    const allocations = context.allocations.map((allocation, index) => {
      const { requestId, beneficiary, amount, raw } = allocation, artifact = context.artifacts[index];
      valid(artifact.requestId === requestId && requestId > previous); previous = requestId;
      let issuance: DonorIssuanceDTO = { state: "not_recorded", transactionHash: null, claimableBalanceId: null };
      const row = raw.d1_issuance_outcomes;
      if (row !== null) {
        const { signed, submission } = artifact;
        valid(signed && submission && row.request_id === requestId && row.attempt_id === submission.attempt_id);
        const receipt = exact(parseCapturedJSONB(row.receipt), RECEIPT_KEYS);
        valid(receipt.kind === "d1_issuance_outcome_journal" && receipt.revision === 1 &&
          receipt.request_id === requestId && receipt.namespace === namespace && receipt.network === "TESTNET" && receipt.pool === pool &&
          receipt.attempt_id === row.attempt_id && receipt.transaction_hash === signed.transaction_hash &&
          receipt.transaction_hash === submission.transaction_hash && receipt.envelope_hash === signed.envelope_hash &&
          receipt.envelope_hash === submission.envelope_hash);
        const actor = receipt.authorized_by;
        valid(typeof actor === "string" && /^G[A-Z2-7]{55}$/.test(actor) && Keypair.fromPublicKey(actor).publicKey() === actor);
        // Preserve the historical actor; neither current administrator membership
        // nor equality with the signing/submission actor is a read requirement.
        const transactionHash = digest(receipt.transaction_hash);
        digest(receipt.envelope_hash); const outcomeHash = digest(receipt.outcome_hash);
        const stored = exact(receipt.observed_outcome, ["kind", "revision", "observation", "outcome", "claimableBalanceId"]);
        valid(stored.kind === "d1_initial_issuance_outcome" && stored.revision === 1 &&
          ((stored.outcome === "success" && typeof stored.claimableBalanceId === "string" && /^00000000[0-9a-f]{64}$/.test(stored.claimableBalanceId)) ||
            (stored.outcome === "failed" && stored.claimableBalanceId === null)));
        const bytes = Buffer.from(observedOutcomeToken(row.receipt), "utf8");
        valid(bytes.length <= 1048576 && hash(bytes).toString("hex") === outcomeHash);
        const observation = object(stored.observation), historical = records.get(transactionHash);
        // History replay independently bound every record to its own persisted
        // page anchor and firstLedger, not merely the latest capture checkpoint.
        // Exact membership binds context BEFORE it reaches the pure SDK parser.
        valid(historical && same(observation, historical));
        valid(historical.context.pool === pool && historical.context.firstLedger === context.history.firstLedger &&
          historical.source === pool && historical.feePayer === pool && historical.sequence === submission.reservation.transaction_sequence &&
          historical.envelopeXdr === signed.signed_xdr && historical.outcome === stored.outcome &&
          same(historical.operationTypes, [14]) && same(historical.poolOperationSourceIndices, [0]));
        const parsed = parseInitialIssuanceOutcome(pool, signed.signed_xdr, {
          context: historical.context, transaction: historical.raw.transaction, ledger: historical.raw.ledger,
        });
        valid(same(parsed, stored) && same(parsed.observation, historical));
        if (parsed.outcome === "success") {
          valid(/^00000000[0-9a-f]{64}$/.test(parsed.claimableBalanceId));
          issuance = { state: "succeeded_observed", transactionHash, claimableBalanceId: parsed.claimableBalanceId };
        } else issuance = { state: "failed_observed", transactionHash, claimableBalanceId: null };
      }
      // No outcome means not_recorded, even when transaction history includes it.
      // All other present descendants were still validated by the predecessor.
      return { requestId, beneficiary, amount, issuance };
    });
    const payment = context.payment, readAt = context.capture.dbReadAt;
    valid(Number.isSafeInteger(readAt) && readAt >= 0 && readAt <= 253402300799);
    // Explicit public allowlist and fresh nested objects: no private context,
    // signed XDR, authorization, journal receipt or financial snapshot escapes.
    const result: DonorPaymentStatusDTO = {
      version: 1, network: "TESTNET", namespace, pool,
      payment: {
        transactionHash: payment.transactionHash, operationId: payment.operationId, donor: payment.donor,
        asset: payment.asset.type === "native" ? { type: "native" } :
          { type: "issued", code: payment.asset.code, issuer: payment.asset.issuer },
        grossAmount: payment.grossAmount, confirmedAt: payment.confirmedAt, deadline: payment.deadline,
      },
      allocations,
      snapshot: { kind: "stored_allocations", readAt, completeness: "all_stored_allocations" },
    };
    valid(Buffer.byteLength(JSON.stringify(result), "utf8") <= 65536);
    return freeze(result);
  } catch { throw unavailable(); }
}
