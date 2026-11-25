import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { Account, Asset, Networks, Operation, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { CustodyError } from "../../functions/d1-custody/custody-error.ts";
import { HorizonDiscoverySource } from "../../functions/d1-custody/discovery-source.ts";

// Public-only synthetic identities. No signing, submission, or real fetch.
const address = (byte: number) => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, byte));
const pool = address(1), sender = address(2), beneficiary = address(3), issuer = address(4);
const origin = "https://horizon-testnet.stellar.org";
const headPath = "/ledgers?limit=1&order=desc";
const date = "2026-10-27T12:00:00Z", closedAt = Date.parse(date) / 1000;
const head = {
  sequence: 10, hash: "a".repeat(64), closed_at: date,
  base_fee_in_stroops: 100, base_reserve_in_stroops: 5000000,
};
const root = { network_passphrase: Networks.TESTNET, history_elder_ledger: 1, history_latest_ledger: head.sequence };
const headPage = (ledger = head) => ({ _embedded: { records: [ledger] } });
const initialPage = () => ({ pool, firstLedger: 8, checkpoint: null });

function transport(respond: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const source = new HorizonDiscoverySource(async (url, init) => {
    calls.push({ url: String(url), init });
    return await respond(String(url));
  });
  return {
    source,
    verify(paths: string[]) {
      assert.deepEqual(calls.map(call => call.url), paths.map(path => origin + path));
      return calls.map(({ init }) => {
        assert.deepEqual([init?.method, init?.redirect, init?.credentials], ["GET", "error", "omit"]);
        assert.ok(init?.signal instanceof AbortSignal);
        return init.signal;
      });
    },
  };
}

type Step = [path: string, response: unknown];
function scripted(...steps: Step[]) {
  let index = 0;
  const fake = transport(url => {
    const next = steps[index++];
    if (!next || url !== origin + next[0]) throw new Error(`Unexpected fake request: ${url}`);
    return next[1] instanceof Response ? next[1] : Response.json(next[1]);
  });
  return { source: fake.source, verify: () => fake.verify(steps.map(([path]) => path)) };
}

async function unavailable(result: Promise<unknown>) {
  // A fulfilled promise (including any partial record) must fail this assertion.
  await assert.rejects(result, (error: unknown) => {
    assert.ok(error instanceof CustodyError);
    assert.equal(error.code, "dependency_unavailable");
    assert.equal(error.message, "dependency_unavailable");
    assert.equal(error.status, 503);
    return true;
  });
}

const operationContext = () => ({
  ...initialPage(),
  checkpoint: { cursor: "0", through_ledger: head.sequence, ledger_hash: head.hash, closed_at: closedAt },
});
const account = {
  id: pool, account_id: pool, sequence: "1", last_modified_ledger: 9,
  subentry_count: 0, num_sponsoring: 0, num_sponsored: 0,
  balances: [{ asset_type: "native", balance: "1.0000000", selling_liabilities: "0.0000000", buying_liabilities: "0.0000000" }],
  signers: [{ key: pool, type: "ed25519_public_key", weight: 1 }],
  thresholds: { low_threshold: 1, med_threshold: 1, high_threshold: 1 },
};
const toid = (ledger: number, position: number) => (BigInt(ledger) << 32n) + (BigInt(position) << 12n);
function payment(ledger = 9, position = 1) {
  const envelope = new TransactionBuilder(new Account(sender, "1"), {
    fee: "100", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 0 },
  }).addOperation(Operation.payment({ destination: pool, asset: Asset.native(), amount: "1" })).build();
  const hash = envelope.hash().toString("hex"), token = toid(ledger, position), id = String(token + 1n);
  const transaction = {
    hash, ledger, paging_token: String(token), successful: true, operation_count: 1,
    created_at: date, envelope_xdr: envelope.toXDR(),
  };
  const operation = {
    id, paging_token: id, type: "payment", type_i: 1, from: sender, to: pool, asset_type: "native",
    amount: "1.0000000", source_account: sender, created_at: date,
    transaction_hash: hash, transaction_successful: true,
  };
  return { operation, transaction };
}
function operationLookups({ operation, transaction }: ReturnType<typeof payment>, requestedId = operation.id): Step[] {
  return [["/", root], [`/accounts/${pool}`, account], [headPath, headPage()],
    [`/operations/${requestedId}`, operation], [`/transactions/${transaction.hash}`, transaction]];
}

