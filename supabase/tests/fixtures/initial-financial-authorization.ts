import { Account, Asset, LiquidityPoolAsset, Keypair, Memo, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError, type Preparation } from "../../functions/d1-custody/handler.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import { parseDiscoveredOperation } from "../../functions/d1-custody/discovery.ts";
import { planIssuance } from "../../functions/d1-custody/issuance-plan.ts";
export const [pool, team, donor, admin, beneficiary, issuer] = [101, 102, 103, 104, 105, 106].map(n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey());
export const namespace = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222", hash = "a".repeat(64), date = "2026-10-27T12:00:00Z", closedAt = Date.parse(date) / 1000;
export function equal(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error("assertion failed: " + JSON.stringify([a, b])); }
export type InitialSetup = "none" | "before" | "after" | "zero" | "failed" | "lp" | "feeOnly";
function included(position: number, kind: "create" | "payment" | "pool" | "issued" | "trust" | "feeOnly" = "payment", success = true, startingBalance = "100.0000000", setup: InitialSetup = "before") {
  const source = kind === "create" ? team : ["pool", "trust", "feeOnly"].includes(kind) ? pool : donor, token = String((10n << 32n) + BigInt(position) * 4096n);
  const op = kind === "trust" ? Operation.changeTrust({ asset: setup === "lp" ? new LiquidityPoolAsset(Asset.native(), new Asset("USD", issuer), 30) : new Asset("USD", issuer), limit: setup === "zero" ? "0.0000000" : "100.0000000" }) : kind === "feeOnly" ? Operation.manageData({ name: "other", value: null, source: team }) : kind === "create" ? Operation.createAccount({ destination: pool, startingBalance }) : kind === "pool" ? Operation.manageData({ name: "test", value: null }) : Operation.payment({ destination: pool, asset: kind === "issued" ? new Asset("USD", issuer) : Asset.native(), amount: "10.0000000" });
  const tx = new TransactionBuilder(new Account(source, kind === "trust" || kind === "feeOnly" ? "1" : String(position)), { fee: "500", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 0 }, memo: kind === "create" ? Memo.text("D1OPS") : Memo.none() }).addOperation(op).build();
  const inner = kind === "trust" ? xdr.OperationResultTr.changeTrust(success ? xdr.ChangeTrustResult.changeTrustSuccess() : xdr.ChangeTrustResult.changeTrustNoIssuer()) : kind === "feeOnly" ? xdr.OperationResultTr.manageData(xdr.ManageDataResult.manageDataSuccess()) : kind === "create" ? xdr.OperationResultTr.createAccount(xdr.CreateAccountResult.createAccountSuccess()) : kind === "pool" ? xdr.OperationResultTr.manageData(success ? xdr.ManageDataResult.manageDataSuccess() : xdr.ManageDataResult.manageDataNameNotFound()) : xdr.OperationResultTr.payment(xdr.PaymentResult.paymentSuccess());
  const results = [xdr.OperationResult.opInner(inner)];
  const transaction = { hash: tx.hash().toString("hex"), paging_token: token, ledger: 10, created_at: date, source_account: source, source_account_sequence: tx.sequence,
    fee_account: source, fee_charged: "123", max_fee: tx.fee, successful: success, operation_count: 1, envelope_xdr: tx.toXDR(),
    result_xdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("123"), result: success ? xdr.TransactionResultResult.txSuccess(results) : xdr.TransactionResultResult.txFailed(results), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64") };
  return { transaction, token, record: parseIncludedTransaction({ context: { pool, firstLedger: 8, anchor: { sequence: 10, hash, closedAt } }, ledger: { sequence: 10, hash, closed_at: date }, transaction }) };
}
export function fixture(extra: "none" | "success" | "failed" = "none", selectedPayment: "donation" | "operating" | "absent" | "issued" = "donation", startingBalance = "100.0000000", issuedDonation = false, issueAmount = "1.0000000", setup: InitialSetup = "none") {
  const birth = included(1, "create", true, startingBalance), payment = included(setup === "none" || setup === "after" ? 2 : 3), records = [birth.record, payment.record];
  if (extra !== "none") records.push(included(setup === "none" ? 3 : 5, "pool", extra === "success").record);
  if (setup !== "none") records.push(included(setup === "after" ? 3 : 2, setup === "feeOnly" ? "feeOnly" : "trust", setup !== "failed", startingBalance, setup).record);
  const issuedPayment = issuedDonation || selectedPayment === "issued" ? included(setup === "none" ? 3 : 4, "issued") : undefined;
  if (issuedPayment) records.push(issuedPayment.record); records.sort((a, b) => BigInt(a.pagingToken) < BigInt(b.pagingToken) ? -1 : 1);
  const operationId = String(BigInt(birth.token) + 1n), operation = { id: operationId, paging_token: operationId, transaction_hash: birth.transaction.hash, transaction_successful: true,
    source_account: team, created_at: date, type: "create_account", type_i: 0, funder: team, account: pool, starting_balance: startingBalance };
  const receipt = { kind: "d1_operating_credit_observation", revision: 1, authorized_by: admin, observation: { namespace, network: "TESTNET", pool, funder: team,
    operationId, transactionHash: birth.transaction.hash, ledger: 10, amountStroops: BigInt(startingBalance.replace(".", "")).toString(), anchor: { sequence: 10, hash, closedAt }, record: parseDiscoveredOperation({ pool, anchor: { sequence: 10, closedAt }, operation, transaction: birth.transaction }) } };
  const checkpoint = { cursor: records.at(-1)!.pagingToken, through_ledger: 10, ledger_hash: hash, closed_at: closedAt };
  const discovery = { kind: "d1_discovery_state", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 8, checkpoint: { ...checkpoint, cursor: String(BigInt(checkpoint.cursor) + 1n) }, coverage_complete: true };
  const history = { kind: "d1_transaction_history_state", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 8, income_state: structuredClone(discovery), checkpoint, coverage_complete: true, page_count: records.length + 1, record_count: records.length };
  const credit = { kind: "d1_operating_credit_state", revision: 1, namespace, network: "TESTNET", pool, receipt_count: 1, set_hash: "c".repeat(64), discovery_state: structuredClone(discovery) };
  const selected = selectedPayment === "issued" ? issuedPayment! : selectedPayment === "donation" ? payment : selectedPayment === "operating" ? birth : included(20);
  const selectedDonor = selectedPayment === "operating" ? team : donor;
  const prepared: Preparation = { request_id: requestId, authorized_by: admin, confirmed_at: closedAt, ledger: 10, memo_hash: "b".repeat(64),
    payment: { transaction_hash: selected.transaction.hash, operation_id: String(BigInt(selected.token) + 1n), donor: selectedDonor, pool, amount: selectedPayment === "operating" ? startingBalance : "10.0000000", asset: selectedPayment === "issued" ? { type: "issued", code: "USD", issuer } : { type: "native" } },
    request: { version: 1, incident_id: "incident-1", donor: selectedDonor, beneficiary, amount: issueAmount, asset: selectedPayment === "issued" ? { type: "issued", code: "USD", issuer } : { type: "native" }, deadline: "2026-10-27T12:05:00Z" } };
  const scope = { request_id: requestId, namespace, network: "TESTNET", pool };
  const intent = { kind: "d1_issuance_request_intent", revision: 1, ...scope, preparation_input: prepared, preparation: { revision: 1, state: "allocated", request_id: requestId, allocation: {} } };
  const reservation = { kind: "d1_issuance_sequence_reservation", revision: 1, ...scope, observed_account_sequence: "2", transaction_sequence: "3", intent };
  const { unsignedXdr } = planIssuance(prepared, { networkPassphrase: Networks.TESTNET, pool, sequence: "2", now: closedAt + 1, fee: "100" });
  const journal = { kind: "d1_unsigned_transaction_journal", revision: 1, ...scope, reservation: structuredClone(reservation), deadline: prepared.request.deadline, transaction_sequence: "3", unsigned_xdr: unsignedXdr, transaction_hash: TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET).hash().toString("hex") };
  const commitment = { kind: "d1_issuance_fee_commitment", revision: 1, ...scope, reservation: structuredClone(reservation), authorized_by: admin, deadline: prepared.request.deadline, issuance_fee_stroops: "100", future_refund_fee_stroops: "300" };
  const owner = { kind: "d1_issuance_fee_commitment_lookup", revision: 1, ...scope, reservation: structuredClone(reservation), commitment: structuredClone(commitment), commitments: [structuredClone(commitment)] };
  const account = { pool, networkPassphrase: Networks.TESTNET as const, anchor: { sequence: 10, hash, closedAt }, sequence: "2", lastModifiedLedger: 10, baseFee: "100", baseReserve: "5000000",
    native: { balance: (BigInt(startingBalance.replace(".", "")) + 100000000n).toString(), sellingLiabilities: "0" }, issuedBalances: [] as { code: string; issuer: string; balance: string; sellingLiabilities: string }[], account: { subentry_count: 0, num_sponsoring: 0, num_sponsored: 0 } };
  if (setup !== "none") account.native.balance = (BigInt(account.native.balance) - 123n).toString();
  if (setup === "before" || setup === "after") { account.account.subentry_count = 1; account.issuedBalances = [{ code: "USD", issuer, balance: issuedPayment ? "100000000" : "0", sellingLiabilities: "0" }]; }
  const calls: string[] = [], counts: Record<string, number> = {};
  const h = { owner, account, history, credit, receipt, records, calls, now: closedAt + 2, error: null as unknown, persisted: new Map<string, unknown>(), observationAuthorizer: admin, beforeResponse: async (_name: string) => {}, mutate: (_name: string, _data: unknown, _count: number) => {},
    client: { async rpc(name: string, args: Record<string, unknown>) {
      calls.push(name); counts[name] = (counts[name] ?? 0) + 1; let data: unknown;
      switch (name) {
        case "d1_load_issuance_fee_commitments": data = h.owner; break;
        case "d1_load_unsigned_transaction": data = { kind: "d1_unsigned_transaction_lookup", revision: 1, ...scope, reservation: structuredClone(reservation), transaction: journal }; break;
        case "d1_load_transaction_history_state": data = h.history; break;
        case "d1_list_transaction_records": data = { kind: "d1_transaction_records", revision: 1, namespace, network: "TESTNET", pool, from_cursor: "0", next_cursor: checkpoint.cursor, records: h.records, has_more: false, history_state: h.history }; break;
        case "d1_load_discovery_state": data = discovery; break;
        case "d1_load_operating_credit_state": data = h.credit; break;
        case "d1_list_operating_credits": data = { kind: "d1_operating_credits", revision: 1, namespace, network: "TESTNET", pool, from_cursor: args.p_after, next_cursor: operationId, receipts: [h.receipt], has_more: false, credit_state: h.credit }; break;
        case "d1_load_operating_credit": data = { kind: "d1_operating_credit_lookup", revision: 1, namespace, network: "TESTNET", pool, operation_id: operationId, receipt: h.receipt }; break;
        case "d1_record_fresh_initial_financial_observation": {
          const snapshot = JSON.parse(JSON.stringify(args.p_snapshot)), snapshotHash = "e".repeat(64);
          if (!h.persisted.has(snapshotHash)) h.persisted.set(snapshotHash, { kind: "d1_initial_financial_observation", revision: 1, ...scope,
            authorized_by: h.observationAuthorizer, transaction_hash: journal.transaction_hash, snapshot_hash: snapshotHash, snapshot });
          data = { kind: "d1_fresh_initial_financial_observation", revision: 1, ...scope, authorized_by: args.p_authorized_by,
            transaction_hash: journal.transaction_hash, snapshot_hash: snapshotHash, validated_at: h.now, expires_at: snapshot.expiresAt,
            observation: structuredClone(h.persisted.get(snapshotHash)) }; break;
        }
        default: throw Error("Unexpected write/RPC: " + name);
      }
      const detached = JSON.parse(JSON.stringify(data)); h.mutate(name, detached, counts[name]); await h.beforeResponse(name); return { data: h.error === null ? detached : null, error: h.error };
    } }, source: { async readAccountAtCheckpoint() { calls.push("account"); const result = structuredClone(h.account); h.mutate("account", result, calls.filter(c => c === "account").length); return result; } } };
  return { h, configuration: { namespace, pool, requestId, authenticatedAdmin: admin, source: h.source, now: () => h.now, maximumAgeSeconds: 30, futureToleranceSeconds: 2 } };
}
