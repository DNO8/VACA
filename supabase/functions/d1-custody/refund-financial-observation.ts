import { Networks, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { observeSavedRefundFunding, type SavedRefundFundingObservation } from "./refund-funding-observation.ts";
import { captureRefundReadClient, validateRefundAccountBinding } from "./refund-account-observation.ts";

type Client = Parameters<typeof observeSavedRefundFunding>[0];
type Scope = Parameters<typeof observeSavedRefundFunding>[1];
type Options = Parameters<typeof observeSavedRefundFunding>[2];
export interface RefundFinancialSnapshot {
  readonly kind: "d1_refund_financial_snapshot";
  readonly revision: 1;
  readonly requestId: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly funding: SavedRefundFundingObservation;
}
export interface RefundFinancialObservation {
  readonly kind: "d1_refund_financial_observation";
  readonly revision: 1;
  readonly request_id: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly authorized_by: string;
  readonly transaction_hash: string;
  readonly snapshot_hash: string;
  readonly observed_at: number;
  readonly expires_at: number;
  readonly snapshot: RefundFinancialSnapshot;
}
const unavailable = () => new CustodyError("refund_financial_observation_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && descriptors[k].enumerable && "value" in descriptors[k]));
  return Object.fromEntries(keys.map(k => [k, descriptors[k as string].value]));
}
function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  check(Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)));
}
function copy(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { check(Number.isFinite(value)); return value; }
  check(typeof value === "object" && value !== null && !seen.has(value));
  seen.add(value);
  let result: unknown;
  if (Array.isArray(value)) {
    check(Object.getPrototypeOf(value) === Array.prototype);
    const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value), length = descriptors.length.value;
    check(typeof length === "number" && Number.isSafeInteger(length) && length >= 0 && Reflect.ownKeys(value).length === length + 1);
    result = Object.freeze(Array.from({ length }, (_, i) => {
      const d = descriptors[String(i)]; check(d && "value" in d && d.enumerable); return copy(d.value, seen);
    }));
  } else result = Object.freeze(Object.fromEntries(Object.entries(fields(value)).map(([k, v]) => [k, copy(v, seen)])));
  seen.delete(value); return result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const data = value as Record<string, unknown>;
    return `{${Object.keys(data).sort().map(k => `${JSON.stringify(k)}:${canonical(data[k])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value); check(typeof encoded === "string"); return encoded;
}
function captureRPC(client: Client): (name: string, parameters: Record<string, unknown>) => ReturnType<Client["rpc"]> {
  check(client !== null && (typeof client === "object" || typeof client === "function"));
  let owner: object | null = client, descriptor: PropertyDescriptor | undefined;
  const seen = new Set<object>();
  while (owner !== null) {
    check(!seen.has(owner)); seen.add(owner);
    descriptor = Object.getOwnPropertyDescriptor(owner, "rpc"); if (descriptor) break;
    owner = Object.getPrototypeOf(owner);
  }
  check(descriptor && "value" in descriptor && typeof descriptor.value === "function");
  const method = descriptor.value;
  return (name, parameters) => Reflect.apply(method, client, [name, parameters]);
}
/** Persists validated evidence through the genuine RPCs; NOT a read-only runtime,
 * signer capability or mounted endpoint. SQL/service admission remains separate.
 * Calls the genuine funding observer; callers cannot supply an approved snapshot.
 */
