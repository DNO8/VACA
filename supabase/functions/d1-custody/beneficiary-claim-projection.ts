import { Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { calculateIssuanceEncumbrances, type IssuanceEncumbrances } from "./issuance-encumbrances.ts";
import { parseIncludedTransaction } from "./transaction-observation.ts";
export interface BeneficiaryClaimProjection {
  readonly kind: "d1_beneficiary_claim_projection";
  readonly revision: 1;
  readonly basis: IssuanceEncumbrances;
  readonly claims: readonly {
    requestId: string; claimableBalanceId: string; beneficiary: string; amountStroops: string;
    issuanceTransactionHash: string; transactionHash: string; operationIndex: number;
    operationId: string; ledger: number; ledgerHash: string; closedAt: number;
  }[];
}
type DTO = Record<string, any>;
const unavailable = () => new CustodyError("beneficiary_claim_projection_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function exact(value: unknown, keys: string): DTO {
  check(value !== null && typeof value === "object" && !Array.isArray(value));
  check(Object.keys(value).sort().join(",") === keys); return value as DTO;
}
/** Detached bounded JSON: never invoke accessors, hooks or foreign prototypes. */
function snapshot(input: unknown): unknown {
  const seen = new Set<object>(); let nodes = 0, characters = 0;
  function visit(value: unknown, depth: number): unknown {
    check(++nodes <= 20000 && depth <= 40);
    if (typeof value === "string") { check((characters += value.length) <= 2097152); return value; }
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") { check(Number.isSafeInteger(value)); return value; }
    check(typeof value === "object" && value !== null && !seen.has(value)); seen.add(value);
    const array = Array.isArray(value), descriptors = Object.getOwnPropertyDescriptors(value);
    check(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype));
    check(Object.getOwnPropertySymbols(value).length === 0);
    if (array) check(value.length <= 20000 && Object.keys(value).length === value.length && Object.keys(value).every((k, i) => k === String(i)));
    check(Object.keys(descriptors).length === Object.keys(value).length + (array ? 1 : 0));
    const entries: [string, unknown][] = [];
    for (const [key, descriptor] of Object.entries(descriptors)) {
      check("value" in descriptor); if (array && key === "length") continue;
      check(descriptor.enumerable && (characters += key.length) <= 2097152);
      entries.push([key, visit(descriptor.value, depth + 1)]);
    }
    seen.delete(value);
    return array ? entries.map(([, v]) => v) : Object.fromEntries(entries);
  }
  const value = visit(input, 0); check(new TextEncoder().encode(JSON.stringify(value)).length <= 2097152); return value;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
/** Positive historical consistency only. Trusted ledger-reader provenance is a
 * caller prerequisite: this is neither consensus nor settlement/spending authority.
 * Missing evidence never means unclaimed. Existing accounting remains unchanged. */
export function projectBeneficiaryClaims(input: unknown): BeneficiaryClaimProjection {
  try {
    const root = exact(snapshot(input), "claims,initial");
    check(Array.isArray(root.claims) && root.claims.length >= 1 && root.claims.length <= 100);
    const initial = root.initial as Parameters<typeof calculateIssuanceEncumbrances>[0];
    const basis = calculateIssuanceEncumbrances(initial), seen = new Set<string>();
    const context = { pool: initial.pool, firstLedger: initial.firstLedger, anchor: initial.anchor };
    const claims: BeneficiaryClaimProjection["claims"][number][] = [];
    for (const value of root.claims) {
      const selection = exact(value, "ledger,operationIndex,requestId,transaction");
      check(typeof selection.requestId === "string" && Number.isSafeInteger(selection.operationIndex) && selection.operationIndex >= 0);
      const matches = basis.encumbrances.filter(e => e.requestId === selection.requestId); check(matches.length === 1);
      const mapped = matches[0];
      const claim = parseIncludedTransaction({ context, transaction: selection.transaction, ledger: selection.ledger });
      check(claim.outcome === "success");
      const transaction = TransactionBuilder.fromXDR(claim.envelopeXdr, Networks.TESTNET); check(transaction instanceof Transaction);
      check(selection.operationIndex < transaction.operations.length);
      const operation = transaction.operations[selection.operationIndex];
      check(operation.type === "claimClaimableBalance" && operation.balanceId === mapped.claimableBalanceId);
      check((operation.source ?? transaction.source) === mapped.beneficiary);
      const issuances = initial.transactions.filter(v => (v as DTO).transactionHash === mapped.issuanceTransactionHash); check(issuances.length === 1);
      const issued = issuances[0] as DTO;
      // The accepted initial-issuance contract contains one CB creation at index0.
      check(issued.operationTypes.length === 1 && issued.operationTypes[0] === 14);
      const operationId = (BigInt(claim.pagingToken) + BigInt(selection.operationIndex) + 1n).toString();
      check(BigInt(operationId) > BigInt(issued.pagingToken) + 1n && claim.ledger >= issued.ledger && claim.closedAt >= issued.closedAt);
      if (claim.ledger === issued.ledger) check(claim.ledgerHash === issued.ledgerHash && claim.closedAt === issued.closedAt);
      check(claim.closedAt < Date.parse(mapped.deadline) / 1000);
      const tokens = ["request:" + mapped.requestId, "cb:" + mapped.claimableBalanceId, "operation:" + claim.transactionHash + ":" + selection.operationIndex];
      for (const token of tokens) { check(!seen.has(token)); seen.add(token); }
      claims.push({ requestId: mapped.requestId, claimableBalanceId: mapped.claimableBalanceId, beneficiary: mapped.beneficiary,
        amountStroops: mapped.amountStroops, issuanceTransactionHash: mapped.issuanceTransactionHash,
        transactionHash: claim.transactionHash, operationIndex: selection.operationIndex, operationId,
        ledger: claim.ledger, ledgerHash: claim.ledgerHash, closedAt: claim.closedAt });
    }
    return freeze({ kind: "d1_beneficiary_claim_projection", revision: 1, basis, claims });
  } catch { throw unavailable(); }
}
