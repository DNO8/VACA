import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { DiscoveryDatabase } from "../../functions/d1-custody/discovery-ingestion.ts";
import { HorizonDiscoverySource } from "../../functions/d1-custody/discovery-source.ts";
import { observeOperatingCredit } from "../../functions/d1-custody/operating-credit.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";

const pool = Keypair.random().publicKey(), team = Keypair.random().publicKey(), other = Keypair.random().publicKey();
const namespace = "11111111-1111-1111-1111-111111111111", date = "2026-10-27T12:00:00Z";
const closed = Date.parse(date) / 1000, ledgerHash = "a".repeat(64), origin = "https://horizon-testnet.stellar.org";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Mismatch: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function harness(options: { creation?: boolean; source?: string; destination?: string; asset?: Asset; memo?: Memo; amount?: string; ledger?: number; unsupported?: boolean } = {}) {
  const source = options.source ?? team, destination = options.destination ?? pool, amount = options.amount ?? "900719925.4740993";
  const asset = options.asset ?? Asset.native(), ledger = options.ledger ?? 10;
  const operation = options.unsupported ? Operation.manageData({ name: "ignored", value: null }) : options.creation ?
    Operation.createAccount({ destination, startingBalance: amount }) : Operation.payment({ destination, asset, amount });
  const tx = new TransactionBuilder(new Account(source, "1"), { fee: "100", networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 0 }, memo: options.memo ?? Memo.text("D1OPS") }).addOperation(operation).build();
  const token = (BigInt(ledger) << 32n) + 4096n, id = String(token + 1n), txHash = tx.hash().toString("hex");
  const op: Record<string, unknown> = { id, paging_token: id, transaction_hash: txHash, transaction_successful: true,
    source_account: source, created_at: date, ...(options.unsupported ? { type: "manage_data", type_i: 10 } : options.creation ?
      { type: "create_account", type_i: 0, funder: source, account: destination, starting_balance: amount } :
      { type: "payment", type_i: 1, from: source, to: destination, amount, ...(asset.isNative() ? { asset_type: "native" } :
        { asset_type: "credit_alphanum4", asset_code: asset.getCode(), asset_issuer: asset.getIssuer() }) }) };
  const transaction: Record<string, unknown> = { hash: txHash, paging_token: String(token), ledger, successful: true,
    operation_count: 1, created_at: date, envelope_xdr: tx.toXDR() };
  const checkpoint = { cursor: id, through_ledger: 10, ledger_hash: ledgerHash, closed_at: closed };
  const state = { kind: "d1_discovery_state", revision: 1, namespace, network: "TESTNET", pool, first_ledger: 8,
    checkpoint, coverage_complete: true };
  const head: Record<string, unknown> = { sequence: 10, hash: ledgerHash, closed_at: date, base_fee_in_stroops: 100, base_reserve_in_stroops: 5000000 };
  const account = { id: pool, account_id: pool, sequence: "1", last_modified_ledger: 10, subentry_count: 0,
    num_sponsoring: 0, num_sponsored: 0, balances: [{ asset_type: "native", balance: "1.0000000", selling_liabilities: "0.0000000", buying_liabilities: "0.0000000" }],
    signers: [{ type: "ed25519_public_key", key: pool, weight: 1 }], thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 } };
  const calls: string[] = [], rpcs: unknown[] = [];
  let rpcError: unknown = null, override: ((path: string) => unknown) | undefined;
  const sourceReader = new HorizonDiscoverySource(async (url, init) => {
    const path = String(url).replace(origin, ""); calls.push(path);
    const request = init as RequestInit | undefined;
    equal(String(url), origin + path); equal([request?.method, request?.redirect, request?.credentials], ["GET", "error", "omit"]);
    equal(request?.signal instanceof AbortSignal, true);
    const custom = override?.(path);
    const dto = custom !== undefined ? custom : path === "/" ? { network_passphrase: Networks.TESTNET, history_elder_ledger: 1, history_latest_ledger: 10 } :
      path === `/accounts/${pool}` ? account : path === "/ledgers?limit=1&order=desc" ? { _embedded: { records: [head] } } :
      path === `/operations/${id}` ? op : path === `/transactions/${txHash}` ? transaction : null;
    if (dto === null) throw new Error("unexpected request");
    return new Response(JSON.stringify(dto));
  });
  const database = new DiscoveryDatabase({ rpc(name, args) { rpcs.push([name, args]); return Promise.resolve({ data: structuredClone(state), error: rpcError }); } }, namespace, team);
  return { id, txHash, op, transaction, checkpoint, state, head, account, calls, rpcs, database, source: sourceReader,
    context: () => ({ pool, firstLedger: 8, checkpoint: { ...checkpoint } }),
    override(fn: typeof override) { override = fn; }, rpcError(value: unknown) { rpcError = value; } };
}
async function reject(h: ReturnType<typeof harness>, run = () => observeOperatingCredit(h.database, h.id, [team], h.source), message = "operating_credit_unavailable", status = 503) {
  const before = JSON.stringify([h.state, h.op, h.transaction, h.account]);
  let error: unknown; try { await run(); } catch (e) { error = e; }
  equal(error instanceof CustodyError, true); equal([(error as CustodyError).message, (error as CustodyError).status], [message, status]);
  equal(JSON.stringify([h.state, h.op, h.transaction, h.account]), before);
  equal(h.rpcs.every((r) => (r as unknown[])[0] === "d1_load_discovery_state"), true);
}
Deno.test("operating credit observes exact native payment and account creation without writes or input mutation", async () => {
  for (const creation of [false, true]) {
    const h = harness({ creation }), funders = Object.freeze([team]), before = JSON.stringify([h.state, h.op, h.transaction]);
    const result = await observeOperatingCredit(h.database, h.id, funders, h.source);
    equal({ ...result, record: undefined }, { namespace, network: "TESTNET", pool, funder: team, operationId: h.id,
      transactionHash: h.txHash, ledger: 10, amountStroops: "9007199254740993",
      anchor: { sequence: 10, hash: ledgerHash, closedAt: closed }, record: undefined });
    equal(result.record.operation.kind, creation ? "account_created" : "incoming_payment");
    equal(result.record.operation.memo, { type: "text", value: "D1OPS" });
    equal(result.record.operation.raw, { operation: h.op, transaction: h.transaction });
    equal(h.rpcs, [["d1_load_discovery_state", { p_namespace: namespace, p_authorized_by: team }]]);
    equal(JSON.stringify([h.state, h.op, h.transaction]), before); equal(funders, [team]);
    equal(h.calls, ["/", `/accounts/${pool}`, "/ledgers?limit=1&order=desc", `/operations/${h.id}`, `/transactions/${h.txHash}`, "/ledgers?limit=1&order=desc"]);
  }
  const h = harness({ amount: "922337203685.4775807" });
  equal((await observeOperatingCredit(h.database, h.id, [other, team], h.source)).amountStroops, "9223372036854775807");
});
Deno.test("credit rejects unlisted/self/outgoing/quarantined/issued and non-text D1OPS memos", async () => {
  for (const options of [{ source: other }, { source: pool }, { destination: other }, { unsupported: true },
    { asset: new Asset("USD", team) }, { memo: Memo.none() }, { memo: Memo.text("other") }, { memo: Memo.hash("ab".repeat(32)) }]) {
    await reject(harness(options));
  }
  for (const funders of [[], [team, team], ["bad"], [pool]]) {
    const h = harness(); await reject(h, () => observeOperatingCredit(h.database, h.id, funders, h.source));
  }
});
Deno.test("credit loads current admin first and rejects incomplete, historical, not-ingested and malformed state", async () => {
  for (const patch of [{ coverage_complete: false }, { checkpoint: null }, { network: "PUBLIC" }, { extra: true }]) {
    const h = harness(); Object.assign(h.state, patch); await reject(h); equal(h.calls, []); equal(h.rpcs.length, 1);
  }
  const old = harness({ ledger: 7 }); await reject(old); equal(old.calls, []);
  const ahead = harness(); ahead.checkpoint.cursor = String(BigInt(ahead.id) - 1n); await reject(ahead); equal(ahead.calls, []);
  for (const id of ["0", "01", "18446744073709551616", "../operations/1", 1]) {
    const h = harness(); await reject(h, () => observeOperatingCredit(h.database, id as string, [team], h.source)); equal(h.calls, []); equal(h.rpcs.length, 1);
  }
  const denied = harness(); denied.rpcError({ message: "unauthorized_admin_wallet" });
  await reject(denied, undefined, "unauthorized_admin_wallet", 403); equal(denied.calls, []);
  const failure = harness(); failure.rpcError({ message: "secret" }); await reject(failure); equal(failure.calls, []);
});
Deno.test("operation source binds requested id, DTO, successful XDR and active ledger with sanitized failures", async () => {
  for (const patch of [{ id: "1" }, { transaction_hash: "https://evil.invalid" }, { transaction_successful: false },
    { amount: "0.0000000" }, { amount: "1.0000000" }, { source_account: other }]) {
    const h = harness(); Object.assign(h.op, patch); await reject(h);
  }
  for (const patch of [{ hash: "b".repeat(64) }, { successful: false }, { ledger: 9 }, { envelope_xdr: "secret" }]) {
    const h = harness(); Object.assign(h.transaction, patch); await reject(h);
  }
  const alias = harness(); alias.op.id = alias.op.paging_token = String(BigInt(alias.id) + 4096n);
  alias.transaction.paging_token = String(BigInt(alias.id) + 4095n); await reject(alias);
  const old = harness({ ledger: 7 });
  let error: unknown; try { await old.source.readOperationAtCheckpoint(old.context(), old.id); } catch (e) { error = e; }
  equal([(error as CustodyError).message, (error as CustodyError).status], ["dependency_unavailable", 503]);
});
Deno.test("operation source snapshots context and rechecks final head after tx without retries or new cache", async () => {
  const h = harness(), context = h.context();
  h.override((path) => { if (path === "/") { context.pool = other; context.firstLedger = 99; context.checkpoint.through_ledger = 99; } });
  equal((await h.source.readOperationAtCheckpoint(context, h.id)).operation_id, h.id);
  await h.source.readOperationAtCheckpoint(h.context(), h.id);
  equal(h.calls.filter((p) => p === `/transactions/${h.txHash}`).length, 2);
  for (const patch of [{ sequence: 11 }, { hash: "b".repeat(64) }, { closed_at: "2026-10-27T12:00:01Z" }]) {
    const changed = harness(); let heads = 0;
    changed.override((path) => path === "/ledgers?limit=1&order=desc" && ++heads === 2 ? { _embedded: { records: [{ ...changed.head, ...patch }] } } : undefined);
    await reject(changed); equal(heads, 2); equal(changed.calls.length, 6);
  }
  const badAccount = harness(); badAccount.account.signers[0].key = other; await reject(badAccount);
  equal(badAccount.calls.some((p) => p.startsWith("/operations/")), false);
});
Deno.test("observer rebinds source records instead of trusting injected classification or identity", async () => {
  for (const mutate of [(r: Awaited<ReturnType<HorizonDiscoverySource["readOperationAtCheckpoint"]>>) => { r.operation.memo.value = "D1OPS"; },
    (r: Awaited<ReturnType<HorizonDiscoverySource["readOperationAtCheckpoint"]>>) => { r.operation_id = "1"; }]) {
    const h = harness({ memo: Memo.text("other") });
    await reject(h, () => observeOperatingCredit(h.database, h.id, [team], { async readOperationAtCheckpoint(context, id) {
      const record = await h.source.readOperationAtCheckpoint(context, id); mutate(record); return record;
    } }));
  }
  for (const error of [new Error("secret"), new CustodyError("unauthorized_admin_wallet", 403)]) {
    const h = harness(); await reject(h, () => observeOperatingCredit(h.database, h.id, [team], {
      readOperationAtCheckpoint() { throw error; },
    })); equal(h.rpcs.length, 1);
  }
});
Deno.test("source rejects malformed backend context and canonical id before HTTP", async () => {
  for (const id of ["0", "01", "18446744073709551616", "../1"]) {
    const h = harness(); let error: unknown;
    try { await h.source.readOperationAtCheckpoint(h.context(), id); } catch (e) { error = e; }
    equal([(error as CustodyError).message, (error as CustodyError).status], ["dependency_unavailable", 503]); equal(h.calls, []);
  }
  const h = harness();
  const hidden = Object.defineProperty({ ...h.checkpoint }, "unknown", { value: true });
  const accessor = Object.defineProperty({ ...h.checkpoint }, "cursor", { get() { throw new Error("secret"); }, enumerable: true });
  for (const checkpoint of [hidden, accessor, { ...h.checkpoint, extra: true }, { ...h.checkpoint, cursor: "01" }]) {
    let error: unknown;
    try { await h.source.readOperationAtCheckpoint({ ...h.context(), checkpoint }, h.id); } catch (e) { error = e; }
    equal([(error as CustodyError).message, (error as CustodyError).status], ["dependency_unavailable", 503]); equal(h.calls, []);
  }
});
Deno.test("observer snapshots backend allowlist before source await and sanitizes transport/unknown DTO failures", async () => {
  const h = harness(), funders = [team];
  h.override((path) => { if (path === "/") funders[0] = other; });
  equal((await observeOperatingCredit(h.database, h.id, funders, h.source)).funder, team);
  for (const dto of [{}, { transaction_hash: null }, { transaction_hash: "a".repeat(64) }]) {
    const bad = harness(); bad.override((path) => path.startsWith("/operations/") ? dto : undefined); await reject(bad);
  }
  const thrown = harness(); thrown.override(() => { throw new Error("private transport failure"); }); await reject(thrown);
});
