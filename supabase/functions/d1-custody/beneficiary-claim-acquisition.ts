import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { observeRefundLifecycle } from "./refund-lifecycle-observation.ts";
import { observeBeneficiaryClaim } from "./beneficiary-claim-observation.ts";
import { HorizonBeneficiaryTransactionSource } from "./beneficiary-transaction-source.ts";
import { parseIncludedTransaction } from "./transaction-observation.ts";

type Client = Parameters<typeof observeRefundLifecycle>[0];
type Scope = Parameters<typeof observeRefundLifecycle>[1];
type Data = Record<string, unknown>;
type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
const unavailable = () => new CustodyError("beneficiary_claim_acquisition_unavailable", 503);
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
/** Descriptor-only, bounded, canonical detached JSON; no getters or toJSON. */
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
    check(v !== null && typeof v === "object" && !active.has(v)); active.add(v);
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
  return visit(value, 0) as Frozen<T>;
}
const same = (a: unknown, b: unknown) => JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b));
function method(receiver: unknown, name: string, own = false): (...args: unknown[]) => unknown {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, descriptor: PropertyDescriptor | undefined;
  while (owner !== null) {
    descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (descriptor || own) break;
    owner = Object.getPrototypeOf(owner);
  }
  check(descriptor && "value" in descriptor && typeof descriptor.value === "function");
  const fn = descriptor.value; return (...args) => Reflect.apply(fn, receiver, args);
}

