/** Agreed implementation contract v1. Definitions only: no mounted or verified API. */
export const REFUND_ROUTES = Object.freeze({
  refund: "/functions/v1/d1-custody/refund",
  refund_status: "/functions/v1/d1-custody/refund-status",
  refund_reconcile: "/functions/v1/d1-custody/refund-reconcile",
});
export type RefundAction = keyof typeof REFUND_ROUTES;
export type RefundState = "not_due" | "not_started" | "blocked" | "pending" | "unknown" |
  "refund_observed" | "refund_failed_observed" | "settled";
export type RefundReason = "deadline_not_reached" | "financial_precondition_unavailable" |
  "remainder_protected" | "outcome_unresolved" | "refund_failed" | null;
export interface RefundCommandEnvelope {
  readonly version: 1;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly namespace: string;
  readonly action: RefundAction;
  readonly request_id: string;
  readonly timestamp: number;
  readonly payload: Readonly<Record<string, never>>;
  readonly wallet: string;
  readonly signature: string;
}
export type RefundAsset = Readonly<{ type: "native" }> |
  Readonly<{ type: "issued"; code: string; issuer: string }>;
export interface RefundHttpResponse {
  readonly version: 1;
  readonly network: "TESTNET";
  readonly namespace: string;
  readonly pool: string;
  readonly requestId: string;
  readonly state: RefundState;
  readonly verification: "unverified" | "persisted_sdk_observation";
  readonly deadline: string;
  readonly donation: Readonly<{
    paymentOperationId: string;
    paymentTransactionHash: string;
    donor: string;
    asset: RefundAsset;
    grossAmount: string;
  }>;
  readonly refund: Readonly<{
    transactionHash: string;
    amount: string;
    claimableBalanceId: string | null;
  }> | null;
  readonly settlement: Readonly<{
    beneficiaryClaimedAmount: string | null;
    donorRefundedAmount: string | null;
    remainingPrincipalAmount: string | null;
  }>;
  readonly safeActions: readonly RefundAction[];
  readonly reason: RefundReason;
}
export type RefundErrorCode = "invalid_request" | "stale_request" | "invalid_signature" |
  "unauthorized_admin_wallet" | "request_not_found" | "not_found" | "method_not_allowed" | "refund_unavailable";
export interface RefundHttpError { readonly error: RefundErrorCode }
/** Allowed commands, never financial eligibility or permission to spend. */
export const REFUND_SAFE_ACTIONS: Readonly<Record<RefundState, readonly RefundAction[]>> = Object.freeze({
  not_due: Object.freeze(["refund_status"] as const),
  not_started: Object.freeze(["refund", "refund_status"] as const),
  blocked: Object.freeze(["refund_status", "refund_reconcile"] as const),
  pending: Object.freeze(["refund_status", "refund_reconcile"] as const),
  unknown: Object.freeze(["refund_status", "refund_reconcile"] as const),
  refund_observed: Object.freeze(["refund_status", "refund_reconcile"] as const),
  refund_failed_observed: Object.freeze(["refund_status", "refund_reconcile"] as const),
  settled: Object.freeze(["refund_status"] as const),
});
