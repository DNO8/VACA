import { CustodyError, type Preparation, type VerifiedPayment } from "./handler.ts";
import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";

export class TestnetPayments {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async payment(transactionHash: string, operationId: string): Promise<VerifiedPayment> {
    if (!/^[0-9a-f]{64}$/.test(transactionHash) || !/^[1-9][0-9]{0,18}$/.test(operationId)) {
      throw new CustodyError("invalid_request", 400);
    }
    const read = async (path: string) => {
      const response = await this.fetcher("https://horizon-testnet.stellar.org" + path, {
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      // A missing/unknown ledger object is never evidence of payment failure.
      if (!response.ok) throw new CustodyError("ledger_unavailable", 503);
      return await response.json();
    };
    const op = await read("/operations/" + operationId);
    const tx = await read("/transactions/" + transactionHash);
    if (
      op.id !== operationId || op.transaction_hash !== transactionHash ||
      op.type !== "payment" || op.transaction_successful !== true ||
      op.from !== op.source_account || op.from_muxed || op.to_muxed ||
      tx.hash !== transactionHash || tx.successful !== true || tx.operation_count !== 1 ||
      !Number.isSafeInteger(tx.ledger) || tx.ledger <= 0 ||
      typeof tx.created_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(tx.created_at) ||
      tx.memo_type !== "hash" || typeof tx.memo !== "string" ||
      !/^[A-Za-z0-9+/]{43}=$/.test(tx.memo) ||
      typeof op.amount !== "string" || !/^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(op.amount) ||
      BigInt(op.amount.replace(".", "")) <= 0n
    ) {
      throw new CustodyError("unsupported_payment", 422);
    }
    try {
      Keypair.fromPublicKey(op.from);
      Keypair.fromPublicKey(op.to);
    } catch {
      throw new CustodyError("unsupported_payment", 422);
    }
    let asset: VerifiedPayment["asset"];
    if (op.asset_type === "native") asset = { type: "native" };
    else if (
      (op.asset_type === "credit_alphanum4" || op.asset_type === "credit_alphanum12") &&
      typeof op.asset_code === "string" && /^[A-Za-z0-9]{1,12}$/.test(op.asset_code)
    ) {
      try {
        Keypair.fromPublicKey(op.asset_issuer);
      } catch {
        throw new CustodyError("unsupported_payment", 422);
      }
      asset = { type: "issued", code: op.asset_code, issuer: op.asset_issuer };
    } else throw new CustodyError("unsupported_payment", 422);
    const confirmed = Date.parse(tx.created_at) / 1000;
    if (
      !Number.isSafeInteger(confirmed) ||
      new Date(confirmed * 1000).toISOString().replace(".000Z", "Z") !== tx.created_at
    ) {
      throw new CustodyError("unsupported_payment", 422);
    }
    return {
      transaction_hash: transactionHash,
      operation_id: operationId,
      donor: op.from,
      pool: op.to,
      asset,
      amount: op.amount,
      confirmed_at: confirmed,
      ledger: tx.ledger,
      memo_hash: Buffer.from(tx.memo, "base64").toString("hex"),
    };
  }
}

export class CustodyDatabase {
  constructor(
    private readonly client: {
      rpc(name: string, args: Record<string, unknown>): PromiseLike<{
        data: unknown;
        error: { code?: string; message: string } | null;
      }>;
    },
  ) {}

  async prepare(input: Preparation): Promise<unknown> {
    const { data, error } = await this.client.rpc("d1_prepare", { p_input: input });
    if (!error) return data;
    if (error.code === "40001") throw new CustodyError("serialization_failure", 503);
    const errors: Record<string, number> = {
      unauthorized_admin_wallet: 403,
      idempotency_conflict: 409,
      donation_binding_conflict: 409,
      donation_payment_conflict: 409,
      historical_request: 409,
      historical_payment: 409,
      deadline_expired: 410,
      payment_binding_mismatch: 422,
      payment_before_activation: 422,
      pool_not_activated: 422,
      donation_capacity_exceeded: 422,
      donation_request_mismatch: 422,
      beneficiary_mismatch: 422,
      incident_not_promoted: 422,
      invalid_preparation: 422,
      invalid_release_request: 422,
      invalid_donation_payment: 422,
    };
    const status = Object.hasOwn(errors, error.message) ? errors[error.message] : undefined;
    throw new CustodyError(status ? error.message : "dependency_unavailable", status ?? 503);
  }
}
