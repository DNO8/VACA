import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { observeCurrentRemainderFunding, type CurrentRemainderFundingObservation, type RemainderFundingOptions } from "./remainder-funding-observation.ts";
import { loadRemainderCandidate, type RemainderCandidateReceipt, type RemainderCandidateScope } from "./remainder-candidate-journal.ts";
import { parseDiscoveredOperation, type DiscoveryRecord } from "./discovery.ts";
import type { PoolAccountObservation } from "./discovery-source.ts";

export type { RemainderFundingOptions } from "./remainder-funding-observation.ts";
export type RemainderFinancialScope = RemainderCandidateScope;
type Client = Parameters<typeof observeCurrentRemainderFunding>[0];
type Data = Record<string, unknown>;
export interface RemainderFinancialSnapshot {
  readonly kind: "d1_remainder_financial_snapshot";
  readonly revision: 2;
  readonly requestId: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly candidate: Readonly<RemainderCandidateReceipt>;
  readonly funding: CurrentRemainderFundingObservation;
}
export interface RemainderFinancialReceipt {
  readonly kind: "d1_remainder_financial_observation";
  readonly revision: 2;
  readonly request_id: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly authorized_by: string;
  readonly transaction_hash: string;
  readonly snapshot_hash: string;
  readonly snapshot: RemainderFinancialSnapshot;
}
const unavailable = () => new CustodyError("remainder_financial_observation_unavailable", 503);
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
/** Detached own-data JSON only; bounded before SDK parsing, RPCs or comparisons. */
function snapshot<T>(value: T): T {
  let nodes = 0, budget = 33554432;
  const active = new Set<object>();
  function visit(v: unknown, depth: number): unknown {
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
    } else result = Object.freeze(Object.fromEntries(Object.entries(fields(v)).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => {
      visit(k, depth + 1); return [k, visit(x, depth + 1)];
    })));
    active.delete(v); return result;
  }
  return visit(value, 0) as T;
}
const same = (a: unknown, b: unknown) => JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b));
function capture(receiver: unknown, name: string): (...args: unknown[]) => unknown {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, d: PropertyDescriptor | undefined;
  const seen = new Set<object>();
  while (owner !== null) {
    check(!seen.has(owner)); seen.add(owner);
    d = Object.getOwnPropertyDescriptor(owner, name); if (d) break; owner = Object.getPrototypeOf(owner);
  }
  check(d && "value" in d && typeof d.value === "function");
  const fn = d.value; return (...args) => Reflect.apply(fn, receiver, args);
}
function money(value: unknown): bigint {
  check(typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value));
  const n = BigInt(value); check(n <= 9223372036854775807n); return n;
}
function seconds(value: unknown): asserts value is number {
  check(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799);
}
/** Internal server composition, not a public DTO, transferable permit or signer. */
export async function observeAndSaveRemainderFinancialEvidence(client: Client, configuration: RemainderFinancialScope,
  options: RemainderFundingOptions): Promise<Readonly<RemainderFinancialReceipt>> {
  let denied = false;
  try {
    const scope = snapshot(configuration); exact(scope, "namespace,pool,requestId,authenticatedAdmin");
    check([scope.namespace, scope.requestId].every(v => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v)));
    Keypair.fromPublicKey(scope.pool); Keypair.fromPublicKey(scope.authenticatedAdmin);
    const o = exact(options, "source,now,maximumAgeSeconds,futureToleranceSeconds");
    const maximumAgeSeconds = o.maximumAgeSeconds, futureToleranceSeconds = o.futureToleranceSeconds;
    check(typeof maximumAgeSeconds === "number" && Number.isSafeInteger(maximumAgeSeconds) && maximumAgeSeconds >= 1 && maximumAgeSeconds <= 30);
    check(typeof futureToleranceSeconds === "number" && Number.isSafeInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    // Capture methods AND original receivers, policy and scope before the first await.
    const invoke = capture(client, "rpc"), clock = capture(options, "now"), readAccount = capture(o.source, "readAccountAtCheckpoint");
    let last = -1;
    const now = () => { const n = clock(); seconds(n); check(n >= last); last = n; return n; };
    const args = Object.freeze({ p_request_id: scope.requestId, p_authorized_by: scope.authenticatedAdmin });
    const nsArgs = Object.freeze({ p_namespace: scope.namespace, p_authorized_by: scope.authenticatedAdmin });
    const requestReads = new Set(["d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
      "d1_load_unsigned_transaction", "d1_load_issuance_fee_commitments", "d1_load_beneficiary_claim", "d1_load_refund_outcome",
      "d1_load_refund_candidate", "d1_load_refund_submission_attempt", "d1_load_remainder_candidate"]);
    const namespaceReads = new Set(["d1_load_active_issuance_sequence", "d1_load_transaction_history_state",
      "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_beneficiary_claim_set"]);
    const hashes = new Set(["d1_load_initial_financial_observation", "d1_load_refund_financial_observation"]);
    const pages = new Set(["d1_list_transaction_records", "d1_list_operating_credits"]);
    const members = new Map<string, { name: string; args: Data; data: unknown }>();
    const rpc = async (name: string, parameters: Data) => {
      const reply = exact(snapshot(await invoke(name, snapshot(parameters))), "data,error");
      if (reply.error !== null) {
        const e = fields(reply.error);
        if (reply.data === null && e.code === "42501" && e.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    const read = async (name: string, parameters: Data) => {
      const a = snapshot(parameters);
      if (requestReads.has(name)) check(same(a, args));
      else if (namespaceReads.has(name)) check(same(a, nsArgs));
      else if (hashes.has(name)) {
        exact(a, "p_request_id,p_authorized_by,p_snapshot_hash");
        check(a.p_request_id === scope.requestId && a.p_authorized_by === scope.authenticatedAdmin &&
          typeof a.p_snapshot_hash === "string" && /^[0-9a-f]{64}$/.test(a.p_snapshot_hash));
      } else {
        const discovery = name === "d1_list_discovery_operations", credit = name === "d1_load_operating_credit";
        check(discovery || credit || pages.has(name));
        const cursor = discovery ? "p_after_cursor" : credit ? "p_operation_id" : "p_after";
        exact(a, `p_namespace,p_authorized_by,${cursor}${credit ? "" : ",p_limit"}`);
        check(a.p_namespace === scope.namespace && a.p_authorized_by === scope.authenticatedAdmin &&
          typeof a[cursor] === "string" && /^(0|[1-9][0-9]{0,19})$/.test(a[cursor] as string) &&
          BigInt(a[cursor] as string) <= 18446744073709551615n && (!credit || a[cursor] !== "0") && (credit || a.p_limit === 100));
      }
      const data = await rpc(name, a), key = name + JSON.stringify(a), previous = members.get(key);
      if (previous) check(same(previous.data, data));
      else { check(members.size < 12000); members.set(key, { name, args: a, data }); }
      return data;
    };
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      return { data: await read(name, parameters), error: null };
    } });
    const source: RemainderFundingOptions["source"] = Object.freeze({ async readAccountAtCheckpoint(context) {
      try { return snapshot(await readAccount(snapshot(context))) as PoolAccountObservation; }
      catch { throw unavailable(); } // Supplier/clock/helper403 never becomes DB authentication.
    } });
    now();
    const candidate = await loadRemainderCandidate(readonly, scope, { now });
    check(candidate !== null); // Creation is a separate J21b operation, never a fallback here.
    const funding = snapshot(await observeCurrentRemainderFunding(readonly, scope, {
      source, now, maximumAgeSeconds, futureToleranceSeconds,
    }));
    const { account, claimSet, accounting } = funding, state = accounting.history.state, cp = state.checkpoint;
    check(cp && state.income_state.checkpoint && same(scope, funding.scope));
    // J21a reuses whole025 SDK envelope/result readers,022 raw-credit readers,
    // original018/032 observers and039 historical positive SDK acquisition validation.
    check(candidate.claim_set_hash === claimSet.set_hash && candidate.claim_set_count === claimSet.count &&
      same(candidate.history_state, claimSet.history_state) && same(state, claimSet.history_state) && claimSet.count === 1);
    const receipt = claimSet.receipts[0], claim = receipt.acquisition.claim, original = claim.original;
    check(candidate.acquisition_hash === receipt.acquisition_hash && candidate.claimable_balance_id === original.claimableBalanceId &&
      candidate.donor === original.donor && same(candidate.asset, original.asset) && candidate.deadline === original.deadline &&
      candidate.gross_stroops === claim.originalGrossStroops && candidate.claimed_stroops === claim.claimedPrincipalStroops &&
      candidate.remaining_stroops === claim.grossLessThisClaimStroops && candidate.remaining_stroops === funding.selected.remainingProtectedPrincipalStroops);
    check(money(candidate.claimed_stroops) > 0n && money(candidate.remaining_stroops) > 0n &&
      money(candidate.gross_stroops) === money(candidate.claimed_stroops) + money(candidate.remaining_stroops));
    exact(account, "pool,networkPassphrase,anchor,baseFee,baseReserve,sequence,lastModifiedLedger,native,issuedBalances,account");
    exact(account.native, "balance,sellingLiabilities"); exact(account.account, "subentry_count,num_sponsoring,num_sponsored");
    money(account.native.balance); money(account.native.sellingLiabilities);
    check(money(account.baseFee) > 0n && money(account.baseFee) <= 4294967295n && money(account.baseReserve) > 0n && money(account.baseReserve) <= 4294967295n);
    check(Object.values(account.account).every(v => Number.isSafeInteger(v) && v >= 0 && v <= 4294967295));
    for (const b of account.issuedBalances) { exact(b, "code,issuer,balance,sellingLiabilities"); money(b.balance); money(b.sellingLiabilities); }
    check(account.sequence === candidate.source_sequence && money(account.sequence) < 9223372036854775807n &&
      candidate.transaction_sequence === (money(account.sequence) + 1n).toString());
    // J21b already reconstructs the exact canonical unsigned one-payment body.
    const tx = TransactionBuilder.fromXDR(candidate.unsigned_xdr, Networks.TESTNET);
    check(tx instanceof Transaction && tx.toXDR() === candidate.unsigned_xdr && tx.signatures.length === 0 &&
      tx.hash().toString("hex") === candidate.transaction_hash && tx.source === scope.pool && tx.sequence === candidate.transaction_sequence);
    check(money(tx.fee) >= money(account.baseFee) && money(tx.fee) <= money(fields(accounting.context.held.commitment).future_refund_fee_stroops));
    const deadline = Date.parse(candidate.deadline) / 1000, validUntil = Number(candidate.valid_until);
    seconds(deadline); seconds(validUntil);
    check(tx.timeBounds?.minTime === String(deadline) && tx.timeBounds.maxTime === candidate.valid_until);
    const window = () => {
      const n = now();
      check(n >= funding.startedAt && n >= funding.observedAt && funding.observedAt >= funding.startedAt &&
        n - funding.startedAt <= maximumAgeSeconds && n >= deadline && n < validUntil &&
        n < funding.expiresAt && funding.expiresAt === cp.closed_at + maximumAgeSeconds &&
        n - cp.closed_at < maximumAgeSeconds && cp.closed_at - n <= futureToleranceSeconds);
    };
    window();
    //020's actual read API is additional evidence, NOT part of042's literal19 menu.
    const operations = new Map<string, DiscoveryRecord>(), transactions = new Map(accounting.history.records.map(r => [r.transactionHash, r]));
    let after = "0", complete = false, operationBytes = 0;
    for (let pageNumber = 0; pageNumber <= 1000; pageNumber++) {
      const page = exact(await read("d1_list_discovery_operations", { ...nsArgs, p_after_cursor: after, p_limit: 100 }),
        "kind,revision,namespace,network,pool,first_ledger,checkpoint,records,next_cursor,has_more");
      check(page.kind === "d1_discovery_operations" && page.revision === 1 && page.namespace === scope.namespace &&
        page.network === "TESTNET" && page.pool === scope.pool && page.first_ledger === state.first_ledger &&
        same(page.checkpoint, state.income_state.checkpoint) && typeof page.has_more === "boolean" &&
        Array.isArray(page.records) && page.records.length <= 100 && (!page.has_more || page.records.length > 0));
      for (const value of page.records) {
        const r = value as DiscoveryRecord, raw = r.operation.raw;
        const decoded = parseDiscoveredOperation({ ...raw, pool: scope.pool, anchor: account.anchor });
        const whole = transactions.get(decoded.transaction_hash);
        check(same(decoded, r) && BigInt(r.paging_token) > BigInt(after) && BigInt(r.paging_token) <= BigInt(state.income_state.checkpoint.cursor) &&
          whole && whole.outcome === "success" && r.ledger >= state.first_ledger && r.ledger === whole.ledger &&
          same(raw.transaction, whole.raw.transaction) && r.operation.confirmed_at === whole.closedAt && !operations.has(r.operation_id));
        operationBytes += new TextEncoder().encode(JSON.stringify(decoded)).length;
        check(operationBytes <= 33554432);
        operations.set(r.operation_id, decoded); check(operations.size <= 100000); after = r.paging_token;
      }
      check(page.next_cursor === after);
      if (!page.has_more) { complete = true; break; }
    }
    check(complete && after === state.income_state.checkpoint.cursor);
    for (const whole of accounting.history.records) {
      if (whole.outcome !== "success") continue;
      for (let i = 0; i < whole.operationTypes.length; i++) {
        // External manageData is non-monetary; all other successful operations need019 coverage.
        const id = (BigInt(whole.pagingToken) + BigInt(i + 1)).toString();
        check(operations.has(id) || whole.operationTypes[i] === 10 && !whole.poolOperationSourceIndices.includes(i));
      }
    }
    for (const credit of funding.credits.receipts) check(same(operations.get(credit.observation.operationId), credit.observation.record));
    // ALL saved SQL reads (including033/040 through041) and additional019 pages,
    // plus genuine current pinned account/body, must still agree after every wait.
    const checkpoint = snapshot({ pool: scope.pool, firstLedger: state.first_ledger, checkpoint: state.income_state.checkpoint });
    const fresh = async () => {
      window();
      check(same(await source.readAccountAtCheckpoint(checkpoint), account));
      // Reload SQL AFTER the provider await as well: it cannot hide DB drift.
      check(same(await loadRemainderCandidate(readonly, scope, { now }), candidate));
      for (const member of members.values()) check(same(await read(member.name, member.args), member.data));
      window();
    };
    await fresh();
    const evidence: RemainderFinancialSnapshot = snapshot({ kind: "d1_remainder_financial_snapshot", revision: 2,
      requestId: scope.requestId, namespace: scope.namespace, network: "TESTNET", pool: scope.pool,
      observedAt: funding.observedAt, expiresAt: funding.expiresAt, candidate, funding });
    window();
    // Exactly ONE awaited write. Unknown/error/malformed acknowledgements exit;
    // no readback or retry is attempted until this entire strict acknowledgement passes.
    const saved = exact(await rpc("d1_record_remainder_financial_observation", { ...args, p_snapshot: evidence }),
      "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,snapshot_hash,snapshot");
    check(saved.kind === "d1_remainder_financial_observation" && saved.revision === 2 && saved.request_id === scope.requestId &&
      saved.namespace === scope.namespace && saved.network === "TESTNET" && saved.pool === scope.pool &&
      saved.authorized_by === scope.authenticatedAdmin && saved.transaction_hash === candidate.transaction_hash &&
      typeof saved.snapshot_hash === "string" && /^[0-9a-f]{64}$/.test(saved.snapshot_hash) && same(saved.snapshot, evidence));
    window();
    const lookup = exact(await rpc("d1_load_remainder_financial_observation", { ...args, p_snapshot_hash: saved.snapshot_hash }),
      "kind,revision,request_id,namespace,network,pool,transaction_hash,snapshot_hash,observation");
    check(lookup.kind === "d1_remainder_financial_observation_lookup" && lookup.revision === 2 && lookup.request_id === scope.requestId &&
      lookup.namespace === scope.namespace && lookup.network === "TESTNET" && lookup.pool === scope.pool &&
      lookup.transaction_hash === candidate.transaction_hash && lookup.snapshot_hash === saved.snapshot_hash && same(lookup.observation, saved));
    //044 load revalidates its PostgreSQL JSONB hash; NEVER substitute a JS digest.
    await fresh();
    return snapshot(saved) as unknown as Readonly<RemainderFinancialReceipt>;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
