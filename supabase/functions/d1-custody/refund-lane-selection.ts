import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { observeRefundLifecycle } from "./refund-lifecycle-observation.ts";
import { loadBeneficiaryClaim, recordBeneficiaryClaim } from "./beneficiary-claim-journal.ts";
import { observeCurrentRemainderFunding } from "./remainder-funding-observation.ts";
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
  | Readonly<{ kind: "proposed"; lane: "full_gross_v1" | "verified_remainder_v2" }>
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
const requestArguments = ["p_request_id", "p_authorized_by"];
const namespaceArguments = ["p_namespace", "p_authorized_by"];
// Actual helper RPC contracts. No writer belongs to this read capability.
const readArguments: Readonly<Record<string, readonly string[]>> = Object.freeze({
  d1_load_refund_lane_fence: requestArguments,
  d1_load_refund_outcome: requestArguments,
  d1_load_refund_candidate: requestArguments,
  d1_load_refund_submission_attempt: requestArguments,
  d1_load_refund_financial_observation: [...requestArguments, "p_snapshot_hash"],
  d1_load_issuance_outcome: requestArguments,
  d1_load_submission_attempt: requestArguments,
  d1_load_signed_transaction: requestArguments,
  d1_load_unsigned_transaction: requestArguments,
  d1_load_initial_financial_observation: [...requestArguments, "p_snapshot_hash"],
  d1_load_active_issuance_sequence: namespaceArguments,
  d1_load_transaction_history_state: namespaceArguments,
  d1_list_transaction_records: [...namespaceArguments, "p_after", "p_limit"],
  d1_load_beneficiary_claim: requestArguments,
  d1_list_beneficiary_claim_set: namespaceArguments,
  d1_load_issuance_fee_commitments: requestArguments,
  d1_load_discovery_state: namespaceArguments,
  d1_load_operating_credit_state: namespaceArguments,
  d1_list_operating_credits: [...namespaceArguments, "p_after", "p_limit"],
  d1_load_operating_credit: [...namespaceArguments, "p_operation_id"],
});
type Source = Pick<HorizonDiscoverySource, "readClaimableBalance"> &
  Partial<Pick<HorizonDiscoverySource, "readAccountAtCheckpoint">>;
/** Explicit trusted transport opt-in to genuine acquisition and its single039
 * evidence write, NOT a caller-provided claim, approval or execution permit. */
export interface RefundLaneAcquisitionOptions { readonly fetcher: typeof fetch }

/** Private fixed-scope selector. Only authentic positive claim membership plus
 * the real pre041 funding observer can propose v2. Neither proposal reserves. */
