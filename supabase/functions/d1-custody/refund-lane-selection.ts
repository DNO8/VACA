import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { observeRefundLifecycle } from "./refund-lifecycle-observation.ts";
import type { HorizonDiscoverySource } from "./discovery-source.ts";

type Client = Parameters<typeof observeRefundLifecycle>[0];
type Data = Record<string, unknown>;
export interface RefundLaneSelectorConfiguration {
  readonly namespace: string;
  readonly pool: string;
  readonly actor: string;
  readonly network: "TESTNET";
  readonly now: () => number;
  readonly maximumAgeSeconds: number;
  readonly futureToleranceSeconds: number;
}
/** Routing evidence only: neither a reservation nor permission to sign/send. */
export type RefundLaneSelection =
  | Readonly<{ kind: "existing"; lane: "full_gross_v1" | "verified_remainder_v2"; candidateHash: string }>
  | Readonly<{ kind: "proposed"; lane: "full_gross_v1" }>
  | Readonly<{ kind: "held"; reason: "foreign_owner" | "ownership_unresolved" | "not_due" | "evidence_unavailable" }>;
const unavailable = () => new CustodyError("refund_lane_selection_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function own(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && descriptors[k].enumerable && "value" in descriptors[k]));
  return Object.fromEntries(keys.map(k => [k, descriptors[k as string].value]));
}
function exact(value: unknown, keys: readonly string[]): Data {
  const data = own(value), names = Object.keys(data);
  check(names.length === keys.length && names.every(k => keys.includes(k))); return data;
}
function uuid(value: unknown): asserts value is string {
  check(typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value));
}
function address(value: unknown): asserts value is string {
  check(typeof value === "string" && Keypair.fromPublicKey(value).publicKey() === value);
}
function seconds(value: unknown): asserts value is number {
  check(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799);
}
function method(receiver: unknown, key: string): (...args: unknown[]) => unknown {
  check(receiver !== null && typeof receiver === "object");
  let current: object | null = receiver;
  for (let depth = 0; current !== null && depth < 8; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      check("value" in descriptor && typeof descriptor.value === "function");
      const fn = descriptor.value; return (...args) => Reflect.apply(fn, receiver, args);
    }
    current = Object.getPrototypeOf(current);
  }
  throw unavailable();
}
const held = (reason: Extract<RefundLaneSelection, { kind: "held" }>["reason"]): RefundLaneSelection =>
  Object.freeze({ kind: "held", reason });
const reads = new Set(["d1_load_refund_lane_fence", "d1_load_refund_outcome", "d1_load_refund_candidate",
  "d1_load_refund_submission_attempt", "d1_load_refund_financial_observation", "d1_load_issuance_outcome",
  "d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction",
  "d1_load_initial_financial_observation", "d1_load_active_issuance_sequence",
  "d1_load_transaction_history_state", "d1_list_transaction_records"]);

/** Private fixed-scope selector. Missing beneficiary/CB evidence never proposes a
 * lane. Positive unfenced remainder selection needs the actual acquisition path;
 * this module does not manufacture that evidence or an executor for it. */
