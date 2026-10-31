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

  registerIssuanceIntent(requestId: string, authenticatedAdmin: string): Promise<unknown> {
    return this.issuanceRpc("d1_register_issuance_intent", {
      p_request_id: requestId, p_authorized_by: authenticatedAdmin,
    });
  }

  reserveIssuanceSequence(
    requestId: string, authenticatedAdmin: string, observedAccountSequence: string,
  ): Promise<unknown> {
    return this.issuanceRpc("d1_reserve_issuance_sequence", {
      p_request_id: requestId, p_authorized_by: authenticatedAdmin,
      p_observed_account_sequence: observedAccountSequence,
    });
  }

  loadUnsignedTransaction(requestId: string, authenticatedAdmin: string): Promise<unknown> {
    return this.journalRpc("d1_load_unsigned_transaction", {
      p_request_id: requestId, p_authorized_by: authenticatedAdmin,
    });
  }

  saveUnsignedTransaction(
    requestId: string, authenticatedAdmin: string, unsignedXdr: string, transactionHash: string,
  ): Promise<unknown> {
    return this.journalRpc("d1_save_unsigned_transaction", {
      p_request_id: requestId, p_authorized_by: authenticatedAdmin,
      p_unsigned_xdr: unsignedXdr, p_transaction_hash: transactionHash,
    });
  }

  // Journal-only normalization: never broaden the legacy registration/reservation errors.
  private async journalRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    let result;
    try { result = await this.client.rpc(name, args); }
    catch { throw new CustodyError("dependency_unavailable", 503); }
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new CustodyError("dependency_unavailable", 503);
    }
    const { data, error } = result;
    if (error === null) return data;
    if (!error || typeof error !== "object" || Array.isArray(error) || typeof error.message !== "string") {
      throw new CustodyError("dependency_unavailable", 503);
    }
    if (error.code === "40001") throw new CustodyError("serialization_failure", 503);
    const errors: Record<string, number> = {
      unauthorized_admin_wallet: 403, invalid_unsigned_transaction: 400,
      d1_preparation_not_found: 400, deadline_expired: 410,
      ...(name === "d1_save_unsigned_transaction" ? {
        d1_issuance_sequence_not_found: 400, unsigned_transaction_conflict: 409,
      } : {}),
    };
    const status = typeof error.message === "string" && Object.hasOwn(errors, error.message)
      ? errors[error.message] : undefined;
    throw new CustodyError(status ? error.message : "dependency_unavailable", status ?? 503);
  }

  private async issuanceRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    let result;
    try { result = await this.client.rpc(name, args); }
    catch { throw new CustodyError("dependency_unavailable", 503); }
    if (!result || typeof result !== "object") throw new CustodyError("dependency_unavailable", 503);
    const { data, error } = result;
    if (error === null) return data;
    if (error?.code === "40001") throw new CustodyError("serialization_failure", 503);
    const errors: Record<string, number> = {
      unauthorized_admin_wallet: 403,
      issuance_sequence_conflict: 409, issuance_source_busy: 409,
      deadline_expired: 410,
      invalid_issuance_intent: 422, invalid_issuance_sequence: 422,
      d1_preparation_not_found: 422, d1_issuance_intent_not_found: 422,
    };
    const status = error && typeof error.message === "string" && Object.hasOwn(errors, error.message)
      ? errors[error.message] : undefined;
    throw new CustodyError(status ? error.message : "dependency_unavailable", status ?? 503);
  }

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
    const status = typeof error.message === "string" && Object.hasOwn(errors, error.message)
      ? errors[error.message] : undefined;
    throw new CustodyError(status ? error.message : "dependency_unavailable", status ?? 503);
  }
}
