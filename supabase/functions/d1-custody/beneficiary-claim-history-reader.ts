import { Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { calculateIssuanceEncumbrances } from "./issuance-encumbrances.ts";
import { projectBeneficiaryClaims, type BeneficiaryClaimProjection } from "./beneficiary-claim-projection.ts";
import { parseIncludedTransaction } from "./transaction-observation.ts";
type DTO = Record<string, any>;
const ORIGIN = "https://horizon-testnet.stellar.org";
const unavailable = () => new CustodyError("beneficiary_claim_history_unavailable", 503);
function check(v: unknown): asserts v { if (!v) throw unavailable(); }
function object(v: unknown): DTO { check(v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype); return v as DTO; }
function integer(v: unknown): asserts v is number { check(typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 4294967295); }
/** Copy before any asynchronous transport: accessors/hooks are not JSON evidence. */
function snapshot(input: unknown): unknown {
  let nodes = 0, size = 0; const active = new Set<object>();
  function visit(v: unknown, depth: number): unknown {
    check(++nodes <= 20000 && depth <= 40);
    if (typeof v === "string") { check((size += v.length) <= 2097152); return v; }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { check(Number.isSafeInteger(v)); return v; }
    check(v !== null && typeof v === "object" && !active.has(v)); active.add(v);
    const array = Array.isArray(v), descriptors = Object.getOwnPropertyDescriptors(v);
    check(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype) && Object.getOwnPropertySymbols(v).length === 0);
    if (array) check(v.length <= 20000 && Object.keys(v).length === v.length && Object.keys(v).every((k, i) => k === String(i)));
    check(Object.keys(descriptors).length === Object.keys(v).length + (array ? 1 : 0));
    const entries: [string, unknown][] = [];
    for (const [k, d] of Object.entries(descriptors)) {
      check("value" in d); if (array && k === "length") continue;
      check(d.enumerable && (size += k.length) <= 2097152); entries.push([k, visit(d.value, depth + 1)]);
    }
    active.delete(v); return array ? entries.map(([, x]) => x) : Object.fromEntries(entries);
  }
  const result = visit(input, 0); check(new TextEncoder().encode(JSON.stringify(result)).length <= 2097152); return result;
}
function header(value: unknown) {
  const v = object(value); integer(v.sequence); check(typeof v.hash === "string" && /^[0-9a-f]{64}$/.test(v.hash));
  check(typeof v.closed_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v.closed_at));
  const closedAt = Date.parse(v.closed_at) / 1000; check(Number.isSafeInteger(closedAt) && closedAt >= 0);
  check(new Date(closedAt * 1000).toISOString().replace(".000Z", "Z") === v.closed_at);
  return { sequence: v.sequence, hash: v.hash, closedAt };
}
/** Positive-only historical indexer consistency, not consensus/fresh spending authority.
 * No current account/CB existence requirement, negative eligibility, writes or retries. */
export class BeneficiaryClaimHistoryReader {
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}
  async read(input: unknown): Promise<BeneficiaryClaimProjection> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const controller = new AbortController();
    try {
      const root = object(snapshot(input)); check(Object.keys(root).sort().join(",") === "initial,requestId" && typeof root.requestId === "string");
      const initial = root.initial as Parameters<typeof calculateIssuanceEncumbrances>[0];
      const basis = calculateIssuanceEncumbrances(initial), matches = basis.encumbrances.filter(e => e.requestId === root.requestId); check(matches.length === 1);
      const mapped = matches[0], issued = initial.transactions.filter(v => (v as DTO).transactionHash === mapped.issuanceTransactionHash); check(issued.length === 1);
      const issuance = issued[0] as DTO, anchor = initial.anchor;
      const context = { pool: initial.pool, firstLedger: initial.firstLedger, anchor };
      const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, 10000); });
      const read = async (path: string): Promise<unknown> => {
        const response = await this.fetcher(ORIGIN + path, { method: "GET", redirect: "error", credentials: "omit", signal: controller.signal });
        check(!controller.signal.aborted && response.status === 200 && !response.redirected && response.body !== null);
        reader = response.body.getReader(); const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }); let bytes = 0, text = "";
        while (true) {
          const chunk = await reader.read(); check(!controller.signal.aborted); if (chunk.done) break;
          check((bytes += chunk.value.byteLength) <= 1048576); text += decoder.decode(chunk.value, { stream: true });
        }
        return JSON.parse(text + decoder.decode());
      };
      const verifyAnchor = async () => {
        const raw = await read(`/ledgers/${anchor.sequence}`), h = header(raw);
        check(h.sequence === anchor.sequence && h.hash === anchor.hash && h.closedAt === anchor.closedAt); return raw;
      };
      const scan = async (): Promise<BeneficiaryClaimProjection> => {
        const network = object(await read("/")); check(network.network_passphrase === Networks.TESTNET);
        integer(network.history_elder_ledger); integer(network.history_latest_ledger);
        check(network.history_elder_ledger <= issuance.ledger && network.history_latest_ledger >= anchor.sequence);
        const cache = new Map<number, unknown>([[anchor.sequence, await verifyAnchor()]]), hashes = new Set<string>();
        let after = issuance.pagingToken as string;
        for (let page = 0; page < 3; page++) {
          const response = object(await read(`/claimable_balances/${mapped.claimableBalanceId}/transactions?order=asc&include_failed=true&limit=20&cursor=${after}`));
          const records = object(response._embedded).records; check(Array.isArray(records) && records.length > 0 && records.length <= 20);
          const candidates: { requestId: string; operationIndex: number; transaction: unknown; ledger: unknown }[] = [];
          // Validate the complete page before returning even an earlier positive.
          for (const value of records) {
            const dto = object(value); integer(dto.ledger); check(dto.ledger >= initial.firstLedger && dto.ledger <= anchor.sequence);
            check(typeof dto.paging_token === "string" && /^[1-9][0-9]{0,19}$/.test(dto.paging_token) && BigInt(dto.paging_token) > BigInt(after));
            if (!cache.has(dto.ledger)) { const raw = await read(`/ledgers/${dto.ledger}`); check(header(raw).sequence === dto.ledger); cache.set(dto.ledger, raw); }
            const ledger = cache.get(dto.ledger), parsed = parseIncludedTransaction({ context, transaction: dto, ledger });
            check(!hashes.has(parsed.transactionHash)); hashes.add(parsed.transactionHash); after = parsed.pagingToken;
            if (parsed.outcome !== "success") continue;
            const tx = TransactionBuilder.fromXDR(parsed.envelopeXdr, Networks.TESTNET); check(tx instanceof Transaction);
            tx.operations.forEach((op, operationIndex) => {
              if (op.type === "claimClaimableBalance" && op.balanceId === mapped.claimableBalanceId && (op.source ?? tx.source) === mapped.beneficiary)
                candidates.push({ requestId: mapped.requestId, operationIndex, transaction: dto, ledger });
            });
          }
          check(candidates.length <= 1);
          if (candidates.length === 1) { await verifyAnchor(); return projectBeneficiaryClaims({ initial, claims: candidates }); }
        }
        throw unavailable();
      };
      return await Promise.race([scan(), deadline]);
    } catch { throw unavailable(); }
    finally { clearTimeout(timer); controller.abort(); void reader?.cancel().catch(() => {}); }
  }
}
