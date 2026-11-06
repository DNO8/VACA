import { CustodyError } from "./handler.ts";
import { verifyReconciliationCommand, type IssuanceCommandConfiguration } from "./issuance-command.ts";
import { withInitialSubmissionAuthorization } from "./initial-submission-authorization.ts";
import { recordInitialIssuanceOutcome } from "./initial-issuance-outcome-journal.ts";
import { DiscoveryDatabase, ingestDiscoveryPage } from "./discovery-ingestion.ts";
import { TransactionHistoryDatabase, ingestTransactionPage } from "./transaction-ingestion.ts";
import type { HorizonDiscoverySource } from "./discovery-source.ts";

export interface ReconciliationHttpDependencies {
  readonly client: Parameters<typeof recordInitialIssuanceOutcome>[0];
  readonly configuration: IssuanceCommandConfiguration & {
    readonly source: Pick<HorizonDiscoverySource, "readPage" | "readTransactionPageAtCheckpoint">;
  };
}
const unavailable = () => new CustodyError("issuance_reconciliation_unavailable", 503);
function check(v: unknown): asserts v { if (!v) throw unavailable(); }
type DTO = Record<string, unknown>;
function object(v: unknown): v is DTO { return v !== null && typeof v === "object" && !Array.isArray(v); }
// Capture descriptors before values: neither a lookup nor a nested SDK input may invoke getters.
function snapshot<T>(input: T): T {
  const seen = new Set<object>(); let nodes = 0, characters = 0;
  function visit(v: unknown, depth: number) {
    check(++nodes <= 20000 && depth <= 40);
    if (typeof v === "string") { check((characters += v.length) <= 2097152); return; }
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return; }
    check(typeof v === "object" && v !== null && !seen.has(v)); seen.add(v);
    check(Object.getPrototypeOf(v) === (Array.isArray(v) ? Array.prototype : Object.prototype) || Object.getPrototypeOf(v) === null);
    check(Object.getOwnPropertySymbols(v).length === 0);
    if (Array.isArray(v)) check(v.length <= 20000 && Object.keys(v).length === v.length && Object.keys(v).every((k, i) => k === String(i)));
    const ds = Object.getOwnPropertyDescriptors(v);
    check(Object.keys(ds).length === Object.keys(v).length + (Array.isArray(v) ? 1 : 0));
    for (const [k, d] of Object.entries(ds)) {
      check(!d.get && !d.set); if (Array.isArray(v) && k === "length") continue;
      check(d.enumerable && (characters += k.length) <= 2097152); visit(d.value, depth + 1);
    }
  }
  visit(input, 0); const text = JSON.stringify(input);
  check(new TextEncoder().encode(text).length <= 2097152); return JSON.parse(text);
}
/** Explicit one-page progress only; an included SDK observation is not settlement or retry authority. */
export async function reconcileHttp(request: Request, dependencies: ReconciliationHttpDependencies, pool: string): Promise<Response> {
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
  let command: Awaited<ReturnType<typeof verifyReconciliationCommand>>;
  try {
    check(dependencies.configuration.pool === pool);
    command = await verifyReconciliationCommand(request, dependencies.configuration);
  } catch (error) {
    if (error instanceof CustodyError && ((error.status === 400 && error.code === "invalid_request") ||
      (error.status === 401 && ["stale_request", "invalid_signature"].includes(error.code)))) return reply({ error: error.code }, error.status);
    return reply({ error: unavailable().code }, 503);
  }
  let denied = false;
  try {
    const { configuration, client } = dependencies, source = configuration.source;
    check(typeof source?.readPage === "function" && typeof source?.readTransactionPageAtCheckpoint === "function");
    const bound = { namespace: command.namespace, pool: command.pool, requestId: command.requestId, authenticatedAdmin: command.authenticatedAdmin };
    const args = { p_request_id: command.requestId, p_authorized_by: command.authenticatedAdmin };
    const rpc: ReconciliationHttpDependencies["client"]["rpc"] = async (name, parameters) => {
      const r = snapshot(await client.rpc(name, parameters));
      check(object(r) && Object.hasOwn(r, "data") && Object.hasOwn(r, "error"));
      if (r.error !== null) {
        if (r.data === null && object(r.error) && r.error.code === "42501" && r.error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      if (name === "d1_load_submission_attempt") check(object(r.data) && r.data.attempt !== null);
      if (name === "d1_load_discovery_state") check(object(r.data) && r.data.pool === pool);
      return { data: r.data, error: null };
    };
    const reads = ["d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation"];
    const readonly = { async rpc(name: string, parameters: Record<string, unknown>) {
      check(reads.includes(name)); return await rpc(name, parameters);
    } };
    const never = (): never => { throw unavailable(); };
    const gate = await withInitialSubmissionAuthorization(readonly, { ...bound, now: never, maximumAgeSeconds: 30,
      futureToleranceSeconds: 2, loadPoolSigner: never, source: { readAccountAtCheckpoint: never } }, never);
    check(gate.invoked === false);
    const lookup = (await rpc("d1_load_issuance_outcome", args)).data;
    check(object(lookup) && Object.keys(lookup).length === 7 && lookup.kind === "d1_issuance_outcome_lookup" && lookup.revision === 1 &&
      lookup.request_id === bound.requestId && lookup.namespace === bound.namespace && lookup.network === "TESTNET" && lookup.pool === pool &&
      Object.hasOwn(lookup, "outcome") && (lookup.outcome === null || object(lookup.outcome)));
    const transactionHash = gate.attempt.transaction_hash;
    check(typeof transactionHash === "string" && /^[0-9a-f]{64}$/.test(transactionHash));
    const progress = (stage: string) => reply({ state: "reconciliation_progress", requestId: bound.requestId, transactionHash, stage }, 202);
    const existing = lookup.outcome !== null;
    if (!existing) {
      const discovery = await ingestDiscoveryPage(new DiscoveryDatabase({ rpc }, bound.namespace, bound.authenticatedAdmin), source);
      check(discovery.receipt.pool === pool);
      if (!discovery.completeAtAnchor) return progress("discovery");
      // Load 024 only after the awaited income save; an explicit later call may refresh the anchor again.
      const transactions = await ingestTransactionPage(new TransactionHistoryDatabase({ rpc }, bound.namespace, bound.authenticatedAdmin, pool, "TESTNET"), source);
      if (!transactions.completeAtAnchor) return progress("transactions");
    }
    const result = await recordInitialIssuanceOutcome({ async rpc(name, parameters) {
      if (name === "d1_load_issuance_outcome") return { data: structuredClone(lookup), error: null };
      check(reads.includes(name) || (!existing && ["d1_load_transaction_history_state", "d1_list_transaction_records", "d1_record_issuance_outcome"].includes(name)));
      return await rpc(name, parameters);
    } }, bound);
    check(result.transaction_hash === transactionHash);
    return reply({ state: "issuance_outcome_recorded", requestId: bound.requestId, transactionHash, outcome: result.observed_outcome.outcome }, 200);
  } catch {
    return reply({ error: denied ? "unauthorized_admin_wallet" : unavailable().code }, denied ? 403 : 503);
  }
}
