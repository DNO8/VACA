import { Account, Asset, Keypair, Networks, Operation, Transaction, TransactionBuilder, xdr, hash } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { BeneficiaryClaimHistoryReader } from "../../functions/d1-custody/beneficiary-claim-history-reader.ts";
import { calculateIssuanceEncumbrances } from "../../functions/d1-custody/issuance-encumbrances.ts";
import { parseInitialIssuanceOutcome } from "../../functions/d1-custody/initial-issuance-outcome.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { fixture, pool, admin, donor, beneficiary, team, namespace, requestId, closedAt } from "../fixtures/initial-financial-authorization.ts";
type DTO = Record<string, any>;
const iso = (n: number) => new Date(n * 1000).toISOString().replace(".000Z", "Z");
function equal(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error("public observable mismatch"); }
function result(types: number[], failed = false) {
  return new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString(String(types.length * 100)),
    result: (failed ? xdr.TransactionResultResult.txFailed : xdr.TransactionResultResult.txSuccess)(types.map((type, i) => {
      const b = Buffer.alloc(12); b.writeInt32BE(type, 4); b.writeInt32BE(failed && i === 0 ? -1 : 0, 8); return xdr.OperationResult.fromXDR(b);
    })), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
}
function raw(tx: Transaction, types: number[], ledger = 12, time = closedAt + 10, position = 1, failed = false, resultXdr?: string) {
  return { hash: tx.hash().toString("hex"), paging_token: ((BigInt(ledger) << 32n) + BigInt(position) * 4096n).toString(), ledger,
    created_at: iso(time), source_account: tx.source, source_account_sequence: tx.sequence, fee_account: tx.source,
    fee_charged: String(types.length * 100), max_fee: tx.fee, successful: !failed, operation_count: types.length,
    envelope_xdr: tx.toXDR(), result_xdr: resultXdr ?? result(types, failed) };
}
async function setup(issued = false) {
  const f = issued ? fixture("none", "issued", "100.0000000", true, "1.0000000", "before") : fixture("none", "donation", "100.0000000", false, "1.0000000");
  const response = await f.h.client.rpc("d1_load_unsigned_transaction", {}), j = structuredClone((response.data as DTO).transaction);
  const tx = TransactionBuilder.fromXDR(j.unsigned_xdr, Networks.TESTNET); if (!(tx instanceof Transaction)) throw Error("fixture");
  tx.sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 101))); const cb = tx.getClaimableBalanceId(0);
  const createdId = xdr.ClaimableBalanceId.fromXDR(cb, "hex");
  const creationResult = xdr.CreateClaimableBalanceResult.createClaimableBalanceSuccess(createdId);
  const op = xdr.OperationResult.opInner(xdr.OperationResultTr.createClaimableBalance(creationResult));
  const created = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("100"), result: xdr.TransactionResultResult.txSuccess([op]), ext: xdr.TransactionResultExt.fromXDR("AAAAAA==", "base64") }).toXDR("base64");
  const observed = parseInitialIssuanceOutcome(pool, tx.toXDR(), { context: { pool, firstLedger: 8, anchor: { sequence: 11, hash: "f".repeat(64), closedAt: closedAt + 5 } },
    transaction: raw(tx, [14], 11, closedAt + 5, 1, false, created), ledger: { sequence: 11, hash: "f".repeat(64), closed_at: iso(closedAt + 5) } });
  const initial: Parameters<typeof calculateIssuanceEncumbrances>[0] = { namespace, pool, firstLedger: 8,
    anchor: { sequence: 12, hash: "f".repeat(64), closedAt: closedAt + 10 }, transactions: [...f.h.records, structuredClone(observed.observation)], operatingCredits: [f.h.receipt],
    issuances: [{ unsignedJournal: j, outcomeReceipt: { kind: "d1_issuance_outcome_journal", revision: 1, request_id: requestId, namespace, network: "TESTNET", pool, authorized_by: admin,
      attempt_id: "33333333-3333-4333-8333-333333333333", transaction_hash: j.transaction_hash, envelope_hash: hash(Buffer.from(tx.toXDR(), "base64")).toString("hex"), outcome_hash: "d".repeat(64), observed_outcome: structuredClone(observed) } }] };
  calculateIssuanceEncumbrances(initial);
  const make = (o: DTO = {}) => {
    const b = new TransactionBuilder(new Account(o.source ?? beneficiary, o.sequence ?? "0"), { networkPassphrase: Networks.TESTNET, fee: "100", timebounds: { minTime: 0, maxTime: 0 } });
    const types: number[] = [];
    if (o.batch) { b.addOperation(Operation.payment({ destination: donor, asset: Asset.native(), amount: "0.0000001" })); types.push(1);
      b.addOperation(Operation.claimClaimableBalance({ balanceId: "0".repeat(72) })); types.push(15); }
    b.addOperation(Operation.claimClaimableBalance({ balanceId: o.cb ?? cb, ...(o.explicit ? { source: o.explicit } : {}) })); types.push(15);
    return raw(b.build(), types, o.ledger, o.time, o.position, o.failed);
  };
  return { input: { requestId, initial }, cb, make, claim: make(), issuanceToken: observed.observation.pagingToken };
}
type Setup = Awaited<ReturnType<typeof setup>>;
function transport(d: Setup, fault = "", pages: DTO[][] = [[d.claim]], mutate?: () => void) {
  const calls: { url: URL; options: RequestInit | undefined }[] = [], anchor = structuredClone(d.input.initial.anchor); let page = 0;
  const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
    const u = new URL(String(url)); calls.push({ url: u, options });
    if (u.pathname === "/") { mutate?.(); if (fault === "stalled_body") await new Promise(r => setTimeout(r, 6000));
      return Response.json({ network_passphrase: fault === "network" ? Networks.PUBLIC : Networks.TESTNET, history_elder_ledger: fault === "pruned" ? 12 : 8, history_latest_ledger: anchor.sequence }); }
    if (u.pathname.startsWith("/ledgers/")) {
      const sequence = Number(u.pathname.split("/").at(-1)); return Response.json({ sequence, hash: fault === "anchor" ? "e".repeat(64) : "f".repeat(64), closed_at: iso(sequence === anchor.sequence ? anchor.closedAt : closedAt + 5) });
    }
    if (u.pathname !== `/claimable_balances/${d.cb}/transactions`) throw Error("unexpected_request_SECRET");
    if (fault === "404") return new Response("secret", { status: 404 });
    if (fault === "oversized") return new Response("x".repeat(1048577));
    if (fault === "json") return new Response("secret-invalid-json");
    if (fault === "utf8") return new Response(new Uint8Array([255]));
    if (fault === "stalled_fetch") return new Promise<Response>(() => {});
    if (fault === "stalled_body") return new Response(new ReadableStream({ cancel: () => new Promise<void>(() => {}) }));
    const response = Response.json({ _embedded: { records: pages[page++] ?? [] }, _links: { next: { href: "https://evil.invalid/SECRET" } } });
    if (fault === "redirect") Object.defineProperty(response, "redirected", { value: true }); return response;
  }) as typeof fetch;
  return { fetcher, calls, history: () => calls.filter(c => c.url.pathname.endsWith("/transactions")) };
}
async function reject(input: unknown, fetcher: typeof fetch, serializable = true) {
  const before = serializable ? JSON.stringify(input) : undefined; let caught: unknown;
  try { await new BeneficiaryClaimHistoryReader(fetcher).read(input); } catch (e) { caught = e; }
  equal(caught instanceof CustodyError ? [caught.code, caught.status, caught.message] : caught, ["beneficiary_claim_history_unavailable", 503, "beneficiary_claim_history_unavailable"]);
  if (serializable) equal(JSON.stringify(input), before);
}
Deno.test("CB history finds consumed native and issued claims without current CB or account reads", async () => {
  for (const issued of [false, true]) for (const batch of [false, true]) {
    const d = await setup(issued); d.claim = batch ? d.make({ source: team, explicit: beneficiary, batch: true }) : d.claim;
    const h = transport(d), before = JSON.stringify(d.input), value = await new BeneficiaryClaimHistoryReader(h.fetcher).read(d.input);
    equal([value.kind, value.claims.length, value.claims[0].requestId, value.claims[0].amountStroops, value.claims[0].operationIndex], ["d1_beneficiary_claim_projection", 1, requestId, "10000000", batch ? 2 : 0]);
    const basis = calculateIssuanceEncumbrances(d.input.initial); equal(value.basis, basis);
    const selected = value.basis.donations.find(x => x.operationId === basis.encumbrances[0].operationId)!;
    equal([selected.amountStroops, selected.issuedStroops, selected.unissuedStroops], ["100000000", "10000000", "90000000"]);
    equal(value.basis.donations.filter(x => x.operationId !== selected.operationId).map(x => [x.asset, x.amountStroops, x.issuedStroops, x.unissuedStroops]),
      issued ? [[{ type: "native" }, "100000000", "0", "100000000"]] : []);
    equal(JSON.stringify(d.input), before); equal(Object.isFrozen(value.basis.original), true); equal(Object.isFrozen(value.claims[0]), true);
    equal(h.calls.map(x => x.url.pathname), ["/", "/ledgers/12", `/claimable_balances/${d.cb}/transactions`, "/ledgers/12"]);
    for (const c of h.calls) equal([c.url.origin, c.options?.method, c.options?.redirect, c.options?.credentials, c.options?.signal instanceof AbortSignal], ["https://horizon-testnet.stellar.org", "GET", "error", "omit", true]);
    equal([...h.history()[0].url.searchParams], [["order", "asc"], ["include_failed", "true"], ["limit", "20"], ["cursor", d.issuanceToken]]);
  }
});
Deno.test("failed claim history advances constructed cursor, not hostile next links or retry", async () => {
  const d = await setup(), failed = d.make({ failed: true }), positive = d.make({ position: 2, sequence: "1" });
  const h = transport(d, "", [[failed], [positive]]), value = await new BeneficiaryClaimHistoryReader(h.fetcher).read(d.input);
  equal(value.claims[0].transactionHash, positive.hash); equal(h.history().map(c => c.url.searchParams.get("cursor")), [d.issuanceToken, failed.paging_token]);
});
Deno.test("foreign network anchor and canonical claim contradictions fail closed without retry", async () => {
  for (const fault of ["network", "anchor", "pruned", "404", "redirect", "oversized", "json", "utf8", "cb", "source", "failed", "hash", "expired", "late", "above", "empty", "duplicate", "order", "tail", "page_size", "caps"]) {
    const d = await setup(); let pages = [[d.claim]];
    if (fault === "cb") pages = [[d.make({ cb: "0".repeat(72) })]];
    if (fault === "source") pages = [[d.make({ source: pool })]];
    if (fault === "failed") pages = [[d.make({ failed: true })]];
    if (fault === "hash") d.claim.hash = TransactionBuilder.fromXDR(d.claim.envelope_xdr, Networks.PUBLIC).hash().toString("hex");
    if (fault === "expired" || fault === "late") { const time = closedAt + (fault === "expired" ? 300 : 301); d.input.initial.anchor.closedAt = time; pages = [[d.make({ time })]]; }
    if (fault === "above") pages = [[d.make({ ledger: 13, time: closedAt + 11 })]];
    if (fault === "empty") pages = [[]];
    if (fault === "duplicate") pages = [[d.claim, structuredClone(d.claim)]];
    if (fault === "order") pages = [[d.make({ position: 2 }), d.make({ sequence: "1" })]];
    if (fault === "tail") pages = [[d.claim, { ...d.claim, paging_token: "invalid" }]];
    if (fault === "page_size") pages = [Array.from({ length: 21 }, () => structuredClone(d.claim))];
    if (fault === "caps") pages = Array.from({ length: 4 }, (_, i) => [d.make({ failed: i < 3, position: i + 1, sequence: String(i) })]);
    const h = transport(d, fault, pages); await reject(d.input, h.fetcher);
    equal(new Set(h.history().map(c => c.url.href)).size, h.history().length);
    if (fault === "caps") equal(h.history().length, 3);
    if (["404", "redirect", "oversized", "json", "utf8"].includes(fault)) equal(h.history().length, 1);
    equal(h.calls.filter(c => c.url.pathname === "/").length, 1);
  }
});
Deno.test("entire read deadline bounds ignored abort in fetch and body without awaiting cancellation", async () => {
  for (const fault of ["stalled_fetch", "stalled_body"]) {
    const d = await setup(), h = transport(d, fault), start = performance.now(); await reject(d.input, h.fetcher);
    const elapsed = performance.now() - start; equal(elapsed >= 9500 && elapsed < 14500, true); equal(h.history().length, 1);
    equal(h.calls.every(c => c.options?.signal?.aborted), true);
  }
});
Deno.test("initial hostile evidence rejects before any fetch, and caller mutations cannot redirect selection", async () => {
  const d = await setup(), h = transport(d); let reads = 0;
  const getter = { requestId, get initial() { reads++; throw Error("secret"); } }; await reject(getter, h.fetcher, false); equal([reads, h.calls.length], [0, 0]);
  for (const input of [null, { ...d.input, requestId: namespace }, { ...d.input, forged: true }, { ...d.input, initial: {} }]) await reject(input, h.fetcher);
  equal(h.calls.length, 0);
  const t = transport(d, "", [[d.claim]], () => { d.input.requestId = namespace; d.input.initial.anchor.hash = "e".repeat(64); });
  const value = await new BeneficiaryClaimHistoryReader(t.fetcher).read(d.input); equal(value.claims[0].requestId, requestId); equal(value.claims[0].claimableBalanceId, d.cb);
  d.input.initial.transactions.length = 0; equal(value.basis.donations[0].unissuedStroops, "90000000");
});
