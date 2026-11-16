import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder, hash, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { parseDiscoveredOperation } from "../../functions/d1-custody/discovery.ts";
import type { CanonicalOwnedCapture, DonorAsset } from "../../functions/d1-custody/donor-captured-history.ts";
import type { VerifiedDonorPaymentCommand } from "../../functions/d1-custody/donor-payment-command.ts";
import type { Preparation } from "../../functions/d1-custody/handler.ts";

export const [pool, donor, admin, beneficiary, issuer, team] = [111, 112, 113, 114, 115, 116]
  .map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
export const namespace = "11111111-1111-4111-8111-111111111111", incident = "incident-1";
export const date = "2026-10-27T12:00:00Z", closedAt = Date.parse(date) / 1000, ledgerHash = "a".repeat(64);
export const memoHash = hash(Buffer.from("vaca.d1.donation.v1\n" + incident)).toString("hex");
export const requestId = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
export function equal(a: unknown, b: unknown) {
  const ordered = (v: unknown): unknown => Array.isArray(v) ? v.map(ordered) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)])) : v;
  if (JSON.stringify(ordered(a)) !== JSON.stringify(ordered(b))) throw Error("assertion failed: " + JSON.stringify([a, b]));
}
/** Actual SDK observations and 014/015/054 storage, with no provider or RPC substitute. */
export function captured(issued = false, amounts = ["1.0000000"], memo: "hash" | "none" | "wrong" = "hash") {
  const asset: DonorAsset = issued ? { type: "issued", code: "USD", issuer } : { type: "native" };
  const records = [1, 2].map(position => {
    const birth = position === 1, source = birth ? team : donor;
    const tx = new TransactionBuilder(new Account(source, String(position)), {
      fee: "500", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 0 },
      memo: birth ? Memo.text("D1OPS") : memo === "none" ? Memo.none() : Memo.hash(memo === "wrong" ? "b".repeat(64) : memoHash),
    }).addOperation(birth ? Operation.createAccount({ destination: pool, startingBalance: "100.0000000" }) :
      Operation.payment({ destination: pool, asset: issued ? new Asset("USD", issuer) : Asset.native(), amount: "10.0000000" })).build();
    const token = String((10n << 32n) + BigInt(position) * 4096n);
    const result = birth ? xdr.OperationResultTr.createAccount(xdr.CreateAccountResult.createAccountSuccess()) :
      xdr.OperationResultTr.payment(xdr.PaymentResult.paymentSuccess());
    const transaction = { hash: tx.hash().toString("hex"), paging_token: token, ledger: 10, created_at: date,
      source_account: source, source_account_sequence: tx.sequence, fee_account: source, fee_charged: "123",
      max_fee: tx.fee, successful: true, operation_count: 1, envelope_xdr: tx.toXDR(),
      result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"),
        result: xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(result)]),
        ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") };
    return parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: { sequence: 10, hash: ledgerHash, closedAt } },
      ledger: { sequence: 10, hash: ledgerHash, closed_at: date }, transaction });
  });
  const discoveries = records.map((r, i) => {
    const id = String(BigInt(r.pagingToken) + 1n);
    return parseDiscoveredOperation({ pool, anchor: { sequence: 10, closedAt }, transaction: r.raw.transaction,
      operation: { id, paging_token: id, transaction_hash: r.transactionHash, transaction_successful: true,
        source_account: i === 0 ? team : donor, created_at: date,
        ...(i === 0 ? { type: "create_account", type_i: 0, funder: team, account: pool, starting_balance: "100.0000000" } :
          { type: "payment", type_i: 1, from: donor, to: pool, amount: "10.0000000",
            ...(issued ? { asset_type: "credit_alphanum4", asset_code: "USD", asset_issuer: issuer } : { asset_type: "native" }) }) } });
  });
  function journal(entries: unknown[], tokens: string[], transaction: boolean) {
    const cursor = tokens.at(-1)!, checkpoint = { cursor, through_ledger: 10, ledger_hash: ledgerHash, closed_at: closedAt };
    const pages = [entries, []].map((records, i) => {
      const page = { revision: 1, from_cursor: i === 0 ? "0" : cursor, to_cursor: cursor,
        through_ledger: 10, ledger_hash: ledgerHash, closed_at: closedAt, records };
      const receipt = transaction ? { kind: "d1_transaction_page", revision: 1, namespace, network: "TESTNET", pool,
        first_ledger: 8, authorized_by: admin, page, checkpoint, page_count: i + 1, record_count: entries.length,
        page_record_count: records.length } : { kind: "d1_discovery_page", revision: 1, namespace, network: "TESTNET", pool,
        from_cursor: page.from_cursor, to_cursor: cursor, checkpoint_ledger: 10, checkpoint_hash: ledgerHash,
        page_count: i + 1, record_count: records.length };
      return { namespace, from_cursor: page.from_cursor, through_ledger: "10", ledger_hash: ledgerHash,
        page: JSON.stringify(page), receipt: JSON.stringify(receipt) };
    });
    return { pages, checkpoint: { namespace, checkpoint: JSON.stringify(checkpoint), page_count: "2" } };
  }
  const discovery = journal(discoveries, discoveries.map(r => r.paging_token), false);
  const history = journal(records, records.map(r => r.pagingToken), true);
  const payment = { transaction_hash: records[1].transactionHash, operation_id: discoveries[1].operation_id,
    donor, pool, asset, amount: "10.0000000" };
  const command: VerifiedDonorPaymentCommand = { kind: "d1_verified_donor_payment_command", revision: 1, namespace,
    network: "TESTNET", pool, verifiedDonor: donor, paymentTransactionHash: payment.transaction_hash, paymentOperationId: payment.operation_id };
  const capture: CanonicalOwnedCapture = { kind: "d1_donor_payment_capture", revision: 1,
    scope: { namespace, network: "TESTNET", pool, verifiedDonor: donor, transactionHash: payment.transaction_hash, operationId: payment.operation_id },
    dbReadAt: closedAt + 2, payment: { transaction_hash: payment.transaction_hash, operation_id: payment.operation_id,
      payment: JSON.stringify(payment), donation_stroops: "100000000", allocated_stroops: amounts.reduce((sum, a) => sum + BigInt(a.replace(".", "")), 0n).toString() },
    allocations: amounts.map((amount, i) => {
      const id = requestId(i + 1), timestamp = "2026-10-27T12:00:01.123Z";
      const request = { version: 1, incident_id: incident, donor, beneficiary, asset, amount, deadline: "2026-10-27T12:05:00Z" };
      const input: Preparation = { request_id: id, authorized_by: admin, payment, request, confirmed_at: closedAt, ledger: 10, memo_hash: memoHash };
      const reservation = { request_id: id, authorized_by: admin, request, state: "reserved", reserved_at: timestamp };
      const receipt = { revision: 1, state: "allocated", request_id: id, allocation: {
        reservation, payment, allocated_amount: amount, state: "allocated", allocated_at: timestamp } };
      return { donation_allocations: { request_id: id, authorized_by: admin, transaction_hash: payment.transaction_hash,
        operation_id: payment.operation_id, allocated_stroops: BigInt(amount.replace(".", "")).toString(), allocated_at: timestamp.replace("Z", "+00:00") },
        release_requests: { ...reservation, request: JSON.stringify(request), reserved_at: timestamp.replace("Z", "+00:00") },
        d1_preparations: { request_id: id, namespace, input: JSON.stringify(input), receipt: JSON.stringify(receipt) },
        d1_issuance_intents: null, d1_issuance_sequences: null, d1_unsigned_transactions: null, d1_issuance_fee_commitments: null,
        d1_initial_financial_observations: [], d1_signed_transactions: null, d1_submission_attempts: null, d1_issuance_outcomes: null };
    }),
    evidence: { d1_pools: { namespace, pool, first_ledger: "8" }, d1_discovery_checkpoints: discovery.checkpoint,
      d1_discovery_pages: discovery.pages, d1_discovery_operations: discoveries.map(r => ({ namespace, paging_token: r.paging_token,
        transaction_hash: r.transaction_hash, operation_id: r.operation_id, record: JSON.stringify(r) })),
      d1_transaction_checkpoints: { ...history.checkpoint, record_count: String(records.length) }, d1_transaction_pages: history.pages,
      d1_transaction_records: records.map(r => ({ namespace, paging_token: r.pagingToken, transaction_hash: r.transactionHash, record: JSON.stringify(r) })),
      d1_operating_credit_observations: [{ namespace, operation_id: discoveries[0].operation_id, receipt: JSON.stringify({
        kind: "d1_operating_credit_observation", revision: 1, authorized_by: admin, observation: { namespace, network: "TESTNET", pool,
          funder: team, operationId: discoveries[0].operation_id, transactionHash: records[0].transactionHash, ledger: 10,
          amountStroops: "1000000000", anchor: { sequence: 10, hash: ledgerHash, closedAt }, record: discoveries[0] } }) }] } };
  return { capture, command };
}
