export interface VerifiedPayment {
  transaction_hash: string;
  operation_id: string;
  donor: string;
  pool: string;
  asset: { type: "native" } | { type: "issued"; code: string; issuer: string };
  amount: string;
  confirmed_at: number;
  ledger: number;
  memo_hash: string;
}

export interface Preparation {
  request_id: string;
  authorized_by: string;
  payment: Omit<VerifiedPayment, "confirmed_at" | "ledger" | "memo_hash">;
  request: {
    version: number;
    incident_id: string;
    donor: string;
    beneficiary: string;
    asset: VerifiedPayment["asset"];
    amount: string;
    deadline: string;
  };
  confirmed_at: number;
  ledger: number;
  memo_hash: string;
}
