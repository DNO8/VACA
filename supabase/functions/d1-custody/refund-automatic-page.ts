import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { createDueRefundOriginalsReader } from "./refund-due-originals.ts";
import { createRefundLaneSelector, type RefundLaneSelection } from "./refund-lane-selection.ts";
import { createRefundExecutor, type RefundExecutionDependencies } from "./refund-execution.ts";
import { createRemainderExecutor } from "./remainder-execution.ts";
import { DiscoveryDatabase, ingestDiscoveryPage } from "./discovery-ingestion.ts";
import { TransactionHistoryDatabase, ingestTransactionPage } from "./transaction-ingestion.ts";
import { recordInitialIssuanceOutcome } from "./initial-issuance-outcome-journal.ts";
import type { RefundSignerConfiguration } from "./refund-authorized-signer.ts";
import type { HorizonDiscoverySource } from "./discovery-source.ts";
import type { RefundAutomaticPageResult } from "./refund-automatic-http.ts";

export type { RefundAutomaticPageResult } from "./refund-automatic-http.ts";
type Client = RefundExecutionDependencies["client"];
type Source = Pick<HorizonDiscoverySource, "readPage" | "readTransactionPageAtCheckpoint" |
  "readAccountAtCheckpoint" | "readClaimableBalance">;
