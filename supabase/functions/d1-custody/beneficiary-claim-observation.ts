import { Keypair, Networks, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { calculateIssuanceEncumbrances } from "./issuance-encumbrances.ts";
import { recordInitialIssuanceOutcome } from "./initial-issuance-outcome-journal.ts";
import { readTransactionHistory } from "./transaction-history-reader.ts";
import { parseIncludedTransaction } from "./transaction-observation.ts";

type Client = Parameters<typeof readTransactionHistory>[0];
type Data = Record<string, unknown>;
type Scope = { namespace: string; pool: string; requestId: string; authenticatedAdmin: string };
type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
export interface BeneficiaryClaimProvenance {
  namespace: string; pool: string; firstLedger: number;
  anchor: { sequence: number; hash: string; closedAt: number };
  transactions: Parameters<typeof calculateIssuanceEncumbrances>[0]["transactions"];
  unsignedJournal: unknown; outcomeReceipt: unknown;
}
const unavailable = () => new CustodyError("beneficiary_claim_observation_unavailable", 503);
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
/** Bounded, descriptor-only detached JSON; accessors and serialization hooks are rejected. */
function snapshot<T>(value: T): Frozen<T> {
  let nodes = 0, budget = 33554432;
  const active = new Set<object>();
  const visit = (v: unknown, depth: number): unknown => {
    check(++nodes <= 200000 && depth <= 60 && (budget -= 8) >= 0);
    if (typeof v === "string") {
      check(v.length <= budget && (budget -= new TextEncoder().encode(JSON.stringify(v)).length) >= 0); return v;
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
    } else {
      result = Object.freeze(Object.fromEntries(Object.entries(fields(v)).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => {
        visit(k, depth + 1); return [k, visit(x, depth + 1)];
      })));
    }
    active.delete(v); return result;
  };
  return visit(value, 0) as Frozen<T>;
}
const same = (a: unknown, b: unknown) => JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function address(v: unknown): asserts v is string { check(typeof v === "string"); Keypair.fromPublicKey(v); }
function captureRPC(client: Client): Client["rpc"] {
  check(client !== null && (typeof client === "object" || typeof client === "function"));
  let owner: object | null = client, d: PropertyDescriptor | undefined;
  while (owner !== null) {
    d = Object.getOwnPropertyDescriptor(owner, "rpc"); if (d) break; owner = Object.getPrototypeOf(owner);
  }
  check(d && "value" in d && typeof d.value === "function");
  const method = d.value;
  return (name, args) => Reflect.apply(method, client, [name, args]);
}
/** Pure SDK consistency only. Supplied provenance is independently parsed, NOT authenticated.
 * Use the observer below for actual persisted membership; neither API proves consensus. */
export function parseBeneficiaryClaim(provenance: BeneficiaryClaimProvenance, rawInput: unknown) {
  try {
    const p = exact(snapshot(provenance), "namespace,pool,firstLedger,anchor,transactions,unsignedJournal,outcomeReceipt");
    check(Array.isArray(p.transactions));
    const accounting = calculateIssuanceEncumbrances({
      namespace: p.namespace as string, pool: p.pool as string, firstLedger: p.firstLedger as number,
      anchor: p.anchor as BeneficiaryClaimProvenance["anchor"], transactions: p.transactions,
      operatingCredits: [], issuances: [{ unsignedJournal: p.unsignedJournal, outcomeReceipt: p.outcomeReceipt }],
    });
    check(accounting.encumbrances.length === 1);
    const original = accounting.encumbrances[0];
    const observation = parseIncludedTransaction(snapshot(rawInput));
    check(observation.outcome === "success" && observation.context.pool === p.pool &&
      observation.context.firstLedger === p.firstLedger && same(observation.context.anchor, p.anchor));
    const initial = accounting.original.donations.find(d => d.operationId === original.operationId);
    const issuance = p.transactions.find(r => fields(r).transactionHash === original.issuanceTransactionHash);
    check(initial && issuance);
    const issuedObservation = fields(issuance);
    check(typeof issuedObservation.pagingToken === "string" && BigInt(observation.pagingToken) > BigInt(issuedObservation.pagingToken) &&
      typeof issuedObservation.closedAt === "number" && observation.closedAt >= issuedObservation.closedAt &&
      observation.closedAt >= initial.confirmedAt && observation.closedAt < Date.parse(original.deadline) / 1000);
    const tx = TransactionBuilder.fromXDR(observation.envelopeXdr, Networks.TESTNET);
    check(tx instanceof Transaction);
    const min = tx.timeBounds?.minTime, max = tx.timeBounds?.maxTime;
    check((min === undefined && max === undefined) ||
      (typeof min === "string" && typeof max === "string" && BigInt(min) <= BigInt(observation.closedAt) &&
        (max === "0" || BigInt(max) >= BigInt(observation.closedAt))));
    const indices: number[] = [];
    tx.operations.forEach((operation, index) => {
      if (operation.type === "claimClaimableBalance" && operation.balanceId === original.claimableBalanceId) {
        check((operation.source ?? tx.source) === original.beneficiary); indices.push(index);
      }
    });
    check(indices.length === 1);
    const index = indices[0];
    const result = xdr.TransactionResult.fromXDR(observation.resultXdr, "base64");
    const opResult = result.result().results()[index];
    check(result.result().switch().name === "txSuccess" && opResult.switch().value === 0 &&
      opResult.tr().switch().name === "claimClaimableBalance" &&
      opResult.tr().claimClaimableBalanceResult().switch().value === 0);
    return snapshot({ kind: "d1_positive_beneficiary_claim" as const, revision: 1 as const,
      requestId: original.requestId, namespace: p.namespace as string, network: "TESTNET" as const, pool: p.pool as string,
      original, claimedPrincipalStroops: original.amountStroops, asset: original.asset,
      originalGrossStroops: initial.amountStroops,
      grossLessThisClaimStroops: (BigInt(initial.amountStroops) - BigInt(original.amountStroops)).toString(),
      claimOperationIndex: index, feePayer: observation.feePayer, feeChargedStroops: observation.feeChargedStroops,
      observation });
  } catch { throw unavailable(); }
}
/** Read-only authentic018/032 membership plus supplied raw positive inclusion.
 * There is deliberately no claim-acquisition callback or invented provider method. */
