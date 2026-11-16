import { Account, Asset, Keypair, Networks, Operation, Transaction, TransactionBuilder, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError, type Preparation } from "./handler.ts";
import { validateUnsignedTransaction } from "./unsigned-transaction.ts";
import { calculateOriginalObligations } from "./original-obligations.ts";
import { recordInitialIssuanceOutcome } from "./initial-issuance-outcome-journal.ts";
import { loadRefundOutcome } from "./refund-outcome-journal.ts";
import { readTransactionHistory } from "./transaction-history-reader.ts";
import type { RefundCandidateReceipt, RefundCandidateScope } from "./refund-candidate-journal.ts";

type Client = Parameters<typeof readTransactionHistory>[0];
type Data = Record<string, unknown>;
type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
export interface RefundLifecycleObservation {
  readonly kind: "d1_refund_lifecycle_observation";
  readonly revision: 1;
  readonly scope: RefundCandidateScope;
  readonly observedAt: number;
  readonly deadline: string;
  readonly donation: { paymentOperationId: string; paymentTransactionHash: string; donor: string;
    asset: { type: "native" } | { type: "issued"; code: string; issuer: string }; grossAmount: string };
  readonly phase: "not_due" | "owned_no_refund_attempt" | "candidate_saved" | "signing_unknown" |
    "signed_saved" | "submission_unknown" | "refund_observed" | "refund_failed_observed" | "unknown";
  readonly joinedStable: boolean;
  readonly ownership: { initial033: "held" | "unresolved"; refund034: "held" | "absent" | "unresolved" };
  readonly initial: { unsigned018: Data; outcome032: Awaited<ReturnType<typeof recordInitialIssuanceOutcome>> | null };
  readonly candidate034: Readonly<RefundCandidateReceipt> | null;
  readonly signingClaim036: Data | null;
  readonly signed036: Data | null;
  readonly attempt037: Data | null;
  readonly outcome038: Awaited<ReturnType<typeof loadRefundOutcome>>;
  readonly history: Awaited<ReturnType<typeof readTransactionHistory>>;
  readonly executionAuthority: false;
  readonly settlementAuthority: false;
}
const unavailable = () => new CustodyError("refund_lifecycle_observation_unavailable", 503);
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
function snapshot<T>(value: T): T {
  const active = new Set<object>(); let nodes = 0, characters = 0;
  const visit = (v: unknown, depth: number): unknown => {
    check(++nodes <= 200000 && depth <= 60);
    if (typeof v === "string") { check((characters += v.length) <= 33554432); return v; }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return v; }
    check(typeof v === "object" && v !== null && !active.has(v)); active.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      check(Object.getPrototypeOf(v) === Array.prototype);
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), length = ds.length.value;
      check(Number.isSafeInteger(length) && length >= 0 && length <= 200000 && Reflect.ownKeys(v).length === length + 1);
      result = Object.freeze(Array.from({ length }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d); return visit(d.value, depth + 1);
      }));
    } else result = Object.freeze(Object.fromEntries(Object.entries(fields(v)).map(([k, x]) => {
      check((characters += k.length) <= 33554432); return [k, visit(x, depth + 1)];
    })));
    active.delete(v); return result;
  };
  const result = visit(value, 0);
  check(new TextEncoder().encode(JSON.stringify(result)).length <= 33554432); return result as T;
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const d = v as Data; return `{${Object.keys(d).sort().map(k => `${JSON.stringify(k)}:${canonical(d[k])}`).join(",")}}`;
  }
  const text = JSON.stringify(v); check(typeof text === "string"); return text;
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
function address(v: unknown): asserts v is string { check(typeof v === "string"); Keypair.fromPublicKey(v); }
function seconds(v: unknown): asserts v is number { check(typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 253402300799); }
function method(receiver: unknown, name: string): (...args: unknown[]) => unknown {
  check(receiver !== null && (typeof receiver === "object" || typeof receiver === "function"));
  let owner: object | null = receiver, d: PropertyDescriptor | undefined;
  while (owner !== null) { d = Object.getOwnPropertyDescriptor(owner, name); if (d) break; owner = Object.getPrototypeOf(owner); }
  check(d && "value" in d && typeof d.value === "function");
  const fn = d.value; return (...args) => Reflect.apply(fn, receiver, args);
}
/** Internal read evidence, not a public DTO, execution grant or settlement decision. */
export async function observeRefundLifecycle(client: Client, configuration: RefundCandidateScope,
  options: { readonly now: () => number }): Promise<Frozen<RefundLifecycleObservation>> {
  let denied = false;
  try {
    const input = exact(snapshot(configuration), "namespace,pool,requestId,authenticatedAdmin");
    const { namespace, pool, requestId, authenticatedAdmin } = input;
    check(uuid(namespace) && uuid(requestId)); address(pool); address(authenticatedAdmin);
    const scope = Object.freeze({ namespace, pool, requestId, authenticatedAdmin });
    exact(fields(options), "now");
    const invoke = method(client, "rpc"), clock = method(options, "now");
    const started = clock(); seconds(started);
    const args = Object.freeze({ p_request_id: requestId, p_authorized_by: authenticatedAdmin });
    const allowed = new Set(["d1_load_refund_outcome", "d1_load_refund_candidate", "d1_load_refund_submission_attempt",
      "d1_load_refund_financial_observation", "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
      "d1_load_unsigned_transaction", "d1_load_initial_financial_observation", "d1_load_active_issuance_sequence",
      "d1_load_transaction_history_state", "d1_list_transaction_records"]);
    const stable = new Map<string, { name: string; parameters: Data; data: unknown }>();
    const rpc = async (name: string, parameters: Data): Promise<unknown> => {
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
    const load = async (name: string, parameters: Data): Promise<unknown> => {
      const data = await rpc(name, parameters);
      if (name !== "d1_list_transaction_records") {
        const key = name + canonical(parameters), prior = stable.get(key);
        if (prior) check(same(prior.data, data)); else stable.set(key, { name, parameters: snapshot(parameters), data });
      }
      return data;
    };
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) { return { data: await load(name, parameters), error: null }; } });
    const bound = (d: Data, kind: string) => check(d.kind === kind && d.revision === 1 && d.request_id === requestId &&
      d.namespace === namespace && d.network === "TESTNET" && d.pool === pool);
    const lookup = async (name: string, kind: string, names: string) => {
      const d = exact(await load(name, args), names); bound(d, kind); return d;
    };
    const saved = await lookup("d1_load_refund_outcome", "d1_refund_outcome_lookup", "kind,revision,request_id,namespace,network,pool,outcome");
    const outcome038 = saved.outcome === null ? null : await loadRefundOutcome(readonly, scope);
    check(saved.outcome === null || (outcome038 !== null && same(outcome038, saved.outcome)));
    const unsignedLookup = await lookup("d1_load_unsigned_transaction", "d1_unsigned_transaction_lookup", "kind,revision,request_id,namespace,network,pool,reservation,transaction");
    const unsigned = exact(unsignedLookup.transaction, "kind,revision,request_id,namespace,network,pool,reservation,deadline,transaction_sequence,unsigned_xdr,transaction_hash");
    bound(unsigned, "d1_unsigned_transaction_journal");
    const reservation = exact(unsigned.reservation, "kind,revision,request_id,namespace,network,pool,observed_account_sequence,transaction_sequence,intent");
    bound(reservation, "d1_issuance_sequence_reservation"); check(same(unsignedLookup.reservation, reservation));
    const intent = exact(reservation.intent, "kind,revision,request_id,namespace,network,pool,preparation_input,preparation");
    bound(intent, "d1_issuance_request_intent");
    const prepared = exact(intent.preparation_input, "request_id,authorized_by,confirmed_at,ledger,memo_hash,payment,request");
    check(prepared.request_id === requestId); address(prepared.authorized_by); seconds(prepared.confirmed_at);
    const allocated = exact(intent.preparation, "revision,state,request_id,allocation");
    check(allocated.revision === 1 && allocated.state === "allocated" && allocated.request_id === requestId);
    const payment = exact(prepared.payment, "transaction_hash,operation_id,donor,pool,amount,asset");
    const request = exact(prepared.request, "version,incident_id,donor,beneficiary,amount,asset,deadline");
    check(typeof unsigned.unsigned_xdr === "string" && typeof unsigned.transaction_hash === "string" &&
      typeof reservation.observed_account_sequence === "string" && typeof reservation.transaction_sequence === "string");
    validateUnsignedTransaction({ prepared: prepared as unknown as Preparation, networkPassphrase: Networks.TESTNET, pool,
      observedSequence: reservation.observed_account_sequence, transactionSequence: reservation.transaction_sequence,
      unsignedXdr: unsigned.unsigned_xdr, expectedTransactionHash: unsigned.transaction_hash });
    check(unsigned.transaction_sequence === reservation.transaction_sequence && unsigned.deadline === request.deadline && typeof unsigned.deadline === "string");
    const deadline = unsigned.deadline, cutoff = prepared.confirmed_at + 300;
    check(deadline === new Date(cutoff * 1000).toISOString().replace(".000Z", "Z"));
    const history = await readTransactionHistory(readonly, namespace, authenticatedAdmin, pool), cp = history.state.checkpoint;
    check(cp !== null);
    const originals = calculateOriginalObligations({ namespace, pool, firstLedger: history.state.first_ledger,
      anchor: { sequence: cp.through_ledger, hash: cp.ledger_hash, closedAt: cp.closed_at }, transactions: history.records, operatingCredits: [] });
    const donation = originals.donations.find(d => d.operationId === payment.operation_id && d.transactionHash === payment.transaction_hash);
    check(donation && payment.pool === pool && donation.donor === payment.donor && same(donation.asset, payment.asset) &&
      donation.confirmedAt === prepared.confirmed_at && typeof payment.amount === "string" && /^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(payment.amount) &&
      BigInt(payment.amount.replace(".", "")).toString() === donation.amountStroops && history.records.find(r => r.transactionHash === donation.transactionHash)?.ledger === prepared.ledger);
    const initialLookup = await lookup("d1_load_issuance_outcome", "d1_issuance_outcome_lookup", "kind,revision,request_id,namespace,network,pool,outcome");
    const initial = initialLookup.outcome === null ? null : await recordInitialIssuanceOutcome(readonly, scope);
    if (initial) check(initial.transaction_hash === unsigned.transaction_hash && same(initial.observed_outcome.observation,
      history.records.find(r => r.transactionHash === initial.transaction_hash)) && initial.observed_outcome.observation.sequence === reservation.transaction_sequence);
    const owner = await load("d1_load_active_issuance_sequence", { p_namespace: namespace, p_authorized_by: authenticatedAdmin });
    const initialHeld = same(owner, reservation);
    const candidateLookup = await lookup("d1_load_refund_candidate", "d1_refund_candidate_lookup", "kind,revision,request_id,namespace,network,pool,candidate,active_request_id");
    const attemptLookup = await lookup("d1_load_refund_submission_attempt", "d1_refund_submission_attempt_lookup", "kind,revision,request_id,namespace,network,pool,journal,attempt");
    const journal = exact(attemptLookup.journal, "kind,revision,request_id,namespace,network,pool,candidate,claim,transaction");
    bound(journal, "d1_refund_signing_journal_lookup"); check(same(journal.candidate, candidateLookup.candidate));
    const c = journal.candidate === null ? null : exact(journal.candidate, "kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,source_sequence,transaction_sequence,deadline,unsigned_xdr,transaction_hash");
    let body: Transaction | null = null;
    if (c) {
      bound(c, "d1_refund_candidate"); address(c.authorized_by);
      check(initial !== null && c.initial_transaction_hash === unsigned.transaction_hash && c.initial_outcome_hash === initial.outcome_hash &&
        hash(c.transaction_hash) && c.source_sequence === reservation.transaction_sequence && c.transaction_sequence === (BigInt(reservation.transaction_sequence) + 1n).toString() && c.deadline === deadline);
      check(typeof c.unsigned_xdr === "string" && c.unsigned_xdr.length <= 65536);
      const tx = TransactionBuilder.fromXDR(c.unsigned_xdr, Networks.TESTNET); check(tx instanceof Transaction);
      const balanceId = initial.observed_outcome.claimableBalanceId, count = balanceId === null ? 1 : 2;
      check(tx.timeBounds && tx.timeBounds.minTime === String(cutoff) && /^[1-9][0-9]{0,12}$/.test(tx.timeBounds.maxTime));
      const until = Number(tx.timeBounds.maxTime); seconds(until); check(until > cutoff && /^[1-9][0-9]{0,9}$/.test(tx.fee));
      check(BigInt(tx.fee) <= 4294967295n && BigInt(tx.fee) % BigInt(count) === 0n);
      const asset = donation.asset.type === "native" ? Asset.native() : new Asset(donation.asset.code, donation.asset.issuer);
      const builder = new TransactionBuilder(new Account(pool, reservation.transaction_sequence), { fee: (BigInt(tx.fee) / BigInt(count)).toString(),
        networkPassphrase: Networks.TESTNET, timebounds: { minTime: cutoff, maxTime: until } });
      if (balanceId !== null) builder.addOperation(Operation.claimClaimableBalance({ balanceId }));
      const expected = builder.addOperation(Operation.payment({ destination: donation.donor, asset, amount: payment.amount })).build();
      check(expected.toXDR() === c.unsigned_xdr && expected.hash().toString("hex") === c.transaction_hash && expected.sequence === c.transaction_sequence); body = tx;
    }
    const claim = journal.claim === null ? null : exact(journal.claim, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,financial_snapshot_hash,signing_nonce");
    const signed = journal.transaction === null ? null : exact(journal.transaction, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,financial_snapshot_hash,signing_nonce,signed_xdr,envelope_hash");
    const attempt = attemptLookup.attempt === null ? null : exact(attemptLookup.attempt, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,envelope_hash,snapshot_hash,signing_nonce,attempt_id,claimed_at,expires_at");
    for (const [d, kind] of [[claim, "d1_refund_signing_attempt"], [signed, "d1_signed_refund_transaction"], [attempt, "d1_refund_submission_attempt"]] as const) {
      if (!d) continue; bound(d, kind); address(d.authorized_by); check(c && d.transaction_hash === c.transaction_hash && uuid(d.signing_nonce));
    }
    if (claim) check(hash(claim.financial_snapshot_hash));
    if (signed) {
      check(claim && body && signed.authorized_by === claim.authorized_by && signed.signing_nonce === claim.signing_nonce && signed.financial_snapshot_hash === claim.financial_snapshot_hash &&
        hash(signed.envelope_hash) && typeof signed.signed_xdr === "string" && signed.signed_xdr.length <= 65536);
      const tx = TransactionBuilder.fromXDR(signed.signed_xdr, Networks.TESTNET), key = Keypair.fromPublicKey(pool);
      check(tx instanceof Transaction && tx.toXDR() === signed.signed_xdr && tx.signatures.length === 1 && tx.toEnvelope().v1().tx().toXDR("base64") === body.toEnvelope().v1().tx().toXDR("base64") &&
        tx.signatures[0].hint().equals(key.signatureHint()) && key.verify(tx.hash(), tx.signatures[0].signature()) && digest(Buffer.from(signed.signed_xdr, "base64")).toString("hex") === signed.envelope_hash);
    }
    if (attempt) {
      check(signed && attempt.envelope_hash === signed.envelope_hash && attempt.signing_nonce === signed.signing_nonce && hash(attempt.snapshot_hash) && uuid(attempt.attempt_id));
      seconds(attempt.claimed_at); seconds(attempt.expires_at); check(attempt.claimed_at < attempt.expires_at);
    }
    // Historical035 membership is not a renewed financial gate. A signing
    // claim without bytes still owns its original snapshot indefinitely.
    const hashes = new Set<unknown>();
    if (claim) hashes.add(claim.financial_snapshot_hash);
    if (attempt) hashes.add(attempt.snapshot_hash);
    for (const snapshotHash of hashes) {
      check(hash(snapshotHash));
      const member = exact(await load("d1_load_refund_financial_observation", { ...args, p_snapshot_hash: snapshotHash }),
        "kind,revision,request_id,namespace,network,pool,transaction_hash,snapshot_hash,observation");
      bound(member, "d1_refund_financial_observation_lookup");
      const evidence = exact(member.observation, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,snapshot_hash,observed_at,expires_at,snapshot");
      bound(evidence, "d1_refund_financial_observation"); address(evidence.authorized_by);
      check(c && member.transaction_hash === c.transaction_hash && evidence.transaction_hash === c.transaction_hash &&
        member.snapshot_hash === snapshotHash && evidence.snapshot_hash === snapshotHash);
      seconds(evidence.observed_at); seconds(evidence.expires_at); check(evidence.observed_at < evidence.expires_at);
      const snap = exact(evidence.snapshot, "kind,revision,requestId,namespace,network,pool,observedAt,expiresAt,funding");
      check(snap.kind === "d1_refund_financial_snapshot" && snap.revision === 1 && snap.requestId === requestId &&
        snap.namespace === namespace && snap.network === "TESTNET" && snap.pool === pool && snap.observedAt === evidence.observed_at && snap.expiresAt === evidence.expires_at);
      const funding = fields(snap.funding), creation = fields(funding.creationObservation), observation = fields(creation.observation);
      check(funding.kind === "d1_saved_refund_funding_observation" && funding.revision === 1 &&
        creation.kind === "d1_saved_refund_creation_observation" && creation.revision === 1 && same(observation.candidate, c));
      const held = fields(fields(observation.accounting).held);
      check(same(held.activeOwner, reservation) && same(fields(held.commitment).reservation, reservation));
      if (attempt && snapshotHash === attempt.snapshot_hash) check(evidence.expires_at === attempt.expires_at && evidence.observed_at <= (attempt.claimed_at as number));
    }
    check(c !== null || (claim === null && signed === null && attempt === null));
    const refundHeld = c !== null && candidateLookup.active_request_id === requestId;
    const refundAbsent = candidateLookup.active_request_id === null && c === null;
    let joinedStable = true;
    for (const { name, parameters, data } of stable.values()) if (!same(await rpc(name, parameters), data)) joinedStable = false;
    const observedAt = clock(); seconds(observedAt); check(observedAt >= started);
    let phase: RefundLifecycleObservation["phase"] = "unknown";
    if (initialHeld && (refundHeld || refundAbsent)) {
      if (outcome038) phase = outcome038.observed_outcome.outcome === "success" ? "refund_observed" : "refund_failed_observed";
      else if (attempt) phase = "submission_unknown";
      else if (signed) phase = "signed_saved";
      else if (claim) phase = "signing_unknown";
      else if (c) phase = "candidate_saved";
      else if (observedAt < cutoff) phase = "not_due";
      else if (initial) phase = "owned_no_refund_attempt";
    }
    if (!joinedStable) phase = "unknown";
    return snapshot({ kind: "d1_refund_lifecycle_observation", revision: 1, scope, observedAt, deadline,
      donation: { paymentOperationId: donation.operationId, paymentTransactionHash: donation.transactionHash, donor: donation.donor, asset: donation.asset, grossAmount: payment.amount },
      phase, joinedStable, ownership: { initial033: joinedStable && initialHeld ? "held" : "unresolved",
        refund034: !joinedStable ? "unresolved" : refundHeld ? "held" : refundAbsent ? "absent" : "unresolved" },
      initial: { unsigned018: unsigned, outcome032: initial }, candidate034: c as unknown as RefundCandidateReceipt | null,
      signingClaim036: claim, signed036: signed, attempt037: attempt, outcome038, history, executionAuthority: false, settlementAuthority: false }) as Frozen<RefundLifecycleObservation>;
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