/** Positive evidence only. No caller-supplied original, source, raw claim or approval. */
export async function acquireBeneficiaryClaim(client: Client, configuration: Scope,
  options: { readonly now: () => number; readonly fetcher: typeof fetch }) {
  let denied = false, active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const whole = new AbortController(), cleanups: (() => void)[] = [];
  try {
    const scope = snapshot(configuration);
    exact(scope, "namespace,pool,requestId,authenticatedAdmin");
    exact(options, "now,fetcher");
    // Capture methods AND receivers before the first suspension. RPC may be a
    // prototype data method; the two explicit server options must be own data.
    const invoke = method(client, "rpc"), clock = method(options, "now", true);
    const fetcher = method(options, "fetcher", true), wall = method(Date, "now", true);
    const started = wall(); check(typeof started === "number" && Number.isSafeInteger(started));
    let last = -1;
    const guard = () => {
      const time = wall();
      check(active && !whole.signal.aborted && typeof time === "number" && time >= started && time - started < 30000);
    };
    const now = () => {
      guard(); const time = clock();
      check(typeof time === "number" && Number.isSafeInteger(time) && time >= 0 && time <= 253402300799 && time >= last);
      last = time; return time;
    };
    const allowed = new Set(["d1_load_refund_outcome", "d1_load_refund_candidate", "d1_load_refund_submission_attempt",
      "d1_load_refund_financial_observation", "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
      "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_active_issuance_sequence",
      "d1_load_transaction_history_state", "d1_list_transaction_records"]);
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      guard();
      const args = snapshot(parameters);
      check(allowed.has(name) && args.p_authorized_by === scope.authenticatedAdmin);
      if (Object.hasOwn(args, "p_request_id")) check(args.p_request_id === scope.requestId);
      if (Object.hasOwn(args, "p_namespace")) check(args.p_namespace === scope.namespace);
      const reply = exact(snapshot(await invoke(name, args)), "data,error");
      guard();
      if (reply.error !== null) {
        const error = fields(reply.error);
        if (reply.data === null && error.code === "42501" && error.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return { data: reply.data, error: null };
    } });
    // Keep signal forwarding alive through response streaming, not merely until
    // headers. J17 owns its 10s/1MiB GET bound; this adds the entire-work bound.
    const transport: typeof fetch = (input, init) => {
      guard();
      const inner = init && "signal" in init ? init.signal : undefined;
      check(inner instanceof AbortSignal);
      const combined = new AbortController();
      const abort = () => combined.abort();
      whole.signal.addEventListener("abort", abort, { once: true });
      inner.addEventListener("abort", abort, { once: true });
      cleanups.push(() => {
        whole.signal.removeEventListener("abort", abort); inner.removeEventListener("abort", abort);
      });
      if (inner.aborted || whole.signal.aborted) combined.abort();
      guard(); check(!combined.signal.aborted);
      return fetcher(input, { ...init, signal: combined.signal }) as ReturnType<typeof fetch>;
    };
    const source = new HorizonBeneficiaryTransactionSource(transport);
    const readPage = source.readTransactionPageAtCheckpoint.bind(source);
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { active = false; whole.abort(); reject(unavailable()); }, 30000);
    });
    const work = async () => {
      const initial = await observeRefundLifecycle(readonly, scope, { now }); guard();
      check(initial.joinedStable && initial.history.state.coverage_complete);
      const issuance = initial.initial.outcome032;
      check(issuance !== null && issuance.observed_outcome.outcome === "success");
      const balanceId = issuance.observed_outcome.claimableBalanceId;
      check(typeof balanceId === "string" && /^[0-9a-f]{72}$/.test(balanceId));
      const unsigned = initial.initial.unsigned018;
      const request = fields(fields(fields(fields(unsigned.reservation).intent).preparation_input).request);
      const beneficiary = request.beneficiary;
      check(typeof beneficiary === "string"); Keypair.fromPublicKey(beneficiary);
      const firstLedger = initial.history.state.first_ledger, checkpoint = initial.history.state.checkpoint;
      check(checkpoint !== null);
      const anchor = Object.freeze({ sequence: checkpoint.through_ledger, hash: checkpoint.ledger_hash, closedAt: checkpoint.closed_at });
      const context = Object.freeze({ pool: scope.pool, beneficiary, firstLedger, checkpoint });
      let cursor = (firstLedger > 1 ? (BigInt(firstLedger) << 32n) - 4096n : 0n).toString();
      const cursors = new Set([cursor]), hashes = new Set<string>();
      let count = 0;
      for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
        guard(); const page = await readPage(context, cursor); guard();
        check(page.revision === 1 && same(page.context, context) && same(page.anchor, anchor) && page.from_cursor === cursor &&
          typeof page.complete === "boolean" && Array.isArray(page.records) && page.records.length <= 100);
        count += page.records.length; check(count <= 500);
        let after = cursor;
        // Validate the ENTIRE page before selecting a positive candidate.
        for (const record of page.records) {
          check(same(record.context, { pool: scope.pool, firstLedger, anchor }));
          const parsed = parseIncludedTransaction({ ...record.raw, context: record.context });
          check(same(parsed, record) && BigInt(record.pagingToken) > BigInt(after) && !hashes.has(record.transactionHash) &&
            !cursors.has(record.pagingToken));
          hashes.add(record.transactionHash); cursors.add(record.pagingToken); after = record.pagingToken;
        }
        check(page.to_cursor === after && page.complete === (page.records.length === 0));
        for (const record of page.records) {
          guard();
          const tx = TransactionBuilder.fromXDR(record.envelopeXdr, Networks.TESTNET);
          check(tx instanceof Transaction);
          const matches = tx.operations.some(op => op.type === "claimClaimableBalance" && op.balanceId === balanceId &&
            (op.source ?? tx.source) === beneficiary);
          if (!matches || record.outcome !== "success") continue;
          const raw = { ...record.raw, context: { pool: scope.pool, firstLedger, anchor } };
          const observed = await observeBeneficiaryClaim(readonly, scope, raw); guard();
          check(observed.claim.original.claimableBalanceId === balanceId && observed.claim.original.beneficiary === beneficiary &&
            observed.claim.observation.transactionHash === record.transactionHash && same(observed.claim.observation, record) &&
            same(observed.historyState, initial.history.state));
          const reloaded = await observeRefundLifecycle(readonly, scope, { now }); guard();
          check(reloaded.joinedStable && same(reloaded.initial, initial.initial) && same(reloaded.history, initial.history) &&
            same(reloaded.donation, initial.donation) && same(reloaded.scope, initial.scope));
          const confirmed = await observeBeneficiaryClaim(readonly, scope, raw); guard();
          check(same(confirmed, observed));
          return snapshot({ kind: "d1_beneficiary_claim_acquisition" as const, revision: 1 as const,
            positiveAcquisition: "pinned_testnet_horizon_beneficiary_transactions" as const,
            provenance: observed.provenance, claim: observed.claim, historyState: observed.historyState,
            acquisition: { kind: "d1_pinned_beneficiary_acquisition" as const, version: 1 as const,
              origin: "https://horizon-testnet.stellar.org" as const, network: "TESTNET" as const,
              namespace: scope.namespace, beneficiary, pool: scope.pool, requestId: scope.requestId, firstLedger, anchor,
              claimableBalanceId: balanceId, transactionHash: record.transactionHash, operationIndex: observed.claim.claimOperationIndex,
              pages: pageNumber + 1, records: count, evidence: { raw, parsed: record },
              executionAuthority: false as const, settlementAuthority: false as const } });
        }
        if (page.complete) throw unavailable();
        check(after !== cursor); cursor = after;
      }
      throw unavailable();
    };
    const result = await Promise.race([work(), deadline]); guard(); return result;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  } finally {
    active = false; clearTimeout(timer); whole.abort(); cleanups.forEach(cleanup => cleanup());
  }
}
