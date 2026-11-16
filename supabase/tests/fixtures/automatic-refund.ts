import { Account, Operation, Keypair, Networks, Transaction, TransactionBuilder, xdr, hash } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { fixture, pool, admin, beneficiary, donor, issuer, namespace, requestId, closedAt } from "./initial-financial-authorization.ts";
import { parseDiscoveredOperation } from "../../functions/d1-custody/discovery.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { parseInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome.ts";
import type { RefundAutomaticPageDependencies } from "../../functions/d1-custody/refund-automatic-page.ts";
import { DiscoveryDatabase, ingestDiscoveryPage } from "../../functions/d1-custody/discovery-ingestion.ts";
import { TransactionHistoryDatabase, ingestTransactionPage } from "../../functions/d1-custody/transaction-ingestion.ts";
import { REFUND_ROUTES } from "../../functions/d1-custody/refund-http-contract.ts";
import { REMAINDER_ROUTES } from "../../functions/d1-custody/remainder-http-contract.ts";
export { pool, admin, namespace, requestId, closedAt };
export const poolKey = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101));
export const adminKey = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 104));
export const token = Buffer.alloc(32, 42).toString("base64url");
export const cutoff = closedAt + 300;
export const scope = { namespace, pool, requestId, authenticatedAdmin: admin };
export function equal(a: unknown, b: unknown) {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v !== null && typeof v === "object" ?
    Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
  if (JSON.stringify(canonical(a)) !== JSON.stringify(canonical(b))) throw Error(JSON.stringify({ actual: a, expected: b }));
}
export async function responseIs(response: Response, status: number, body: unknown) {
  equal(response.status, status); equal(response.headers.get("cache-control"), "no-store");
  equal(await response.text(), JSON.stringify(body));
}
export function manualRequest(action: keyof typeof REFUND_ROUTES | keyof typeof REMAINDER_ROUTES, timestamp = cutoff,
  invalid = false): Request {
  const version = action.startsWith("refund_remainder") ? 2 : 1;
  const message: Record<string, unknown> = { version, network: "TESTNET", pool, namespace, action, request_id: requestId,
    timestamp, payload: {}, wallet: admin };
  const canonical = "{" + Object.keys(message).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(message[k])).join(",") + "}";
  const signature = (invalid ? poolKey : adminKey).sign(hash(Buffer.from("Stellar Signed Message:\n" + canonical))).toString("base64");
  const routes: Record<string, string> = { ...REFUND_ROUTES, ...REMAINDER_ROUTES };
  return new Request("https://offline.invalid" + routes[action], { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...message, signature }) });
}
// External RPC journal model, not a replacement helper/validator. Original018,
// signed031 and included032 are genuine SDK transactions and production parsers.
export async function automaticFixture(failed = false, claimed = false, freshFullGross = false, issued = false) {
  // Reuse the real issuance fixture, including the pool's successful ChangeTrust
  // BEFORE protected donations. Never omit trustline history to obtain settlement.
  if (issued && (claimed || !freshFullGross)) throw Error("issued fixture requires fresh full-gross lane");
  const base = issued ? fixture("none", "issued", "100.0000000", false, "1.0000000", "before") : fixture();
  const freshAccount = claimed || freshFullGross;
  const firstLedger = freshAccount ? 10 : 8;
  if (freshAccount) {
    base.h.history.first_ledger = firstLedger; base.h.history.income_state.first_ledger = firstLedger;
    base.h.records = base.h.records.map(r => parseIncludedTransaction({ ...r.raw, context: { ...r.context, firstLedger } }));
  }
  type Data = Record<string, any>;
  const binding = { request_id: requestId, namespace, network: "TESTNET", pool };
  const original = (await base.h.client.rpc("d1_load_unsigned_transaction", {})).data as Data;
  const journal = original.transaction, reservation = journal.reservation;
  const tx = TransactionBuilder.fromXDR(journal.unsigned_xdr, Networks.TESTNET);
  if (!(tx instanceof Transaction)) throw Error("ordinary transaction required");
  tx.sign(poolKey);
  const snapshotHash = "e".repeat(64);
  const signed = { kind: "d1_signed_transaction_journal", revision: 1, ...binding, authorized_by: admin,
    transaction_hash: journal.transaction_hash, snapshot_hash: snapshotHash, signed_xdr: tx.toXDR(),
    envelope_hash: hash(Buffer.from(tx.toXDR(), "base64")).toString("hex"), reservation };
  const attempt = { kind: "d1_submission_attempt", revision: 1, ...binding, authorized_by: admin,
    transaction_hash: signed.transaction_hash, envelope_hash: signed.envelope_hash, snapshot_hash: snapshotHash,
    attempt_id: "33333333-3333-4333-8333-333333333333", claimed_at: closedAt + 2, reservation };
  const membership = { kind: "d1_initial_financial_observation_lookup", revision: 1, ...binding,
    transaction_hash: signed.transaction_hash, snapshot_hash: snapshotHash,
    observation: { kind: "d1_initial_financial_observation", revision: 1, ...binding, authorized_by: admin,
      transaction_hash: signed.transaction_hash, snapshot_hash: snapshotHash,
      snapshot: { kind: "d1_initial_financial_snapshot", revision: 1, namespace, network: "TESTNET", pool, requestId,
        commitment: base.h.owner.commitment } } };
  const ledger = 11, ledgerHash = "f".repeat(64), time = closedAt + 5;
  const date = new Date(time * 1000).toISOString().replace(".000Z", "Z");
  const inner = failed ? xdr.CreateClaimableBalanceResult.createClaimableBalanceUnderfunded() :
    xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(xdr.ClaimableBalanceId.fromXDR(tx.getClaimableBalanceId(0), "hex"));
  const results = [xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(inner))];
  const raw = { context: { pool, firstLedger, anchor: { sequence: ledger, hash: ledgerHash, closedAt: time } },
    ledger: { sequence: ledger, hash: ledgerHash, closed_at: date }, transaction: { hash: tx.hash().toString("hex"),
      paging_token: ((11n << 32n) + 4096n).toString(), ledger, created_at: date, source_account: pool,
      source_account_sequence: tx.sequence, fee_account: pool, fee_charged: "80", max_fee: tx.fee, successful: !failed,
      operation_count: 1, envelope_xdr: tx.toXDR(), result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("80"),
        result: failed ? xdr.TransactionResultResult.txFailed(results) : xdr.TransactionResultResult.txSuccess(results),
        ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") } };
  base.h.records.push(parseIncludedTransaction(raw)); base.h.history.record_count++; base.h.history.page_count++;
  Object.assign(base.h.history.checkpoint!, { cursor: raw.transaction.paging_token, through_ledger: ledger, ledger_hash: ledgerHash, closed_at: time });
  Object.assign(base.h.history.income_state.checkpoint!, { ...base.h.history.checkpoint, cursor: (BigInt(raw.transaction.paging_token) + 1n).toString() });
  let claimTransaction: typeof raw.transaction | null = null;
  if (claimed) {
    // The beneficiary's genuine included claim predates expiry. Pool025 has no
    // beneficiary-only transaction;039 acquires its raw bytes via the real transport.
    const claimTx = new TransactionBuilder(new Account(beneficiary, "7"), { fee: "100", networkPassphrase: Networks.TESTNET,
      timebounds: { minTime: 0, maxTime: 0 } }).addOperation(Operation.claimClaimableBalance({ balanceId: tx.getClaimableBalanceId(0) })).build();
    claimTx.sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 105)));
    claimTransaction = { hash: claimTx.hash().toString("hex"), paging_token: ((12n << 32n) + 4096n).toString(), ledger: 12,
      created_at: new Date((closedAt + 10) * 1000).toISOString().replace(".000Z", "Z"), source_account: beneficiary,
      source_account_sequence: claimTx.sequence, fee_account: beneficiary, fee_charged: "100", max_fee: claimTx.fee,
      successful: true, operation_count: 1, envelope_xdr: claimTx.toXDR(),
      result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("100"),
        result: xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(
          xdr.OperationResultTr.claimClaimableBalance(xdr.ClaimClaimableBalanceResult.claimClaimableBalanceSuccess()))]),
        ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") };
    Object.assign(base.h.history.checkpoint!, { through_ledger: 13, ledger_hash: "3".repeat(64), closed_at: cutoff });
    Object.assign(base.h.history.income_state.checkpoint!, { through_ledger: 13, ledger_hash: "3".repeat(64), closed_at: cutoff });
    Object.assign(base.h.account, { sequence: "3", lastModifiedLedger: 12, anchor: { sequence: 13, hash: "3".repeat(64), closedAt: cutoff } });
    base.h.account.native.balance = "1089999920"; //110 gross -1 issued -80 fee stroops.
  }
  if (freshFullGross) {
    Object.assign(base.h.history.checkpoint!, { through_ledger: 13, ledger_hash: "3".repeat(64), closed_at: cutoff });
    Object.assign(base.h.history.income_state.checkpoint!, { through_ledger: 13, ledger_hash: "3".repeat(64), closed_at: cutoff });
    Object.assign(base.h.account, { sequence: "3", lastModifiedLedger: 11, anchor: { sequence: 13, hash: "3".repeat(64), closedAt: cutoff } });
    base.h.account.native.balance = issued ? "1099999797" : failed ? "1099999920" : "1089999920";
    if (issued) base.h.account.issuedBalances[0].balance = failed ? "100000000" : "90000000";
    base.h.account.account.num_sponsoring = failed ? 0 : 1;
  }
  base.h.credit.discovery_state = structuredClone(base.h.history.income_state);
  const outcome = { kind: "d1_issuance_outcome_journal", revision: 1, ...binding, authorized_by: admin,
    attempt_id: attempt.attempt_id, transaction_hash: signed.transaction_hash, envelope_hash: signed.envelope_hash,
    outcome_hash: "d".repeat(64), observed_outcome: parseInitialIssuanceOutcome(pool, tx.toXDR(), raw) };
  const wrap = (kind: string, extra: Data): Data => ({ kind, revision: 1, ...binding, ...extra });
  const model: Record<string, Data> = {
    d1_load_unsigned_transaction: original,
    d1_load_signed_transaction: wrap("d1_signed_transaction_lookup", { transaction: signed }),
    d1_load_submission_attempt: wrap("d1_submission_attempt_lookup", { attempt }),
    d1_load_initial_financial_observation: membership,
    d1_load_issuance_outcome: wrap("d1_issuance_outcome_lookup", { outcome }),
    d1_load_active_issuance_sequence: reservation,
    d1_load_refund_outcome: wrap("d1_refund_outcome_lookup", { outcome: null }),
    d1_load_refund_candidate: wrap("d1_refund_candidate_lookup", { candidate: null, active_request_id: null }),
    d1_load_refund_submission_attempt: wrap("d1_refund_submission_attempt_lookup", {
      journal: wrap("d1_refund_signing_journal_lookup", { candidate: null, claim: null, transaction: null }), attempt: null }),
    d1_load_refund_lane_fence: wrap("d1_refund_lane_fence_lookup", { fence: null }),
    d1_load_beneficiary_claim: wrap("d1_beneficiary_claim_lookup", { claim: null }),
    d1_load_remainder_candidate: { ...wrap("d1_remainder_candidate_lookup", { candidate: null, fence: null }), revision: 2 },
    d1_load_remainder_signing_journal: { ...wrap("d1_remainder_signing_journal_lookup", { candidate: null, claim: null, transaction: null }), revision: 2 },
    d1_load_remainder_outcome: { ...wrap("d1_remainder_outcome_lookup", { outcome: null }), revision: 2 },
  };
  model.d1_load_remainder_submission_attempt = { ...wrap("d1_remainder_submission_attempt_lookup",
    { journal: model.d1_load_remainder_signing_journal, attempt: null }), revision: 2 };
  model.d1_load_refund_signing_journal = model.d1_load_refund_submission_attempt.journal;
  const operations = claimed ? base.h.records.map(record => {
    if (record === base.h.records[0]) return base.h.receipt.observation.record;
    const decoded = TransactionBuilder.fromXDR(record.envelopeXdr, Networks.TESTNET);
    if (!(decoded instanceof Transaction)) throw Error("ordinary operation transaction required");
    const op = decoded.operations[0], id = (BigInt(record.pagingToken) + 1n).toString();
    const rawOperation = { id, paging_token: id, transaction_hash: record.transactionHash, transaction_successful: true,
      source_account: decoded.source, created_at: record.raw.transaction.created_at,
      type_i: decoded.toEnvelope().v1().tx().operations()[0].body().switch().value,
      ...(op.type === "payment" ? { type: "payment", from: decoded.source, to: pool, amount: op.amount, asset_type: "native" } :
        { type: "create_claimable_balance" }) };
    return parseDiscoveredOperation({ pool, anchor: base.h.account.anchor, transaction: record.raw.transaction, operation: rawOperation });
  }) : [];
  const calls: string[] = [], counters = { discovery: 0, history: 0, balance: 0, account: 0, signer: 0, transport: 0, writes: 0 };
  const control = { now: cutoff, deny: false, ambiguous: "", balanceUnavailable: claimed, due: [requestId], next: null as string | null,
    after: null as string | null, limit: 2, saveRemainderCandidate: false, executeRemainder: false, ambiguousSend: false,
    executeRefund: false, includePosted: false };
  let postedXdr: string | null = null;
  function includedRefund() {
    if (!postedXdr) throw Error("no actual submission to include");
    const submitted = TransactionBuilder.fromXDR(postedXdr, Networks.TESTNET);
    if (!(submitted instanceof Transaction)) throw Error("ordinary inclusion required");
    const time = cutoff + 1, ledger = 14, ledgerHash = "4".repeat(64), date = new Date(time * 1000).toISOString().replace(".000Z", "Z");
    const results = submitted.operations.map(op => xdr.OperationResult.opInner(op.type === "claimClaimableBalance" ?
      xdr.OperationResultTr.claimClaimableBalance(xdr.ClaimClaimableBalanceResult.claimClaimableBalanceSuccess()) :
      xdr.OperationResultTr.payment(xdr.PaymentResult.paymentSuccess())));
    return parseIncludedTransaction({ context: { pool, firstLedger, anchor: { sequence: ledger, hash: ledgerHash, closedAt: time } },
      ledger: { sequence: ledger, hash: ledgerHash, closed_at: date }, transaction: { hash: submitted.hash().toString("hex"),
        paging_token: ((14n << 32n) + 4096n).toString(), ledger, created_at: date, source_account: pool,
        source_account_sequence: submitted.sequence, fee_account: pool, fee_charged: submitted.fee, max_fee: submitted.fee,
        successful: true, operation_count: submitted.operations.length, envelope_xdr: postedXdr,
        result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString(submitted.fee),
          result: xdr.TransactionResultResult.txSuccess(results), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") } });
  }
  const client = { async rpc(name: string, args: Record<string, unknown>) {
    calls.push(name);
    if (name === "d1_list_due_refund_originals") {
      equal(args, { p_namespace: namespace, p_pool: pool, p_actor: admin, p_after_request_id: control.after, p_limit: control.limit });
      return { data: { kind: "d1_due_refund_originals", revision: 1, namespace, pool, network: "TESTNET",
        dbObservedAt: new Date(control.now * 1000).toISOString(), requestIds: control.due, nextAfterRequestId: control.next }, error: null };
    }
    equal(args.p_authorized_by, admin);
    if (control.deny) return { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
    if (name.startsWith("d1_record_") || name.startsWith("d1_claim_")) {
      counters.writes++;
      const p = args.p_page as Data;
      if (name === "d1_record_refund_outcome" || name === "d1_record_remainder_outcome") {
        const v1 = name === "d1_record_refund_outcome", prefix = v1 ? "refund" : "remainder";
        const signing = model[`d1_load_${prefix}_signing_journal`], attempt = model[`d1_load_${prefix}_submission_attempt`].attempt;
        const receipt = { kind: `d1_${prefix}_outcome_journal`, revision: v1 ? 1 : 2, ...binding, authorized_by: admin,
          attempt_id: attempt.attempt_id, signing_nonce: signing.claim.signing_nonce, transaction_hash: signing.transaction.transaction_hash,
          ...(v1 ? { envelope_hash: signing.transaction.envelope_hash, initial_transaction_hash: outcome.transaction_hash,
            initial_outcome_hash: outcome.outcome_hash } : { envelope_sha256: signing.transaction.envelope_sha256 }),
          outcome_hash: "9".repeat(64), observed_outcome: structuredClone(args.p_observed_outcome), history_state: structuredClone(args.p_history_state) };
        model[`d1_load_${prefix}_outcome`].outcome = receipt;
        return { data: structuredClone(receipt), error: null };
      }
      if (control.executeRefund) {
        const signing = model.d1_load_refund_signing_journal;
        if (name === "d1_record_refund_candidate") {
          const refund = TransactionBuilder.fromXDR(args.p_unsigned_xdr as string, Networks.TESTNET);
          if (!(refund instanceof Transaction)) throw Error("ordinary refund candidate required");
          const candidate = wrap("d1_refund_candidate", { authorized_by: admin, initial_transaction_hash: outcome.transaction_hash,
            initial_outcome_hash: outcome.outcome_hash, source_sequence: "3", transaction_sequence: refund.sequence,
            deadline: journal.deadline, unsigned_xdr: args.p_unsigned_xdr, transaction_hash: args.p_transaction_hash });
          model.d1_load_refund_candidate.candidate = candidate; model.d1_load_refund_candidate.active_request_id = requestId;
          signing.candidate = candidate;
          model.d1_load_refund_lane_fence.fence = wrap("d1_refund_lane_fence", { authorized_by: admin, lane: "full_gross_v1", candidate_hash: candidate.transaction_hash });
          return { data: structuredClone(candidate), error: null };
        }
        if (name === "d1_record_refund_financial_observation") {
          const snapshot = structuredClone(args.p_snapshot) as Data;
          const receipt = wrap("d1_refund_financial_observation", { authorized_by: admin, transaction_hash: signing.candidate.transaction_hash,
            snapshot_hash: "6".repeat(64), observed_at: snapshot.observedAt, expires_at: snapshot.expiresAt, snapshot });
          if (model.d1_load_refund_financial_observation) equal(receipt, model.d1_load_refund_financial_observation.observation);
          model.d1_load_refund_financial_observation = wrap("d1_refund_financial_observation_lookup", {
            transaction_hash: receipt.transaction_hash, snapshot_hash: receipt.snapshot_hash, observation: receipt });
          return { data: structuredClone(receipt), error: null };
        }
        if (name === "d1_claim_refund_signing") {
          equal(signing.claim, null);
          signing.claim = wrap("d1_refund_signing_attempt", { authorized_by: admin, transaction_hash: signing.candidate.transaction_hash,
            financial_snapshot_hash: args.p_snapshot_hash, signing_nonce: args.p_signing_nonce });
          return { data: structuredClone({ ...signing, kind: "d1_refund_signing_claim", invoked: true }), error: null };
        }
        if (name === "d1_record_signed_refund_transaction") {
          equal(args.p_signing_nonce, signing.claim.signing_nonce);
          signing.transaction = { ...signing.claim, kind: "d1_signed_refund_transaction", signed_xdr: args.p_signed_xdr,
            envelope_hash: hash(Buffer.from(args.p_signed_xdr as string, "base64")).toString("hex") };
          return { data: structuredClone(signing.transaction), error: null };
        }
        if (name === "d1_claim_refund_submission_attempt") {
          const lookup = model.d1_load_refund_submission_attempt; equal(lookup.attempt, null);
          lookup.attempt = wrap("d1_refund_submission_attempt", { authorized_by: admin, transaction_hash: signing.candidate.transaction_hash,
            envelope_hash: signing.transaction.envelope_hash, snapshot_hash: args.p_snapshot_hash, signing_nonce: signing.claim.signing_nonce,
            attempt_id: args.p_attempt_id, claimed_at: control.now, expires_at: model.d1_load_refund_financial_observation.observation.expires_at });
          return { data: structuredClone({ kind: "d1_refund_submission_claim", revision: 1, claimed: true, attempt: lookup.attempt }), error: null };
        }
      }
      if (control.executeRemainder) {
        const candidate = model.d1_load_remainder_candidate.candidate;
        const signing = model.d1_load_remainder_signing_journal;
        if (name === "d1_record_remainder_financial_observation") {
          const receipt = { kind: "d1_remainder_financial_observation", revision: 2, ...binding, authorized_by: admin,
            transaction_hash: candidate.transaction_hash, snapshot_hash: "e".repeat(64), snapshot: structuredClone(args.p_snapshot) };
          const prior = model.d1_load_remainder_financial_observation;
          if (prior) equal(receipt, prior.observation);
          model.d1_load_remainder_financial_observation = { kind: "d1_remainder_financial_observation_lookup", revision: 2, ...binding,
            transaction_hash: receipt.transaction_hash, snapshot_hash: receipt.snapshot_hash, observation: receipt };
          if (control.ambiguous === name) throw Error("private lost acknowledgement");
          return { data: structuredClone(receipt), error: null };
        }
        if (name === "d1_claim_remainder_signing") {
          equal(signing.claim, null); equal(signing.transaction, null);
          signing.claim = { kind: "d1_remainder_signing_attempt", revision: 2, ...binding, authorized_by: admin,
            transaction_hash: candidate.transaction_hash, financial_snapshot_hash: args.p_snapshot_hash, signing_nonce: args.p_signing_nonce };
          if (control.ambiguous === name) throw Error("private lost acknowledgement");
          return { data: structuredClone({ ...signing, kind: "d1_remainder_signing_claim", invoked: true }), error: null };
        }
        if (name === "d1_record_signed_remainder") {
          equal(args.p_signing_nonce, signing.claim.signing_nonce); equal(args.p_snapshot_hash, signing.claim.financial_snapshot_hash);
          signing.transaction = { ...signing.claim, kind: "d1_signed_remainder_transaction", unsigned_xdr: candidate.unsigned_xdr,
            signed_xdr: args.p_signed_xdr, envelope_sha256: args.p_envelope_sha256 };
          if (control.ambiguous === name) throw Error("private lost acknowledgement");
          return { data: structuredClone(signing.transaction), error: null };
        }
        if (name === "d1_claim_remainder_submission_attempt") {
          const lookup = model.d1_load_remainder_submission_attempt; equal(lookup.attempt, null);
          lookup.attempt = { kind: "d1_remainder_submission_attempt", revision: 2, ...binding, authorized_by: admin,
            transaction_hash: candidate.transaction_hash, envelope_sha256: signing.transaction.envelope_sha256,
            snapshot_hash: args.p_snapshot_hash, signing_nonce: signing.claim.signing_nonce, attempt_id: args.p_attempt_nonce,
            claimed_at: control.now, expires_at: model.d1_load_remainder_financial_observation.observation.snapshot.expiresAt };
          if (control.ambiguous === name) throw Error("private lost acknowledgement");
          return { data: structuredClone({ kind: "d1_remainder_submission_claim", revision: 2, claimed: true, attempt: lookup.attempt }), error: null };
        }
      }
      if (name === "d1_record_remainder_candidate" && control.saveRemainderCandidate) {
        const receipt = model.d1_load_beneficiary_claim.claim, claim = receipt.acquisition.claim, original = claim.original;
        const candidate = { kind: "d1_remainder_candidate", revision: 2, ...binding, authorized_by: admin,
          initial_transaction_hash: original.issuanceTransactionHash, initial_outcome_hash: original.outcomeHash,
          acquisition_hash: receipt.acquisition_hash, claimable_balance_id: original.claimableBalanceId,
          claim_set_hash: args.p_claim_set_hash, claim_set_count: 1, history_state: structuredClone(base.h.history),
          gross_stroops: claim.originalGrossStroops, claimed_stroops: claim.claimedPrincipalStroops,
          remaining_stroops: claim.grossLessThisClaimStroops, asset: original.asset, donor: original.donor, deadline: original.deadline,
          source_sequence: args.p_source_sequence, transaction_sequence: (BigInt(args.p_source_sequence as string) + 1n).toString(),
          valid_until: args.p_valid_until, unsigned_xdr: args.p_unsigned_xdr, transaction_hash: args.p_transaction_hash };
        const fence = { kind: "d1_refund_lane_fence", revision: 1, ...binding, authorized_by: admin,
          lane: "verified_remainder_v2", candidate_hash: candidate.transaction_hash };
        model.d1_load_remainder_candidate.candidate = candidate; model.d1_load_remainder_candidate.fence = fence;
        model.d1_load_refund_lane_fence.fence = fence; model.d1_load_remainder_signing_journal.candidate = candidate;
        if (control.ambiguous === name) throw Error("private lost acknowledgement");
        return { data: structuredClone(candidate), error: null };
      }
      if (name === "d1_record_beneficiary_claim") {
        const receipt = wrap("d1_beneficiary_claim_journal", { authorized_by: admin, acquisition_hash: "b".repeat(64),
          acquisition: structuredClone(args.p_acquisition) });
        model.d1_load_beneficiary_claim.claim = receipt;
        if (control.ambiguous === name) throw Error("private lost acknowledgement");
        return { data: structuredClone(receipt), error: null };
      }
      if (name === "d1_record_discovery_page") {
        const income = base.h.history.income_state;
        if (p.through_ledger !== base.h.history.checkpoint!.through_ledger) base.h.history.coverage_complete = false;
        Object.assign(income.checkpoint!, { cursor: p.to_cursor, through_ledger: p.through_ledger, ledger_hash: p.ledger_hash, closed_at: p.closed_at });
        income.coverage_complete = p.records.length === 0;
        for (const record of p.records) if (!operations.some(op => op.operation_id === record.operation_id)) operations.push(structuredClone(record));
        base.h.credit.discovery_state = structuredClone(income);
        if (control.ambiguous === name) throw Error("private lost acknowledgement");
        return { data: { kind: "d1_discovery_page", revision: 1, namespace, network: "TESTNET", pool,
          from_cursor: p.from_cursor, to_cursor: p.to_cursor, checkpoint_ledger: p.through_ledger,
          checkpoint_hash: p.ledger_hash, page_count: 1, record_count: p.records.length }, error: null };
      }
      if (name === "d1_record_transaction_page") {
        const checkpoint = { cursor: p.to_cursor, through_ledger: p.through_ledger, ledger_hash: p.ledger_hash, closed_at: p.closed_at };
        if (!(base.h.history.coverage_complete && p.records.length === 0)) base.h.history.page_count++;
        for (const record of p.records) {
          if (base.h.records.some(r => r.transactionHash === record.transactionHash)) throw Error("duplicate included record");
          base.h.records.push(structuredClone(record)); base.h.history.record_count++;
        }
        base.h.history.coverage_complete = p.records.length === 0;
        Object.assign(base.h.history.checkpoint!, checkpoint);
        if (control.ambiguous === name) throw Error("private lost acknowledgement");
        return { data: { kind: "d1_transaction_page", revision: 1, namespace, network: "TESTNET", pool, first_ledger: firstLedger,
          authorized_by: admin, page: p, checkpoint, page_count: base.h.history.page_count, record_count: base.h.history.record_count,
          page_record_count: p.records.length }, error: null };
      }
      if (name === "d1_record_issuance_outcome") {
        equal(args.p_observed_outcome, outcome.observed_outcome); model.d1_load_issuance_outcome.outcome = structuredClone(outcome);
        if (control.ambiguous === name) throw Error("private lost acknowledgement");
        return { data: structuredClone(outcome), error: null };
      }
      throw Error("unexpected financial write: " + name);
    }
    if (name === "d1_list_discovery_operations") return { data: { kind: "d1_discovery_operations", revision: 1,
      namespace, network: "TESTNET", pool, first_ledger: firstLedger, checkpoint: structuredClone(base.h.history.income_state.checkpoint),
      records: structuredClone(operations), next_cursor: base.h.history.income_state.checkpoint!.cursor, has_more: false }, error: null };
    if (name === "d1_list_beneficiary_claim_set") return { data: { kind: "d1_beneficiary_claim_set", revision: 1,
      namespace, network: "TESTNET", pool, history_state: structuredClone(base.h.history),
      count: model.d1_load_beneficiary_claim.claim === null ? 0 : 1,
      receipts: model.d1_load_beneficiary_claim.claim === null ? [] : [structuredClone(model.d1_load_beneficiary_claim.claim)], set_hash: "c".repeat(64) }, error: null };
    if (name === "d1_load_discovery_state") return { data: structuredClone(base.h.history.income_state), error: null };
    if (Object.hasOwn(model, name)) return { data: structuredClone(model[name]), error: null };
    return await base.h.client.rpc(name, args);
  } };
  // Read through the modeled RPC port for preservation assertions; do not assert helper internals.
  const stored = async () => {
    const values = [];
    for (const name of Object.keys(model)) values.push(await client.rpc(name, { p_request_id: requestId, p_authorized_by: admin }));
    values.push(await client.rpc("d1_load_transaction_history_state", { p_namespace: namespace, p_authorized_by: admin }));
    return JSON.stringify(values);
  };
  const source: RefundAutomaticPageDependencies["source"] = {
    async readPage(context) {
      counters.discovery++; equal(context.pool, pool);
      const cp = context.checkpoint!;
      if (control.includePosted) {
        const record = includedRefund(), decoded = TransactionBuilder.fromXDR(record.envelopeXdr, Networks.TESTNET);
        if (!(decoded instanceof Transaction)) throw Error("ordinary discovery required");
        const records = decoded.operations.map((op, i) => {
          const id = (BigInt(record.pagingToken) + BigInt(i + 1)).toString();
          const operation = { id, paging_token: id, transaction_hash: record.transactionHash, transaction_successful: true,
            source_account: pool, created_at: record.raw.transaction.created_at,
            type_i: decoded.toEnvelope().v1().tx().operations()[i].body().switch().value,
            ...(op.type === "payment" ? { type: "payment", from: pool, to: op.destination, amount: op.amount,
              asset_type: op.asset.getAssetType(), ...(op.asset.isNative() ? {} : { asset_code: op.asset.getCode(), asset_issuer: op.asset.getIssuer() }) } : { type: "claim_claimable_balance" }) };
          return parseDiscoveredOperation({ pool, anchor: record.context.anchor, operation, transaction: record.raw.transaction });
        }).filter(r => BigInt(r.paging_token) > BigInt(cp.cursor));
        return { complete: records.length === 0, page: { revision: 1, from_cursor: cp.cursor, to_cursor: records.at(-1)?.paging_token ?? cp.cursor,
          through_ledger: 14, ledger_hash: "4".repeat(64), closed_at: cutoff + 1, records } };
      }
      return { complete: true, page: { revision: 1, from_cursor: cp.cursor, to_cursor: cp.cursor,
        through_ledger: cp.through_ledger, ledger_hash: cp.ledger_hash, closed_at: cp.closed_at, records: [] } };
    },
    async readTransactionPageAtCheckpoint(context, after) {
      counters.history++; equal(context.pool, pool);
      const cp = context.checkpoint;
      if (control.includePosted) {
        const record = includedRefund(), records = BigInt(record.pagingToken) > BigInt(after) ? [record] : [];
        return { complete: records.length === 0, account: structuredClone(base.h.account), page: { revision: 1, from_cursor: after,
          to_cursor: records.at(-1)?.pagingToken ?? after, through_ledger: cp.through_ledger, ledger_hash: cp.ledger_hash, closed_at: cp.closed_at, records } };
      }
      return { complete: true, account: structuredClone(base.h.account), page: { revision: 1, from_cursor: after, to_cursor: after,
        through_ledger: cp.through_ledger, ledger_hash: cp.ledger_hash, closed_at: cp.closed_at, records: [] } };
    },
    async readAccountAtCheckpoint(context) {
      counters.account++;
      if (!freshAccount) throw Error("no current account scripted");
      equal(context, { pool, firstLedger, checkpoint: base.h.history.income_state.checkpoint });
      return structuredClone(base.h.account);
    },
    async readClaimableBalance() {
      counters.balance++;
      if (control.balanceUnavailable) throw Error("404 unknown");
      return { verification: "current_indexer_observation", state: "present", claimableBalanceId: tx.getClaimableBalanceId(0),
        observedLedger: freshFullGross ? 13 : 12, ledgerHash: freshFullGross ? "3".repeat(64) : "1".repeat(64), observedClosedAt: control.now };
    },
  };
  const financial = { maximumAgeSeconds: 15, futureToleranceSeconds: 0,
    loadPoolSigner(requestedPool: string) { counters.signer++; equal(requestedPool, pool); return poolKey; } };
  const fetcher: typeof fetch = async (input, init) => {
    counters.transport++;
    if (!claimTransaction && !freshFullGross) throw Error("no transport scripted");
    if (init && "method" in init && init.method === "POST") {
      equal(String(input), "https://horizon-testnet.stellar.org/transactions");
      const body = "body" in init ? init.body : undefined;
      equal(typeof body, "string");
      const signedXdr = new URLSearchParams(body as string).get("tx")!;
      equal(signedXdr, model[control.executeRefund ? "d1_load_refund_signing_journal" : "d1_load_remainder_signing_journal"].transaction.signed_xdr);
      postedXdr = signedXdr;
      const sent = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
      if (!(sent instanceof Transaction)) throw Error("ordinary submitted transaction required");
      equal(sent.signatures.length, 1); equal(Keypair.fromPublicKey(pool).verify(sent.hash(), sent.signatures[0].signature()), true);
      equal(sent.operations.length, control.executeRefund && !failed ? 2 : 1);
      const payment = sent.operations.at(-1)!; equal(payment.type, "payment");
      if (payment.type === "payment") {
        equal(payment.amount, control.executeRefund ? "10.0000000" : "9.0000000");
        equal(payment.destination, donor);
        equal(payment.asset.isNative() ? { type: "native" } : { type: "issued", code: payment.asset.getCode(), issuer: payment.asset.getIssuer() },
          issued ? { type: "issued", code: "USD", issuer } : { type: "native" });
      }
      if (control.ambiguousSend) throw Error("private timeout after send");
      return Response.json({ hash: sent.hash().toString("hex") });
    }
    equal(init && "method" in init ? init.method : undefined, "GET");
    equal(init && "credentials" in init ? init.credentials : undefined, "omit");
    equal(init && "redirect" in init ? init.redirect : undefined, "error");
    const url = new URL(String(input)); equal(url.origin, "https://horizon-testnet.stellar.org");
    const head = { sequence: 13, hash: "3".repeat(64), closed_at: new Date(cutoff * 1000).toISOString().replace(".000Z", "Z") };
    if (url.pathname === "/") return Response.json({ network_passphrase: Networks.TESTNET, history_elder_ledger: firstLedger, history_latest_ledger: 13 });
    if (url.pathname === "/ledgers") { equal(url.search, "?limit=1&order=desc"); return Response.json({ _embedded: { records: [head] } }); }
    if (url.pathname === "/ledgers/13") return Response.json(head);
    if (url.pathname === "/ledgers/12") return Response.json({ sequence: 12, hash: "2".repeat(64), closed_at: claimTransaction!.created_at });
    equal(url.pathname, `/accounts/${beneficiary}/transactions`);
    equal(url.search, `?order=asc&include_failed=true&limit=100&cursor=${(BigInt(firstLedger) << 32n) - 4096n}`);
    return Response.json({ _embedded: { records: [claimTransaction] } });
  };
  const pageDependencies = { client, namespace, pool, actor: admin, network: "TESTNET" as const, now: () => control.now,
    source, financial, feePerOperationStroops: "100", transactionLifetimeSeconds: 60, maxBatchSize: 2, fetcher };
  // Advance external evidence only through the production ingestion interfaces.
  // Each stream deliberately exposes a nonempty partial page then an empty head.
  const ingestPosted = async () => {
    control.includePosted = true; control.now = cutoff + 1;
    const discovery = new DiscoveryDatabase(client, namespace, admin);
    const history = new TransactionHistoryDatabase(client, namespace, admin, pool, "TESTNET");
    const receipts = [await ingestDiscoveryPage(discovery, source), await ingestDiscoveryPage(discovery, source),
      await ingestTransactionPage(history, source), await ingestTransactionPage(history, source)];
    equal(receipts.map(r => r.completeAtAnchor), [false, true, false, true]);
    return receipts;
  };
  return { client, model, control, calls, counters, source, financial, fetcher, pageDependencies, stored, outcome, ingestPosted,
    selectorConfiguration: { namespace, pool, actor: admin, network: "TESTNET" as const, now: () => control.now,
      maximumAgeSeconds: 15, futureToleranceSeconds: 0 },
    executionDependencies: { client, now: () => control.now },
    configuration: { namespace, pool, now: () => control.now } };
}