type Data = Record<string, unknown>;
type Lane = "full_gross_v1" | "verified_remainder_v2";
interface Fence { readonly requestId: string; readonly lane: Lane; readonly candidateHash: string }
export interface RefundAutomaticPageDependencies {
  readonly client: Client;
  readonly namespace: string;
  readonly pool: string;
  readonly actor: string;
  readonly network: "TESTNET";
  /** Trusted Unix seconds, not a caller timestamp. */
  readonly now: () => number;
  readonly source: Source;
  readonly financial: {
    readonly maximumAgeSeconds: number;
    readonly futureToleranceSeconds: number;
    readonly loadPoolSigner: RefundSignerConfiguration["loadPoolSigner"];
  };
  readonly feePerOperationStroops: string;
  readonly transactionLifetimeSeconds: number;
  readonly maxBatchSize: number;
  readonly fetcher: typeof fetch;
}
export type RefundAutomaticPage = (afterRequestId: string | null, limit: number) => Promise<RefundAutomaticPageResult>;
const unavailable = () => new CustodyError("refund_tick_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.length <= 200000 && keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const data = fields(value);
  check(Object.keys(data).sort().join(",") === names.split(",").sort().join(",")); return data;
}
function method<T extends object, K extends keyof T>(receiver: T, key: K): T[K] {
  check(receiver !== null && typeof receiver === "object");
  let owner: object | null = receiver;
  for (let depth = 0; owner !== null && depth < 16; depth++) {
    const d = Object.getOwnPropertyDescriptor(owner, key);
    if (d) {
      check("value" in d && typeof d.value === "function");
      const fn = d.value; return ((...args: unknown[]) => Reflect.apply(fn, receiver, args)) as T[K];
    }
    owner = Object.getPrototypeOf(owner);
  }
  throw unavailable();
}
/** Bound and detach RPC JSON before any nested identity access. */
function snapshot<T>(value: T): T {
  let nodes = 0, budget = 33554432;
  const active = new Set<object>();
  const visit = (v: unknown, depth: number): unknown => {
    check(++nodes <= 200000 && depth <= 60 && (budget -= 8) >= 0);
    if (typeof v === "string") {
      check(v.length <= budget && (budget -= new TextEncoder().encode(JSON.stringify(v)).length) >= 0); return v;
    }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return v; }
    check(v !== null && typeof v === "object" && !active.has(v)); active.add(v);
    let copy: unknown;
    if (Array.isArray(v)) {
      check(Object.getPrototypeOf(v) === Array.prototype);
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), n = ds.length.value;
      check(Number.isSafeInteger(n) && n >= 0 && n <= 200000 && Reflect.ownKeys(v).length === n + 1);
      copy = Object.freeze(Array.from({ length: n }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d); return visit(d.value, depth + 1);
      }));
    } else copy = Object.freeze(Object.fromEntries(Object.entries(fields(v)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, x]) => [visit(k, depth + 1), visit(x, depth + 1)])));
    active.delete(v); return copy;
  };
  return visit(value, 0) as T;
}
function uuid(value: unknown): asserts value is string {
  check(typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value));
}
function address(value: unknown): asserts value is string {
  check(typeof value === "string" && Keypair.fromPublicKey(value).publicKey() === value);
}
function integer(value: unknown, min: number, max: number): asserts value is number {
  check(typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max);
}
const requestArgs = "p_request_id,p_authorized_by", namespaceArgs = "p_namespace,p_authorized_by";
// Only the actual018/032 historical gate and019/024 ingestion graph. No initial
// issuance, reservation, candidate, signer, submission or administration writer.
const neutralArguments: Readonly<Record<string, string>> = Object.freeze({
  d1_load_refund_lane_fence: requestArgs,
  d1_load_unsigned_transaction: requestArgs,
  d1_load_issuance_outcome: requestArgs,
  d1_load_submission_attempt: requestArgs,
  d1_load_signed_transaction: requestArgs,
  d1_load_initial_financial_observation: requestArgs + ",p_snapshot_hash",
  d1_load_discovery_state: namespaceArgs,
  d1_load_transaction_history_state: namespaceArgs,
  d1_list_transaction_records: namespaceArgs + ",p_after,p_limit",
  d1_record_discovery_page: namespaceArgs + ",p_page",
  d1_record_transaction_page: namespaceArgs + ",p_page",
  d1_record_issuance_outcome: requestArgs + ",p_observed_outcome",
});
const ingestionWrites = new Set(["d1_record_discovery_page", "d1_record_transaction_page"]);
const laneWrites: Readonly<Record<Lane, ReadonlySet<string>>> = Object.freeze({
  full_gross_v1: new Set(["d1_record_refund_candidate", "d1_record_refund_financial_observation",
    "d1_claim_refund_signing", "d1_record_signed_refund_transaction", "d1_claim_refund_submission_attempt", "d1_record_refund_outcome"]),
  verified_remainder_v2: new Set(["d1_record_beneficiary_claim", "d1_record_remainder_candidate",
    "d1_record_remainder_financial_observation", "d1_claim_remainder_signing", "d1_record_signed_remainder",
    "d1_claim_remainder_submission_attempt", "d1_record_remainder_outcome"]),
});
// Genuine remainder claim-set/accounting helpers may read other originals in the
// same namespace. Their own validators join that membership; never allow writes.
const accountingReads = new Set(["d1_load_beneficiary_claim", "d1_load_refund_outcome", "d1_load_refund_candidate",
  "d1_load_refund_submission_attempt", "d1_load_refund_financial_observation", "d1_load_issuance_outcome",
  "d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction",
  "d1_load_initial_financial_observation", "d1_load_issuance_fee_commitments"]);

/** Private inert composition, NOT authentication, a scheduler or a distributed
 * lock. Dedicated HTTP authentication and SQL service admission are mandatory. */
