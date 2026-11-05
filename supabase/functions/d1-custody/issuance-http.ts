import { CustodyError } from "./handler.ts";
import { verifyIssuanceCommand } from "./issuance-command.ts";
import { submitInitialIssuance } from "./initial-issuance-submission.ts";
import { recordInitialIssuanceOutcome } from "./initial-issuance-outcome-journal.ts";

type SignerConfiguration = Parameters<typeof submitInitialIssuance>[1];
export interface IssuanceHttpDependencies {
  readonly client: Parameters<typeof submitInitialIssuance>[0];
  readonly configuration: Omit<SignerConfiguration, "requestId" | "authenticatedAdmin"> & {
    readonly source: NonNullable<SignerConfiguration["source"]>;
  };
  readonly fetcher: typeof fetch;
}
const unavailable = () => new CustodyError("initial_submission_unavailable", 503);
function failure(error: CustodyError): Response {
  return Response.json({ error: error.code }, {
    status: error.status, headers: { "cache-control": "no-store" },
  });
}
type DTO = Record<string, unknown>;
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function object(value: unknown): DTO {
  check(value !== null && typeof value === "object" && !Array.isArray(value)); return value as DTO;
}
// Descriptor-first, bounded JSON capture: never evaluate a dependency's getters.
function snapshot<T>(value: T): T {
  const seen = new Set<object>(); let nodes = 0, characters = 0;
  function visit(x: unknown, depth: number) {
    check(++nodes <= 20000 && depth <= 40);
    if (typeof x === "string") { check((characters += x.length) <= 2097152); return; }
    if (x === null || typeof x === "boolean") return;
    if (typeof x === "number") { check(Number.isSafeInteger(x)); return; }
    check(typeof x === "object" && x !== null && !seen.has(x)); seen.add(x);
    check(Object.getPrototypeOf(x) === (Array.isArray(x) ? Array.prototype : Object.prototype) || Object.getPrototypeOf(x) === null);
    check(Object.getOwnPropertySymbols(x).length === 0);
    if (Array.isArray(x)) check(x.length <= 20000 && Object.keys(x).length === x.length && Object.keys(x).every((k, i) => k === String(i)));
    const descriptors = Object.getOwnPropertyDescriptors(x);
    check(Object.keys(descriptors).length === Object.keys(x).length + (Array.isArray(x) ? 1 : 0));
    for (const [key, d] of Object.entries(descriptors)) {
      check(!d.get && !d.set); if (Array.isArray(x) && key === "length") continue;
      check(d.enumerable && (characters += key.length) <= 2097152); visit(d.value, depth + 1);
    }
  }
  visit(value, 0); const json = JSON.stringify(value);
  check(new TextEncoder().encode(json).length <= 2097152); return JSON.parse(json);
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b)) return false;
  const left = a as DTO, right = b as DTO;
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(k => Object.hasOwn(right, k) && same(left[k], right[k]));
}
/** Optional backend route. Persisted observations are not current chain status. */
export async function issueHttp(request: Request, dependencies: IssuanceHttpDependencies, pool: string): Promise<Response> {
  let command: Awaited<ReturnType<typeof verifyIssuanceCommand>>;
  try {
    const configuration = dependencies.configuration;
    if (configuration.pool !== pool) throw unavailable();
    command = await verifyIssuanceCommand(request, configuration);
  } catch (error) {
    // Only the unchanged proof parser's public errors survive this boundary.
    if (error instanceof CustodyError && (
      (error.code === "invalid_request" && error.status === 400) ||
      (["stale_request", "invalid_signature"].includes(error.code) && error.status === 401)
    )) return failure(error);
    return failure(unavailable());
  }
  try {
    const configuration = dependencies.configuration;
    // Runtime checks prevent missing JS dependencies from enabling SDK network defaults.
    if (typeof dependencies.fetcher !== "function" || typeof configuration.loadPoolSigner !== "function" ||
        typeof configuration.source?.readAccountAtCheckpoint !== "function") throw unavailable();
    const client = dependencies.client, fetcher = dependencies.fetcher;
    const bound = { ...configuration, namespace: command.namespace, pool: command.pool,
      requestId: command.requestId, authenticatedAdmin: command.authenticatedAdmin };
    const args = { p_request_id: command.requestId, p_authorized_by: command.authenticatedAdmin };
    const reply = object(snapshot(await client.rpc("d1_load_issuance_outcome", args)));
    check(Object.hasOwn(reply, "data") && Object.hasOwn(reply, "error"));
    if (reply.error !== null) {
      const e = object(reply.error);
      if (reply.data === null && e.code === "42501" && e.message === "unauthorized_admin_wallet")
        return failure(new CustodyError("unauthorized_admin_wallet", 403));
      throw unavailable();
    }
    const lookup = object(reply.data);
    check(Object.keys(lookup).length === 7 && lookup.kind === "d1_issuance_outcome_lookup" && lookup.revision === 1 &&
      lookup.request_id === command.requestId && lookup.namespace === command.namespace && lookup.network === "TESTNET" &&
      lookup.pool === command.pool && Object.hasOwn(lookup, "outcome"));
    if (lookup.outcome !== null) {
      object(lookup.outcome);
      let unsigned: DTO | undefined;
      const reads = new Set(["d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"]);
      const readonly: IssuanceHttpDependencies["client"] = { async rpc(name, parameters) {
        check(parameters.p_request_id === command.requestId && parameters.p_authorized_by === command.authenticatedAdmin);
        check(Object.keys(parameters).length === (name === "d1_load_initial_financial_observation" ? 3 : 2));
        if (name === "d1_load_issuance_outcome") return { data: snapshot(lookup), error: null };
        check(reads.has(name));
        const captured = snapshot(await client.rpc(name, parameters));
        if (name === "d1_load_unsigned_transaction") {
          const current = object(captured);
          if (unsigned !== undefined) check(same(unsigned, current));
          unsigned = snapshot(current); // Independent of the copy consumed by the SDK.
        }
        return captured;
      } };
      let receipt: Awaited<ReturnType<typeof recordInitialIssuanceOutcome>>;
      try { receipt = await recordInitialIssuanceOutcome(readonly, bound); }
      catch (error) {
        if (error instanceof CustodyError && error.code === "unauthorized_admin_wallet" && error.status === 403) return failure(error);
        throw error;
      }
      check(unsigned !== undefined);
      const journal = object(object(unsigned.data).transaction);
      const preparation = object(object(object(journal.reservation).intent).preparation_input);
      const payment = object(preparation.payment), request = object(preparation.request);
      check(typeof payment.transaction_hash === "string" && /^[0-9a-f]{64}$/.test(payment.transaction_hash));
      const failed = receipt.observed_outcome.outcome === "failed";
      return Response.json({ state: failed ? "issuance_failed_observed" : "issuance_observed", verification: "persisted_sdk_observation",
        requestId: command.requestId, transactionHash: receipt.transaction_hash, donor: payment.donor, beneficiary: request.beneficiary,
        asset: request.asset, amount: request.amount, paymentTransactionHash: payment.transaction_hash, deadline: request.deadline,
        ...(!failed ? { claimableBalanceId: receipt.observed_outcome.claimableBalanceId } : {}) }, {
        status: 200, headers: { "cache-control": "no-store" },
      });
    }
    let result: Awaited<ReturnType<typeof submitInitialIssuance>>;
    try {
      result = await submitInitialIssuance(client, bound, fetcher);
    } catch (error) {
      // Only an SDK-validated database denial may cross as 403, never a DI exception.
      if (error instanceof CustodyError && error.code === "unauthorized_admin_wallet" && error.status === 403) return failure(error);
      throw error;
    }
    const transactionHash = result.attempt.transaction_hash;
    if (typeof transactionHash !== "string" || !/^[0-9a-f]{64}$/.test(transactionHash)) throw unavailable();
    return Response.json({ state: "pending", verification: "unverified", requestId: command.requestId, transactionHash }, {
      status: 202, headers: { "cache-control": "no-store" },
    });
  } catch {
    return failure(unavailable());
  }
}
