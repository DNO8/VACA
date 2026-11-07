import { CustodyError } from "./handler.ts";
import { verifyStatusCommand, type IssuanceCommandConfiguration } from "./issuance-command.ts";
import { recordInitialIssuanceOutcome } from "./initial-issuance-outcome-journal.ts";
export interface IssuanceStatusDependencies {
  readonly client: Parameters<typeof recordInitialIssuanceOutcome>[0];
  readonly configuration: IssuanceCommandConfiguration;
}
const unavailable = () => new CustodyError("issuance_status_unavailable", 503);
const failure = (error: CustodyError) => Response.json({ error: error.code }, { status: error.status, headers: { "cache-control": "no-store" } });
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
/** Historical lookup only: no signer, transport, reconciliation or write fallback. */
export async function issuanceStatusHttp(request: Request, dependencies: IssuanceStatusDependencies, pool: string): Promise<Response> {
  let command: Awaited<ReturnType<typeof verifyStatusCommand>>;
  try {
    if (dependencies.configuration.pool !== pool) throw unavailable();
    command = await verifyStatusCommand(request, dependencies.configuration);
  } catch (e) {
    if (e instanceof CustodyError && ((e.code === "invalid_request" && e.status === 400) ||
      (["stale_request", "invalid_signature"].includes(e.code) && e.status === 401))) return failure(e);
    return failure(unavailable());
  }
  try {
    const client = dependencies.client, args = { p_request_id: command.requestId, p_authorized_by: command.authenticatedAdmin };
    const load = "d1_load_issuance_outcome", reply = object(snapshot(await client.rpc(load, args)));
    check(Object.hasOwn(reply, "data") && Object.hasOwn(reply, "error"));
    if (reply.error !== null) {
      const e = object(reply.error);
      if (reply.data === null && e.code === "42501" && e.message === "unauthorized_admin_wallet") return failure(new CustodyError("unauthorized_admin_wallet", 403));
      throw unavailable();
    }
    const lookup = object(reply.data);
    check(Object.keys(lookup).length === 7 && lookup.kind === "d1_issuance_outcome_lookup" && lookup.revision === 1 &&
      lookup.namespace === command.namespace && lookup.pool === command.pool && lookup.network === "TESTNET" &&
      lookup.request_id === command.requestId && Object.hasOwn(lookup, "outcome"));
    if (lookup.outcome === null) return Response.json({ state: "outcome_not_recorded", verification: "unverified", requestId: command.requestId },
      { headers: { "cache-control": "no-store" } });
    object(lookup.outcome);
    const reads = new Set(["d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"]);
    let unsigned: DTO | undefined;
    const readonly: IssuanceStatusDependencies["client"] = { async rpc(name, parameters) {
      check(parameters.p_request_id === command.requestId && parameters.p_authorized_by === command.authenticatedAdmin &&
        Object.keys(parameters).length === (name === "d1_load_initial_financial_observation" ? 3 : 2));
      if (name === load) return { data: snapshot(lookup), error: null };
      check(reads.has(name));
      let captured: Awaited<ReturnType<typeof client.rpc>>;
      try { captured = snapshot(await client.rpc(name, parameters)); } catch { throw unavailable(); }
      if (name === "d1_load_unsigned_transaction") {
        const current = object(captured); if (unsigned !== undefined) check(same(unsigned, current)); unsigned = snapshot(current);
      }
      return captured;
    } };
    let receipt: Awaited<ReturnType<typeof recordInitialIssuanceOutcome>>;
    try { receipt = await recordInitialIssuanceOutcome(readonly, command); }
    catch (e) {
      if (e instanceof CustodyError && e.code === "unauthorized_admin_wallet" && e.status === 403) return failure(e);
      throw unavailable();
    }
    check(unsigned !== undefined);
    const journal = object(object(unsigned.data).transaction), preparation = object(object(object(journal.reservation).intent).preparation_input);
    const payment = object(preparation.payment), allocation = object(preparation.request);
    check(typeof payment.transaction_hash === "string" && /^[0-9a-f]{64}$/.test(payment.transaction_hash));
    const failed = receipt.observed_outcome.outcome === "failed";
    return Response.json({ state: failed ? "issuance_failed_observed" : "issuance_observed", verification: "persisted_sdk_observation",
      requestId: command.requestId, transactionHash: receipt.transaction_hash, donor: payment.donor, beneficiary: allocation.beneficiary,
      asset: allocation.asset, amount: allocation.amount, paymentTransactionHash: payment.transaction_hash, deadline: allocation.deadline,
      ...(!failed ? { claimableBalanceId: receipt.observed_outcome.claimableBalanceId } : {}) }, { headers: { "cache-control": "no-store" } });
  } catch { return failure(unavailable()); }
}