export function createRefundAutomaticPage(dependencies: RefundAutomaticPageDependencies): RefundAutomaticPage {
  try {
    const d = exact(dependencies, "client,namespace,pool,actor,network,now,source,financial,feePerOperationStroops,transactionLifetimeSeconds,maxBatchSize,fetcher");
    const { namespace, pool, actor, feePerOperationStroops, transactionLifetimeSeconds, maxBatchSize } = d;
    uuid(namespace); address(pool); address(actor); check(d.network === "TESTNET");
    integer(transactionLifetimeSeconds, 1, 600); integer(maxBatchSize, 1, 50);
    check(typeof feePerOperationStroops === "string" && /^[1-9][0-9]{0,9}$/.test(feePerOperationStroops) &&
      BigInt(feePerOperationStroops) <= 4294967295n);
    const policy = exact(d.financial, "maximumAgeSeconds,futureToleranceSeconds,loadPoolSigner");
    const { maximumAgeSeconds, futureToleranceSeconds } = policy;
    integer(maximumAgeSeconds, 1, 30); integer(futureToleranceSeconds, 0, 2);
    const invoke = method(d.client as Client, "rpc"), clock = method(dependencies, "now");
    const transport = method(dependencies, "fetcher");
    const loadSigner = method(d.financial as RefundAutomaticPageDependencies["financial"], "loadPoolSigner");
    const source = d.source as Source;
    const capturedSource: Source = Object.freeze({ readPage: method(source, "readPage"),
      readTransactionPageAtCheckpoint: method(source, "readTransactionPageAtCheckpoint"),
      readAccountAtCheckpoint: method(source, "readAccountAtCheckpoint"), readClaimableBalance: method(source, "readClaimableBalance") });
    const financial = Object.freeze({ maximumAgeSeconds, futureToleranceSeconds,
      loadPoolSigner(requestedPool: string) { check(requestedPool === pool); return loadSigner(pool); } });
    // Normalize only the transport envelope; do not leak mutable result aliases or
    // Supabase metadata into helpers that require exactly {data,error}.
    const client: Client = Object.freeze({ async rpc(name: string, args: Data) {
      const reply = await invoke(name, snapshot(args));
      check(reply !== null && typeof reply === "object");
      const data = Object.getOwnPropertyDescriptor(reply, "data"), error = Object.getOwnPropertyDescriptor(reply, "error");
      check(data && "value" in data && error && "value" in error);
      return snapshot({ data: data.value, error: error.value });
    } });
    const reader = createDueRefundOriginalsReader(client, { namespace, pool, actor, network: "TESTNET" });
    let busy = false;
    return async function runPage(afterRequestId: string | null, limit: number): Promise<RefundAutomaticPageResult> {
      check(!busy);
      if (afterRequestId !== null) uuid(afterRequestId);
      integer(limit, 1, maxBatchSize);
      busy = true;
      try {
        let last = -1;
        const now = () => {
          const n = clock(); integer(n, 0, 253402300799); check(n >= last); last = n; return n;
        };
        const page = await reader.read(afterRequestId, limit);
        let held = 0;
        for (const requestId of page.requestIds) {
          try {
            const scope = Object.freeze({ namespace, pool, requestId, authenticatedAdmin: actor });
            const args = Object.freeze({ p_request_id: requestId, p_authorized_by: actor });
            // Shared budgets survive the neutral refresh and selected core. Even
            // a later reconcile cannot fetch a second generic page this original.
            let discoveryRead = false, transactionRead = false;
            const boundedSource: Source = Object.freeze({ ...capturedSource,
              readPage(context) {
                check(!discoveryRead && context.pool === pool); discoveryRead = true;
                return capturedSource.readPage(context);
              },
              readTransactionPageAtCheckpoint(context, after) {
                check(!transactionRead && context.pool === pool); transactionRead = true;
                return capturedSource.readTransactionPageAtCheckpoint(context, after);
              },
            });
            const attempted = new Set<string>();
            const neutral: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
              check(Object.hasOwn(neutralArguments, name));
              const p = exact(snapshot(parameters), neutralArguments[name]);
              check(p.p_authorized_by === actor);
              if (Object.hasOwn(p, "p_request_id")) check(p.p_request_id === requestId);
              if (Object.hasOwn(p, "p_namespace")) check(p.p_namespace === namespace);
              if (name.startsWith("d1_record_")) {
                check(!attempted.has(name)); attempted.add(name); // Before await, including uncertain ACKs.
              }
              const reply = await client.rpc(name, p); check(reply.error === null);
              if (name === "d1_load_discovery_state") check(fields(reply.data).pool === pool);
              return reply;
            } });
            const bound = (data: Data, kind: string, revision: number, id = requestId) => check(data.kind === kind &&
              data.revision === revision && data.request_id === id && data.namespace === namespace &&
              data.network === "TESTNET" && data.pool === pool);
            const parseFence = (value: unknown): Fence => {
              const f = exact(value, "kind,revision,namespace,request_id,network,pool,authorized_by,lane,candidate_hash");
              uuid(f.request_id); bound(f, "d1_refund_lane_fence", 1, f.request_id); address(f.authorized_by);
              check(f.lane === "full_gross_v1" || f.lane === "verified_remainder_v2");
              check(typeof f.candidate_hash === "string" && /^[0-9a-f]{64}$/.test(f.candidate_hash));
              return Object.freeze({ requestId: f.request_id, lane: f.lane, candidateHash: f.candidate_hash });
            };
            const readFence = async (): Promise<Fence | null> => {
              const lookup = exact((await neutral.rpc("d1_load_refund_lane_fence", args)).data,
                "kind,revision,request_id,namespace,network,pool,fence");
              bound(lookup, "d1_refund_lane_fence_lookup", 1);
              return lookup.fence === null ? null : parseFence(lookup.fence);
            };
            const first = await readFence(); // Foreign namespace owner holds BEFORE any provider/write.
            if (first !== null && first.requestId !== requestId) { held++; continue; }
            let selection: RefundLaneSelection;
            if (first !== null) {
              selection = { kind: "existing", lane: first.lane, candidateHash: first.candidateHash };
            } else {
              // Actual018 admission and immutable original deadline, not a renewed
              // refund transaction lifetime. This preflight grants evidence ONLY.
              const lookup = exact((await neutral.rpc("d1_load_unsigned_transaction", args)).data,
                "kind,revision,request_id,namespace,network,pool,reservation,transaction");
              bound(lookup, "d1_unsigned_transaction_lookup", 1);
              const saved = exact(lookup.transaction, "kind,revision,request_id,namespace,network,pool,deadline,transaction_sequence,reservation,unsigned_xdr,transaction_hash");
              bound(saved, "d1_unsigned_transaction_journal", 1);
              const reservation = fields(saved.reservation), intent = fields(reservation.intent);
              bound(reservation, "d1_issuance_sequence_reservation", 1); bound(intent, "d1_issuance_request_intent", 1);
              check(JSON.stringify(snapshot(lookup.reservation)) === JSON.stringify(snapshot(saved.reservation)));
              const preparation = fields(intent.preparation_input), payment = fields(preparation.payment), request = fields(preparation.request);
              check(preparation.request_id === requestId && payment.pool === pool);
              integer(preparation.confirmed_at, 0, 253402300499);
              const deadline = preparation.confirmed_at + 300;
              check(saved.deadline === new Date(deadline * 1000).toISOString().replace(".000Z", "Z") &&
                request.deadline === saved.deadline && now() >= deadline);
              const discovery = await ingestDiscoveryPage(new DiscoveryDatabase(neutral, namespace, actor), boundedSource);
              check(discovery.receipt.pool === pool && discovery.completeAtAnchor);
              const history = await ingestTransactionPage(new TransactionHistoryDatabase(neutral, namespace, actor, pool, "TESTNET"), boundedSource);
              check(history.completeAtAnchor);
              // Authentic032 historical SDK gate; no synthetic failure, issuance,
              // retry or readback after a partial/ambiguous write acknowledgement.
              await recordInitialIssuanceOutcome(neutral, scope);
              selection = await createRefundLaneSelector(client, { namespace, pool, actor, network: "TESTNET", now,
                maximumAgeSeconds, futureToleranceSeconds }, boundedSource, { fetcher: transport })(requestId);
            }
            if (selection.kind === "held") { held++; continue; }
            const lane = selection.lane;
            const engineClient: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
              const p = snapshot(parameters);
              check(p.p_authorized_by === actor);
              if (Object.hasOwn(p, "p_namespace")) check(p.p_namespace === namespace);
              if (Object.hasOwn(p, "p_pool")) check(p.p_pool === pool);
              if (Object.hasOwn(p, "p_request_id") && p.p_request_id !== requestId) {
                check(lane === "verified_remainder_v2" && accountingReads.has(name)); uuid(p.p_request_id);
              }
              if (ingestionWrites.has(name)) check(p.p_namespace === namespace);
              else if (!name.startsWith("d1_load_") && !name.startsWith("d1_list_"))
                check(laneWrites[lane].has(name) && p.p_request_id === requestId);
              const reply = await client.rpc(name, p);
              if (reply.error === null && name === "d1_load_discovery_state") check(fields(reply.data).pool === pool);
              return reply;
            } });
            const expectedHash = selection.kind === "existing" ? selection.candidateHash : null;
            const matchCandidateFence = async () => {
              // Match actual034/041 lookup shapes after read-only status and BEFORE
              // actions, including a candidate that raced an unfenced proposal.
              // Never reconstruct a hash from bytes or infer it from a public DTO.
              const fence = await readFence();
              if (fence) check(fence.requestId === requestId && fence.lane === lane);
              if (expectedHash !== null) check(fence && fence.candidateHash === expectedHash);
              const v1 = lane === "full_gross_v1";
              const reply = await engineClient.rpc(v1 ? "d1_load_refund_candidate" : "d1_load_remainder_candidate", args);
              check(reply.error === null);
              const lookup = exact(reply.data, "kind,revision,request_id,namespace,network,pool,candidate," + (v1 ? "active_request_id" : "fence"));
              bound(lookup, v1 ? "d1_refund_candidate_lookup" : "d1_remainder_candidate_lookup", v1 ? 1 : 2);
              if (lookup.candidate === null) {
                check(fence === null && expectedHash === null && (v1 ? lookup.active_request_id === null : lookup.fence === null));
                return;
              }
              const candidate = fields(lookup.candidate);
              bound(candidate, v1 ? "d1_refund_candidate" : "d1_remainder_candidate", v1 ? 1 : 2);
              check(fence && candidate.transaction_hash === fence.candidateHash);
              if (v1) check(lookup.active_request_id === requestId);
              else {
                const nested = parseFence(lookup.fence);
                check(nested.requestId === requestId && nested.lane === lane && nested.candidateHash === fence.candidateHash);
              }
            };
            // Factories capture absolute expiry. Construct anew per original,
            // and omit construction entirely for existing immutable candidates.
            const started = now();
            const construction = selection.kind === "proposed" ? Object.freeze({ feePerOperationStroops,
              validUntil: started + transactionLifetimeSeconds }) : undefined;
            if (construction) integer(construction.validUntil, 0, 253402300799);
            const options = { client: engineClient, now, source: boundedSource, financial, fetcher: transport,
              ...(construction ? { construction } : {}) };
            let settled = false;
            if (lane === "full_gross_v1") {
              const execute = createRefundExecutor(options);
              let result = await execute(scope, "refund_status");
              if (result.kind === "state") await matchCandidateFence();
              if (result.kind === "state" && result.state.state !== "settled") {
                if (result.state.safeActions.includes("refund")) result = await execute(scope, "refund");
                else if (result.state.safeActions.includes("refund_reconcile")) result = await execute(scope, "refund_reconcile");
              }
              settled = result.kind === "state" && result.state.state === "settled";
            } else {
              const execute = createRemainderExecutor(options);
              let result = await execute(scope, "refund_remainder_status");
              if (result.kind === "state") await matchCandidateFence();
              if (result.kind === "state" && result.state.state !== "settled") {
                if (result.state.safeActions.includes("refund_remainder")) result = await execute(scope, "refund_remainder");
                else if (result.state.safeActions.includes("refund_remainder_reconcile")) result = await execute(scope, "refund_remainder_reconcile");
              }
              settled = result.kind === "state" && result.state.state === "settled";
            }
            if (!settled) held++; // Includes ACK, pending, refund_observed, unknown and errors.
          } catch { held++; } // Continue only to the next original; never retry/fallback/read back.
        }
        return Object.freeze({ processed: page.requestIds.length, held, nextAfterRequestId: page.nextAfterRequestId });
      } catch { throw unavailable(); }
      finally { busy = false; }
    };
  } catch { throw unavailable(); }
}
