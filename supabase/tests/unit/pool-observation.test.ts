import { Keypair, Networks } from "@stellar/stellar-sdk";
import { HorizonDiscoverySource } from "../../functions/d1-custody/discovery-source.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";

const pool = Keypair.random().publicKey(), issuer = Keypair.random().publicKey();
const origin = "https://horizon-testnet.stellar.org", date = "2026-10-27T12:00:00Z";
const closed = Date.parse(date) / 1000, hash = "a".repeat(64);
const input = () => ({ pool, firstLedger: 8,
  checkpoint: { cursor: String(9n << 32n), through_ledger: 10, ledger_hash: hash, closed_at: closed } });
const native = () => ({ asset_type: "native", balance: "123.0000001", selling_liabilities: "0.0000001", buying_liabilities: "0.0000000" });
const credit = (code = "USD") => ({ ...native(), asset_type: code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12",
  asset_code: code, asset_issuer: issuer, is_authorized: true });
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Mismatch: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function harness() {
  const root: Record<string, unknown> = { network_passphrase: Networks.TESTNET, history_elder_ledger: 1, history_latest_ledger: 10 };
  const ledger: Record<string, unknown> = { sequence: 10, hash, closed_at: date, base_fee_in_stroops: 100, base_reserve_in_stroops: 5000000 };
  const account: Record<string, unknown> = { id: pool, account_id: pool, sequence: "9223372036854775807", last_modified_ledger: 9,
    balances: [native(), credit(), credit("LONGASSET")], subentry_count: 2, num_sponsoring: 0, num_sponsored: 1,
    signers: [{ key: pool, type: "ed25519_public_key", weight: 1 }],
    thresholds: { low_threshold: 0, med_threshold: 1, high_threshold: 1 } };
  const calls: { url: string; init?: RequestInit }[] = [];
  let hook: (() => void) | undefined, failure: (() => Response) | undefined;
  const fetcher: typeof fetch = async (url, init) => {
    const text = String(url); calls.push({ url: text, init }); hook?.();
    if (failure) return failure();
    const dto = text === origin + "/" ? root : text === origin + `/accounts/${pool}` ? account :
      text === origin + "/ledgers?limit=1&order=desc" ? { _embedded: { records: [ledger] } } : undefined;
    if (!dto) throw new Error("unexpected request");
    return new Response(JSON.stringify(dto));
  };
  return { root, ledger, account, calls, source: new HorizonDiscoverySource(fetcher),
    hook(fn: () => void) { hook = fn; }, fail(fn: () => Response) { failure = fn; } };
}
async function reject(h: ReturnType<typeof harness>, context: unknown = input()) {
  const before = JSON.stringify(context), facts = JSON.stringify([h.root, h.ledger, h.account]);
  let error: unknown;
  try { await h.source.readAccountAtCheckpoint(context as Parameters<HorizonDiscoverySource["readAccountAtCheckpoint"]>[0]); }
  catch (e) { error = e; }
  equal(error instanceof CustodyError, true);
  equal([(error as CustodyError).message, (error as CustodyError).status], ["dependency_unavailable", 503]);
  equal(JSON.stringify(context), before); equal(JSON.stringify([h.root, h.ledger, h.account]), facts);
  equal(h.calls.length <= 3, true);
}
Deno.test("pool observation pins root/account/final head and returns complete exact normalized facts", async () => {
  const h = harness(), context = input(), before = JSON.stringify(context);
  const result = await h.source.readAccountAtCheckpoint(context);
  equal(result, { pool, networkPassphrase: Networks.TESTNET, anchor: { sequence: 10, hash, closedAt: closed },
    baseFee: "100", baseReserve: "5000000", sequence: "9223372036854775807", lastModifiedLedger: 9,
    native: { balance: "1230000001", sellingLiabilities: "1" },
    issuedBalances: ["USD", "LONGASSET"].map((code) => ({ code, issuer, balance: "1230000001", sellingLiabilities: "1" })),
    account: { subentry_count: 2, num_sponsoring: 0, num_sponsored: 1 } });
  equal(JSON.stringify(context), before);
  equal(h.calls.map((c) => c.url), [origin + "/", origin + `/accounts/${pool}`, origin + "/ledgers?limit=1&order=desc"]);
  for (const { init } of h.calls) {
    equal([init?.method, init?.redirect, init?.credentials], ["GET", "error", "omit"]);
    equal(init?.signal instanceof AbortSignal, true);
  }
  const copied = harness(), mutable = input();
  copied.hook(() => { mutable.pool = issuer; mutable.checkpoint.through_ledger = 11; mutable.checkpoint.ledger_hash = "b".repeat(64); });
  equal(await copied.source.readAccountAtCheckpoint(mutable), result);
  const bounds = harness(); bounds.account.sequence = "0"; bounds.account.last_modified_ledger = 10;
  bounds.account.balances = [{ ...native(), balance: "922337203685.4775807", selling_liabilities: "0.0000000" }];
  bounds.account.num_sponsoring = 4294967295;
  const observed = await bounds.source.readAccountAtCheckpoint(input());
  equal([observed.native, observed.sequence, observed.account.num_sponsoring],
    [{ balance: "9223372036854775807", sellingLiabilities: "0" }, "0", 4294967295]);
});
Deno.test("pool observation rejects invalid required registry checkpoint before HTTP", async () => {
  for (const context of [{ ...input(), checkpoint: null }, { ...input(), pool: "bad" }, { ...input(), firstLedger: 0 },
    { ...input(), firstLedger: 11 }, { ...input(), firstLedger: 4294967296 },
    ...[{ cursor: "01" }, { cursor: "18446744073709551616" }, { cursor: String(11n << 32n) },
      { through_ledger: 0 }, { through_ledger: "10" }, { ledger_hash: "A".repeat(64) }, { closed_at: -1 },
      { closed_at: 0.5 }, { extra: true }].map((patch) => ({ ...input(), checkpoint: { ...input().checkpoint, ...patch } }))]) {
    const h = harness(); await reject(h, context); equal(h.calls.length, 0);
  }
});
Deno.test("pool observation rejects network/history gaps and advanced/regressed/reset final headers", async () => {
  for (const patch of [{ network_passphrase: Networks.PUBLIC }, { history_elder_ledger: 9 }, { history_latest_ledger: 11 },
    { history_latest_ledger: 9 }, { history_elder_ledger: 0 }]) {
    const h = harness(); Object.assign(h.root, patch); await reject(h); equal(h.calls.length, 1);
  }
  for (const patch of [{ sequence: 11 }, { sequence: 9 }, { hash: "b".repeat(64) }, { closed_at: "2026-10-27T12:00:01Z" },
    { closed_at: "2026-02-30T12:00:00Z" }, { base_fee_in_stroops: "100" }, { base_fee_in_stroops: 0 },
    { base_reserve_in_stroops: 4294967296 }, { base_reserve_in_stroops: 0.5 }]) {
    const h = harness(); Object.assign(h.ledger, patch); await reject(h); equal(h.calls.length, 3);
  }
});
Deno.test("pool observation rejects account identity/sequence/staleness and incomplete counts", async () => {
  for (const patch of [{ id: issuer }, { account_id: issuer }, { account_id: undefined },
    ...["01", "-1", "9223372036854775808", 1].map((sequence) => ({ sequence })),
    ...[0, 11, "9"].map((last_modified_ledger) => ({ last_modified_ledger })),
    { subentry_count: -1 }, { num_sponsoring: 4294967296 }, { num_sponsored: undefined }]) {
    const h = harness(); Object.assign(h.account, patch); await reject(h);
  }
});
Deno.test("pool observation retains every asset or rejects malformed, unauthorized, duplicate and overflowing facts", async () => {
  const cases = [[], [credit()], [native(), native()], [native(), credit(), credit()],
    [native(), { ...credit(), asset_type: "liquidity_pool_shares" }],
    ...[{ asset_code: "ABCDE" }, { asset_code: "bad!" }, { asset_code: "" }, { asset_issuer: "bad" },
      { asset_type: "credit_alphanum12" }, { is_authorized: false }, { is_authorized: undefined }]
      .map((patch) => [native(), { ...credit(), ...patch }]),
    [{ ...native(), asset_code: "XLM" }], [{ ...native(), asset_issuer: issuer }]];
  for (const field of ["balance", "selling_liabilities", "buying_liabilities"]) {
    for (const value of [undefined, "-0.0000001", "1", "1.00000000", "01.0000000", "1e0", "922337203685.4775808", 1]) {
      cases.push([{ ...native(), [field]: value }], [native(), { ...credit(), [field]: value }]);
    }
  }
  for (const balances of cases) { const h = harness(); h.account.balances = balances; await reject(h); }
});
Deno.test("pool observation requires one enabled master covering every uint8 threshold", async () => {
  for (const signers of [[], [{ key: issuer, type: "ed25519_public_key", weight: 1 }],
    [{ key: pool, type: "sha256_hash", weight: 1 }], [{ key: pool, type: "ed25519_public_key", weight: 0 }],
    [{ key: pool, type: "ed25519_public_key", weight: 256 }],
    [{ key: pool, type: "ed25519_public_key", weight: 1 }, { key: issuer, type: "ed25519_public_key", weight: 1 }]]) {
    const h = harness(); h.account.signers = signers; await reject(h);
  }
  for (const key of ["low_threshold", "med_threshold", "high_threshold"]) {
    for (const value of [undefined, -1, 2, 256, "1"]) {
      const h = harness(); (h.account.thresholds as Record<string, unknown>)[key] = value; await reject(h);
    }
  }
});
Deno.test("pool observation sanitizes upstream HTTP/body/transport errors without retry", async () => {
  for (const failure of [() => new Response("secret", { status: 503 }), () => new Response("", { status: 302 }),
    () => new Response("{"), () => new Response(new Uint8Array([255])), () => new Response("x".repeat(1048577)),
    () => { throw new Error("private upstream facts"); }]) {
    const h = harness(); h.fail(failure); await reject(h); equal(h.calls.length, 1);
  }
});