Deno.test("pinned operation returns the exact indexed record after both lookups and a final head check", async () => {
  const context = operationContext(), before = structuredClone(context);
  const fixture = payment(), { operation, transaction } = fixture;
  const fake = scripted(...operationLookups(fixture), [headPath, headPage()]);
  assert.deepEqual(await fake.source.readOperationAtCheckpoint(context, operation.id), {
    paging_token: operation.id, operation_id: operation.id, ledger: transaction.ledger, transaction_hash: transaction.hash,
    operation: {
      kind: "incoming_payment", donor: sender, pool, asset: { type: "native" }, amount: "1.0000000",
      sdk_type: 1, source: sender, confirmed_at: closedAt, memo: { type: "none", value: null }, raw: fixture,
    },
  });
  fake.verify();
  assert.deepEqual(context, before);
});

Deno.test("pinned operation rejects an internally consistent wrong ID and a ledger outside either bound", async () => {
  const wrongId = payment(9, 2), tooEarly = payment(7), tooLate = payment(11);
  for (const [fixture, requestedId] of [
    [wrongId, String(toid(9, 1) + 1n)], [tooEarly, tooEarly.operation.id], [tooLate, tooLate.operation.id],
  ] as const) {
    const context = operationContext(), before = structuredClone(context);
    const fake = scripted(...operationLookups(fixture, requestedId));
    await unavailable(fake.source.readOperationAtCheckpoint(context, requestedId));
    fake.verify();
    assert.deepEqual(context, before);
  }
});

Deno.test("pinned operation rejects final head drift after the operation and transaction were read", async () => {
  const context = operationContext(), before = structuredClone(context), fixture = payment();
  const fake = scripted(...operationLookups(fixture), [headPath, headPage({ ...head, sequence: 11 })]);
  await unavailable(fake.source.readOperationAtCheckpoint(context, fixture.operation.id));
  fake.verify();
  assert.deepEqual(context, before);
});

const claimableBalanceId = "00000000" + "c".repeat(64);
const balancePath = `/claimable_balances/${claimableBalanceId}`;
const deadline = "2026-10-28T12:00:00Z";
const beforeDeadline = { abs_before: deadline, abs_before_epoch: String(Date.parse(deadline) / 1000) };
const claimContext = (now = () => closedAt) => ({
  pool, claimableBalanceId, beneficiary, asset: { type: "issued", code: "USD", issuer }, amount: "1.2345678",
  deadline, minimumLedger: 10, now, maximumAgeSeconds: 30, futureToleranceSeconds: 2,
});
const balance = {
  id: claimableBalanceId, asset: `USD:${issuer}`, amount: "1.2345678", last_modified_ledger: "9",
  claimants: [
    { destination: beneficiary, predicate: beforeDeadline },
    { destination: pool, predicate: { not: beforeDeadline } },
  ],
};
const claimAnchor = (ledger = head): Step[] => [["/", root], [headPath, headPage(ledger)]];
const claimLookups = (resource: unknown = balance): Step[] => [...claimAnchor(), [balancePath, resource]];
async function rejectPresence(steps: Step[], now?: () => number) {
  const context = claimContext(now), before = { ...context, asset: { ...context.asset } };
  const fake = scripted(...steps);
  await unavailable(fake.source.readClaimableBalance(context));
  fake.verify();
  assert.deepEqual(context, before);
}

