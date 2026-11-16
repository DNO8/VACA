import { Keypair, Networks, Transaction, TransactionBuilder, hash as digest } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { recordInitialIssuanceOutcome } from "./initial-issuance-outcome-journal.ts";
import { calculateOriginalObligations } from "./original-obligations.ts";
import { readTransactionHistory } from "./transaction-history-reader.ts";
import { parseRefundOutcome, type RefundOutcome, type RefundOriginalPayment } from "./refund-outcome.ts";
import type { RefundCandidateReceipt, RefundCandidateScope } from "./refund-candidate-journal.ts";

type Client = Parameters<typeof readTransactionHistory>[0];
type Data = Record<string, unknown>;
type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
export interface RefundOutcomeObservation {
  readonly kind: "d1_refund_outcome_observation";
  readonly revision: 1;
  readonly requestId: string;
  readonly namespace: string;
  readonly network: "TESTNET";
  readonly pool: string;
  readonly candidate: Readonly<RefundCandidateReceipt>;
  readonly signingClaim: Readonly<Data>;
  readonly signedTransaction: Readonly<Data>;
  readonly submissionAttempt: Readonly<Data>;
  readonly outcome: Readonly<RefundOutcome>;
  readonly history: Frozen<Awaited<ReturnType<typeof readTransactionHistory>>>;
}
const unavailable = () => new CustodyError("refund_outcome_observation_unavailable", 503);
function check(value: unknown): asserts value {
  if (!value) throw unavailable();
}
function fields(value: unknown): Data {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  check(keys.every(k => typeof k === "string" && descriptors[k].enumerable && "value" in descriptors[k]));
  return Object.fromEntries(keys.map(k => [k, descriptors[k as string].value]));
}
function exact(value: unknown, names: string): Data {
  const data = fields(value);
  check(Object.keys(data).sort().join(",") === names.split(",").sort().join(","));
  return data;
}
/** Detach bounded JSON before field access; never invoke accessors or JSON hooks. */
function snapshot<T>(value: T): T {
  const active = new Set<object>(); let nodes = 0, characters = 0;
  const visit = (v: unknown, depth: number): unknown => {
    check(++nodes <= 200000 && depth <= 60);
    if (typeof v === "string") {
      check((characters += v.length) <= 33554432); return v;
    }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isFinite(v)); return v; }
    check(typeof v === "object" && v !== null && !active.has(v)); active.add(v);
    let result: unknown;
    if (Array.isArray(v)) {
      check(Object.getPrototypeOf(v) === Array.prototype);
      const ds: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(v), length = ds.length.value;
      check(Number.isSafeInteger(length) && length >= 0 && length <= 200000 && Reflect.ownKeys(v).length === length + 1);
      result = Object.freeze(Array.from({ length }, (_, i) => {
        const d = ds[String(i)]; check(d && d.enumerable && "value" in d);
        return visit(d.value, depth + 1);
      }));
    } else {
      result = Object.freeze(Object.fromEntries(Object.entries(fields(v)).map(([k, x]) => {
        check((characters += k.length) <= 33554432); return [k, visit(x, depth + 1)];
      })));
    }
    active.delete(v); return result;
  };
  const result = visit(value, 0);
  check(new TextEncoder().encode(JSON.stringify(result)).length <= 33554432);
  return result as T;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const data = value as Data;
    return `{${Object.keys(data).sort().map(k => `${JSON.stringify(k)}:${canonical(data[k])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value); check(typeof encoded === "string"); return encoded;
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
function address(v: unknown): asserts v is string {
  check(typeof v === "string"); Keypair.fromPublicKey(v);
}
function seconds(v: unknown): asserts v is number {
  check(typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 253402300799);
}
function captureRPC(client: Client): Client["rpc"] {
  check(client !== null && (typeof client === "object" || typeof client === "function"));
  let owner: object | null = client, descriptor: PropertyDescriptor | undefined;
  while (owner !== null) {
    descriptor = Object.getOwnPropertyDescriptor(owner, "rpc");
    if (descriptor) break;
    owner = Object.getPrototypeOf(owner);
  }
  check(descriptor && "value" in descriptor && typeof descriptor.value === "function");
  const method = descriptor.value;
  return (name, parameters) => Reflect.apply(method, client, [name, parameters]);
}
/** Historical internal observation only. No provider, clock, write or execution capability. */
export async function observeSavedRefundOutcome(
  client: Client, configuration: RefundCandidateScope,
): Promise<Frozen<RefundOutcomeObservation>> {
  let denied = false;
  try {
    const input = exact(snapshot(configuration), "namespace,pool,requestId,authenticatedAdmin");
    const { namespace, pool, requestId, authenticatedAdmin } = input;
    check(uuid(namespace) && uuid(requestId)); address(pool); address(authenticatedAdmin);
    const scope = Object.freeze({ namespace, pool, requestId, authenticatedAdmin });
    const invoke = captureRPC(client);
    const args = Object.freeze({ p_request_id: requestId, p_authorized_by: authenticatedAdmin });
    const allowed = new Set(["d1_load_refund_submission_attempt", "d1_load_refund_financial_observation",
      "d1_load_issuance_outcome", "d1_load_submission_attempt", "d1_load_signed_transaction",
      "d1_load_unsigned_transaction", "d1_load_initial_financial_observation",
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
        const key = name + canonical(parameters), previous = stable.get(key);
        if (previous) check(same(previous.data, data));
        else stable.set(key, { name, parameters: snapshot(parameters), data });
      }
      return data;
    };
    const bound = (d: Data, kind: string) => check(d.kind === kind && d.revision === 1 &&
      d.request_id === requestId && d.namespace === namespace && d.network === "TESTNET" && d.pool === pool);
    const lookup = exact(await load("d1_load_refund_submission_attempt", args),
      "kind,revision,request_id,namespace,network,pool,journal,attempt");
    bound(lookup, "d1_refund_submission_attempt_lookup");
    const journal = exact(lookup.journal, "kind,revision,request_id,namespace,network,pool,candidate,claim,transaction");
    bound(journal, "d1_refund_signing_journal_lookup");
    const candidate = exact(journal.candidate, "kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,source_sequence,transaction_sequence,deadline,unsigned_xdr,transaction_hash");
    const claim = exact(journal.claim, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,financial_snapshot_hash,signing_nonce");
    const signed = exact(journal.transaction, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,financial_snapshot_hash,signing_nonce,signed_xdr,envelope_hash");
    const attempt = exact(lookup.attempt, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,envelope_hash,snapshot_hash,signing_nonce,attempt_id,claimed_at,expires_at");
    bound(candidate, "d1_refund_candidate"); bound(claim, "d1_refund_signing_attempt");
    bound(signed, "d1_signed_refund_transaction"); bound(attempt, "d1_refund_submission_attempt");
    for (const d of [candidate, claim, signed, attempt]) address(d.authorized_by);
    check(hash(candidate.transaction_hash) && hash(candidate.initial_transaction_hash) && hash(candidate.initial_outcome_hash) &&
      hash(signed.envelope_hash) && hash(signed.financial_snapshot_hash) && hash(attempt.snapshot_hash) &&
      uuid(signed.signing_nonce) && uuid(attempt.attempt_id) && claim.authorized_by === signed.authorized_by &&
      claim.signing_nonce === signed.signing_nonce && attempt.signing_nonce === signed.signing_nonce &&
      claim.financial_snapshot_hash === signed.financial_snapshot_hash && attempt.envelope_hash === signed.envelope_hash);
    for (const d of [claim, signed, attempt]) check(d.transaction_hash === candidate.transaction_hash);
    seconds(attempt.claimed_at); seconds(attempt.expires_at); check(attempt.claimed_at < attempt.expires_at);
    check(typeof signed.signed_xdr === "string" && signed.signed_xdr.length >= 4 && signed.signed_xdr.length <= 65536 &&
      Buffer.from(signed.signed_xdr, "base64").toString("base64") === signed.signed_xdr &&
      digest(Buffer.from(signed.signed_xdr, "base64")).toString("hex") === signed.envelope_hash);
    // Existing032 validation is reused ONLY with pre-existing outcome and read-only RPCs.
    const initialLookup = exact(await load("d1_load_issuance_outcome", args),
      "kind,revision,request_id,namespace,network,pool,outcome");
    bound(initialLookup, "d1_issuance_outcome_lookup"); check(initialLookup.outcome !== null);
    const readonly: Client = Object.freeze({ async rpc(name: string, parameters: Data) {
      const data = await load(name, parameters);
      if (name === "d1_load_submission_attempt") check(fields(data).attempt !== null);
      if (name === "d1_load_signed_transaction") check(fields(data).transaction !== null);
      return { data, error: null };
    } });
    const initial = await recordInitialIssuanceOutcome(readonly, scope);
    check(initial.transaction_hash === candidate.initial_transaction_hash && initial.outcome_hash === candidate.initial_outcome_hash);
    const refundTransaction = TransactionBuilder.fromXDR(signed.signed_xdr, Networks.TESTNET);
    check(refundTransaction instanceof Transaction);
    const originalBalanceId = initial.observed_outcome.claimableBalanceId;
    if (originalBalanceId === null) {
      check(refundTransaction.operations.length === 1);
    } else {
      const first = refundTransaction.operations[0];
      check(refundTransaction.operations.length === 2 && first.type === "claimClaimableBalance" && first.balanceId === originalBalanceId);
    }
    const unsignedLookup = exact(await load("d1_load_unsigned_transaction", args),
      "kind,revision,request_id,namespace,network,pool,reservation,transaction");
    bound(unsignedLookup, "d1_unsigned_transaction_lookup");
    const unsigned = exact(unsignedLookup.transaction, "kind,revision,request_id,namespace,network,pool,reservation,deadline,transaction_sequence,unsigned_xdr,transaction_hash");
    bound(unsigned, "d1_unsigned_transaction_journal");
    const reservation = exact(unsigned.reservation, "kind,revision,request_id,namespace,network,pool,observed_account_sequence,transaction_sequence,intent");
    bound(reservation, "d1_issuance_sequence_reservation"); check(same(reservation, unsignedLookup.reservation));
    const intent = exact(reservation.intent, "kind,revision,request_id,namespace,network,pool,preparation_input,preparation");
    bound(intent, "d1_issuance_request_intent");
    const prepared = exact(intent.preparation_input, "request_id,authorized_by,confirmed_at,ledger,memo_hash,payment,request");
    check(prepared.request_id === requestId); address(prepared.authorized_by); seconds(prepared.confirmed_at);
    const payment = exact(prepared.payment, "transaction_hash,operation_id,donor,pool,amount,asset");
    const request = fields(prepared.request);
    check(payment.pool === pool && unsigned.transaction_hash === initial.transaction_hash &&
      reservation.transaction_sequence === candidate.source_sequence && unsigned.transaction_sequence === candidate.source_sequence &&
      initial.observed_outcome.observation.sequence === candidate.source_sequence && unsigned.deadline === candidate.deadline &&
      request.deadline === candidate.deadline);
    // A and B can differ. Membership never renews their clocks or grants permission.
    for (const snapshotHash of new Set([signed.financial_snapshot_hash, attempt.snapshot_hash])) {
      const member = exact(await load("d1_load_refund_financial_observation", { ...args, p_snapshot_hash: snapshotHash }),
        "kind,revision,request_id,namespace,network,pool,transaction_hash,snapshot_hash,observation");
      bound(member, "d1_refund_financial_observation_lookup");
      const saved = exact(member.observation, "kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,snapshot_hash,observed_at,expires_at,snapshot");
      bound(saved, "d1_refund_financial_observation"); address(saved.authorized_by);
      check(member.snapshot_hash === snapshotHash && saved.snapshot_hash === snapshotHash &&
        member.transaction_hash === candidate.transaction_hash && saved.transaction_hash === candidate.transaction_hash);
      seconds(saved.observed_at); seconds(saved.expires_at); check(saved.observed_at < saved.expires_at);
      const snap = exact(saved.snapshot, "kind,revision,requestId,namespace,network,pool,observedAt,expiresAt,funding");
      check(snap.kind === "d1_refund_financial_snapshot" && snap.revision === 1 && snap.requestId === requestId &&
        snap.namespace === namespace && snap.network === "TESTNET" && snap.pool === pool &&
        snap.observedAt === saved.observed_at && snap.expiresAt === saved.expires_at);
      const funding = fields(snap.funding), creation = fields(funding.creationObservation), observation = fields(creation.observation);
      check(funding.kind === "d1_saved_refund_funding_observation" && funding.revision === 1 &&
        creation.kind === "d1_saved_refund_creation_observation" && creation.revision === 1 &&
        same(observation.candidate, candidate));
      const accounting = fields(observation.accounting), held = fields(accounting.held), commitment = fields(held.commitment);
      check(same(held.activeOwner, reservation) && same(commitment.reservation, reservation));
      if (snapshotHash === attempt.snapshot_hash) check(saved.expires_at === attempt.expires_at && saved.observed_at <= attempt.claimed_at);
    }
    const history = await readTransactionHistory(readonly, namespace, authenticatedAdmin, pool);
    const checkpoint = history.state.checkpoint; check(checkpoint !== null);
    // This projection only locates the original full incoming payment. Unmatched
    // outgoing refund activity is NOT silently accepted as settlement/accounting.
    const originals = calculateOriginalObligations({ namespace, pool, firstLedger: history.state.first_ledger,
      anchor: { sequence: checkpoint.through_ledger, hash: checkpoint.ledger_hash, closedAt: checkpoint.closed_at },
      transactions: history.records, operatingCredits: [] });
    const donation = originals.donations.find(d => d.operationId === payment.operation_id && d.transactionHash === payment.transaction_hash);
    check(donation && donation.donor === payment.donor && same(donation.asset, payment.asset) &&
      donation.confirmedAt === prepared.confirmed_at && typeof payment.amount === "string" &&
      /^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(payment.amount) &&
      BigInt(payment.amount.replace(".", "")).toString() === donation.amountStroops);
    const incoming = history.records.find(r => r.transactionHash === payment.transaction_hash);
    check(incoming && incoming.ledger === prepared.ledger);
    const initialRecord = history.records.find(r => r.transactionHash === initial.transaction_hash);
    check(initialRecord && same(initialRecord, initial.observed_outcome.observation));
    const included = history.records.filter(r => r.transactionHash === candidate.transaction_hash);
    check(included.length === 1);
    const record = included[0];
    const original: RefundOriginalPayment = { donor: donation.donor, asset: donation.asset, grossAmount: payment.amount,
      confirmedAt: new Date(prepared.confirmed_at * 1000).toISOString().replace(".000Z", "Z") };
    const outcome = parseRefundOutcome(candidate as unknown as RefundCandidateReceipt, original, signed.signed_xdr,
      { context: record.context, transaction: record.raw.transaction, ledger: record.raw.ledger });
    check(same(outcome.observation, record));
    // Joined receipts and the complete history state must survive the whole read.
    // No retry on drift; these reads are not a database-wide atomic snapshot.
    for (const { name, parameters, data } of stable.values()) check(same(await rpc(name, parameters), data));
    const result: RefundOutcomeObservation = { kind: "d1_refund_outcome_observation", revision: 1, requestId, namespace, network: "TESTNET", pool,
      candidate: candidate as unknown as RefundCandidateReceipt, signingClaim: claim, signedTransaction: signed,
      submissionAttempt: attempt, outcome, history };
    return snapshot(result);
  } catch {
    if (denied) throw new CustodyError("unauthorized_admin_wallet", 403);
    throw unavailable();
  }
}
