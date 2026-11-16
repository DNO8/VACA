import { Keypair } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { readRemainderSigningJournal, type RemainderSigningJournal, type RemainderSigningScope } from "./remainder-authorized-signer.ts";
import type { RemainderSubmissionAttempt } from "./remainder-submission-authorization.ts";
import type { RemainderFinancialReceipt } from "./remainder-financial-observation.ts";
import { readAuthenticBeneficiaryClaimSet, type AuthenticBeneficiaryClaimSet } from "./remainder-accounting.ts";
import { observeRefundLifecycle } from "./refund-lifecycle-observation.ts";
import { readTransactionHistory } from "./transaction-history-reader.ts";
import { parseRemainderOutcome, type RemainderOriginalPayment, type RemainderOutcome } from "./remainder-outcome.ts";

type Client = Parameters<typeof readTransactionHistory>[0];
type Data = Record<string, unknown>;
type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
/** PRIVATE backend evidence: contains saved bytes/nonces; never serialize to HTTP. */
export interface RemainderSubmissionState {
  readonly kind: "d1_remainder_submission_state";
  readonly revision: 2;
  readonly scope: RemainderSigningScope;
  readonly observedAt: number;
  readonly journal: Readonly<RemainderSigningJournal>;
  readonly attempt: Readonly<RemainderSubmissionAttempt> | null;
  readonly submissionEvidence: Readonly<RemainderFinancialReceipt> | null;
  readonly executionAuthority: false;
  readonly settlementAuthority: false;
}
/** Positive inclusion evidence only; persistence remains a separate coordinator. */
export interface RemainderOutcomeObservation {
  readonly kind: "d1_remainder_outcome_observation";
  readonly revision: 2;
  readonly scope: RemainderSigningScope;
  readonly observedAt: number;
  readonly submissionState: Frozen<RemainderSubmissionState>;
  readonly claimSet: Frozen<AuthenticBeneficiaryClaimSet>;
  readonly originalPayment: Readonly<RemainderOriginalPayment>;
  readonly history: Frozen<Awaited<ReturnType<typeof readTransactionHistory>>>;
  readonly history_state: AuthenticBeneficiaryClaimSet["history_state"];
  readonly outcome: Frozen<RemainderOutcome>;
  readonly executionAuthority: false;
  readonly settlementAuthority: false;
}
const unavailable = () => new CustodyError("remainder_outcome_observation_unavailable", 503);
function check(value: unknown): asserts value { if (!value) throw unavailable(); }
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && ds[k].enumerable && "value" in ds[k]));
  return Object.fromEntries(keys.map(k => [k, ds[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const d = fields(value); check(Object.keys(d).sort().join(",") === names.split(",").sort().join(",")); return d;
}
/** Own-data bounded JSON: no getters, hooks, sparse arrays, cycles or mutable aliases. */
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
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
function address(v: unknown): asserts v is string { check(typeof v === "string"); Keypair.fromPublicKey(v); }
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
function context(client: Client, configuration: RemainderSigningScope, options: { readonly now: () => number }) {
  const scope = snapshot(configuration); exact(scope, "namespace,pool,requestId,authenticatedAdmin"); exact(options, "now");
  check(uuid(scope.namespace) && uuid(scope.requestId)); address(scope.pool); address(scope.authenticatedAdmin);
  const invoke = capture(client, "rpc"), clock = capture(options, "now");
  let denied = false, last = -1;
  const now = () => { const n = clock(); seconds(n); check(n >= last); last = n; return n; };
  const args = Object.freeze({ p_request_id: scope.requestId, p_authorized_by: scope.authenticatedAdmin });
  const reads = new Set(["d1_load_remainder_submission_attempt", "d1_load_remainder_signing_journal",
    "d1_load_remainder_financial_observation", "d1_load_remainder_candidate", "d1_load_beneficiary_claim",
    "d1_list_beneficiary_claim_set", "d1_load_refund_outcome", "d1_load_refund_candidate", "d1_load_refund_submission_attempt",
    "d1_load_refund_financial_observation", "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
    "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_active_issuance_sequence",
    "d1_load_transaction_history_state", "d1_list_transaction_records", "d1_load_issuance_fee_commitments",
    "d1_load_discovery_state", "d1_load_operating_credit_state", "d1_list_operating_credits", "d1_load_operating_credit"]);
  const captured = new Map<string, { name: string; parameters: Data; data: unknown }>();
  const rpc = async (name: string, parameters: Data) => {
    check(reads.has(name)); const p = snapshot(parameters);
    check(p.p_authorized_by === scope.authenticatedAdmin);
    if (Object.hasOwn(p, "p_namespace")) check(p.p_namespace === scope.namespace);
    // J20 must validate other donors' original requests too; do not restrict all request IDs to the selected one.
    const reply = exact(snapshot(await invoke(name, p)), "data,error");
    if (reply.error !== null) {
      const e = fields(reply.error);
      if (reply.data === null && e.code === "42501" && e.message === "unauthorized_admin_wallet") denied = true;
      throw unavailable();
    }
    return reply.data;
  };
  const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
    const data = await rpc(name, parameters), key = name + JSON.stringify(snapshot(parameters)), prior = captured.get(key);
    if (prior) check(same(prior.data, data));
    else { check(captured.size < 10000); captured.set(key, { name, parameters: snapshot(parameters), data }); }
    return { data, error: null };
  } });
  const load = async (name: string, parameters: Data) => (await readonly.rpc(name, parameters)).data;
  const bound = (d: Data, kind: string) => check(d.kind === kind && d.revision === 2 && d.request_id === scope.requestId &&
    d.namespace === scope.namespace && d.network === "TESTNET" && d.pool === scope.pool);
  const state = async (): Promise<RemainderSubmissionState> => {
    const first = exact(await load("d1_load_remainder_submission_attempt", args),
      "kind,revision,request_id,namespace,network,pool,journal,attempt"); //046 FIRST, even when absent.
    bound(first, "d1_remainder_submission_attempt_lookup");
    const journal = await readRemainderSigningJournal(readonly, scope, { now });
    check(same(first.journal, journal));
    let attempt: Readonly<RemainderSubmissionAttempt> | null = null;
    let submissionEvidence: Readonly<RemainderFinancialReceipt> | null = null;
    if (first.attempt !== null) {
      const signed = journal.transaction; check(signed && journal.candidate && journal.claim);
      const a = exact(first.attempt, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,envelope_sha256,snapshot_hash,signing_nonce,attempt_id,claimed_at,expires_at");
      bound(a, "d1_remainder_submission_attempt"); address(a.authorized_by); seconds(a.claimed_at); seconds(a.expires_at);
      check(uuid(a.attempt_id) && uuid(a.signing_nonce) && hash(a.snapshot_hash) && a.claimed_at < a.expires_at &&
        a.transaction_hash === signed.transaction_hash && a.envelope_sha256 === signed.envelope_sha256 && a.signing_nonce === signed.signing_nonce);
      const m = exact(await load("d1_load_remainder_financial_observation", { ...args, p_snapshot_hash: a.snapshot_hash }),
        "kind,revision,request_id,namespace,network,pool,transaction_hash,snapshot_hash,observation");
      bound(m, "d1_remainder_financial_observation_lookup");
      const b = exact(m.observation, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,snapshot_hash,snapshot");
      bound(b, "d1_remainder_financial_observation");
      const s = exact(b.snapshot, "kind,revision,requestId,namespace,network,pool,observedAt,expiresAt,candidate,funding");
      seconds(s.observedAt); seconds(s.expiresAt);
      check(m.snapshot_hash === a.snapshot_hash && b.snapshot_hash === a.snapshot_hash && m.transaction_hash === a.transaction_hash &&
        b.transaction_hash === a.transaction_hash && b.authorized_by === a.authorized_by && s.kind === "d1_remainder_financial_snapshot" &&
        s.revision === 2 && s.requestId === scope.requestId && s.namespace === scope.namespace && s.network === "TESTNET" && s.pool === scope.pool &&
        same(s.candidate, journal.candidate) && same(fields(s.funding).scope, { ...scope, authenticatedAdmin: a.authorized_by }) &&
        a.claimed_at >= s.observedAt && a.expires_at === s.expiresAt && a.claimed_at <= now());
      attempt = snapshot(a) as unknown as RemainderSubmissionAttempt;
      submissionEvidence = snapshot(b) as unknown as RemainderFinancialReceipt;
    }
    return snapshot({ kind: "d1_remainder_submission_state", revision: 2, scope, observedAt: now(), journal,
      attempt, submissionEvidence, executionAuthority: false, settlementAuthority: false });
  };
  const finish = async () => {
    // Reload EVERY captured SQL membership, including every025 page and039 set, after all SDK/helper awaits.
    for (const entry of captured.values()) check(same(await rpc(entry.name, entry.parameters), entry.data));
    return now();
  };
  now();
  return { scope, readonly, now, state, finish,
    failure: () => denied ? new CustodyError("unauthorized_admin_wallet", 403) : unavailable() };
}
/** Historical internal state only. Absence and expiry NEVER acquire, sign, send or renew anything. */
export async function readRemainderSubmissionState(client: Client, scope: RemainderSigningScope,
  options: { readonly now: () => number }): Promise<Frozen<RemainderSubmissionState>> {
  let c: ReturnType<typeof context> | undefined;
  try {
    c = context(client, scope, options); const state = await c.state(), observedAt = await c.finish();
    return snapshot({ ...state, observedAt });
  } catch { throw c ? c.failure() : unavailable(); }
}
/** Genuine positive025 inclusion; null is unknown/missing, never failed-zero or permission. */
export async function observeSavedRemainderOutcome(client: Client, scope: RemainderSigningScope,
  options: { readonly now: () => number }): Promise<Frozen<RemainderOutcomeObservation> | null> {
  let c: ReturnType<typeof context> | undefined;
  try {
    const captured = context(client, scope, options); c = captured;
    const state = await captured.state(), candidate = state.journal.candidate, signed = state.journal.transaction;
    if (!candidate || !signed || !state.attempt) { await captured.finish(); return null; }
    const { namespace, pool, requestId, authenticatedAdmin } = captured.scope;
    const setScope = Object.freeze({ namespace, pool, authenticatedAdmin });
    const claimSet = await readAuthenticBeneficiaryClaimSet(captured.readonly, setScope, { now: captured.now });
    const selected = claimSet.receipts.find(r => r.request_id === requestId); check(selected);
    const claim = selected.acquisition.claim, original = claim.original;
    const lifecycle = await observeRefundLifecycle(captured.readonly, captured.scope, { now: captured.now });
    check(lifecycle.joinedStable && lifecycle.ownership.initial033 === "held" && lifecycle.ownership.refund034 === "absent" &&
      lifecycle.initial.outcome032?.observed_outcome.outcome === "success" && lifecycle.initial.outcome032.observed_outcome.claimableBalanceId === original.claimableBalanceId);
    check(selected.acquisition_hash === candidate.acquisition_hash && original.requestId === requestId &&
      original.issuanceTransactionHash === candidate.initial_transaction_hash && original.outcomeHash === candidate.initial_outcome_hash &&
      original.claimableBalanceId === candidate.claimable_balance_id && original.donor === candidate.donor && same(original.asset, candidate.asset) &&
      original.deadline === candidate.deadline && claim.originalGrossStroops === candidate.gross_stroops &&
      claim.claimedPrincipalStroops === candidate.claimed_stroops && claim.grossLessThisClaimStroops === candidate.remaining_stroops &&
      BigInt(claim.claimedPrincipalStroops) > 0n && BigInt(claim.grossLessThisClaimStroops) > 0n && candidate.claim_set_count <= claimSet.count);
    const donation = lifecycle.donation;
    check(donation.paymentOperationId === original.operationId && donation.paymentTransactionHash === original.paymentTransactionHash &&
      donation.donor === original.donor && same(donation.asset, original.asset) &&
      BigInt(donation.grossAmount.replace(".", "")) === BigInt(claim.originalGrossStroops));
    const prepared = fields(fields(fields(lifecycle.initial.unsigned018.reservation).intent).preparation_input);
    seconds(prepared.confirmed_at);
    const originalPayment: RemainderOriginalPayment = { donor: original.donor, asset: original.asset, grossAmount: donation.grossAmount,
      confirmedAt: new Date(prepared.confirmed_at * 1000).toISOString().replace(".000Z", "Z"), requestId,
      operationId: original.operationId, paymentTransactionHash: original.paymentTransactionHash,
      issuanceTransactionHash: original.issuanceTransactionHash, outcomeHash: original.outcomeHash,
      claimableBalanceId: original.claimableBalanceId, sequence: original.sequence, namespace, network: "TESTNET", pool };
    const history = await readTransactionHistory(captured.readonly, namespace, authenticatedAdmin, pool);
    check(same(history.state, claimSet.history_state) && same(history, lifecycle.history));
    // J21b/J22b already validated both saved candidate and acquisition prefixes against this same captured complete history.
    const included = history.records.filter(r => r.transactionHash === signed.transaction_hash);
    check(included.length <= 1);
    let outcome: Frozen<RemainderOutcome> | null = null;
    if (included.length === 1) {
      const record = included[0]; check(record.envelopeXdr === signed.signed_xdr);
      outcome = parseRemainderOutcome(candidate, originalPayment, signed.signed_xdr,
        { context: record.context, transaction: record.raw.transaction, ledger: record.raw.ledger });
      check(same(outcome.observation, record) && outcome.envelopeSha256 === signed.envelope_sha256 &&
        outcome.envelopeSha256 === state.attempt.envelope_sha256);
    }
    const reloaded = await captured.state();
    check(same(reloaded.journal, state.journal) && same(reloaded.attempt, state.attempt) && same(reloaded.submissionEvidence, state.submissionEvidence));
    check(same(await readTransactionHistory(captured.readonly, namespace, authenticatedAdmin, pool), history));
    check(same(await readAuthenticBeneficiaryClaimSet(captured.readonly, setScope, { now: captured.now }), claimSet));
    const observedAt = await captured.finish();
    if (outcome === null) return null;
    return snapshot({ kind: "d1_remainder_outcome_observation", revision: 2, scope: captured.scope, observedAt,
      submissionState: { ...state, observedAt }, claimSet, originalPayment, history, history_state: history.state, outcome,
      executionAuthority: false, settlementAuthority: false });
  } catch { throw c ? c.failure() : unavailable(); }
}
