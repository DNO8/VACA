import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import type { RefundExecutionDependencies } from "./refund-execution.ts";
import type { RemainderExecutionDependencies } from "./remainder-execution.ts";

type Financial = NonNullable<RefundExecutionDependencies["financial"]> &
  NonNullable<RemainderExecutionDependencies["financial"]>;

/** Private server capability, NOT a DTO. Never log, serialize or expose it. */
export interface RefundAutomaticConfiguration {
  readonly namespace: string;
  readonly pool: string;
  readonly actor: string;
  readonly network: "TESTNET";
  readonly token: string;
  readonly maxBatchSize: number;
  readonly feePerOperationStroops: string;
  readonly transactionLifetimeSeconds: number;
  readonly financial: Readonly<Financial>;
}

function unavailable(): Error {
  return new Error("automatic_refund_configuration_unavailable");
}
function check(value: unknown): asserts value {
  if (!value) throw unavailable();
}
function address(value: unknown): asserts value is string {
  check(typeof value === "string" && value.length === 56 && /^G[A-Z2-7]{55}$/.test(value));
  check(Keypair.fromPublicKey(value).publicKey() === value);
}
function decimal(value: unknown, minimum: number, maximum: number): number {
  check(typeof value === "string" && value.length >= 1 && value.length <= 10 && /^(0|[1-9][0-9]*)$/.test(value));
  const number = Number(value);
  // Round trip also rejects trailing newlines; no trimming or coercive acceptance.
  check(Number.isSafeInteger(number) && String(number) === value && number >= minimum && number <= maximum);
  return number;
}
function token(value: unknown): asserts value is string {
  // Same canonical 32-byte base64url rule as refund-automatic-http.ts's private tokenBytes.
  check(typeof value === "string" && value.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(value));
  const bytes = Buffer.from(value, "base64url");
  check(bytes.length === 32 && bytes.toString("base64url") === value);
}

/** Keep the saved key out of the returned configuration and all public host state. */
function bindPoolSigner(secret: unknown, pool: string): Financial["loadPoolSigner"] {
  check(typeof secret === "string" && secret.length === 56 && /^S[A-Z2-7]{55}$/.test(secret));
  const validated = Keypair.fromSecret(secret);
  check(validated.canSign() && validated.secret() === secret && validated.publicKey() === pool);
  // A fresh SDK instance avoids handing out the mutable instance used for validation.
  // Neither this closure nor its caller consults getEnv again when loading a signer.
  return Object.freeze((requestedPool: string): unknown => {
    try {
      check(requestedPool === pool);
      const signer = Keypair.fromSecret(secret);
      check(signer.canSign() && signer.publicKey() === pool);
      return signer;
    } catch {
      throw unavailable();
    }
  });
}

/**
 * Call once at trusted server composition, never from request input or per tick.
 * Importing this module reads no environment and constructs no SDK keypair.
 * Disabled mode reads ONLY the flag. Errors contain no values or SDK diagnostics.
 */
export function readRefundAutomaticConfiguration(
  getEnv: (name: string) => string | undefined,
  publicPool: string,
): Readonly<RefundAutomaticConfiguration> | null {
  try {
    const enabled = getEnv("D1_AUTOMATIC_REFUNDS_ENABLED");
    if (enabled === undefined || enabled === "false") return null;
    check(enabled === "true");

    const namespace = getEnv("D1_NAMESPACE");
    check(typeof namespace === "string" && namespace.length === 36 &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(namespace));
    address(publicPool);
    const actor = getEnv("D1_REFUND_SERVICE_ACTOR");
    address(actor);
    const tickToken = getEnv("D1_REFUND_TICK_TOKEN");
    token(tickToken);

    const maxBatchSize = decimal(getEnv("D1_REFUND_MAX_BATCH_SIZE") ?? "1", 1, 50);
    const feePerOperationStroops = getEnv("D1_REFUND_FEE_PER_OPERATION_STROOPS");
    check(typeof feePerOperationStroops === "string");
    decimal(feePerOperationStroops, 1, 4294967295);
    const transactionLifetimeSeconds = decimal(getEnv("D1_REFUND_TRANSACTION_LIFETIME_SECONDS"), 1, 600);
    const maximumAgeSeconds = decimal(getEnv("D1_REFUND_MAX_AGE_SECONDS") ?? "15", 1, 30);
    const futureToleranceSeconds = decimal(getEnv("D1_REFUND_FUTURE_TOLERANCE_SECONDS") ?? "0", 0, 2);
    const loadPoolSigner = bindPoolSigner(getEnv("D1_REFUND_POOL_SECRET_KEY"), publicPool);

    return Object.freeze({
      namespace, pool: publicPool, actor, network: "TESTNET", token: tickToken,
      maxBatchSize, feePerOperationStroops, transactionLifetimeSeconds,
      financial: Object.freeze({ maximumAgeSeconds, futureToleranceSeconds, loadPoolSigner }),
    });
  } catch {
    // Do not preserve a cause: dependency errors may contain private configuration.
    throw unavailable();
  }
}
