import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { loadBeneficiaryClaim, type BeneficiaryClaimReceipt } from "./beneficiary-claim-journal.ts";
import { TransactionHistoryDatabase } from "./transaction-ingestion.ts";
import { calculateIssuanceEncumbrances } from "./issuance-encumbrances.ts";

type Client = Parameters<typeof loadBeneficiaryClaim>[0];
type Scope = Parameters<typeof loadBeneficiaryClaim>[1];
type Data = Record<string, unknown>;
type Asset = { type: "native" } | { type: "issued"; code: string; issuer: string };
const unavailable = () => new CustodyError("remainder_accounting_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, keys: string): Data {
  const data = fields(value);
  check(Object.keys(data).sort().join(",") === keys.split(",").sort().join(",")); return data;
}
/** Descriptor-only detached JSON, bounded before any SDK or async work. */
function snapshot<T>(value: T): T {
  let nodes = 0, budget = 33554432;
  const active = new Set<object>();
  const visit = (v: unknown, depth: number): unknown => {
    check(++nodes <= 200000 && depth <= 60 && (budget -= 8) >= 0);
    if (typeof v === "string") {
      check(v.length <= budget && !/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v));
      check((budget -= new TextEncoder().encode(JSON.stringify(v)).length) >= 0); return v;
    }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return v; }
    check(typeof v === "object" && v !== null && !active.has(v)); active.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      check(Object.getPrototypeOf(v) === Array.prototype);
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), n = ds.length.value;
      check(Number.isSafeInteger(n) && n >= 0 && n <= 200000 && Reflect.ownKeys(v).length === n + 1);
      result = Object.freeze(Array.from({ length: n }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d); return visit(d.value, depth + 1);
      }));
    } else result = Object.freeze(Object.fromEntries(Object.keys(fields(v)).sort().map(k => {
      visit(k, depth + 1); return [k, visit(Object.getOwnPropertyDescriptor(v, k)!.value, depth + 1)];
    })));
    active.delete(v); return result;
  };
  return visit(value, 0) as T;
}
const same = (a: unknown, b: unknown) => JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
function address(v: unknown): asserts v is string { check(typeof v === "string"); Keypair.fromPublicKey(v); }
function stroops(v: unknown, positive = false): bigint {
  check(typeof v === "string" && /^(0|[1-9][0-9]{0,18})$/.test(v));
  const n = BigInt(v); check(n <= 9223372036854775807n && (!positive || n > 0n)); return n;
}
function capture(receiver: unknown, name: string, own = false): (...args: unknown[]) => unknown {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, d: PropertyDescriptor | undefined;
  while (owner !== null) {
    d = Object.getOwnPropertyDescriptor(owner, name); if (d || own) break;
    owner = Object.getPrototypeOf(owner);
  }
  check(d && "value" in d && typeof d.value === "function");
  const fn = d.value; return (...args) => Reflect.apply(fn, receiver, args);
}
export interface AuthenticBeneficiaryClaimSet {
  readonly kind: "d1_beneficiary_claim_set";
  readonly revision: 1;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly history_state: Awaited<ReturnType<TransactionHistoryDatabase["loadState"]>>;
  readonly count: number;
  readonly receipts: readonly BeneficiaryClaimReceipt[];
  readonly set_hash: string;
}
/** Genuine complete039 membership + per-request J19b018/032/SDK validation.
 * Empty means exactly this saved set, never universal absence of chain claims. */