Deno.test("claimable balance returns only current indexer presence for the exact resource and claimant predicates", async () => {
  const context = claimContext(), before = { ...context, asset: { ...context.asset } };
  const fake = scripted(...claimLookups(), [headPath, headPage()]);
  assert.deepEqual(await fake.source.readClaimableBalance(context), {
    verification: "current_indexer_observation", state: "present", claimableBalanceId,
    observedLedger: head.sequence, ledgerHash: head.hash, observedClosedAt: closedAt,
  });
  fake.verify();
  assert.deepEqual(context, before);
});

Deno.test("claimable balance rejects missing or mismatched resources rather than reporting a disposition", async () => {
  const [claim, recover] = balance.claimants;
  for (const resource of [
    new Response(null, { status: 404 }),
    { ...balance, id: "00000000" + "d".repeat(64) },
    { ...balance, asset: `USD:${sender}` },
    { ...balance, amount: "1.2345679" },
    { ...balance, claimants: [{ ...claim, destination: sender }, recover] },
    { ...balance, claimants: [{ ...claim, predicate: { abs_before: date } }, recover] },
    { ...balance, claimants: [claim, { ...recover, predicate: beforeDeadline }] },
  ]) {
    await rejectPresence(claimLookups(resource));
  }
});

Deno.test("claimable balance rejects stale and future anchors before reading the resource", async () => {
  await rejectPresence(claimAnchor(), () => closedAt + 31);
  await rejectPresence(claimAnchor(), () => closedAt - 3);
});

Deno.test("claimable balance rejects a regressing trusted clock even when the repeated anchor stays fresh", async () => {
  const readings = [closedAt, closedAt + 2, closedAt + 1];
  await rejectPresence([...claimLookups(), [headPath, headPage()]], () => readings.shift()!);
  assert.deepEqual(readings, []);
});

Deno.test("claimable balance rejects final head drift after the resource lookup", async () => {
  await rejectPresence([...claimLookups(), [headPath, headPage({ ...head, hash: "b".repeat(64) })]]);
});

async function rejectTransport(fake: ReturnType<typeof transport>) {
  const context = initialPage(), before = structuredClone(context);
  await unavailable(fake.source.readPage(context));
  const [signal] = fake.verify([headPath]);
  assert.deepEqual(context, before);
  return signal;
}

Deno.test("source rejects status 200 with no body or a redirected response", async () => {
  const redirected = Object.defineProperty(Response.json(headPage()), "redirected", { value: true });
  for (const response of [new Response(null, { status: 200 }), redirected]) {
    assert.equal((await rejectTransport(transport(() => response))).aborted, false);
  }
});

Deno.test("source per-request deadline bounds a fetch that ignores AbortSignal", async () => {
  const fake = transport(() => new Promise<Response>(() => {}));
  assert.equal((await rejectTransport(fake)).aborted, true);
});

Deno.test("source per-request deadline cancels a stalled body reader without awaiting cancellation", async () => {
  let pulling = false, cancellations = 0;
  const body = new ReadableStream<Uint8Array>({
    pull() { pulling = true; return new Promise<void>(() => {}); },
    cancel() { cancellations++; return new Promise<void>(() => {}); },
  }, { highWaterMark: 0 });
  const fake = transport(() => new Response(body));
  assert.equal((await rejectTransport(fake)).aborted, true);
  assert.equal(pulling, true);
  assert.equal(cancellations, 1);
});

Deno.test("claimable presence binds the resource ledger and predicate epoch at the freshness limits", async () => {
  for (const offset of [-2, 30]) {
    const fake = scripted(...claimLookups(), [headPath, headPage()]);
    assert.equal((await fake.source.readClaimableBalance(claimContext(() => closedAt + offset))).state, "present");
    fake.verify();
  }
  await rejectPresence(claimLookups({ ...balance, last_modified_ledger: "11" }));
  const [claim, recover] = balance.claimants;
  await rejectPresence(claimLookups({ ...balance, claimants: [
    { ...claim, predicate: { ...beforeDeadline, abs_before_epoch: "0" } }, recover,
  ] }));
});
