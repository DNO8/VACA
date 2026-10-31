import { Keypair, Networks } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { type DiscoveryRecord, parseDiscoveredOperation } from "./discovery.ts";

export interface DiscoveryCheckpoint {
  cursor: string;
  through_ledger: number;
  ledger_hash: string;
  closed_at: number;
}
export interface DiscoveryPage {
  revision: 1;
  from_cursor: string;
  to_cursor: string;
  through_ledger: number;
  ledger_hash: string;
  closed_at: number;
  records: DiscoveryRecord[];
}
interface Context {
  readonly pool: string;
  readonly firstLedger: number;
  readonly checkpoint: Readonly<DiscoveryCheckpoint> | null;
}
interface Header { sequence: number; hash: string; closedAt: number }
const ORIGIN = "https://horizon-testnet.stellar.org";
const MAX_BODY = 1048576;
const TIMEOUT_MS = 10000;
function valid(value: unknown): asserts value {
  if (!value) throw new Error("invalid_horizon_observation");
}
function object(value: unknown): Record<string, unknown> {
  valid(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  return value as Record<string, unknown>;
}
function sequence(value: unknown): number {
  valid(typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 4294967295);
  return value;
}
function token(value: unknown): bigint {
  valid(typeof value === "string" && /^(0|[1-9][0-9]{0,19})$/.test(value));
  const number = BigInt(value);
  valid(number <= 18446744073709551615n);
  return number;
}
function hash(value: unknown): string {
  valid(typeof value === "string" && /^[0-9a-f]{64}$/.test(value));
  return value;
}
function seconds(value: unknown): number {
  valid(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799);
  return value;
}
function header(value: unknown): Header {
  const dto = object(value);
  valid(typeof dto.closed_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(dto.closed_at));
  const closedAt = seconds(Date.parse(dto.closed_at) / 1000);
  valid(new Date(closedAt * 1000).toISOString().replace(".000Z", "Z") === dto.closed_at);
  return { sequence: sequence(dto.sequence), hash: hash(dto.hash), closedAt };
}
function list(value: unknown, limit: number): unknown[] {
  const records = object(object(value)._embedded).records;
  valid(Array.isArray(records) && records.length <= limit);
  return records;
}

/** Read-only indexer consistency evidence. Not independent chain proof or readiness. */
export class HorizonDiscoverySource {
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  private async read(path: string): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    // Race the entire fetch AND streamed body: an injected/failed transport may
    // ignore abort, so a signal alone does not establish a bounded wait.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("horizon_deadline"));
      }, TIMEOUT_MS);
    });
    const request = async () => {
      const response = await this.fetcher(ORIGIN + path, {
        method: "GET", redirect: "error", credentials: "omit", signal: controller.signal,
      });
      valid(!controller.signal.aborted && response.status === 200 && !response.redirected && response.body !== null);
      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
      let size = 0, text = "";
      while (true) {
        const chunk = await reader.read();
        valid(!controller.signal.aborted);
        if (chunk.done) break;
        size += chunk.value.byteLength;
        valid(size <= MAX_BODY);
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      return JSON.parse(text) as unknown;
    };
    try { return await Promise.race([request(), deadline]); }
    finally {
      clearTimeout(timer);
      // Also cancel on deadline, even when read() itself is stalled. Do not
      // await cancellation: a broken stream must not delay the bounded result.
      void reader?.cancel().catch(() => {});
    }
  }

  async readPage(context: Context): Promise<{ page: DiscoveryPage; complete: boolean }> {
    try {
      Keypair.fromPublicKey(context.pool);
      const firstLedger = sequence(context.firstLedger);
      const saved = context.checkpoint;
      let from = "0";
      if (saved !== null) {
        const dto = object(saved);
        valid(Object.keys(dto).sort().join(",") === "closed_at,cursor,ledger_hash,through_ledger");
        token(saved.cursor); sequence(saved.through_ledger); hash(saved.ledger_hash); seconds(saved.closed_at);
        valid((token(saved.cursor) >> 32n) <= BigInt(saved.through_ledger));
        from = saved.cursor;
      }
      const latest = list(await this.read("/ledgers?limit=1&order=desc"), 1);
      valid(latest.length === 1);
      const anchor = header(latest[0]);
      const root = object(await this.read("/"));
      const elder = sequence(root.history_elder_ledger), newest = sequence(root.history_latest_ledger);
      valid(root.network_passphrase === Networks.TESTNET && elder <= firstLedger &&
        newest >= anchor.sequence && anchor.sequence >= firstLedger);
      if (saved !== null) {
        valid(elder <= saved.through_ledger && anchor.sequence >= saved.through_ledger &&
          anchor.closedAt >= saved.closed_at);
        const old = anchor.sequence === saved.through_ledger ? anchor :
          header(await this.read("/ledgers/" + saved.through_ledger));
        valid(old.sequence === saved.through_ledger && old.hash === saved.ledger_hash && old.closedAt === saved.closed_at);
        valid(anchor.sequence === old.sequence || anchor.closedAt > old.closedAt);
      }
      const operations = list(await this.read(`/accounts/${context.pool}/operations?order=asc&limit=50&include_failed=false&cursor=${from}`), 50);
      // Validate the entire list before enriching any item. Never skip records
      // that outran the chosen anchor: the snapshot is stale, not complete.
      let cursor = token(from);
      for (const raw of operations) {
        const op = object(raw), next = token(op.paging_token);
        valid(next > cursor && (next >> 32n) <= BigInt(anchor.sequence));
        hash(op.transaction_hash);
        cursor = next;
      }
      const transactions = new Map<string, unknown>();
      const records: DiscoveryRecord[] = [];
      for (const raw of operations) {
        const op = object(raw), txHash = hash(op.transaction_hash);
        if (!transactions.has(txHash)) transactions.set(txHash, await this.read("/transactions/" + txHash));
        records.push(parseDiscoveredOperation({ operation: op, transaction: transactions.get(txHash),
          pool: context.pool, anchor: { sequence: anchor.sequence, closedAt: anchor.closedAt } }));
      }
      return { page: { revision: 1, from_cursor: from,
        to_cursor: records.length ? records[records.length - 1].paging_token : from,
        through_ledger: anchor.sequence, ledger_hash: anchor.hash, closed_at: anchor.closedAt, records },
        complete: operations.length === 0 };
    } catch {
      throw new CustodyError("dependency_unavailable", 503);
    }
  }
}