export async function readAuthenticBeneficiaryClaimSet(client: Client,
  configuration: Omit<Scope, "requestId">, options: { readonly now: () => number }): Promise<AuthenticBeneficiaryClaimSet> {
  let denied = false;
  try {
    const input = exact(snapshot(configuration), "namespace,pool,authenticatedAdmin");
    const { namespace, pool, authenticatedAdmin } = input;
    check(uuid(namespace)); address(pool); address(authenticatedAdmin); exact(options, "now");
    const invoke = capture(client, "rpc"), clock = capture(options, "now", true);
    let last = -1;
    const now = () => {
      const n = clock(); check(typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 253402300799 && n >= last);
      last = n; return n;
    };
    const args = Object.freeze({ p_namespace: namespace, p_authorized_by: authenticatedAdmin });
    const reads = new Set(["d1_load_beneficiary_claim", "d1_load_refund_outcome", "d1_load_refund_candidate",
      "d1_load_refund_submission_attempt", "d1_load_refund_financial_observation", "d1_load_issuance_outcome",
      "d1_load_submission_attempt", "d1_load_signed_transaction", "d1_load_unsigned_transaction",
      "d1_load_initial_financial_observation", "d1_load_active_issuance_sequence",
      "d1_load_transaction_history_state", "d1_list_transaction_records", "d1_list_beneficiary_claim_set"]);
    const call = async (name: string, parameters: Data) => {
      check(reads.has(name) && parameters.p_authorized_by === authenticatedAdmin);
      if (Object.hasOwn(parameters, "p_namespace")) check(parameters.p_namespace === namespace);
      const reply = exact(snapshot(await invoke(name, snapshot(parameters))), "data,error");
      if (reply.error !== null) {
        const e = fields(reply.error);
        if (reply.data === null && e.code === "42501" && e.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    const load = async () => {
      const set = exact(await call("d1_list_beneficiary_claim_set", args),
        "kind,revision,namespace,network,pool,history_state,count,receipts,set_hash");
      check(set.kind === "d1_beneficiary_claim_set" && set.revision === 1 && set.namespace === namespace &&
        set.network === "TESTNET" && set.pool === pool && hash(set.set_hash));
      check(typeof set.count === "number" && Number.isSafeInteger(set.count) && set.count >= 0 && set.count <= 1000 &&
        Array.isArray(set.receipts) && set.receipts.length === set.count); return set;
    };
    now();
    const initial = await load(); // Complete SQL set FIRST; never a caller-selected subset.
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      return { data: await call(name, parameters), error: null };
    } });
    const database = new TransactionHistoryDatabase(readonly, namespace, authenticatedAdmin, pool, "TESTNET");
    const saved = await new TransactionHistoryDatabase({ async rpc(name, parameters) {
      check(name === "d1_load_transaction_history_state" && same(parameters, args));
      return { data: initial.history_state, error: null };
    } }, namespace, authenticatedAdmin, pool, "TESTNET").loadState();
    check(saved.coverage_complete && saved.checkpoint !== null && same(await database.loadState(), saved));
    const used = new Set<string>(); let previous = "";
    for (const value of initial.receipts as unknown[]) {
      const r = exact(value, "kind,revision,request_id,namespace,network,pool,authorized_by,acquisition_hash,acquisition");
      check(r.kind === "d1_beneficiary_claim_journal" && r.revision === 1 && r.namespace === namespace &&
        r.network === "TESTNET" && r.pool === pool && uuid(r.request_id) && r.request_id > previous && hash(r.acquisition_hash));
      address(r.authorized_by); previous = r.request_id;
      const requestId = r.request_id;
      const scoped: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
        if (Object.hasOwn(parameters, "p_request_id")) check(parameters.p_request_id === requestId);
        return readonly.rpc(name, parameters);
      } });
      const genuine = await loadBeneficiaryClaim(scoped, { namespace, pool, requestId, authenticatedAdmin }, { now });
      check(genuine !== null && same(genuine, r));
      const c = genuine.acquisition.claim;
      const cb = c.original.claimableBalanceId, tx = c.observation.transactionHash, op = c.claimOperationIndex;
      check(/^00000000[0-9a-f]{64}$/.test(cb) && hash(tx) && Number.isSafeInteger(op) && op >= 0 && op <= 99);
      for (const key of ["request:" + requestId, "cb:" + cb, "txop:" + tx + ":" + op]) {
        check(!used.has(key)); used.add(key);
      }
    }
    // SQL jsonb::text hashes are preserved, NOT recomputed with JS serialization.
    check(same(await load(), initial) && same(await database.loadState(), saved));
    return snapshot(initial) as unknown as AuthenticBeneficiaryClaimSet;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
/** Pure evidence input, NOT an authenticated refund observation or financial capability.
 * A future observer must derive these from genuine saved membership + SDK inclusion. */
export interface PrincipalRefundFact {
  operationId: string; paymentTransactionHash: string; donor: string; asset: Asset;
  transactionHash: string; operationIndex: number; outcome: "success" | "failed" | "unknown";
  returnedPrincipalStroops: string | null; claimedBalanceId: string | null;
}
/** Pure cumulative principal projection. Supplied inputs do NOT authenticate themselves.
 * Issued CB encumbrance is never discharge; missing returns stay unknown/protected. */