export function createRefundLaneSelector(client: Client, configuration: RefundLaneSelectorConfiguration,
  source?: Pick<HorizonDiscoverySource, "readClaimableBalance">): (requestId: string) => Promise<RefundLaneSelection> {
  const config = exact(configuration, ["namespace", "pool", "actor", "network", "now", "maximumAgeSeconds", "futureToleranceSeconds"]);
  const { namespace, pool, actor, maximumAgeSeconds, futureToleranceSeconds } = config;
  uuid(namespace); address(pool); address(actor); check(config.network === "TESTNET");
  check(typeof maximumAgeSeconds === "number" && Number.isInteger(maximumAgeSeconds) && maximumAgeSeconds > 0 && maximumAgeSeconds <= 30);
  check(typeof futureToleranceSeconds === "number" && Number.isInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
  const invoke = method(client, "rpc"), clock = method(configuration, "now");
  const now = () => { const value = clock(); seconds(value); return value; };
  const readBalance = source === undefined ? undefined : method(source, "readClaimableBalance");
  return async requestId => {
    try {
      uuid(requestId);
      const scope = Object.freeze({ namespace, pool, requestId, authenticatedAdmin: actor });
      const bound: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
        const args = own(parameters);
        check(reads.has(name) && args.p_authorized_by === actor);
        if (Object.hasOwn(args, "p_request_id")) check(args.p_request_id === requestId);
        if (Object.hasOwn(args, "p_namespace")) check(args.p_namespace === namespace);
        if (Object.hasOwn(args, "p_pool")) check(args.p_pool === pool);
        const reply = own(await invoke(name, Object.freeze(args)));
        check(Object.hasOwn(reply, "data") && reply.error === null);
        return { data: reply.data, error: null };
      } });
      const readFence = async () => {
        const reply = await bound.rpc("d1_load_refund_lane_fence", { p_request_id: requestId, p_authorized_by: actor });
        const lookup = exact(reply.data, ["kind", "revision", "request_id", "namespace", "network", "pool", "fence"]);
        check(lookup.kind === "d1_refund_lane_fence_lookup" && lookup.revision === 1 && lookup.request_id === requestId &&
          lookup.namespace === namespace && lookup.network === "TESTNET" && lookup.pool === pool);
        if (lookup.fence === null) return null;
        const fence = exact(lookup.fence, ["kind", "revision", "namespace", "request_id", "network", "pool", "authorized_by", "lane", "candidate_hash"]);
        check(fence.kind === "d1_refund_lane_fence" && fence.revision === 1 && fence.namespace === namespace &&
          fence.network === "TESTNET" && fence.pool === pool);
        uuid(fence.request_id); address(fence.authorized_by);
        check(fence.lane === "full_gross_v1" || fence.lane === "verified_remainder_v2");
        check(typeof fence.candidate_hash === "string" && /^[0-9a-f]{64}$/.test(fence.candidate_hash));
        return Object.freeze({ requestId: fence.request_id, lane: fence.lane, candidateHash: fence.candidate_hash });
      };
      const fence = await readFence();
      if (fence && fence.requestId !== requestId) return held("foreign_owner");
      // Existing v2 identity is routing evidence only. Its genuine coordinator
      // must validate the candidate/hash and all permissions before any effect.
      if (fence?.lane === "verified_remainder_v2")
        return Object.freeze({ kind: "existing", lane: fence.lane, candidateHash: fence.candidateHash });
      const lifecycle = await observeRefundLifecycle(bound, scope, Object.freeze({ now }));
      if (!lifecycle.joinedStable || lifecycle.ownership.initial033 !== "held") return held("ownership_unresolved");
      if (fence) {
        if (lifecycle.ownership.refund034 !== "held" || lifecycle.candidate034?.transaction_hash !== fence.candidateHash)
          return held("ownership_unresolved");
        return Object.freeze({ kind: "existing", lane: "full_gross_v1", candidateHash: fence.candidateHash });
      }
      if (lifecycle.phase === "not_due") return held("not_due");
      if (lifecycle.phase !== "owned_no_refund_attempt" || lifecycle.ownership.refund034 !== "absent" ||
        lifecycle.candidate034 || lifecycle.signingClaim036 || lifecycle.signed036 || lifecycle.attempt037 || lifecycle.outcome038)
        return held("ownership_unresolved");
      const initial = lifecycle.initial.outcome032?.observed_outcome;
      if (!initial) return held("evidence_unavailable"); // Never-issued is not failed included issuance.
      if (initial.outcome === "success") {
        if (!readBalance) return held("evidence_unavailable");
        const xdr = lifecycle.initial.unsigned018.unsigned_xdr;
        check(typeof xdr === "string");
        // The lifecycle already reconstructed this exact original SDK plan.
        const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
        check(tx instanceof Transaction && tx.operations.length === 1);
        const operation = tx.operations[0]; check(operation.type === "createClaimableBalance");
        const beneficiaries = operation.claimants.filter(c => c.destination !== pool);
        check(operation.claimants.length === 2 && beneficiaries.length === 1);
        const asset = operation.asset.isNative() ? { type: "native" } :
          { type: "issued", code: operation.asset.getCode(), issuer: operation.asset.getIssuer() };
        const presence = exact(await readBalance({ pool, claimableBalanceId: initial.claimableBalanceId,
          beneficiary: beneficiaries[0].destination, asset, amount: operation.amount, deadline: lifecycle.deadline,
          minimumLedger: initial.observation.ledger, now, maximumAgeSeconds, futureToleranceSeconds }),
          ["verification", "state", "claimableBalanceId", "observedLedger", "ledgerHash", "observedClosedAt"]);
        check(presence.verification === "current_indexer_observation" && presence.state === "present" &&
          presence.claimableBalanceId === initial.claimableBalanceId);
        check(typeof presence.observedLedger === "number" && Number.isInteger(presence.observedLedger) &&
          presence.observedLedger >= initial.observation.ledger && presence.observedLedger <= 4294967295);
        check(typeof presence.ledgerHash === "string" && /^[0-9a-f]{64}$/.test(presence.ledgerHash));
        seconds(presence.observedClosedAt);
        const current = now();
        check(current >= lifecycle.observedAt && current - presence.observedClosedAt <= maximumAgeSeconds &&
          presence.observedClosedAt - current <= futureToleranceSeconds);
      } else check(initial.outcome === "failed");
      // Detect ownership acquired during observation; never switch lanes here.
      if (await readFence() !== null) return held("ownership_unresolved");
      check(now() >= lifecycle.observedAt);
      return Object.freeze({ kind: "proposed", lane: "full_gross_v1" });
    } catch {
      // Missing RPCs, 404/absence, stale data and ambiguous evidence all hold.
      // No candidate insertion, alternative lane, retry or evidence write occurs.
      return held("evidence_unavailable");
    }
  };
}
