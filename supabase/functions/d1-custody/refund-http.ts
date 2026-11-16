import { CustodyError } from "./handler.ts";
import { verifyRefundCommand, type RefundCommandConfiguration } from "./refund-command.ts";
import { REFUND_SAFE_ACTIONS, type RefundHttpResponse, type RefundState, type RefundReason } from "./refund-http-contract.ts";
import { ensureRecoveryRefundCandidate, type RefundCandidateScope } from "./refund-candidate-journal.ts";
import { observeRefundSettlement } from "./refund-settlement-observation.ts";
import { submitRefund } from "./refund-submission.ts";
import { recordRefundOutcome } from "./refund-outcome-journal.ts";
import { DiscoveryDatabase, ingestDiscoveryPage } from "./discovery-ingestion.ts";
import { TransactionHistoryDatabase, ingestTransactionPage } from "./transaction-ingestion.ts";
import type { HorizonDiscoverySource } from "./discovery-source.ts";

type Client = Parameters<typeof observeRefundSettlement>[0];
type Observation = Awaited<ReturnType<typeof observeRefundSettlement>>;
type Signer = Parameters<typeof submitRefund>[2];
type Data = Record<string, unknown>;
export interface RefundHttpDependencies {
  readonly client: Client;
  readonly configuration: RefundCommandConfiguration;
  readonly source?: Pick<HorizonDiscoverySource, "readPage" | "readTransactionPageAtCheckpoint" |
    "readAccountAtCheckpoint" | "readClaimableBalance">;
  readonly financial?: Omit<Signer["observation"], "source" | "now"> & Pick<Signer, "loadPoolSigner">;
  readonly construction?: { readonly feePerOperationStroops: string; readonly validUntil: number };
  readonly fetcher?: typeof fetch;
}
export type RefundHttpHandler = (request: Request) => Promise<Response>;
const unavailable = () => new CustodyError("refund_unavailable", 503);
function check(v: unknown): asserts v { if (!v) throw unavailable(); }
function fields(v: unknown): Data {
  check(v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(v), keys = Reflect.ownKeys(v);
  check(keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(v: unknown, names: string): Data {
  const d = fields(v); check(Object.keys(d).sort().join(",") === names.split(",").sort().join(",")); return d;
}
function method<T extends object, K extends keyof T>(receiver: T, key: K): T[K] {
  check(receiver !== null && typeof receiver === "object");
  let owner: object | null = receiver, d: PropertyDescriptor | undefined;
  while (owner !== null) { d = Object.getOwnPropertyDescriptor(owner, key); if (d) break; owner = Object.getPrototypeOf(owner); }
  check(d && "value" in d && typeof d.value === "function");
  const fn = d.value; return ((...args: unknown[]) => Reflect.apply(fn, receiver, args)) as T[K];
}
/** Bounded own-data capture before SDK/helper access; no hooks or raw diagnostics. */
function snapshot<T>(input: T): T {
  const active = new Set<object>(); let nodes = 0, budget = 33554432;
  const visit = (v: unknown, depth: number): unknown => {
    check(++nodes <= 200000 && depth <= 60 && (budget -= 8) >= 0);
    if (typeof v === "string") { check((budget -= new TextEncoder().encode(JSON.stringify(v)).length) >= 0); return v; }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return v; }
    check(v !== null && typeof v === "object" && !active.has(v)); active.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), n = ds.length.value;
      check(Object.getPrototypeOf(v) === Array.prototype && Number.isSafeInteger(n) && n >= 0 && n <= 200000 && Reflect.ownKeys(v).length === n + 1);
      result = Object.freeze(Array.from({ length: n }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d); return visit(d.value, depth + 1);
      }));
    } else result = Object.freeze(Object.fromEntries(Object.entries(fields(v)).map(([k, x]) => [visit(k, depth + 1), visit(x, depth + 1)])));
    active.delete(v); return result;
  };
  return visit(input, 0) as T;
}
const response = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
function publicState(observation: Observation, override?: "unknown" | "blocked"): RefundHttpResponse {
  const l = observation.lifecycle;
  let state: RefundState = "unknown", reason: RefundReason = "outcome_unresolved";
  if (l.joinedStable) {
    if (observation.settled) { state = "settled"; reason = null; }
    else if (l.phase === "refund_observed") { state = "refund_observed"; reason = null; }
    else if (l.phase === "refund_failed_observed") { state = "refund_failed_observed"; reason = "refund_failed"; }
    else if (l.phase === "not_due") { state = "not_due"; reason = "deadline_not_reached"; }
    else if (["owned_no_refund_attempt", "candidate_saved"].includes(l.phase)) { state = "not_started"; reason = null; }
  }
  if (override) { state = override; reason = override === "blocked" ? "financial_precondition_unavailable" : "outcome_unresolved"; }
  // J15a has validated exact full-gross SDK body/signature and original032 CB ID.
  // Unsigned candidates and signing claims alone never become public refunds.
  let refund: RefundHttpResponse["refund"] = null;
  if (l.signed036 && l.candidate034 && l.initial.outcome032) {
    const transactionHash = l.signed036.transaction_hash;
    const claimableBalanceId = l.initial.outcome032.observed_outcome.claimableBalanceId;
    check(typeof transactionHash === "string" && /^[0-9a-f]{64}$/.test(transactionHash) && transactionHash === l.candidate034.transaction_hash &&
      (claimableBalanceId === null || /^00000000[0-9a-f]{64}$/.test(claimableBalanceId)));
    refund = Object.freeze({ transactionHash, amount: l.donation.grossAmount, claimableBalanceId });
  }
  if (["refund_observed", "refund_failed_observed"].includes(state)) check(refund !== null);
  return Object.freeze({ version: 1, network: "TESTNET", namespace: l.scope.namespace, pool: l.scope.pool,
    requestId: l.scope.requestId, state, verification: ["settled", "refund_observed", "refund_failed_observed"].includes(state) ? "persisted_sdk_observation" : "unverified",
    deadline: l.deadline, donation: l.donation, refund,
    settlement: override ? { beneficiaryClaimedAmount: null, donorRefundedAmount: null, remainingPrincipalAmount: null } : observation.settlement,
    safeActions: REFUND_SAFE_ACTIONS[state], reason });
}
function stateResponse(dto: RefundHttpResponse, action: string): Response {
  const status = action === "refund_status" ? 200 : ["pending", "unknown"].includes(dto.state) ? 202 :
    action === "refund" && ["not_due", "blocked"].includes(dto.state) ? 409 : 200;
  return response(dto, status);
}
/** Inert server-only factory. No environment, route mount, provider default or key read. */
export function createRefundHttpHandler(dependencies: RefundHttpDependencies): RefundHttpHandler {
  const d = fields(dependencies), configuration = exact(d.configuration, "pool,namespace,now");
  const clock = method(d.configuration as RefundCommandConfiguration, "now");
  const proof = Object.freeze({ pool: configuration.pool as string, namespace: configuration.namespace as string, now: clock });
  const invoke = method(d.client as Client, "rpc");
  // Capture optional capabilities now, but never call them on the status route.
  const source = d.source as RefundHttpDependencies["source"];
  const capturedSource = source === undefined ? undefined : Object.freeze({
    readPage: method(source, "readPage"), readTransactionPageAtCheckpoint: method(source, "readTransactionPageAtCheckpoint"),
    readAccountAtCheckpoint: method(source, "readAccountAtCheckpoint"), readClaimableBalance: method(source, "readClaimableBalance"),
  });
  const financial = d.financial === undefined ? undefined : exact(d.financial, "maximumAgeSeconds,futureToleranceSeconds,loadPoolSigner");
  const loadPoolSigner = financial === undefined ? undefined : method(d.financial as NonNullable<RefundHttpDependencies["financial"]>, "loadPoolSigner");
  const construction = d.construction === undefined ? undefined : snapshot(exact(d.construction, "feePerOperationStroops,validUntil"));
  const fetcher = d.fetcher as typeof fetch | undefined;
  return async request => {
    let command: Awaited<ReturnType<typeof verifyRefundCommand>>;
    try { command = await verifyRefundCommand(request, proof); }
    catch (error) {
      if (error instanceof CustodyError && ((error.status === 400 && error.code === "invalid_request") ||
        (error.status === 401 && ["stale_request", "invalid_signature"].includes(error.code)) ||
        (error.status === 404 && error.code === "not_found") || (error.status === 405 && error.code === "method_not_allowed")))
        return response({ error: error.code }, error.status);
      return response({ error: "refund_unavailable" }, 503);
    }
    let denied = false;
    const scope: RefundCandidateScope = Object.freeze({ namespace: command.namespace, pool: command.pool,
      requestId: command.requestId, authenticatedAdmin: command.authenticatedAdmin });
    const client: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      check(parameters.p_authorized_by === scope.authenticatedAdmin);
      if (Object.hasOwn(parameters, "p_request_id")) check(parameters.p_request_id === scope.requestId);
      if (Object.hasOwn(parameters, "p_namespace")) check(parameters.p_namespace === scope.namespace);
      const reply = exact(snapshot(await invoke(name, snapshot(parameters))), "data,error");
      if (reply.error !== null) {
        const error = fields(reply.error);
        if (reply.data === null && error.code === "42501" && error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      if (name === "d1_load_discovery_state") check(fields(reply.data).pool === scope.pool);
      return { data: reply.data, error: null };
    } });
    const observe = () => observeRefundSettlement(client, scope, Object.freeze({ now: clock }));
    try {
      if (command.action === "refund_reconcile") {
        // Actual018 reader authenticates CURRENT DB membership and original scope
        // even when incomplete history prevents a genuine lifecycle DTO yet.
        const r = await client.rpc("d1_load_unsigned_transaction", { p_request_id: scope.requestId, p_authorized_by: scope.authenticatedAdmin });
        const lookup = exact(r.data, "kind,revision,request_id,namespace,network,pool,reservation,transaction");
        check(lookup.kind === "d1_unsigned_transaction_lookup" && lookup.revision === 1 && lookup.request_id === scope.requestId &&
          lookup.namespace === scope.namespace && lookup.pool === scope.pool && lookup.network === "TESTNET" && lookup.transaction !== null);
        check(capturedSource !== undefined);
        const discovery = await ingestDiscoveryPage(new DiscoveryDatabase(client, scope.namespace, scope.authenticatedAdmin), capturedSource);
        check(discovery.receipt.pool === scope.pool);
        // A partial save cannot supply a fresh honest13-field DTO. Fail closed;
        // subsequent EXPLICIT reconcile calls may advance one more page.
        if (!discovery.completeAtAnchor) throw unavailable();
        const transactions = await ingestTransactionPage(new TransactionHistoryDatabase(client, scope.namespace, scope.authenticatedAdmin, scope.pool, "TESTNET"), capturedSource);
        if (!transactions.completeAtAnchor) throw unavailable();
        const before = await observe(), l = before.lifecycle;
        if (!l.joinedStable) return stateResponse(publicState(before, "unknown"), command.action);
        // Complete history ABSENCE is unknown, never a failed transaction.
        if (l.attempt037 && l.signed036 && !l.outcome038 &&
          l.history.records.some(r => r.transactionHash === l.signed036!.transaction_hash)) {
          await recordRefundOutcome(client, scope); // Unknown write exits directly to sanitized error.
          return stateResponse(publicState(await observe()), command.action);
        }
        const dto = publicState(before, l.attempt037 && !l.outcome038 ? "unknown" : undefined);
        return stateResponse(dto, command.action);
      }
      const before = await observe(), l = before.lifecycle;
      if (command.action === "refund_status") return stateResponse(publicState(before), command.action);
      if (!l.joinedStable || l.phase === "unknown") return stateResponse(publicState(before, "unknown"), command.action);
      if (before.settled || l.outcome038 || l.phase === "not_due") return stateResponse(publicState(before), command.action);
      if (l.attempt037 || (l.signingClaim036 && !l.signed036))
        return stateResponse(publicState(before, "unknown"), command.action);
      check(["owned_no_refund_attempt", "candidate_saved", "signed_saved"].includes(l.phase));
      if (!capturedSource || !financial || !loadPoolSigner || typeof fetcher !== "function" || (!l.candidate034 && !construction))
        return stateResponse(publicState(before, "blocked"), command.action);
      const signer: Signer = Object.freeze({ observation: Object.freeze({ now: clock, source: capturedSource,
        maximumAgeSeconds: financial.maximumAgeSeconds as number, futureToleranceSeconds: financial.futureToleranceSeconds as number }), loadPoolSigner });
      if (!l.candidate034) {
        check(construction && l.initial.outcome032);
        const now = clock(); check(Number.isSafeInteger(now) && now >= l.observedAt);
        await ensureRecoveryRefundCandidate(client, scope, { sourceSequence: l.initial.outcome032.observed_outcome.observation.sequence,
          feePerOperationStroops: construction.feePerOperationStroops as string, now, validUntil: construction.validUntil as number });
      }
      // J7 internally revalidates fresh finances, saves/reloads036, claims037
      // and calls the concrete one-POST transport only for its positive first claim.
      await submitRefund(client, scope, signer, fetcher);
      // An ACK is not inclusion. Read only after an unambiguous gate return;
      // all ambiguous writes/POSTs throw and exit WITHOUT automatic readback.
      return stateResponse(publicState(await observe(), "unknown"), command.action);
    } catch {
      return response({ error: denied ? "unauthorized_admin_wallet" : "refund_unavailable" }, denied ? 403 : 503);
    }
  };
}
