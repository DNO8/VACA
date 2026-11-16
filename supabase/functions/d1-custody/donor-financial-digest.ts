import { hash, Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import type { VerifiedDonorPaymentCommand } from "./donor-payment-command.ts";
import { parseCapturedJSONB, type Immutable } from "./donor-captured-history.ts";
import { validateDonorIssuancePrefix, type ValidatedDonorIssuancePrefix } from "./donor-issuance-prefix.ts";
import { CustodyError } from "./handler.ts";

export interface DonorFinancialDigest {
  requestId: string;
  observations: { snapshotHash: string; snapshotText: string; receipt: Record<string, unknown> }[];
}
export type ValidatedDonorFinancialDigests = ValidatedDonorIssuancePrefix & {
  financialAssurance: "digest-consistency-only"; financialDigests: DonorFinancialDigest[];
};
const SNAPSHOT_KEYS = "account,anchor,budget,commitment,creation,creditState,expiresAt,historyState,kind,namespace,network,obligations,observedAt,originalDonation,pool,requestId,revision,unissuedRefundFeeStroops,unissuedRefundOperationIds";
const RECEIPT_KEYS = "authorized_by,kind,namespace,network,pool,request_id,revision,snapshot,snapshot_hash,transaction_hash";
function valid(v: unknown): asserts v { if (!v) throw new CustodyError("donor_payment_unavailable", 503); }
function exact(v: unknown, keys: string): Record<string, unknown> {
  valid(v !== null && typeof v === "object" && !Array.isArray(v));
  const actual = Object.keys(v).sort(), expected = keys.split(",");
  valid(actual.length === expected.length && actual.every((key, i) => key === expected[i]));
  return v as Record<string, unknown>;
}
function freeze<T>(v: T): Immutable<T> {
  if (v !== null && typeof v === "object" && !Object.isFrozen(v)) {
    Object.values(v).forEach(freeze); Object.freeze(v);
  }
  return v as Immutable<T>;
}
/** Span extraction ONLY after whole-string parseCapturedJSONB validation. This is
 * not a JSON parser or a PostgreSQL serializer. Consume strings atomically so
 * escaped quotes, braces and nested keys cannot impersonate a top-level member. */
function snapshotToken(source: string): string {
  let cursor = 0;
  function whitespace() { while (cursor < source.length && /[ \t\r\n]/.test(source[cursor])) cursor++; }
  function string() {
    cursor++; // Opening quote; validity/termination already proved by the parser.
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
    if (key === "snapshot") return source.slice(start, cursor);
    whitespace(); if (source[cursor++] !== ",") break;
  }
  throw new CustodyError("donor_payment_unavailable", 503);
}

/** Private historical digest consistency, NOT financial authorization or a DTO.
 * Only detached bounded strings from the unchanged prefix validator are scanned.
 * Every row is checked; signed/submitted/outcome semantics remain unvalidated. */
export function validateDonorFinancialDigests(capture: unknown, expected: VerifiedDonorPaymentCommand): Immutable<ValidatedDonorFinancialDigests> {
  try {
    const context = validateDonorIssuancePrefix(capture, expected);
    const { namespace, pool } = context.capture.scope;
    const financialDigests = context.allocations.map((allocation, index) => {
      const { requestId, raw } = allocation, prefix = context.prefixes[index], seen = new Set<string>();
      const observations = raw.d1_initial_financial_observations.map(row => {
        valid(prefix.requestId === requestId && prefix.unsigned && row.request_id === requestId);
        valid(/^[0-9a-f]{64}$/.test(row.snapshot_hash) && !seen.has(row.snapshot_hash));
        const receipt = exact(parseCapturedJSONB(row.receipt), RECEIPT_KEYS);
        valid(receipt.kind === "d1_initial_financial_observation" && receipt.revision === 1 &&
          receipt.request_id === requestId && receipt.namespace === namespace && receipt.network === "TESTNET" &&
          receipt.pool === pool && receipt.transaction_hash === prefix.unsigned.transactionHash && receipt.snapshot_hash === row.snapshot_hash);
        const authorizer = receipt.authorized_by;
        valid(typeof authorizer === "string" && /^G[A-Z2-7]{55}$/.test(authorizer) && Keypair.fromPublicKey(authorizer).publicKey() === authorizer);
        const snapshot = exact(receipt.snapshot, SNAPSHOT_KEYS);
        valid(snapshot.kind === "d1_initial_financial_snapshot" && snapshot.revision === 1 && snapshot.requestId === requestId &&
          snapshot.namespace === namespace && snapshot.network === "TESTNET" && snapshot.pool === pool);
        const snapshotText = snapshotToken(row.receipt), bytes = Buffer.from(snapshotText, "utf8");
        valid(bytes.length <= 1048576 && hash(bytes).toString("hex") === row.snapshot_hash);
        seen.add(row.snapshot_hash);
        return { snapshotHash: row.snapshot_hash, snapshotText, receipt };
      });
      return { requestId, observations };
    });
    return freeze({ ...context, financialAssurance: "digest-consistency-only" as const, financialDigests });
  } catch { throw new CustodyError("donor_payment_unavailable", 503); }
}
