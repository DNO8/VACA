/** Normative additive v2 contract. Definitions only; no handler, factory or mount here. */
export const REMAINDER_ROUTES = Object.freeze({
  refund_remainder: "/functions/v1/d1-custody/refund-remainder",
  refund_remainder_status: "/functions/v1/d1-custody/refund-remainder-status",
  refund_remainder_reconcile: "/functions/v1/d1-custody/refund-remainder-reconcile",
});
export const REMAINDER_BODY_LIMIT_BYTES = 8192;
export const REMAINDER_MAX_SKEW_SECONDS = 60;
export type RemainderAction = keyof typeof REMAINDER_ROUTES;
export type RemainderState = "not_due" | "not_started" | "blocked" | "pending" | "unknown" |
  "refund_observed" | "refund_failed_observed" | "settled";
export type RemainderReason = "deadline_not_reached" | "financial_precondition_unavailable" |
  "remainder_protected" | "outcome_unresolved" | "refund_failed" | null;
export interface RemainderCommandEnvelope {
  readonly version: 2;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly namespace: string;
  readonly action: RemainderAction;
  readonly request_id: string;
  readonly timestamp: number;
  readonly payload: Readonly<Record<string, never>>;
  readonly wallet: string;
  readonly signature: string;
}
export type RemainderAsset = Readonly<{ type: "native" }> |
  Readonly<{ type: "issued"; code: string; issuer: string }>;
export interface RemainderHttpResponse {
  readonly version: 2;
  readonly network: "TESTNET";
  readonly namespace: string;
  readonly pool: string;
  readonly requestId: string;
  readonly state: RemainderState;
  readonly verification: "unverified" | "persisted_sdk_observation";
  readonly deadline: string;
  readonly donation: Readonly<{
    paymentOperationId: string;
    paymentTransactionHash: string;
    donor: string;
    asset: RemainderAsset;
    grossAmount: string;
  }>;
  readonly refund: Readonly<{
    transactionHash: string;
    amount: string;
    claimableBalanceId: null;
  }> | null;
  readonly settlement: Readonly<{
    beneficiaryClaimedAmount: string | null;
    donorRefundedAmount: string | null;
    remainingPrincipalAmount: string | null;
  }>;
  readonly safeActions: readonly RemainderAction[];
  readonly reason: RemainderReason;
}
export type RemainderErrorCode = "invalid_request" | "stale_request" | "invalid_signature" |
  "unauthorized_admin_wallet" | "request_not_found" | "not_found" | "method_not_allowed" | "remainder_unavailable";
export interface RemainderHttpError { readonly error: RemainderErrorCode }
/** Exact ordered command lists, NEVER financial eligibility or spending permission. */
export const REMAINDER_SAFE_ACTIONS: Readonly<Record<RemainderState, readonly RemainderAction[]>> = Object.freeze({
  not_due: Object.freeze(["refund_remainder_status"] as const),
  not_started: Object.freeze(["refund_remainder", "refund_remainder_status"] as const),
  blocked: Object.freeze(["refund_remainder_status", "refund_remainder_reconcile"] as const),
  pending: Object.freeze(["refund_remainder_status", "refund_remainder_reconcile"] as const),
  unknown: Object.freeze(["refund_remainder_status", "refund_remainder_reconcile"] as const),
  refund_observed: Object.freeze(["refund_remainder_status", "refund_remainder_reconcile"] as const),
  refund_failed_observed: Object.freeze(["refund_remainder_status", "refund_remainder_reconcile"] as const),
  settled: Object.freeze(["refund_remainder_status"] as const),
});
