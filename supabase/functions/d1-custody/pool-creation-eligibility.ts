import { Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { CustodyError } from "./handler.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { TransactionHistoryDatabase } from "./transaction-ingestion.ts";
import { readTransactionHistory } from "./transaction-history-reader.ts";

type Client = Parameters<typeof readTransactionHistory>[0];
type Source = Pick<HorizonDiscoverySource, "readAccountAtCheckpoint">;
export interface PoolCreationEvidence {
  kind: "d1_pool_creation_evidence"; revision: 1; namespace: string; network: "TESTNET"; pool: string; firstLedger: number;
  anchor: { sequence: number; hash: string; closedAt: number };
  creation: { transactionHash: string; operationId: string; operationIndex: number; ledger: number; closedAt: number; funder: string; startingBalanceStroops: string };
}
function unavailable() { return new CustodyError("pool_creation_unavailable", 503); }
function valid(v: unknown): asserts v { if (!v) throw unavailable(); }
/** Small bounded JSON snapshot; reject getters before reading account/state values. */
function snapshot(input: unknown): unknown {
  let nodes = 0, bytes = 131072;
  function visit(v: unknown, depth: number): unknown {
    valid(++nodes <= 20000 && depth <= 28 && (bytes -= 8) >= 0);
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { valid(Number.isSafeInteger(v)); return v; }
    if (typeof v === "string") {
      valid(v.length <= bytes && !/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v));
      valid((bytes -= Buffer.byteLength(JSON.stringify(v), "utf8")) >= 0); return v;
    }
    valid(v !== null && typeof v === "object"); const array = Array.isArray(v);
    valid(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype));
    const keys = Reflect.ownKeys(v), d = Object.getOwnPropertyDescriptors(v);
    valid(keys.length <= 20000 && keys.every(k => typeof k === "string" && "value" in d[k] && (d[k].enumerable || (array && k === "length"))));
    if (array) {
      const length = d.length.value; valid(length <= 20000 && keys.length === length + 1);
      return Array.from({ length }, (_, i) => { valid(Object.hasOwn(d, i)); return visit(d[String(i)].value, depth + 1); });
    }
    return Object.fromEntries((keys as string[]).sort().map(k => [visit(k, depth + 1), visit(d[k].value, depth + 1)]));
  }
  return visit(input, 0);
}
function same(a: unknown, b: unknown) { return JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b)); }
/** Backend evidence only, never a caller-supplied creation ID/XDR or permission to sign.
 * "New" means the current incarnation was created within the completely covered
 * active history; it does not certify that this public key has never existed.
 */
export async function observePoolCreation(client: Client, namespace: string, authenticatedAdmin: string, pool: string,
  source?: Source): Promise<PoolCreationEvidence> {
  try {
    const database = new TransactionHistoryDatabase(client, namespace, authenticatedAdmin, pool, "TESTNET");
    const history = await readTransactionHistory(client, namespace, authenticatedAdmin, pool);
    const state = history.state, checkpoint = state.income_state.checkpoint;
    valid(checkpoint !== null && history.records.length > 0);
    const anchor = { sequence: checkpoint.through_ledger, hash: checkpoint.ledger_hash, closedAt: checkpoint.closed_at };
    let creation: PoolCreationEvidence["creation"] | undefined;
    for (let transactionIndex = 0; transactionIndex < history.records.length; transactionIndex++) {
      const record = history.records[transactionIndex];
      if (record.outcome !== "success") continue; // Failed operations did not create or merge an account.
      const tx = TransactionBuilder.fromXDR(record.envelopeXdr, Networks.TESTNET);
      valid(tx instanceof Transaction);
      for (let i = 0; i < tx.operations.length; i++) {
        const op = tx.operations[i], sourceAccount = op.source ?? tx.source;
        valid(!(op.type === "accountMerge" && sourceAccount === pool));
        // A successful operation cannot use an account that has not been created yet.
        if (transactionIndex === 0 && creation === undefined) valid(sourceAccount !== pool);
        if (op.type !== "createAccount" || op.destination !== pool) continue;
        valid(creation === undefined && transactionIndex === 0 && record.ledger >= state.first_ledger && sourceAccount !== pool);
        valid(/^(0|[1-9][0-9]{0,11})\.[0-9]{7}$/.test(op.startingBalance));
        const balance = BigInt(op.startingBalance.replace(".", "")); valid(balance > 0n && balance <= 9223372036854775807n);
        creation = { transactionHash: record.transactionHash, operationId: String(BigInt(record.pagingToken) + BigInt(i + 1)),
          operationIndex: i, ledger: record.ledger, closedAt: record.closedAt, funder: sourceAccount, startingBalanceStroops: balance.toString() };
      }
    }
    valid(creation !== undefined);
    const context = { pool, firstLedger: state.first_ledger, checkpoint: { ...checkpoint } };
    const account = snapshot(await (source ?? new HorizonDiscoverySource()).readAccountAtCheckpoint(context)) as {
      pool: string; networkPassphrase: string; anchor: unknown; lastModifiedLedger: number;
    };
    valid(account !== null && typeof account === "object" && account.pool === pool && account.networkPassphrase === Networks.TESTNET && same(account.anchor, anchor));
    valid(Number.isSafeInteger(account.lastModifiedLedger) && account.lastModifiedLedger >= creation.ledger && account.lastModifiedLedger <= anchor.sequence);
    // The provider await must not hide changed coverage, membership or authorization.
    valid(same(await database.loadState(), state));
    return { kind: "d1_pool_creation_evidence", revision: 1, namespace, network: "TESTNET", pool, firstLedger: state.first_ledger, anchor, creation };
  } catch (error) {
    if (error instanceof CustodyError && error.code === "unauthorized_admin_wallet" && error.status === 403) throw error;
    throw unavailable();
  }
}
