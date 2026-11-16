import { Account, Asset, Keypair, Networks, Operation, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { observeCurrentRemainderFunding, type RemainderFundingOptions } from "./remainder-funding-observation.ts";
import { readAuthenticBeneficiaryClaimSet, type AuthenticBeneficiaryClaimSet } from "./remainder-accounting.ts";
import { observeRefundLifecycle } from "./refund-lifecycle-observation.ts";
import { TransactionHistoryDatabase } from "./transaction-ingestion.ts";

type Client = Parameters<typeof observeCurrentRemainderFunding>[0];
export type RemainderCandidateScope = Parameters<typeof observeCurrentRemainderFunding>[1];
type Data = Record<string, unknown>;
export interface RemainderCandidateReceipt {
  readonly kind: "d1_remainder_candidate";
  readonly revision: 2;
  readonly request_id: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly authorized_by: string;
  readonly initial_transaction_hash: string;
  readonly initial_outcome_hash: string;
  readonly acquisition_hash: string;
  readonly claimable_balance_id: string;
  readonly claim_set_hash: string;
  readonly claim_set_count: number;
  readonly history_state: AuthenticBeneficiaryClaimSet["history_state"];
  readonly gross_stroops: string;
  readonly claimed_stroops: string;
  readonly remaining_stroops: string;
  readonly asset: { readonly type: "native" } | { readonly type: "issued"; readonly code: string; readonly issuer: string };
  readonly donor: string;
  readonly deadline: string;
  readonly source_sequence: string;
  readonly transaction_sequence: string;
  readonly valid_until: string;
  readonly unsigned_xdr: string;
  readonly transaction_hash: string;
}
const keys = "kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,acquisition_hash,claimable_balance_id,claim_set_hash,claim_set_count,history_state,gross_stroops,claimed_stroops,remaining_stroops,asset,donor,deadline,source_sequence,transaction_sequence,valid_until,unsigned_xdr,transaction_hash";
const unavailable = () => new CustodyError("remainder_candidate_journal_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(value);
  check(names.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(names.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const data = fields(value); check(Object.keys(data).sort().join(",") === names.split(",").sort().join(",")); return data;
}
/** Descriptor-only bounded own JSON; no serialization hooks, sparse arrays or cycles. */
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
const hash = (v: unknown) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
function address(v: unknown): asserts v is string { check(typeof v === "string"); Keypair.fromPublicKey(v); }
function integer(v: unknown, maximum = 9223372036854775807n): bigint {
  check(typeof v === "string" && /^(0|[1-9][0-9]{0,18})$/.test(v));
  const n = BigInt(v); check(n <= maximum); return n;
}
function seconds(v: unknown): asserts v is number {
  check(typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 253402300799);
}
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
type Construction = { readonly funding: RemainderFundingOptions; readonly feePerOperationStroops: string; readonly validUntil: number };
async function coordinate(client: Client, configuration: RemainderCandidateScope,
  options: { readonly now: () => number } | Construction, create: boolean): Promise<Readonly<RemainderCandidateReceipt> | null> {
  let denied = false;
  try {
    const scope = snapshot(configuration); exact(scope, "namespace,pool,requestId,authenticatedAdmin");
    const { namespace, pool, requestId, authenticatedAdmin } = scope;
    check([namespace, requestId].every(v => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v)));
    address(pool); address(authenticatedAdmin);
    const o = exact(options, create ? "funding,feePerOperationStroops,validUntil" : "now");
    const f = create ? exact(o.funding, "source,now,maximumAgeSeconds,futureToleranceSeconds") : null;
    // Capture all capabilities/scalars before any await, even for a historical return.
    const invoke = capture(client, "rpc"), clock = capture(create ? o.funding : options, "now");
    const readAccount = f ? capture(f.source, "readAccountAtCheckpoint") : null;
    const maximumAgeSeconds = f?.maximumAgeSeconds, futureToleranceSeconds = f?.futureToleranceSeconds;
    const fee = o.feePerOperationStroops, until = o.validUntil;
    if (create) {
      check(integer(fee, 4294967295n) > 0n); seconds(until);
      check(typeof maximumAgeSeconds === "number" && Number.isSafeInteger(maximumAgeSeconds) && maximumAgeSeconds >= 1 && maximumAgeSeconds <= 30);
      check(typeof futureToleranceSeconds === "number" && Number.isSafeInteger(futureToleranceSeconds) && futureToleranceSeconds >= 0 && futureToleranceSeconds <= 2);
    }
    let last = -1;
    const now = () => { const n = clock(); seconds(n); check(n >= last); last = n; return n; };
    const args = Object.freeze({ p_request_id: requestId, p_authorized_by: authenticatedAdmin });
    const membership = new Map<string, { name: string; args: Data; data: unknown }>();
    const rpc = async (name: string, parameters: Data) => {
      const reply = exact(snapshot(await invoke(name, snapshot(parameters))), "data,error");
      if (reply.error !== null) {
        const e = fields(reply.error);
        if (reply.data === null && e.code === "42501" && e.message === "unauthorized_admin_wallet") denied = true;
        throw unavailable();
      }
      return reply.data;
    };
    const reads = new Set(["d1_load_beneficiary_claim", "d1_list_beneficiary_claim_set", "d1_load_refund_outcome", "d1_load_refund_candidate",
      "d1_load_refund_submission_attempt", "d1_load_refund_financial_observation", "d1_load_issuance_outcome", "d1_load_submission_attempt",
      "d1_load_signed_transaction", "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_active_issuance_sequence",
      "d1_load_transaction_history_state", "d1_list_transaction_records", "d1_load_issuance_fee_commitments", "d1_load_discovery_state",
      "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit"]);
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      check(reads.has(name) && parameters.p_authorized_by === authenticatedAdmin);
      if (Object.hasOwn(parameters, "p_namespace")) check(parameters.p_namespace === namespace);
      const data = await rpc(name, parameters), key = name + JSON.stringify(snapshot(parameters)), prior = membership.get(key);
      if (prior) check(same(prior.data, data));
      else { check(membership.size < 10000); membership.set(key, { name, args: snapshot(parameters), data }); }
      return { data, error: null };
    } });
    const bound = (d: Data, kind: string, revision: number) => check(d.kind === kind && d.revision === revision &&
      d.request_id === requestId && d.namespace === namespace && d.network === "TESTNET" && d.pool === pool);
    const load = async () => {
      const d = exact(await rpc("d1_load_remainder_candidate", args), "kind,revision,request_id,namespace,network,pool,candidate,fence");
      bound(d, "d1_remainder_candidate_lookup", 2); return d;
    };
    const validate = async (value: unknown, fence: unknown) => {
      const c = exact(value, keys); bound(c, "d1_remainder_candidate", 2); address(c.authorized_by);
      for (const k of ["transaction_hash", "initial_transaction_hash", "initial_outcome_hash", "acquisition_hash", "claim_set_hash"]) check(hash(c[k]));
      const lane = exact(fence, "kind,revision,namespace,request_id,network,pool,authorized_by,lane,candidate_hash");
      bound(lane, "d1_refund_lane_fence", 1);
      check(lane.lane === "verified_remainder_v2" && lane.candidate_hash === c.transaction_hash && lane.authorized_by === c.authorized_by);
      const lifecycle = await observeRefundLifecycle(readonly, scope, { now });
      check(lifecycle.joinedStable && lifecycle.ownership.initial033 === "held" && lifecycle.ownership.refund034 === "absent" &&
        lifecycle.initial.outcome032?.observed_outcome.outcome === "success" && lifecycle.candidate034 === null &&
        lifecycle.signingClaim036 === null && lifecycle.signed036 === null && lifecycle.attempt037 === null && lifecycle.outcome038 === null);
      const set = await readAuthenticBeneficiaryClaimSet(readonly, { namespace, pool, authenticatedAdmin }, { now });
      check(same(set.history_state, lifecycle.history.state));
      const selected = set.receipts.find(r => r.request_id === requestId); check(selected);
      const claim = selected.acquisition.claim, original = claim.original, outcome = lifecycle.initial.outcome032;
      check(outcome && c.initial_transaction_hash === outcome.transaction_hash && c.initial_outcome_hash === outcome.outcome_hash &&
        c.acquisition_hash === selected.acquisition_hash && c.claimable_balance_id === original.claimableBalanceId &&
        c.donor === original.donor && same(c.asset, original.asset) && c.deadline === original.deadline && c.deadline === lifecycle.deadline);
      const gross = integer(c.gross_stroops), claimed = integer(c.claimed_stroops), remaining = integer(c.remaining_stroops);
      check(claimed > 0n && remaining > 0n && gross === claimed + remaining && c.gross_stroops === claim.originalGrossStroops &&
        c.claimed_stroops === claim.claimedPrincipalStroops && c.remaining_stroops === claim.grossLessThisClaimStroops);
      check(typeof c.claim_set_count === "number" && Number.isSafeInteger(c.claim_set_count) && c.claim_set_count >= 1 && c.claim_set_count <= set.count);
      //041 preserves the original SQL set hash; validate its saved024 prefix, not a renewed head/hash.
      const saved = await new TransactionHistoryDatabase({ async rpc(name, parameters) {
        check(name === "d1_load_transaction_history_state" && parameters.p_namespace === namespace && parameters.p_authorized_by === authenticatedAdmin);
        return { data: c.history_state, error: null };
      } }, namespace, authenticatedAdmin, pool, "TESTNET").loadState();
      const current = set.history_state, old = saved.checkpoint, head = current.checkpoint;
      check(saved.coverage_complete && current.coverage_complete && old && head && saved.first_ledger === current.first_ledger &&
        saved.page_count <= current.page_count && saved.record_count <= current.record_count && old.through_ledger <= head.through_ledger &&
        old.closed_at <= head.closed_at && BigInt(old.cursor) <= BigInt(head.cursor));
      check(old.through_ledger === head.through_ledger ? old.ledger_hash === head.ledger_hash && old.closed_at === head.closed_at : old.closed_at < head.closed_at);
      const prefix = lifecycle.history.records.filter(r => BigInt(r.pagingToken) <= BigInt(old.cursor));
      check(prefix.length === saved.record_count && (prefix.at(-1)?.pagingToken ?? "0") === old.cursor);
      for (const r of prefix) check(r.ledger <= old.through_ledger && r.closedAt <= old.closed_at &&
        r.context.anchor.sequence <= old.through_ledger && (r.context.anchor.sequence === old.through_ledger ?
          r.context.anchor.hash === old.ledger_hash && r.context.anchor.closedAt === old.closed_at : r.context.anchor.closedAt < old.closed_at) &&
        (r.ledger !== old.through_ledger || r.ledgerHash === old.ledger_hash && r.closedAt === old.closed_at));
      const acquisitionState = selected.acquisition.historyState;
      const acquired = acquisitionState.checkpoint;
      check(acquired && acquisitionState.record_count <= saved.record_count && acquisitionState.page_count <= saved.page_count &&
        BigInt(acquired.cursor) <= BigInt(old.cursor) && acquired.through_ledger <= old.through_ledger && acquired.closed_at <= old.closed_at);
      check(acquired.through_ledger === old.through_ledger ? acquired.ledger_hash === old.ledger_hash && acquired.closed_at === old.closed_at : acquired.closed_at < old.closed_at);
      if (same(saved, current) && c.claim_set_count === set.count) check(c.claim_set_hash === set.set_hash);
      const sequence = integer(c.source_sequence); check(sequence < 9223372036854775807n && sequence >= integer(original.sequence));
      check(c.transaction_sequence === (sequence + 1n).toString());
      const cutoff = Date.parse(original.deadline) / 1000; seconds(cutoff);
      const prepared = fields(fields(fields(lifecycle.initial.unsigned018.reservation).intent).preparation_input);
      seconds(prepared.confirmed_at); check(cutoff === prepared.confirmed_at + 300);
      const validUntil = Number(c.valid_until); seconds(validUntil); check(String(validUntil) === c.valid_until && validUntil > cutoff);
      check(typeof c.unsigned_xdr === "string" && c.unsigned_xdr.length >= 4 && c.unsigned_xdr.length <= 65536);
      const tx = TransactionBuilder.fromXDR(c.unsigned_xdr, Networks.TESTNET); check(tx instanceof Transaction);
      const fee = integer(tx.fee, 4294967295n); check(fee > 0n);
      const asset = original.asset.type === "native" ? Asset.native() : new Asset(original.asset.code, original.asset.issuer);
      const amount = `${remaining / 10000000n}.${(remaining % 10000000n).toString().padStart(7, "0")}`;
      const expected = new TransactionBuilder(new Account(pool, c.source_sequence as string), { fee: fee.toString(),
        networkPassphrase: Networks.TESTNET, timebounds: { minTime: cutoff, maxTime: validUntil } })
        .addOperation(Operation.payment({ destination: original.donor, asset, amount })).build();
      check(tx.toEnvelope().switch().name === "envelopeTypeTx" && tx.signatures.length === 0 && tx.source === pool &&
        tx.sequence === c.transaction_sequence && tx.toXDR() === c.unsigned_xdr && expected.toXDR() === c.unsigned_xdr &&
        expected.hash().toString("hex") === c.transaction_hash && tx.hash().toString("hex") === c.transaction_hash);
      return snapshot(c) as unknown as Readonly<RemainderCandidateReceipt>;
    };
    const first = await load(); //041 FIRST, before lifecycle, claim-set or provider calls.
    if (first.candidate === null && !create) return null;
    let candidate = first.candidate, fundingExpiresAt: number | null = null;
    if (candidate === null) {
      check(first.fence === null && readAccount && typeof fee === "string"); seconds(until);
      const source: RemainderFundingOptions["source"] = Object.freeze({ async readAccountAtCheckpoint(context) {
        try { return snapshot(await readAccount(snapshot(context))) as Awaited<ReturnType<RemainderFundingOptions["source"]["readAccountAtCheckpoint"]>>; }
        catch { throw unavailable(); }
      } });
      const funding = await observeCurrentRemainderFunding(readonly, scope, { source, now,
        maximumAgeSeconds: maximumAgeSeconds as number, futureToleranceSeconds: futureToleranceSeconds as number });
      fundingExpiresAt = funding.expiresAt;
      const claimReceipt = funding.claimSet.receipts[0], claim = claimReceipt.acquisition.claim, original = claim.original;
      const current = now(), cutoff = Date.parse(original.deadline) / 1000, remaining = integer(claim.grossLessThisClaimStroops);
      check(remaining > 0n && funding.selected.remainingProtectedPrincipalStroops === remaining.toString() &&
        funding.selected.operationId === original.operationId && claimReceipt.request_id === requestId &&
        current >= cutoff && until > current && until > cutoff && current < funding.expiresAt);
      check(integer(fee) >= integer(funding.account.baseFee) && integer(fee) <= integer(fields(funding.accounting.context.held.commitment).future_refund_fee_stroops) &&
        integer(funding.budget.availableOperating) >= integer(funding.budget.requiredOperating));
      const sequence = integer(funding.account.sequence); check(sequence < 9223372036854775807n);
      const asset = original.asset.type === "native" ? Asset.native() : new Asset(original.asset.code, original.asset.issuer);
      const amount = `${remaining / 10000000n}.${(remaining % 10000000n).toString().padStart(7, "0")}`;
      const tx = new TransactionBuilder(new Account(pool, sequence.toString()), { fee, networkPassphrase: Networks.TESTNET,
        timebounds: { minTime: cutoff, maxTime: until } }).addOperation(Operation.payment({ destination: original.donor, asset, amount })).build();
      const expected = snapshot({ kind: "d1_remainder_candidate", revision: 2, request_id: requestId, namespace, network: "TESTNET", pool,
        authorized_by: authenticatedAdmin, initial_transaction_hash: original.issuanceTransactionHash, initial_outcome_hash: original.outcomeHash,
        acquisition_hash: claimReceipt.acquisition_hash, claimable_balance_id: original.claimableBalanceId, claim_set_hash: funding.claimSet.set_hash,
        claim_set_count: funding.claimSet.count, history_state: funding.claimSet.history_state, gross_stroops: claim.originalGrossStroops,
        claimed_stroops: claim.claimedPrincipalStroops, remaining_stroops: claim.grossLessThisClaimStroops, asset: original.asset, donor: original.donor,
        deadline: original.deadline, source_sequence: sequence.toString(), transaction_sequence: tx.sequence, valid_until: String(until),
        unsigned_xdr: tx.toXDR(), transaction_hash: tx.hash().toString("hex") });
      //One awaited write; unknown/error/malformed acknowledgement never triggers readback or retry.
      candidate = await rpc("d1_record_remainder_candidate", { ...args, p_unsigned_xdr: expected.unsigned_xdr,
        p_transaction_hash: expected.transaction_hash, p_source_sequence: expected.source_sequence,
        p_valid_until: expected.valid_until, p_claim_set_hash: expected.claim_set_hash });
      exact(candidate, keys); check(same(candidate, expected));
      check(now() < until && now() < funding.expiresAt);
    }
    const lookup = await load(); check(same(lookup.candidate, candidate));
    const receipt = await validate(candidate, lookup.fence);
    for (const entry of membership.values()) check(same(await rpc(entry.name, entry.args), entry.data));
    check(same(await load(), lookup));
    const finished = now();
    //Historical bytes may be expired; only this freshly constructed return has a window check.
    if (first.candidate === null) check(fundingExpiresAt !== null && finished < fundingExpiresAt &&
      finished >= Date.parse(receipt.deadline) / 1000 && finished < Number(receipt.valid_until));
    return receipt;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
/** Read-only historical bytes, including expired bytes; never a fresh financial permit. */
export async function loadRemainderCandidate(client: Client, scope: RemainderCandidateScope,
  options: { readonly now: () => number }): Promise<Readonly<RemainderCandidateReceipt> | null> {
  return await coordinate(client, scope, options, false);
}
/** Real internal funding observation only on absent041; no caller-approved candidate/funding DTO. */
export async function ensureRemainderCandidate(client: Client, scope: RemainderCandidateScope,
  options: Construction): Promise<Readonly<RemainderCandidateReceipt>> {
  const receipt = await coordinate(client, scope, options, true); check(receipt); return receipt;
}
