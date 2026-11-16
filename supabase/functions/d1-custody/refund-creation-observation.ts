import { CustodyError } from "./handler.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { observePoolCreation, type PoolCreationEvidence } from "./pool-creation-eligibility.ts";
import { captureRefundReadClient, validateRefundAccountBinding } from "./refund-account-observation.ts";
import { observeSavedRefundClaimableBalance, type SavedRefundClaimableOptions,
  type SavedRefundClaimableObservation } from "./refund-claimable-observation.ts";

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
type Client = Parameters<typeof observeSavedRefundClaimableBalance>[0];
type Scope = Parameters<typeof observeSavedRefundClaimableBalance>[1];
export interface SavedRefundCreationObservation {
  readonly kind: "d1_saved_refund_creation_observation";
  readonly revision: 1;
  readonly creation: DeepReadonly<PoolCreationEvidence>;
  readonly observation: SavedRefundClaimableObservation;
  readonly observedAt: number;
}
const unavailable = () => new CustodyError("refund_creation_observation_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function snapshot<T>(value: T, active = new Set<object>()): T {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { check(Number.isSafeInteger(value)); return value; }
  check(typeof value === "object" && !active.has(value));
  const array = Array.isArray(value), descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype));
  check(keys.every(k => typeof k === "string" && "value" in descriptors[k] &&
    (descriptors[k].enumerable || (array && k === "length"))));
  active.add(value);
  let result: unknown;
  if (array) {
    const length = descriptors.length.value;
    check(keys.length === length + 1);
    result = Array.from({ length }, (_, i) => {
      check(Object.hasOwn(descriptors, String(i)));
      return snapshot(descriptors[String(i)].value, active);
    });
  } else {
    result = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, snapshot(descriptor.value, active)]));
  }
  active.delete(value);
  return result as T;
}
function capture(receiver: unknown, key: string): (...args: unknown[]) => unknown {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  const seen = new Set<object>();
  let owner: object | null = receiver;
  while (owner !== null) {
    check(!seen.has(owner)); seen.add(owner);
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor) {
      check("value" in descriptor && typeof descriptor.value === "function");
      const method = descriptor.value;
      return (...args) => Reflect.apply(method, receiver, args);
    }
    owner = Object.getPrototypeOf(owner);
  }
  throw unavailable();
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Current-incarnation/CB consistency only; all new dependencies remain UNVERIFIED.
 * This does not authorize spending or establish credit/principal/fee eligibility.
 */
export async function observeSavedRefundCreation(
  client: Client, scope: Scope, options: SavedRefundClaimableOptions,
): Promise<SavedRefundCreationObservation> {
  let denied = false;
  try {
    const input = snapshot(scope);
    check(input !== null && typeof input === "object" && !Array.isArray(input));
    check(Object.keys(input).sort().join(",") === "authenticatedAdmin,namespace,pool,requestId");
    check(options !== null && typeof options === "object" && Object.getPrototypeOf(options) === Object.prototype);
    const d = Object.getOwnPropertyDescriptors(options), keys = Reflect.ownKeys(options);
    check(keys.every(k => typeof k === "string" && "value" in d[k] && d[k].enumerable));
    check(["now", "maximumAgeSeconds", "futureToleranceSeconds"].every(k => Object.hasOwn(d, k)) &&
      keys.length === 3 + (Object.hasOwn(d, "source") ? 1 : 0));
    const maximumAgeSeconds = d.maximumAgeSeconds.value, futureToleranceSeconds = d.futureToleranceSeconds.value;
    check(typeof maximumAgeSeconds === "number" && Number.isSafeInteger(maximumAgeSeconds) && maximumAgeSeconds >= 1 && maximumAgeSeconds <= 30);
    check(typeof futureToleranceSeconds === "number" && Number.isSafeInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    const now = capture(options, "now"), source = d.source?.value === undefined ? new HorizonDiscoverySource() : d.source.value;
    const readAccount = capture(source, "readAccountAtCheckpoint"), readBalance = capture(source, "readClaimableBalance");
    const readClient = captureRefundReadClient(client);
    let last = -1;
    const clock = () => {
      const value = now();
      check(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value >= last);
      last = value;
      return value;
    };
    // The creation reader's broad catch must never classify a provider's forged 403.
    const provider: NonNullable<SavedRefundClaimableOptions["source"]> = {
      async readAccountAtCheckpoint(context) {
        try { return snapshot(await readAccount(context)) as Awaited<ReturnType<HorizonDiscoverySource["readAccountAtCheckpoint"]>>; }
        catch { throw unavailable(); }
      },
      async readClaimableBalance(context) {
        try { return snapshot(await readBalance(context)) as Awaited<ReturnType<HorizonDiscoverySource["readClaimableBalance"]>>; }
        catch { throw unavailable(); }
      },
    };
    const trusted = async <T>(operation: () => Promise<T>): Promise<T> => {
      try { return await operation(); } catch (error) {
        denied = error instanceof CustodyError && error.status === 403 &&
          error.code === "unauthorized_admin_wallet" && error.message === error.code;
        throw error;
      }
    };
    const startedAt = clock();
    const creation = snapshot(await trusted(() => observePoolCreation(readClient,
      input.namespace, input.authenticatedAdmin, input.pool, provider)));
    clock();
    const observation = snapshot(await trusted(() => observeSavedRefundClaimableBalance(readClient, input,
      { now: clock, maximumAgeSeconds, futureToleranceSeconds, source: provider })));
    clock();
    const { history, account, candidate } = observation, cp = history.state.checkpoint;
    check(cp !== null && creation.kind === "d1_pool_creation_evidence" && creation.revision === 1 && creation.network === "TESTNET");
    check(creation.namespace === input.namespace && creation.pool === input.pool && creation.firstLedger === history.state.first_ledger);
    check(creation.anchor.sequence === cp.through_ledger && creation.anchor.hash === cp.ledger_hash && creation.anchor.closedAt === cp.closed_at);
    check(account.anchor.sequence === creation.anchor.sequence && account.anchor.hash === creation.anchor.hash &&
      account.anchor.closedAt === creation.anchor.closedAt && account.lastModifiedLedger >= creation.creation.ledger);
    // Bind the public creation proof back to the actual complete accounting input.
    const first = history.records[0], proof = creation.creation;
    check(first !== undefined && first.outcome === "success" && first.transactionHash === proof.transactionHash &&
      first.ledger === proof.ledger && first.closedAt === proof.closedAt);
    check(Number.isSafeInteger(proof.operationIndex) && proof.operationIndex >= 0 &&
      BigInt(first.pagingToken) + BigInt(proof.operationIndex + 1) === BigInt(proof.operationId));
    validateRefundAccountBinding(candidate, history.state, account,
      { startedAt, observedAt: last, maximumAgeSeconds, futureToleranceSeconds });
    // Keep the nested endpoint intact; the outer endpoint is independently named.
    return freeze({ kind: "d1_saved_refund_creation_observation" as const, revision: 1 as const,
      creation, observation, observedAt: last });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