export async function observeAndSaveRefundFinancialEvidence(
  client: Client, scope: Scope, options: Options,
): Promise<Readonly<RefundFinancialObservation>> {
  let denied = false;
  try {
    const input = fields(scope); exact(input, ["namespace", "pool", "requestId", "authenticatedAdmin"]);
    check(Object.values(input).every(v => typeof v === "string"));
    const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
    check(uuid(input.namespace) && uuid(input.requestId));
    check(StrKey.isValidEd25519PublicKey(input.pool as string) && StrKey.isValidEd25519PublicKey(input.authenticatedAdmin as string));
    const capturedScope = Object.freeze({ ...input }) as unknown as Scope;
    const configuration = fields(options), hasSource = Object.hasOwn(configuration, "source");
    exact(configuration, ["now", "maximumAgeSeconds", "futureToleranceSeconds", ...(hasSource ? ["source"] : [])]);
    const { now, maximumAgeSeconds, futureToleranceSeconds } = configuration;
    check(typeof now === "function" && typeof maximumAgeSeconds === "number" && Number.isSafeInteger(maximumAgeSeconds) &&
      maximumAgeSeconds >= 1 && maximumAgeSeconds <= 30 && typeof futureToleranceSeconds === "number" &&
      Number.isSafeInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    const clock = () => Reflect.apply(now, options, []);
    const capturedOptions = Object.freeze({ now: clock, maximumAgeSeconds, futureToleranceSeconds,
      ...(hasSource ? { source: configuration.source } : {}) }) as Options;
    const invoke = captureRPC(client), capturedClient = Object.freeze({ rpc: invoke });
    // Only this leaf retains persistence access; descendants get the existing read allowlist.
    const readClient = captureRefundReadClient(capturedClient);
    let funding: SavedRefundFundingObservation;
    try { funding = await observeSavedRefundFunding(readClient, capturedScope, capturedOptions); }
    catch (error) {
      denied = error instanceof CustodyError && error.status === 403 &&
        error.code === "unauthorized_admin_wallet" && error.message === error.code;
      throw error;
    }
    const observation = funding.creationObservation.observation, { candidate, account, history } = observation;
    const tx = TransactionBuilder.fromXDR(candidate.unsigned_xdr, Networks.TESTNET);
    check(tx instanceof Transaction && tx.signatures.length === 0 && tx.toXDR() === candidate.unsigned_xdr &&
      tx.source === candidate.pool && tx.sequence === candidate.transaction_sequence && tx.hash().toString("hex") === candidate.transaction_hash);
    const maximumTime = tx.timeBounds?.maxTime;
    check(typeof maximumTime === "string" && /^[1-9][0-9]*$/.test(maximumTime));
    const maxTime = Number(maximumTime); check(Number.isSafeInteger(maxTime));
    const expiresAt = Math.min(maxTime, account.anchor.closedAt + maximumAgeSeconds);
    check(Number.isSafeInteger(expiresAt) && expiresAt > funding.observedAt);
    const snapshot: RefundFinancialSnapshot = Object.freeze({ kind: "d1_refund_financial_snapshot", revision: 1,
      requestId: capturedScope.requestId, namespace: capturedScope.namespace, network: "TESTNET", pool: capturedScope.pool,
      observedAt: funding.observedAt, expiresAt, funding });
    check(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength <= 16777216);
    let lastObservedAt = funding.observedAt;
    const finalWindow = (): void => {
      const observedAt = clock(); check(typeof observedAt === "number" && Number.isSafeInteger(observedAt) &&
        observedAt >= lastObservedAt && observedAt < expiresAt);
      validateRefundAccountBinding(candidate, history.state, account,
        { startedAt: funding.observedAt, observedAt, maximumAgeSeconds, futureToleranceSeconds });
      lastObservedAt = observedAt;
    };
    const rpcData = async (name: "d1_record_refund_financial_observation" | "d1_load_refund_financial_observation",
      parameters: Record<string, unknown>): Promise<unknown> => {
      const reply = fields(copy(await invoke(name, Object.freeze(parameters))));
      check(Object.hasOwn(reply, "error") && reply.error === null && Object.hasOwn(reply, "data"));
      return reply.data;
    };
    finalWindow();
    const saved = fields(await rpcData("d1_record_refund_financial_observation", {
      p_request_id: capturedScope.requestId, p_authorized_by: capturedScope.authenticatedAdmin, p_snapshot: snapshot,
    }));
    exact(saved, ["kind", "revision", "request_id", "namespace", "network", "pool", "authorized_by",
      "transaction_hash", "snapshot_hash", "observed_at", "expires_at", "snapshot"]);
    check(saved.kind === "d1_refund_financial_observation" && saved.revision === 1 &&
      saved.request_id === capturedScope.requestId && saved.namespace === capturedScope.namespace &&
      saved.network === "TESTNET" && saved.pool === capturedScope.pool && saved.transaction_hash === candidate.transaction_hash &&
      typeof saved.authorized_by === "string" && StrKey.isValidEd25519PublicKey(saved.authorized_by) &&
      typeof saved.snapshot_hash === "string" && /^[0-9a-f]{64}$/.test(saved.snapshot_hash) &&
      saved.observed_at === snapshot.observedAt && saved.expires_at === snapshot.expiresAt &&
      canonical(saved.snapshot) === canonical(snapshot));
    finalWindow();
    const lookup = fields(await rpcData("d1_load_refund_financial_observation", {
      p_request_id: capturedScope.requestId, p_authorized_by: capturedScope.authenticatedAdmin, p_snapshot_hash: saved.snapshot_hash,
    }));
    exact(lookup, ["kind", "revision", "request_id", "namespace", "network", "pool", "transaction_hash", "snapshot_hash", "observation"]);
    check(lookup.kind === "d1_refund_financial_observation_lookup" && lookup.revision === 1 &&
      lookup.request_id === capturedScope.requestId && lookup.namespace === capturedScope.namespace &&
      lookup.network === "TESTNET" && lookup.pool === capturedScope.pool && lookup.transaction_hash === candidate.transaction_hash &&
      lookup.snapshot_hash === saved.snapshot_hash && canonical(lookup.observation) === canonical(saved));
    // Replies are already detached/frozen before this final caller-owned clock.
    finalWindow();
    return Object.freeze(saved) as unknown as Readonly<RefundFinancialObservation>;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
