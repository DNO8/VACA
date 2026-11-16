import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { acquireBeneficiaryClaim } from "./beneficiary-claim-acquisition.ts";
import { parseBeneficiaryClaim } from "./beneficiary-claim-observation.ts";
import { observeRefundLifecycle } from "./refund-lifecycle-observation.ts";
import { TransactionHistoryDatabase } from "./transaction-ingestion.ts";

type Client = Parameters<typeof observeRefundLifecycle>[0];
type Scope = Parameters<typeof observeRefundLifecycle>[1];
type Acquisition = Awaited<ReturnType<typeof acquireBeneficiaryClaim>>;
type Lifecycle = Awaited<ReturnType<typeof observeRefundLifecycle>>;
type Data = Record<string, unknown>;
export interface BeneficiaryClaimReceipt {
  readonly kind: "d1_beneficiary_claim_journal";
  readonly revision: 1;
  readonly request_id: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly authorized_by: string;
  readonly acquisition_hash: string;
  readonly acquisition: Acquisition;
}
const unavailable = () => new CustodyError("beneficiary_claim_journal_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const data = fields(value);
  check(Object.keys(data).sort().join(",") === names.split(",").sort().join(",")); return data;
}
/** Detached bounded JSON; descriptors only, no getters, hooks or sparse arrays. */
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
    check(typeof v === "object" && v !== null && !active.has(v)); active.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      check(Object.getPrototypeOf(v) === Array.prototype);
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), n = ds.length.value;
      check(Number.isSafeInteger(n) && n >= 0 && n <= 200000 && Reflect.ownKeys(v).length === n + 1);
      result = Object.freeze(Array.from({ length: n }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d); return visit(d.value, depth + 1);
      }));
    } else result = Object.freeze(Object.fromEntries(Object.entries(fields(v)).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => {
      visit(k, depth + 1); return [k, visit(x, depth + 1)];
    })));
    active.delete(v); return result;
  };
  return visit(value, 0) as T;
}
const same = (a: unknown, b: unknown) => JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
function address(v: unknown): asserts v is string { check(typeof v === "string"); Keypair.fromPublicKey(v); }
function method(receiver: unknown, name: string, own = false): (...args: unknown[]) => unknown {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, d: PropertyDescriptor | undefined;
  while (owner !== null) {
    d = Object.getOwnPropertyDescriptor(owner, name);
    if (d || own) break;
    owner = Object.getPrototypeOf(owner);
  }
  check(d && "value" in d && typeof d.value === "function");
  const fn = d.value; return (...args) => Reflect.apply(fn, receiver, args);
}
async function coordinate(client: Client, configuration: Scope,
  options: { readonly now: () => number } | { readonly now: () => number; readonly fetcher: typeof fetch },
  record: boolean): Promise<Readonly<BeneficiaryClaimReceipt> | null> {
  let denied = false;
  try {
    const input = exact(snapshot(configuration), "namespace,pool,requestId,authenticatedAdmin");
    const { namespace, pool, requestId, authenticatedAdmin } = input;
    check(uuid(namespace) && uuid(requestId)); address(pool); address(authenticatedAdmin);
    const scope = Object.freeze({ namespace, pool, requestId, authenticatedAdmin });
    exact(options, record ? "now,fetcher" : "now");
    // Capture every capability and its receiver before the first await.
    const invoke = method(client, "rpc"), clock = method(options, "now", true);
    const transport = record ? method(options, "fetcher", true) : null;
    let last = -1;
    const now = () => {
      const time = clock();
      check(typeof time === "number" && Number.isSafeInteger(time) && time >= 0 && time <= 253402300799 && time >= last);
      last = time; return time;
    };
    const args = Object.freeze({ p_request_id: requestId, p_authorized_by: authenticatedAdmin });
    const reads = new Set(["d1_load_refund_outcome", "d1_load_refund_candidate", "d1_load_refund_submission_attempt",
      "d1_load_refund_financial_observation", "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
      "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_active_issuance_sequence",
      "d1_load_transaction_history_state", "d1_list_transaction_records"]);
    const rpc = async (name: string, parameters: Data): Promise<unknown> => {
      const reply = exact(snapshot(await invoke(name, snapshot(parameters))), "data,error");
      if (reply.error !== null) {
        const error = fields(reply.error);
        if (reply.data === null && error.code === "42501" && error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      check(reads.has(name) && parameters.p_authorized_by === authenticatedAdmin);
      if (Object.hasOwn(parameters, "p_request_id")) check(parameters.p_request_id === requestId);
      if (Object.hasOwn(parameters, "p_namespace")) check(parameters.p_namespace === namespace);
      return { data: await rpc(name, parameters), error: null };
    } });
    const bound = (d: Data, kind: string) => check(d.kind === kind && d.revision === 1 && d.request_id === requestId &&
      d.namespace === namespace && d.network === "TESTNET" && d.pool === pool);
    const load = async () => {
      const lookup = exact(await rpc("d1_load_beneficiary_claim", args), "kind,revision,request_id,namespace,network,pool,claim");
      bound(lookup, "d1_beneficiary_claim_lookup"); return lookup.claim;
    };
    const validate = async (value: unknown, lifecycle: Lifecycle): Promise<Readonly<BeneficiaryClaimReceipt>> => {
      const receipt = exact(value, "kind,revision,request_id,namespace,network,pool,authorized_by,acquisition_hash,acquisition");
      bound(receipt, "d1_beneficiary_claim_journal"); address(receipt.authorized_by); check(hash(receipt.acquisition_hash));
      const payload = exact(receipt.acquisition, "kind,revision,positiveAcquisition,provenance,claim,historyState,acquisition");
      const acquisition = exact(payload.acquisition,
        "kind,version,origin,network,namespace,beneficiary,pool,requestId,firstLedger,anchor,claimableBalanceId,transactionHash,operationIndex,pages,records,evidence,executionAuthority,settlementAuthority");
      const evidence = exact(acquisition.evidence, "raw,parsed");
      // Validate the actual stored state with024's validator; no fabricated head.
      const database = new TransactionHistoryDatabase({ async rpc(name, parameters) {
        check(name === "d1_load_transaction_history_state" && parameters.p_namespace === namespace && parameters.p_authorized_by === authenticatedAdmin);
        return { data: payload.historyState, error: null };
      } }, namespace, authenticatedAdmin, pool, "TESTNET");
      const saved = await database.loadState(), current = lifecycle.history.state;
      check(lifecycle.joinedStable && saved.coverage_complete && saved.checkpoint !== null && current.coverage_complete && current.checkpoint !== null &&
        saved.first_ledger === current.first_ledger && saved.page_count <= current.page_count && saved.record_count <= current.record_count);
      const old = saved.checkpoint, head = current.checkpoint;
      check(old.through_ledger <= head.through_ledger && old.closed_at <= head.closed_at && BigInt(old.cursor) <= BigInt(head.cursor));
      check(old.through_ledger === head.through_ledger ? old.ledger_hash === head.ledger_hash && old.closed_at === head.closed_at : old.closed_at < head.closed_at);
      const anchor = { sequence: old.through_ledger, hash: old.ledger_hash, closedAt: old.closed_at };
      const prefix = lifecycle.history.records.filter(r => BigInt(r.pagingToken) <= BigInt(old.cursor));
      check(prefix.length === saved.record_count && (prefix.at(-1)?.pagingToken ?? "0") === old.cursor);
      let cursor = 0n, ledger = saved.first_ledger, closedAt = 0;
      for (const r of prefix) {
        check(BigInt(r.pagingToken) > cursor && r.ledger >= ledger && r.ledger <= old.through_ledger &&
          r.closedAt >= closedAt && r.closedAt <= old.closed_at && r.context.firstLedger === saved.first_ledger &&
          r.context.anchor.sequence <= old.through_ledger && r.context.anchor.closedAt <= old.closed_at);
        check(r.context.anchor.sequence === old.through_ledger ? r.context.anchor.hash === old.ledger_hash &&
          r.context.anchor.closedAt === old.closed_at : r.context.anchor.closedAt < old.closed_at);
        if (r.ledger === old.through_ledger) check(r.ledgerHash === old.ledger_hash && r.closedAt === old.closed_at);
        cursor = BigInt(r.pagingToken); ledger = r.ledger; closedAt = r.closedAt;
      }
      check(lifecycle.initial.outcome032 !== null && lifecycle.initial.outcome032.observed_outcome.outcome === "success");
      // Keep original immutable record contexts/raw bytes. Only the external
      // beneficiary inclusion carries the saved acquisition anchor.
      const claim = parseBeneficiaryClaim({ namespace, pool, firstLedger: saved.first_ledger, anchor,
        transactions: prefix, unsignedJournal: lifecycle.initial.unsigned018, outcomeReceipt: lifecycle.initial.outcome032 }, evidence.raw);
      check(claim.requestId === requestId && same(claim.observation.context, { pool, firstLedger: saved.first_ledger, anchor }));
      const member = lifecycle.history.records.find(r => r.transactionHash === claim.observation.transactionHash);
      if (member) check(same(member, claim.observation));
      check(typeof acquisition.pages === "number" && Number.isSafeInteger(acquisition.pages) && acquisition.pages >= 1 && acquisition.pages <= 5 &&
        typeof acquisition.records === "number" && Number.isSafeInteger(acquisition.records) && acquisition.records >= 1 &&
        acquisition.records <= 500 && acquisition.records <= acquisition.pages * 100);
      const raw = { ...claim.observation.raw, context: claim.observation.context };
      const reconstructed = { kind: "d1_beneficiary_claim_acquisition", revision: 1,
        positiveAcquisition: "pinned_testnet_horizon_beneficiary_transactions",
        provenance: "authenticated_saved_original_and_supplied_raw_inclusion", claim, historyState: saved,
        acquisition: { kind: "d1_pinned_beneficiary_acquisition", version: 1, origin: "https://horizon-testnet.stellar.org", network: "TESTNET",
          namespace, beneficiary: claim.original.beneficiary, pool, requestId, firstLedger: saved.first_ledger, anchor,
          claimableBalanceId: claim.original.claimableBalanceId, transactionHash: claim.observation.transactionHash,
          operationIndex: claim.claimOperationIndex, pages: acquisition.pages, records: acquisition.records,
          evidence: { raw, parsed: claim.observation }, executionAuthority: false, settlementAuthority: false } };
      check(same(payload, reconstructed) && same(evidence.parsed, claim.observation));
      // PostgreSQL hashes jsonb::text. Preserve the genuine039 hash and actor;
      // JS serialization is NOT a replacement hash or historical origin proof.
      return snapshot(receipt) as unknown as Readonly<BeneficiaryClaimReceipt>;
    };
    const saved = await load(); //039 FIRST: no lifecycle/provider before membership.
    if (saved === null && !record) return null;
    if (saved !== null) {
      const lifecycle = await observeRefundLifecycle(readonly, scope, { now });
      const receipt = await validate(saved, lifecycle);
      check(same(await load(), receipt)); return receipt;
    }
    check(transport !== null);
    const fetcher: typeof fetch = (input, init) => transport(input, init) as ReturnType<typeof fetch>;
    const acquisition = await acquireBeneficiaryClaim(readonly, scope, { now, fetcher });
    // Exactly one awaited write. Any error/malformed acknowledgement exits
    // before readback; no automatic recovery, retry or reacquisition.
    const acknowledged = await rpc("d1_record_beneficiary_claim", { ...args, p_acquisition: acquisition });
    const ack = exact(acknowledged, "kind,revision,request_id,namespace,network,pool,authorized_by,acquisition_hash,acquisition");
    bound(ack, "d1_beneficiary_claim_journal");
    check(ack.authorized_by === authenticatedAdmin && hash(ack.acquisition_hash) && same(ack.acquisition, acquisition));
    const lifecycle = await observeRefundLifecycle(readonly, scope, { now });
    const receipt = await validate(ack, lifecycle);
    check(same(await load(), receipt));
    const reloaded = await observeRefundLifecycle(readonly, scope, { now });
    check(same(reloaded.initial, lifecycle.initial));
    await validate(receipt, reloaded);
    check(same(await load(), receipt)); return receipt;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
/** Read-only historical evidence; null means missing membership, not claimed zero. */
export async function loadBeneficiaryClaim(client: Client, scope: Scope,
  options: { readonly now: () => number }): Promise<Readonly<BeneficiaryClaimReceipt> | null> {
  return await coordinate(client, scope, options, false);
}
/** Internal J18 acquisition only on absent039; never accepts raw/approved DTOs. */
export async function recordBeneficiaryClaim(client: Client, scope: Scope,
  options: { readonly now: () => number; readonly fetcher: typeof fetch }): Promise<Readonly<BeneficiaryClaimReceipt>> {
  const receipt = await coordinate(client, scope, options, true); check(receipt !== null); return receipt;
}