export async function observeBeneficiaryClaim(client: Client, configuration: Scope, rawInput: unknown) {
  let denied = false;
  try {
    const scope = exact(snapshot(configuration), "namespace,pool,requestId,authenticatedAdmin");
    const { namespace, pool, requestId, authenticatedAdmin } = scope;
    check(uuid(namespace) && uuid(requestId)); address(pool); address(authenticatedAdmin);
    const invoke = captureRPC(client), supplied = snapshot(rawInput);
    const args = Object.freeze({ p_request_id: requestId, p_authorized_by: authenticatedAdmin });
    const allowed = new Set(["d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
      "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_transaction_history_state", "d1_list_transaction_records"]);
    const stable = new Map<string, { name: string; parameters: Data; data: unknown }>();
    const rpc = async (name: string, parameters: Data) => {
      check(allowed.has(name) && parameters.p_authorized_by === authenticatedAdmin);
      if (Object.hasOwn(parameters, "p_request_id")) check(parameters.p_request_id === requestId);
      if (Object.hasOwn(parameters, "p_namespace")) check(parameters.p_namespace === namespace);
      const reply = exact(snapshot(await invoke(name, snapshot(parameters))), "data,error");
      if (reply.error !== null) {
        const error = fields(reply.error);
        if (reply.data === null && error.code === "42501" && error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    const load = async (name: string, parameters: Data) => {
      const data = await rpc(name, parameters);
      if (name !== "d1_list_transaction_records") {
        const key = name + JSON.stringify(snapshot(parameters)), previous = stable.get(key);
        if (previous) check(same(previous.data, data));
        else stable.set(key, { name, parameters: snapshot(parameters), data });
      }
      return data;
    };
    const bound = (data: Data, kind: string) => check(data.kind === kind && data.revision === 1 &&
      data.request_id === requestId && data.namespace === namespace && data.network === "TESTNET" && data.pool === pool);
    const lookup = exact(await load("d1_load_issuance_outcome", args), "kind,revision,request_id,namespace,network,pool,outcome");
    bound(lookup, "d1_issuance_outcome_lookup"); check(lookup.outcome !== null);
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      const data = await load(name, parameters);
      if (name === "d1_load_submission_attempt") check(fields(data).attempt !== null);
      if (name === "d1_load_signed_transaction") check(fields(data).transaction !== null);
      return { data, error: null };
    } });
    // Existing journal validator cannot write: every non-read is denied above.
    const outcome = await recordInitialIssuanceOutcome(readonly, { namespace, pool, requestId, authenticatedAdmin });
    check(outcome.observed_outcome.outcome === "success" && same(outcome, lookup.outcome));
    const unsigned = exact(await load("d1_load_unsigned_transaction", args),
      "kind,revision,request_id,namespace,network,pool,reservation,transaction");
    bound(unsigned, "d1_unsigned_transaction_lookup");
    const journal = fields(unsigned.transaction); check(same(unsigned.reservation, journal.reservation));
    const history = await readTransactionHistory(readonly, namespace, authenticatedAdmin, pool);
    const checkpoint = history.state.checkpoint; check(checkpoint !== null);
    const result = parseBeneficiaryClaim({ namespace, pool, firstLedger: history.state.first_ledger,
      anchor: { sequence: checkpoint.through_ledger, hash: checkpoint.ledger_hash, closedAt: checkpoint.closed_at },
      transactions: history.records, unsignedJournal: journal, outcomeReceipt: outcome }, supplied);
    check(result.requestId === requestId);
    // If pool history happens to contain this transaction it must agree exactly.
    const member = history.records.find(r => r.transactionHash === result.observation.transactionHash);
    if (member) check(same(member, result.observation));
    for (const { name, parameters, data } of stable.values()) check(same(await rpc(name, parameters), data));
    return snapshot({ kind: "d1_beneficiary_claim_observation" as const, revision: 1 as const,
      provenance: "authenticated_saved_original_and_supplied_raw_inclusion" as const,
      positiveAcquisition: "not_wired" as const, claim: result, historyState: history.state });
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
