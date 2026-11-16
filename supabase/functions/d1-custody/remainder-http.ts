import { CustodyError } from "./handler.ts";
import { verifyRemainderCommand, type RemainderCommandConfiguration, type RemainderCommandScope } from "./remainder-command.ts";
import { REMAINDER_SAFE_ACTIONS, type RemainderHttpResponse, type RemainderAction } from "./remainder-http-contract.ts";
import { observeRemainderLifecycle } from "./remainder-lifecycle-observation.ts";
import { observeRefundLifecycle } from "./refund-lifecycle-observation.ts";
import { readRemainderSubmissionState } from "./remainder-outcome-observation.ts";
import { loadBeneficiaryClaim, recordBeneficiaryClaim } from "./beneficiary-claim-journal.ts";
import { ensureRemainderCandidate } from "./remainder-candidate-journal.ts";
import { observeAndSaveRemainderOutcome } from "./remainder-outcome-journal.ts";
import { submitRemainder } from "./remainder-submission.ts";
import { DiscoveryDatabase, ingestDiscoveryPage } from "./discovery-ingestion.ts";
import { TransactionHistoryDatabase, ingestTransactionPage } from "./transaction-ingestion.ts";
import type { HorizonDiscoverySource } from "./discovery-source.ts";

type Client = Parameters<typeof observeRemainderLifecycle>[0];
type Signer = Parameters<typeof submitRemainder>[2];
type Data = Record<string, unknown>;
export interface RemainderHttpDependencies {
  readonly client: Client;
  readonly configuration: RemainderCommandConfiguration;
  readonly source?: Pick<HorizonDiscoverySource, "readPage" | "readTransactionPageAtCheckpoint" | "readAccountAtCheckpoint">;
  readonly financial?: Omit<Signer["observation"], "source" | "now"> & Pick<Signer, "loadPoolSigner">;
  readonly construction?: { readonly feePerOperationStroops: string; readonly validUntil: number };
  readonly fetcher?: typeof fetch;
}
export type RemainderHttpHandler = (request: Request) => Promise<Response>;
const unavailable = () => new CustodyError("remainder_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.length <= 200000 && keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const d = fields(value); check(Object.keys(d).sort().join(",") === names.split(",").sort().join(",")); return d;
}
/** Detached bounded own JSON, never getters, serialization hooks or mutable aliases. */
function snapshot<T>(value: T): T {
  let nodes = 0, budget = 33554432;
  const active = new Set<object>();
  function visit(v: unknown, depth: number): unknown {
    check(++nodes <= 200000 && depth <= 60 && (budget -= 8) >= 0);
    if (typeof v === "string") {
      check(v.length <= budget && (budget -= new TextEncoder().encode(JSON.stringify(v)).length) >= 0); return v;
    }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return v; }
    check(v !== null && typeof v === "object" && !active.has(v)); active.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      check(Object.getPrototypeOf(v) === Array.prototype);
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), n = ds.length.value;
      check(Number.isSafeInteger(n) && n >= 0 && n <= 200000 && Reflect.ownKeys(v).length === n + 1);
      result = Object.freeze(Array.from({ length: n }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d); return visit(d.value, depth + 1);
      }));
    } else result = Object.freeze(Object.fromEntries(Object.entries(fields(v)).map(([k, x]) => {
      visit(k, depth + 1); return [k, visit(x, depth + 1)];
    })));
    active.delete(v); return result;
  }
  return visit(value, 0) as T;
}
function method<T extends object, K extends keyof T>(receiver: T, key: K): T[K] {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, d: PropertyDescriptor | undefined;
  const seen = new Set<object>();
  while (owner !== null) {
    check(!seen.has(owner)); seen.add(owner);
    d = Object.getOwnPropertyDescriptor(owner, key); if (d) break; owner = Object.getPrototypeOf(owner);
  }
  check(d && "value" in d && typeof d.value === "function");
  const fn = d.value; return ((...args: unknown[]) => Reflect.apply(fn, receiver, args)) as T[K];
}
const response = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
function stateResponse(dto: Readonly<RemainderHttpResponse>, action: RemainderAction): Response {
  const status = action === "refund_remainder_status" ? 200 : ["pending", "unknown"].includes(dto.state) ? 202 :
    action === "refund_remainder" && ["not_due", "blocked"].includes(dto.state) ? 409 : 200;
  return response(dto, status);
}
const reads = new Set(["d1_load_remainder_outcome", "d1_load_remainder_submission_attempt", "d1_load_remainder_signing_journal",
  "d1_load_remainder_financial_observation", "d1_load_remainder_candidate", "d1_load_beneficiary_claim", "d1_list_beneficiary_claim_set",
  "d1_load_refund_outcome", "d1_load_refund_candidate", "d1_load_refund_submission_attempt", "d1_load_refund_financial_observation",
  "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction",
  "d1_load_initial_financial_observation", "d1_load_active_issuance_sequence", "d1_load_transaction_history_state",
  "d1_list_transaction_records", "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits",
  "d1_load_operating_credit", "d1_load_issuance_fee_commitments", "d1_list_discovery_operations"]);
