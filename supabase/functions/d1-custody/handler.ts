// New local implementation based on recovered contracts, not recovered original source.
import { hash, Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";

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

export class CustodyError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

export interface CustodyConfiguration {
  poolSigner: Keypair;
  now?: () => number;
  ledger?: { payment(transactionHash: string, operationId: string): Promise<VerifiedPayment> };
  database?: { prepare(input: Preparation): Promise<unknown> };
}

export type CustodyHandler = (request: Request) => Promise<Response>;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const object = value as Record<string, unknown>;
  return "{" +
    Object.keys(object).sort().map((key) => JSON.stringify(key) + ":" + canonical(object[key]))
      .join(",") +
    "}";
}

function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === keys.sort().join(",");
}

async function boundedBody(request: Request): Promise<string> {
  if (!request.body) throw new CustodyError("invalid_request", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 8192) {
        await reader.cancel();
        throw new CustodyError("invalid_request", 400);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CustodyError("invalid_request", 400);
  }
}

export function createCustodyHandler(configuration: CustodyConfiguration): CustodyHandler {
  return async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === "/functions/v1/d1-custody/prepare") {
      try {
        // Bound memory use before JSON parsing. No body-controlled network or ledger facts.
        const text = await boundedBody(request);
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          throw new CustodyError("invalid_request", 400);
        }
        if (
          !exact(body, [
            "version",
            "network",
            "pool",
            "action",
            "request_id",
            "timestamp",
            "payload",
            "wallet",
            "signature",
          ]) ||
          body.version !== 1 || body.network !== "TESTNET" || body.action !== "prepare" ||
          body.pool !== configuration.poolSigner.publicKey() ||
          typeof body.request_id !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.request_id) ||
          !Number.isSafeInteger(body.timestamp) || typeof body.wallet !== "string" ||
          typeof body.signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(body.signature) ||
          !exact(body.payload, [
            "incident_id",
            "transaction_hash",
            "operation_id",
            "beneficiary",
            "amount",
          ])
        ) {
          throw new CustodyError("invalid_request", 400);
        }
        const p = body.payload;
        if (
          Object.values(p).some((v) => typeof v !== "string") ||
          !/^[!-~]([ -~]{0,254}[!-~])?$/.test(p.incident_id as string) ||
          !/^[0-9a-f]{64}$/.test(p.transaction_hash as string) ||
          !/^[1-9][0-9]{0,18}$/.test(p.operation_id as string) ||
          !/^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(p.amount as string)
        ) {
          throw new CustodyError("invalid_request", 400);
        }
        const now = configuration.now?.() ?? Math.floor(Date.now() / 1000);
        try {
          Keypair.fromPublicKey(p.beneficiary as string);
        } catch {
          throw new CustodyError("invalid_request", 400);
        }
        if (Math.abs(now - (body.timestamp as number)) > 60) {
          throw new CustodyError("stale_request", 401);
        }
        const { signature, ...message } = body;
        let valid = false;
        try {
          valid = Keypair.fromPublicKey(body.wallet).verify(
            hash(Buffer.from("Stellar Signed Message:\n" + canonical(message))),
            Buffer.from(signature as string, "base64"),
          );
        } catch { /* Invalid keys or signatures fail closed. */ }
        if (!valid) throw new CustodyError("invalid_signature", 401);
        if (!configuration.ledger || !configuration.database) {
          throw new CustodyError("not_ready", 503);
        }
        const proof = await configuration.ledger.payment(
          p.transaction_hash as string,
          p.operation_id as string,
        );
        const memo = hash(Buffer.from("vaca.d1.donation.v1\n" + p.incident_id)).toString("hex");
        if (
          proof.transaction_hash !== p.transaction_hash || proof.operation_id !== p.operation_id ||
          proof.pool !== body.pool || proof.memo_hash !== memo ||
          !Number.isSafeInteger(proof.confirmed_at) || !Number.isSafeInteger(proof.ledger) ||
          proof.confirmed_at > now || proof.ledger <= 0
        ) throw new CustodyError("payment_mismatch", 422);
        const { confirmed_at, ledger, memo_hash, ...payment } = proof;
        const result = await configuration.database.prepare({
          request_id: body.request_id,
          authorized_by: body.wallet,
          payment,
          confirmed_at,
          ledger,
          memo_hash,
          request: {
            version: 1,
            incident_id: p.incident_id as string,
            donor: proof.donor,
            beneficiary: p.beneficiary as string,
            asset: proof.asset,
            amount: p.amount as string,
            deadline: new Date((confirmed_at + 300) * 1000).toISOString().replace(".000Z", "Z"),
          },
        });
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      } catch (error) {
        const safe = error instanceof CustodyError
          ? error
          : new CustodyError("dependency_unavailable", 503);
        return Response.json({ error: safe.code }, {
          status: safe.status,
          headers: { "cache-control": "no-store" },
        });
      }
    }
    if (request.method !== "GET" || !new URL(request.url).pathname.endsWith("/d1-custody/config")) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    return Response.json(
      {
        network: "TESTNET",
        pool_public_key: configuration.poolSigner.publicKey(),
        donation_ttl_seconds: 300,
      },
      {
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "no-store",
        },
      },
    );
  };
}
