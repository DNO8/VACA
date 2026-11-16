import { CustodyError } from "./handler.ts";
import {
  verifyDonorPaymentCommand,
  type DonorPaymentCommandConfiguration,
  type VerifiedDonorPaymentCommand,
} from "./donor-payment-command.ts";
import { projectDonorPaymentStatus } from "./donor-payment-projection.ts";

/** Server-only dependency: pass the real private Supabase client, not an admin
 * journal facade. The narrow type describes the sole RPC this boundary invokes. */
export interface DonorPaymentHttpDependencies {
  readonly client: {
    rpc(name: "d1_capture_donor_payment", args: {
      p_namespace: string;
      p_pool: string;
      p_transaction_hash: string;
      p_operation_id: string;
      p_verified_donor: string;
    }): PromiseLike<{ data: unknown; error: unknown }>;
  };
  readonly configuration: DonorPaymentCommandConfiguration;
}

const unavailable = () => new CustodyError("donor_payment_unavailable", 503);
const headers = {
  "content-type": "application/json",
  "cache-control": "no-store",
};
function failure(error: CustodyError): Response {
  // Only local constants or the exact verifier allowlist reach this serializer.
  return new Response(JSON.stringify({ error: error.code }), { status: error.status, headers });
}
function verifierFailure(error: unknown): Response {
  if (error instanceof CustodyError && error.message === error.code && (
    (error.status === 400 && error.code === "invalid_request") ||
    (error.status === 401 && ["invalid_signature", "stale_request"].includes(error.code)) ||
    (error.status === 405 && error.code === "method_not_allowed")
  )) return failure(error);
  return failure(unavailable());
}

/** Read-only historical lookup. No signer, Horizon provider, write, execution,
 * retry or reconciliation fallback exists here; a failed read stays unavailable. */
export async function donorPaymentHttp(
  request: Request,
  dependencies?: DonorPaymentHttpDependencies,
): Promise<Response> {
  let command: Readonly<VerifiedDonorPaymentCommand>;
  try {
    // Lazy access lets the existing verifier reject methods/queries first, even
    // when this optional mount is unconfigured. It also captures the trusted
    // scope and bound server clock before awaiting request bytes.
    const configuration = () => {
      if (!dependencies) throw unavailable();
      return dependencies.configuration;
    };
    command = await verifyDonorPaymentCommand(request, {
      get namespace() { return configuration().namespace; },
      get pool() { return configuration().pool; },
      get now() {
        const source = configuration();
        return source.now.bind(source);
      },
    });
  } catch (error) { return verifierFailure(error); }

  try {
    if (!dependencies) throw unavailable();
    const reply = await dependencies.client.rpc("d1_capture_donor_payment", {
      p_namespace: command.namespace,
      p_pool: command.pool,
      p_transaction_hash: command.paymentTransactionHash,
      p_operation_id: command.paymentOperationId,
      p_verified_donor: command.verifiedDonor,
    });
    if (!reply || typeof reply !== "object" || Array.isArray(reply)) throw unavailable();
    // Inspect only own data properties; never evaluate a returned error getter,
    // serialize the RPC envelope, or expose database messages to the caller.
    const data = Object.getOwnPropertyDescriptor(reply, "data");
    const error = Object.getOwnPropertyDescriptor(reply, "error");
    if (!data || !("value" in data) || !error || !("value" in error) ||
      error.value !== null || data.value === null || data.value === undefined) throw unavailable();
    const projected = projectDonorPaymentStatus(data.value, command);
    const bytes = new TextEncoder().encode(JSON.stringify(projected));
    if (bytes.byteLength > 65536) throw unavailable();
    return new Response(bytes, { status: 200, headers });
  } catch {
    // Includes capture with null ownership, malformed evidence, projection and
    // serialization errors. 054 does not certify payment_not_found (404).
    return failure(unavailable());
  }
}