export function calculateCumulativeRemainders(input: {
  originals: Parameters<typeof calculateIssuanceEncumbrances>[0];
  claims: readonly BeneficiaryClaimReceipt[]; refunds: readonly PrincipalRefundFact[];
}) {
  try {
    const data = snapshot(input); exact(data, "originals,claims,refunds");
    check(Array.isArray(data.claims) && data.claims.length <= 1000 && Array.isArray(data.refunds) && data.refunds.length <= 1000);
    // Reuses original SDK gross-income accounting and018/032 issuance identity mapping.
    const issued = calculateIssuanceEncumbrances(data.originals);
    const donations = new Map(issued.original.donations.map(d => [d.operationId, d]));
    const claims = new Map<string, bigint>(), returns = new Map<string, bigint>();
    const observed = new Set<string>(), unknown = new Set<string>(), used = new Set<string>();
    const unique = (key: string) => { check(!used.has(key)); used.add(key); };
    const identity = (id: string, tx: string, donor: string, asset: Asset) => {
      check(/^[1-9][0-9]{0,19}$/.test(id) && BigInt(id) <= 18446744073709551615n && hash(tx));
      const d = donations.get(id); check(d && d.transactionHash === tx && d.donor === donor && same(d.asset, asset)); return d;
    };
    const txop = (tx: string, op: number) => {
      check(hash(tx) && Number.isSafeInteger(op) && op >= 0 && op <= 99); unique("txop:" + tx + ":" + op);
    };
    for (const receipt of data.claims) {
      exact(receipt, "kind,revision,request_id,namespace,network,pool,authorized_by,acquisition_hash,acquisition");
      check(receipt.kind === "d1_beneficiary_claim_journal" && receipt.revision === 1 && uuid(receipt.request_id) && hash(receipt.acquisition_hash) &&
        receipt.namespace === data.originals.namespace && receipt.pool === data.originals.pool && receipt.network === "TESTNET");
      address(receipt.authorized_by);
      const c = receipt.acquisition.claim, o = c.original;
      const member = issued.encumbrances.find(e => e.requestId === receipt.request_id);
      check(member && same(member, o) && c.requestId === receipt.request_id && c.namespace === receipt.namespace && c.pool === receipt.pool &&
        c.network === "TESTNET" && c.kind === "d1_positive_beneficiary_claim" && c.revision === 1 && c.observation.outcome === "success");
      const d = identity(o.operationId, o.paymentTransactionHash, o.donor, o.asset);
      check(same(c.asset, d.asset) && stroops(c.originalGrossStroops, true) === stroops(d.amountStroops, true));
      const n = stroops(c.claimedPrincipalStroops, true); check(n === stroops(member.amountStroops, true));
      check(/^00000000[0-9a-f]{64}$/.test(o.claimableBalanceId));
      unique("request:" + receipt.request_id); unique("cb:" + o.claimableBalanceId); txop(c.observation.transactionHash, c.claimOperationIndex);
      claims.set(d.operationId, (claims.get(d.operationId) ?? 0n) + n);
    }
    for (const fact of data.refunds) {
      exact(fact, "operationId,paymentTransactionHash,donor,asset,transactionHash,operationIndex,outcome,returnedPrincipalStroops,claimedBalanceId");
      const d = identity(fact.operationId, fact.paymentTransactionHash, fact.donor, fact.asset);
      txop(fact.transactionHash, fact.operationIndex);
      check(fact.outcome === "success" || fact.outcome === "failed" || fact.outcome === "unknown");
      if (fact.outcome === "unknown") {
        check(fact.returnedPrincipalStroops === null && fact.claimedBalanceId === null); unknown.add(d.operationId); continue;
      }
      const n = stroops(fact.returnedPrincipalStroops, fact.outcome === "success");
      if (fact.outcome === "failed") check(n === 0n && fact.claimedBalanceId === null);
      if (fact.claimedBalanceId !== null) {
        check(/^00000000[0-9a-f]{64}$/.test(fact.claimedBalanceId) && issued.encumbrances.some(e =>
          e.operationId === d.operationId && e.claimableBalanceId === fact.claimedBalanceId));
        unique("cb:" + fact.claimedBalanceId);
      }
      observed.add(d.operationId); returns.set(d.operationId, (returns.get(d.operationId) ?? 0n) + n);
    }
    return snapshot({ kind: "d1_cumulative_remainders" as const, revision: 1 as const,
      executionAuthority: false as const, settlementAuthority: false as const,
      donations: issued.original.donations.map(d => {
        const gross = stroops(d.amountStroops, true), beneficiary = claims.get(d.operationId) ?? 0n, returned = returns.get(d.operationId) ?? 0n;
        const remaining = gross - beneficiary - returned;
        check(beneficiary <= gross && returned <= gross && remaining >= 0n && remaining <= 9223372036854775807n);
        return { ...d, verifiedBeneficiaryPrincipalStroops: beneficiary.toString(), verifiedSuccessfulDonorRefundStroops: returned.toString(),
          observedReturnedPrincipalStroops: observed.has(d.operationId) && !unknown.has(d.operationId) ? returned.toString() : null,
          remainingProtectedPrincipalStroops: remaining.toString(),
          returnUnresolved: !observed.has(d.operationId) || unknown.has(d.operationId),
          positivelyClaimedBalanceIds: data.claims.filter(r => r.acquisition.claim.original.operationId === d.operationId)
            .map(r => r.acquisition.claim.original.claimableBalanceId) };
      }), unmatchedActivity: issued.unmatchedActivity });
  } catch { throw unavailable(); }
}