export function createRefundLaneSelector(client: Client, configuration: RefundLaneSelectorConfiguration,
  source?: Source, acquisition?: RefundLaneAcquisitionOptions): (requestId: string) => Promise<RefundLaneSelection> {
  const config = exact(configuration, ["namespace", "pool", "actor", "network", "now", "maximumAgeSeconds", "futureToleranceSeconds"]);
  const { namespace, pool, actor, maximumAgeSeconds, futureToleranceSeconds } = config;
  uuid(namespace); address(pool); address(actor); check(config.network === "TESTNET");
  check(typeof maximumAgeSeconds === "number" && Number.isInteger(maximumAgeSeconds) && maximumAgeSeconds > 0 && maximumAgeSeconds <= 30);
  check(typeof futureToleranceSeconds === "number" && Number.isInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
  const invoke = method(client, "rpc"), clock = method(configuration, "now");
  const now = () => { const value = clock(); seconds(value); return value; };
  const readBalance = source === undefined ? undefined : method(source, "readClaimableBalance");
  const readAccount = source !== undefined && "readAccountAtCheckpoint" in source
    ? method(source, "readAccountAtCheckpoint") : undefined;
  if (acquisition !== undefined) exact(acquisition, ["fetcher"]);
  const transport = acquisition === undefined ? undefined : method(acquisition, "fetcher");
  const fetcher: typeof fetch | undefined = transport === undefined ? undefined :
    (input, init) => transport(input, init) as ReturnType<typeof fetch>;
  return async requestId => {
    try {
      uuid(requestId);
      const scope = Object.freeze({ namespace, pool, requestId, authenticatedAdmin: actor });
      const call = async (name: string, args: Data) => {
        const reply = own(await invoke(name, Object.freeze(args)));
        check(Object.hasOwn(reply, "data") && reply.error === null);
        return { data: reply.data, error: null };
      };
      const bound: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
        check(Object.hasOwn(readArguments, name));
        const args = exact(parameters, readArguments[name]);
        check(args.p_authorized_by === actor);
        if (Object.hasOwn(args, "p_request_id")) check(args.p_request_id === requestId);
        if (Object.hasOwn(args, "p_namespace")) check(args.p_namespace === namespace);
        return await call(name, args);
      } });
      // This capability is passed ONLY to the genuine039 journal coordinator.
      // Mark before awaiting: even an ambiguous acknowledgement cannot retry.
      let evidenceWriteAttempted = false;
      const evidenceClient: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
        if (name !== "d1_record_beneficiary_claim") return await bound.rpc(name, parameters);
        check(fetcher !== undefined && !evidenceWriteAttempted);
        const args = exact(parameters, [...requestArguments, "p_acquisition"]);
        check(args.p_request_id === requestId && args.p_authorized_by === actor);
        const payload = own(args.p_acquisition), claim = own(payload.claim), proof = own(payload.acquisition);
        check(payload.kind === "d1_beneficiary_claim_acquisition" && payload.revision === 1 &&
          payload.positiveAcquisition === "pinned_testnet_horizon_beneficiary_transactions" &&
          claim.requestId === requestId && claim.namespace === namespace && claim.pool === pool && claim.network === "TESTNET" &&
          proof.requestId === requestId && proof.namespace === namespace && proof.pool === pool && proof.network === "TESTNET" &&
          proof.executionAuthority === false && proof.settlementAuthority === false);
        evidenceWriteAttempted = true;
        return await call(name, args);
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
      let lane: "full_gross_v1" | "verified_remainder_v2" = "full_gross_v1";
      let evidenceStillFresh = (_current: number) => true;
      if (initial.outcome === "success") {
        if (!readBalance) return held("evidence_unavailable");
        // Null is unknown, not an unclaimed/zero assertion. An unavailable039
        // read is also held, never skipped in favour of a v1 lookup.
        let receipt = await loadBeneficiaryClaim(bound, scope, { now });
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
        const deadline = Date.parse(lifecycle.deadline) / 1000; seconds(deadline);
        // A provider failure/404 is UNKNOWN. Only a separate authentic claim
        // and positive current funding may justify v2; failure itself cannot.
        let rawPresence: unknown, presenceUnavailable = false;
        try {
          rawPresence = await readBalance({ pool, claimableBalanceId: initial.claimableBalanceId,
            beneficiary: beneficiaries[0].destination, asset, amount: operation.amount, deadline: lifecycle.deadline,
            minimumLedger: initial.observation.ledger, now, maximumAgeSeconds, futureToleranceSeconds });
        } catch { presenceUnavailable = true; }
        if (!presenceUnavailable) {
          const presence = exact(rawPresence,
            ["verification", "state", "claimableBalanceId", "observedLedger", "ledgerHash", "observedClosedAt"]);
          check(presence.verification === "current_indexer_observation" && presence.state === "present" &&
            presence.claimableBalanceId === initial.claimableBalanceId);
          check(typeof presence.observedLedger === "number" && Number.isInteger(presence.observedLedger) &&
            presence.observedLedger >= initial.observation.ledger && presence.observedLedger <= 4294967295);
          check(typeof presence.ledgerHash === "string" && /^[0-9a-f]{64}$/.test(presence.ledgerHash));
          const closedAt = presence.observedClosedAt; seconds(closedAt);
          // A fresh but pre-expiry head cannot fix v1 while a claim is possible.
          check(closedAt >= deadline);
          evidenceStillFresh = current => current - closedAt <= maximumAgeSeconds && closedAt - current <= futureToleranceSeconds;
          check(evidenceStillFresh(now()));
          // Positive claims contradict current CB presence. Reread039 to catch
          // membership acquired during the provider await; never acquire here.
          if (receipt !== null || await loadBeneficiaryClaim(bound, scope, { now }) !== null)
            return held("evidence_unavailable");
        } else {
          if (!readAccount) return held("evidence_unavailable");
          if (receipt === null) {
            if (!fetcher) return held("evidence_unavailable");
            // Exactly this coordinator acquires/validates/persists039 under057.
            // Any failure, including a possibly committed write, exits to hold.
            receipt = await recordBeneficiaryClaim(evidenceClient, scope, { now, fetcher });
          }
          const claim = receipt.acquisition.claim;
          check(claim.requestId === requestId && claim.original.claimableBalanceId === initial.claimableBalanceId &&
            claim.original.issuanceTransactionHash === lifecycle.initial.unsigned018.transaction_hash &&
            claim.original.operationId === lifecycle.donation.paymentOperationId &&
            claim.original.paymentTransactionHash === lifecycle.donation.paymentTransactionHash &&
            claim.original.deadline === lifecycle.deadline && BigInt(claim.claimedPrincipalStroops) > 0n);
          const funding = await observeCurrentRemainderFunding(bound, scope, {
            source: Object.freeze({ readAccountAtCheckpoint(context: Parameters<HorizonDiscoverySource["readAccountAtCheckpoint"]>[0]) {
              return readAccount(context) as ReturnType<HorizonDiscoverySource["readAccountAtCheckpoint"]>;
            } }), now, maximumAgeSeconds, futureToleranceSeconds,
          });
          // Keep the canonical singleton claim/issuance restriction; the helper
          // authenticates complete039 membership/history and matching originals.
          check(funding.executionAuthority === false && funding.settlementAuthority === false &&
            funding.claimSet.count === 1 && funding.claimSet.receipts[0].request_id === requestId &&
            funding.claimSet.receipts[0].acquisition_hash === receipt.acquisition_hash &&
            funding.selected.operationId === lifecycle.donation.paymentOperationId &&
            funding.selected.transactionHash === lifecycle.donation.paymentTransactionHash &&
            BigInt(funding.selected.verifiedBeneficiaryPrincipalStroops) > 0n &&
            BigInt(funding.selected.remainingProtectedPrincipalStroops) > 0n);
          lane = "verified_remainder_v2";
          evidenceStillFresh = current => current >= funding.observedAt && current < funding.expiresAt;
        }
      } else check(initial.outcome === "failed");
      // Detect ownership acquired during observation; never switch lanes here.
      // SQL candidate creation, NOT this null reread, is the atomic exclusion.
      if (await readFence() !== null) return held("ownership_unresolved");
      const current = now();
      check(current >= lifecycle.observedAt && evidenceStillFresh(current));
      return Object.freeze({ kind: "proposed", lane });
    } catch {
      // Missing/invalid evidence or ambiguous039 writes hold. Never insert a
      // candidate, retry acquisition, or fall back to the opposite lane.
      return held("evidence_unavailable");
    }
  };
}