const ingestionWrites = ["d1_record_discovery_page", "d1_record_transaction_page"];
const executionWrites = ["d1_record_remainder_financial_observation",
  "d1_claim_remainder_signing", "d1_record_signed_remainder", "d1_claim_remainder_submission_attempt"];
/** Inert private factory: capture all capabilities/settings before any request await. */
export function createRemainderHttpHandler(dependencies: RemainderHttpDependencies): RemainderHttpHandler {
  const d = fields(dependencies);
  check(Object.keys(d).every(k => ["client", "configuration", "source", "financial", "construction", "fetcher"].includes(k)));
  const configuration = exact(d.configuration, "pool,namespace,now");
  const clock = method(d.configuration as RemainderCommandConfiguration, "now"), invoke = method(d.client as Client, "rpc");
  const proof = Object.freeze({ pool: configuration.pool as string, namespace: configuration.namespace as string, now: clock });
  const source = d.source as RemainderHttpDependencies["source"];
  const capturedSource = source === undefined ? undefined : Object.freeze({ readPage: method(source, "readPage"),
    readTransactionPageAtCheckpoint: method(source, "readTransactionPageAtCheckpoint"), readAccountAtCheckpoint: method(source, "readAccountAtCheckpoint") });
  const policy = d.financial === undefined ? undefined : exact(d.financial, "maximumAgeSeconds,futureToleranceSeconds,loadPoolSigner");
  const financial = policy === undefined ? undefined : snapshot({ maximumAgeSeconds: policy.maximumAgeSeconds,
    futureToleranceSeconds: policy.futureToleranceSeconds });
  const loadPoolSigner = financial === undefined ? undefined : method(d.financial as NonNullable<RemainderHttpDependencies["financial"]>, "loadPoolSigner");
  if (financial) check(typeof financial.maximumAgeSeconds === "number" && Number.isSafeInteger(financial.maximumAgeSeconds) &&
    financial.maximumAgeSeconds >= 1 && financial.maximumAgeSeconds <= 30 && typeof financial.futureToleranceSeconds === "number" &&
    Number.isSafeInteger(financial.futureToleranceSeconds) && financial.futureToleranceSeconds >= 0 && financial.futureToleranceSeconds <= 2);
  const construction = d.construction === undefined ? undefined : snapshot(exact(d.construction, "feePerOperationStroops,validUntil"));
  if (construction) check(typeof construction.feePerOperationStroops === "string" && /^[1-9][0-9]{0,9}$/.test(construction.feePerOperationStroops) &&
    BigInt(construction.feePerOperationStroops) <= 4294967295n && typeof construction.validUntil === "number" &&
    Number.isSafeInteger(construction.validUntil) && construction.validUntil >= 0 && construction.validUntil <= 253402300799);
  const fetcher = d.fetcher === undefined ? undefined : method(dependencies, "fetcher");
  return async request => {
    let command: Awaited<ReturnType<typeof verifyRemainderCommand>>;
    try { command = await verifyRemainderCommand(request, proof); }
    catch (error) {
      if (error instanceof CustodyError && ((error.status === 400 && error.code === "invalid_request") ||
        (error.status === 401 && ["stale_request", "invalid_signature"].includes(error.code)) ||
        (error.status === 404 && error.code === "not_found") || (error.status === 405 && error.code === "method_not_allowed")))
        return response({ error: error.code }, error.status);
      return response({ error: "remainder_unavailable" }, 503);
    }
    // Verified command has EXTRA discriminator/action keys; exact downstream scope has ONLY these four.
    const scope: RemainderCommandScope = Object.freeze({ namespace: command.namespace, pool: command.pool,
      requestId: command.requestId, authenticatedAdmin: command.authenticatedAdmin });
    let denied = false, missingOriginal = false, preflight = true, last = -1;
    const now = () => {
      const n = clock(); check(typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 253402300799 && n >= last);
      last = n; return n;
    };
    const clientFor = (writes: readonly string[] = []): Client => Object.freeze({ async rpc(name: string, parameters: Data) {
      const p = snapshot(parameters), write = writes.includes(name);
      check((reads.has(name) || write) && p.p_authorized_by === scope.authenticatedAdmin);
      if (Object.hasOwn(p, "p_namespace")) check(p.p_namespace === scope.namespace);
      if (write || name.startsWith("d1_load_remainder_")) {
        if (!ingestionWrites.includes(name)) check(p.p_request_id === scope.requestId);
      }
      // Genuine namespace claim-set validation needs other donors' READS, never their writes.
      const reply = exact(snapshot(await invoke(name, p)), "data,error");
      if (reply.error !== null) {
        const e = fields(reply.error);
        if (reply.data === null && e.code === "42501" && e.message === "unauthorized_admin_wallet") denied = true;
        if (preflight && name === "d1_load_unsigned_transaction" && reply.data === null && e.code === "22023" && e.message === "d1_preparation_not_found") missingOriginal = true;
        throw unavailable();
      }
      return { data: reply.data, error: null };
    } });
    const readonly = clientFor();
    const observe = () => observeRemainderLifecycle(readonly, scope, { now });
    const render = async (blocked = false) => {
      const dto = (await observe()).response;
      // Keep the genuine producer's identity, money/nulls and exact13 keys; no invented financial evidence.
      return stateResponse(blocked && ["blocked", "not_started"].includes(dto.state) ? { ...dto, state: "blocked", reason: "financial_precondition_unavailable",
        verification: "unverified", safeActions: REMAINDER_SAFE_ACTIONS.blocked } : dto, command.action);
    };
    const legacy = (l: Awaited<ReturnType<typeof observeRefundLifecycle>>) => l.candidate034 !== null ||
      l.signingClaim036 !== null || l.signed036 !== null || l.attempt037 !== null || l.outcome038 !== null;
    const owned = (l: Awaited<ReturnType<typeof observeRefundLifecycle>>) => l.joinedStable &&
      l.ownership.initial033 === "held" && l.ownership.refund034 === "absent" && !legacy(l) &&
      l.initial.outcome032?.observed_outcome.outcome === "success";
    const ingest = async () => {
      check(capturedSource);
      const client = clientFor(ingestionWrites);
      const discovery = await ingestDiscoveryPage(new DiscoveryDatabase(client, scope.namespace, scope.authenticatedAdmin), capturedSource);
      check(discovery.receipt.pool === scope.pool && discovery.completeAtAnchor);
      const history = await ingestTransactionPage(new TransactionHistoryDatabase(client, scope.namespace, scope.authenticatedAdmin, scope.pool, "TESTNET"), capturedSource);
      check(history.completeAtAnchor); // At most ONE page each; partial/unknown exits, never a loop/readback.
    };
    try {
      // Actual018 authenticates CURRENT admin before missing capabilities, providers or any prospective write.
      const original = exact((await readonly.rpc("d1_load_unsigned_transaction", {
        p_request_id: scope.requestId, p_authorized_by: scope.authenticatedAdmin })).data,
        "kind,revision,request_id,namespace,network,pool,reservation,transaction");
      preflight = false;
      check(original.kind === "d1_unsigned_transaction_lookup" && original.revision === 1 && original.request_id === scope.requestId &&
        original.namespace === scope.namespace && original.pool === scope.pool && original.network === "TESTNET");
      if (original.transaction === null) return response({ error: "request_not_found" }, 404);
      if (command.action === "refund_remainder_status") return await render();
      let reconciledIncompleteHistory = false;
      if (command.action === "refund_remainder_reconcile") {
        const discoveryState = await new DiscoveryDatabase(readonly, scope.namespace, scope.authenticatedAdmin).loadState();
        check(discoveryState.pool === scope.pool);
        //024 requires complete discovery: short-circuit BEFORE its validator when019 still needs coverage.
        const incomplete = !discoveryState.coverage_complete || !(await new TransactionHistoryDatabase(readonly,
          scope.namespace, scope.authenticatedAdmin, scope.pool, "TESTNET").loadState()).coverage_complete;
        if (incomplete) {
          //018 already authenticated this admin and original scope under database locks.
          // Its immutable deadline permits bounded observation ingestion ONLY, never financial execution.
          const saved = fields(original.transaction), reservation = fields(saved.reservation);
          const preparation = fields(fields(reservation.intent).preparation_input);
          check(saved.kind === "d1_unsigned_transaction_journal" && saved.revision === 1 &&
            saved.request_id === scope.requestId && saved.namespace === scope.namespace &&
            saved.network === "TESTNET" && saved.pool === scope.pool && preparation.request_id === scope.requestId &&
            typeof preparation.confirmed_at === "number" && Number.isSafeInteger(preparation.confirmed_at) &&
            preparation.confirmed_at >= 0 && preparation.confirmed_at <= 253402300499 &&
            saved.deadline === new Date((preparation.confirmed_at + 300) * 1000).toISOString().replace(".000Z", "Z"));
          check(now() >= preparation.confirmed_at + 300 && capturedSource && fetcher);
          await ingest(); // One page per stream. Partial/uncertain ACK stops; a LATER explicit reconcile resumes.
          reconciledIncompleteHistory = true;
        }
      }
      let initial = await observeRefundLifecycle(readonly, scope, { now });
      if (now() < Date.parse(initial.deadline) / 1000 || legacy(initial) || !owned(initial)) return await render();
      const submission = await readRemainderSubmissionState(readonly, scope, { now });
      const { candidate, claim, transaction } = submission.journal;
      if (command.action === "refund_remainder") {
        // Permanent046 and orphan045 exit BEFORE sources, ingestion, current finance or keys.
        if (submission.attempt || claim && !transaction) return await render();
        if (candidate && now() >= Number(candidate.valid_until)) return await render();
        if (!capturedSource || !financial || !loadPoolSigner || !fetcher || !candidate && !construction) return await render(true);
        if (!candidate && construction && now() >= (construction.validUntil as number)) return await render(true);
        const funding: Signer["observation"] = Object.freeze({ source: capturedSource, now,
          maximumAgeSeconds: financial.maximumAgeSeconds as number, futureToleranceSeconds: financial.futureToleranceSeconds as number });
        let beneficiary = await loadBeneficiaryClaim(readonly, scope, { now });
        if (!beneficiary) {
          // Missing039 is NOT evidence of no claim. Obtain positive proof internally, only after complete bounded history.
          await ingest();
          initial = await observeRefundLifecycle(readonly, scope, { now });
          check(owned(initial) && now() >= Date.parse(initial.deadline) / 1000);
          beneficiary = await recordBeneficiaryClaim(clientFor(["d1_record_beneficiary_claim"]), scope, { now, fetcher });
        }
        check(beneficiary !== null);
        if (!candidate) {
          check(construction);
          await ensureRemainderCandidate(clientFor(["d1_record_remainder_candidate"]), scope, { funding,
            feePerOperationStroops: construction.feePerOperationStroops as string, validUntil: construction.validUntil as number });
        }
        // Real J22c optional FIRST signing/fresh A+B/positive046 and one concrete POST. No separately invoked signer.
        await submitRemainder(clientFor(executionWrites), scope, Object.freeze({ observation: funding, loadPoolSigner }), fetcher);
        return await render(); // ACK remains unverified pending/unknown, never047 inclusion.
      }
      check(command.action === "refund_remainder_reconcile" && capturedSource);
      const beneficiary = await loadBeneficiaryClaim(readonly, scope, { now });
      check(beneficiary !== null || fetcher !== undefined); // No partial ingestion if acquisition capability is absent.
      if (!reconciledIncompleteHistory) await ingest();
      initial = await observeRefundLifecycle(readonly, scope, { now });
      check(owned(initial) && now() >= Date.parse(initial.deadline) / 1000);
      if (!beneficiary) {
        check(fetcher);
        await recordBeneficiaryClaim(clientFor(["d1_record_beneficiary_claim"]), scope, { now, fetcher });
      }
      // Fresh helper instances validate the NEW head; never pin pre-ingestion nulls/heads across authorized writes.
      const current = await readRemainderSubmissionState(readonly, scope, { now });
      if (current.attempt && current.journal.transaction && initial.history.records.some(r => r.transactionHash === current.journal.transaction!.transaction_hash))
        await observeAndSaveRemainderOutcome(clientFor(["d1_record_remainder_outcome"]), scope, { now });
      return await render();
    } catch {
      // Only the captured actual RPC denial flag is trusted; helper/source/signer/clock403 is unavailable.
      if (denied) return response({ error: "unauthorized_admin_wallet" }, 403);
      if (missingOriginal) return response({ error: "request_not_found" }, 404);
      return response({ error: "remainder_unavailable" }, 503); // NO automatic readback after uncertain writes/POST.
    }
  };
}
