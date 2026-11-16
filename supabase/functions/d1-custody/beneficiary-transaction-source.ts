import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";
import { type DiscoveryCheckpoint } from "./discovery-source.ts";
import { type IncludedTransactionObservation, parseIncludedTransaction } from "./transaction-observation.ts";

export interface BeneficiaryTransactionContext {
  readonly pool: string;
  readonly beneficiary: string;
  readonly firstLedger: number;
  readonly checkpoint: Readonly<DiscoveryCheckpoint>;
}
type Header = { sequence: number; hash: string; closedAt: number };
export interface BeneficiaryTransactionPage {
  revision: 1;
  context: BeneficiaryTransactionContext;
  anchor: Header;
  from_cursor: string;
  to_cursor: string;
  records: IncludedTransactionObservation[];
  complete: boolean;
}
const ORIGIN = "https://horizon-testnet.stellar.org";
function check(value: unknown): asserts value {
  if (!value) throw new Error("invalid_beneficiary_history");
}
function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  check(Reflect.ownKeys(value).every(k => typeof k === "string" && descriptors[k].enumerable && "value" in descriptors[k]));
  return Object.fromEntries(Object.entries(descriptors).map(([k, d]) => [k, d.value]));
}
function sequence(value: unknown): number {
  check(typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 4294967295);
  return value;
}
function seconds(value: unknown): number {
  check(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799);
  return value;
}
function hash(value: unknown): string {
  check(typeof value === "string" && /^[0-9a-f]{64}$/.test(value)); return value;
}
function uint64(value: unknown): bigint {
  check(typeof value === "string" && /^(0|[1-9][0-9]{0,19})$/.test(value));
  const id = BigInt(value); check(id <= 18446744073709551615n); return id;
}
function token(value: unknown): bigint {
  const id = uint64(value);
  check(id === 0n ||
    ((id >> 32n) > 0n && (id & 4095n) === 0n && ((id >> 12n) & 1048575n) > 0n));
  return id;
}
function address(value: unknown): string {
  check(typeof value === "string" && /^G[A-Z2-7]{55}$/.test(value));
  Keypair.fromPublicKey(value); return value;
}
function header(value: unknown): Header {
  const dto = object(value);
  check(typeof dto.closed_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(dto.closed_at));
  const closedAt = seconds(Date.parse(dto.closed_at) / 1000);
  check(new Date(closedAt * 1000).toISOString().replace(".000Z", "Z") === dto.closed_at);
  return { sequence: sequence(dto.sequence), hash: hash(dto.hash), closedAt };
}
function sameHeader(a: Header, b: Header): boolean {
  return a.sequence === b.sequence && a.hash === b.hash && a.closedAt === b.closedAt;
}
function list(value: unknown, maximum: number): unknown[] {
  const records = object(object(value)._embedded).records;
  check(Array.isArray(records) && records.length <= maximum); return records;
}
// Bound nesting before JSON.parse, including malicious deeply nested tiny bodies.
function boundedJson(text: string): unknown {
  let depth = 0, quoted = false, escaped = false;
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") check(++depth <= 28);
    else if (char === "}" || char === "]") check(--depth >= 0);
  }
  check(depth === 0 && !quoted);
  return JSON.parse(text) as unknown;
}
// This is account involvement, NOT a positive claim selector. Recipients and
// claimants are valid account-history entries even when they did not sign.
function involves(observation: IncludedTransactionObservation, beneficiary: string): boolean {
  const tx = TransactionBuilder.fromXDR(observation.envelopeXdr, Networks.TESTNET);
  check(tx instanceof Transaction);
  if (observation.feePayer === beneficiary || tx.source === beneficiary) return true;
  const addressKeys = new Set(["source", "destination", "from", "trustor", "sponsoredId", "sponsor", "seller"]);
  const participant = (value: unknown, depth: number): boolean => {
    check(depth <= 12);
    if (value === null || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(v => participant(v, depth + 1));
    return Object.entries(value).some(([key, v]) =>
      (addressKeys.has(key) && v === beneficiary) ||
      ((key === "claimants" || key === "claimant" || key === "claimPredicate") && participant(v, depth + 1)));
  };
  return tx.operations.some(op => (op.source ?? tx.source) === beneficiary || participant(op, 0) ||
    (op.type === "createClaimableBalance" && op.claimants.some(claimant => claimant.destination === beneficiary)));
}

/** Inert server dependency; no account-control policy or request occurs at construction. */
export class HorizonBeneficiaryTransactionSource {
  private readonly transport: (path: string) => Promise<unknown>;
  constructor(fetcher: typeof fetch = globalThis.fetch) {
    check(typeof fetcher === "function");
    // Match the existing injected-fetch receiver convention, but capture both
    // function and receiver now; later source mutation cannot replace them.
    const receiver = this, method = fetcher;
    this.transport = async (path: string) => {
      check(path.startsWith("/") && !path.startsWith("//") && !/[\\#]/.test(path));
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("horizon_deadline")); }, 10000);
      });
      const request = async () => {
        const response = await Reflect.apply(method, receiver, [ORIGIN + path, {
          method: "GET", redirect: "error", credentials: "omit", signal: controller.signal,
        }]);
        check(!controller.signal.aborted && response.status === 200 && !response.redirected && response.body !== null);
        const bodyReader = response.body.getReader();
        reader = bodyReader;
        const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
        let bytes = 0, text = "";
        while (true) {
          const chunk = await bodyReader.read();
          check(!controller.signal.aborted);
          if (chunk.done) break;
          bytes += chunk.value.byteLength; check(bytes <= 1048576);
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
        return boundedJson(text);
      };
      try { return await Promise.race([request(), deadline]); }
      finally { clearTimeout(timer); void reader?.cancel().catch(() => {}); }
    };
  }

  /** One ascending page at an already saved pool checkpoint. Never retry here. */
  async readTransactionPageAtCheckpoint(context: BeneficiaryTransactionContext, fromCursor: string): Promise<BeneficiaryTransactionPage> {
    try {
      const input = object(context), saved = object(input.checkpoint);
      check(Object.keys(input).sort().join(",") === "beneficiary,checkpoint,firstLedger,pool" &&
        Object.keys(saved).sort().join(",") === "closed_at,cursor,ledger_hash,through_ledger");
      const pool = address(input.pool), beneficiary = address(input.beneficiary), firstLedger = sequence(input.firstLedger);
      const anchor = { sequence: sequence(saved.through_ledger), hash: hash(saved.ledger_hash), closedAt: seconds(saved.closed_at) };
      const savedCursor = saved.cursor;
      check(typeof savedCursor === "string" && firstLedger <= anchor.sequence &&
        (uint64(savedCursor) >> 32n) <= BigInt(anchor.sequence));
      const from = fromCursor, cursor = token(from);
      // Opaque seek lower bound, not evidence of an actual previous transaction.
      const startFence = firstLedger > 1 ? (BigInt(firstLedger) << 32n) - 4096n : 0n;
      check(cursor === startFence || ((cursor >> 32n) >= BigInt(firstLedger) && (cursor >> 32n) <= BigInt(anchor.sequence)));
      const captured: BeneficiaryTransactionContext = Object.freeze({ pool, beneficiary, firstLedger,
        checkpoint: Object.freeze({ cursor: savedCursor, through_ledger: anchor.sequence, ledger_hash: anchor.hash, closed_at: anchor.closedAt }) });
      const read = this.transport;
      const confirm = async () => {
        const root = object(await read("/"));
        check(root.network_passphrase === Networks.TESTNET && sequence(root.history_elder_ledger) <= firstLedger &&
          sequence(root.history_latest_ledger) === anchor.sequence);
        const heads = list(await read("/ledgers?limit=1&order=desc"), 1);
        check(heads.length === 1 && sameHeader(header(heads[0]), anchor));
        // Positive saved-header lookup as well as current-head equality.
        check(sameHeader(header(await read("/ledgers/" + anchor.sequence)), anchor));
      };
      await confirm();
      const transactions = list(await read(`/accounts/${beneficiary}/transactions?order=asc&include_failed=true&limit=100&cursor=${from}`), 100);
      let last = cursor;
      const seen = new Set<string>();
      for (const raw of transactions) {
        const dto = object(raw), next = token(dto.paging_token), ledger = sequence(dto.ledger), digest = hash(dto.hash);
        check(next > last && (next >> 32n) === BigInt(ledger) && ledger >= firstLedger && ledger <= anchor.sequence && !seen.has(digest));
        seen.add(digest); last = next;
      }
      const ledgers = new Map<number, unknown>();
      const records: IncludedTransactionObservation[] = [];
      for (const raw of transactions) {
        const dto = object(raw), ledger = sequence(dto.ledger);
        if (!ledgers.has(ledger)) {
          const rawHeader = await read("/ledgers/" + ledger), parsed = header(rawHeader);
          check(parsed.sequence === ledger && parsed.closedAt <= anchor.closedAt &&
            (ledger !== anchor.sequence || sameHeader(parsed, anchor)));
          ledgers.set(ledger, rawHeader);
        }
        const observation = parseIncludedTransaction({ transaction: dto, ledger: ledgers.get(ledger),
          context: { pool, firstLedger, anchor } });
        check(involves(observation, beneficiary));
        records.push(observation);
      }
      await confirm();
      return { revision: 1, context: captured, anchor, from_cursor: from,
        to_cursor: records.length ? records[records.length - 1].pagingToken : from,
        records, complete: transactions.length === 0 };
    } catch { throw new CustodyError("beneficiary_transaction_observation_unavailable", 503); }
  }
}
