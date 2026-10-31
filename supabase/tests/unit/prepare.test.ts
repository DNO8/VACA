import { hash, Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { createCustodyHandler, CustodyError, type Preparation } from "../../functions/d1-custody/handler.ts";
import { CustodyDatabase, TestnetPayments } from "../../functions/d1-custody/adapters.ts";

function assert(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

const pool = Keypair.random();
const admin = Keypair.random();
const donor = Keypair.random();
const beneficiary = Keypair.random();
const now = 1793102400;
const payload = {
  amount: "1.0000000",
  beneficiary: beneficiary.publicKey(),
  incident_id: "incident-full-identity-1",
  operation_id: "123",
  transaction_hash: "a".repeat(64),
};

function signed(overrides: Record<string, unknown> = {}): Request {
  const message = {
    action: "prepare",
    network: "TESTNET",
    payload,
    pool: pool.publicKey(),
    request_id: "00000000-0000-4000-8000-000000000001",
    timestamp: now,
    version: 1,
    wallet: admin.publicKey(),
    ...overrides,
  };
  const signature = admin.sign(hash(Buffer.from(
    "Stellar Signed Message:\n" + JSON.stringify(message),
  ))).toString("base64");
  return new Request("http://127.0.0.1/functions/v1/d1-custody/prepare", {
    method: "POST",
    body: JSON.stringify({ ...message, signature }),
  });
}

Deno.test("signed preparation derives donor, asset and exact expiry from confirmed payment", async () => {
  let calls = 0;
  const handler = createCustodyHandler({
    poolSigner: pool,
    now: () => now,
    ledger: {
      payment: async () => ({
        transaction_hash: "a".repeat(64),
        operation_id: "123",
        donor: donor.publicKey(),
        pool: pool.publicKey(),
        asset: { type: "native" },
        amount: "2.0000000",
        confirmed_at: now - 10,
        ledger: 900,
        memo_hash: hash(Buffer.from("vaca.d1.donation.v1\nincident-full-identity-1")).toString(
          "hex",
        ),
      }),
    },
    database: {
      prepare: async (input) => {
        calls++;
        assert(input.payment.donor === donor.publicKey(), "Donor must come from ledger");
        assert(input.payment.amount === "2.0000000", "Payment amount must come from ledger");
        assert(input.request.amount === "1.0000000", "Allocation amount remains admin-authorized");
        assert(
          input.request.deadline === "2026-10-27T12:04:50Z",
          "Expiry must be payment plus 300 seconds",
        );
        return { revision: 1, state: "allocated", request_id: input.request_id };
      },
    },
  });
  const response = await handler(signed());
  assert(response.status === 200, "Valid signed preparation must succeed");
  assert(
    JSON.stringify(await response.json()) === JSON.stringify({
      revision: 1,
      state: "allocated",
      request_id: "00000000-0000-4000-8000-000000000001",
    }),
    "Response must contain the database receipt only",
  );
  assert(calls === 1, "Preparation must use one atomic RPC");
});

Deno.test("invalid beneficiary is rejected before ledger reads or persisted effects", async () => {
  let reads = 0;
  const handler = createCustodyHandler({
    poolSigner: pool,
    now: () => now,
    ledger: {
      payment: () => {
        reads++;
        throw new Error("must not read");
      },
    },
    database: {
      prepare: () => {
        throw new Error("must not persist");
      },
    },
  });
  const response = await handler(signed({ payload: { ...payload, beneficiary: "invalid" } }));
  assert(response.status === 400, "Invalid beneficiary must return 400");
  assert(
    JSON.stringify(await response.json()) === '{"error":"invalid_request"}',
    "Exact safe error",
  );
  assert(reads === 0, "Rejected input must not reach ledger or database");
});

Deno.test("signed HTTP preparation validates raw Testnet operation and successful transaction", async () => {
  const urls: string[] = [];
  let writes = 0;
  const memo = hash(Buffer.from("vaca.d1.donation.v1\nincident-full-identity-1"));
  const ledger = new TestnetPayments(async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/operations/123")) {
      return Response.json({
        id: "123",
        type: "payment",
        transaction_hash: "a".repeat(64),
        transaction_successful: true,
        from: donor.publicKey(),
        source_account: donor.publicKey(),
        to: pool.publicKey(),
        asset_type: "native",
        amount: "2.0000000",
      });
    }
    return Response.json({
      hash: "a".repeat(64),
      successful: true,
      operation_count: 1,
      ledger: 900,
      created_at: "2026-10-27T11:59:50Z",
      memo_type: "hash",
      memo: memo.toString("base64"),
    });
  });
  const handler = createCustodyHandler({
    poolSigner: pool,
    now: () => now,
    ledger,
    database: {
      prepare: async (input) => {
        writes++;
        assert(input.payment.donor === donor.publicKey(), "Donor must be independently verified");
        return { revision: 1, state: "allocated" };
      },
    },
  });
  const response = await handler(signed());
  assert(response.status === 200, "Confirmed raw payment must prepare");
  assert(
    JSON.stringify(await response.json()) === '{"revision":1,"state":"allocated"}',
    "Exact receipt",
  );
  assert(writes === 1, "Exactly one durable preparation");
  assert(
    urls.join(",") ===
      "https://horizon-testnet.stellar.org/operations/123,https://horizon-testnet.stellar.org/transactions/" +
        "a".repeat(64),
    "Only fixed Testnet routes may be fetched",
  );
});

Deno.test("signed HTTP authentication rejects stale, tampered and unknown fields without effects", async () => {
  let effects = 0;
  const handler = createCustodyHandler({
    poolSigner: pool,
    now: () => now,
    ledger: {
      payment: () => {
        effects++;
        throw new Error("unexpected ledger read");
      },
    },
    database: {
      prepare: () => {
        effects++;
        throw new Error("unexpected write");
      },
    },
  });
  const tamperedBody = await signed().json();
  tamperedBody.payload.amount = "2.0000000";
  const cases: [Request, number, string][] = [
    [signed({ timestamp: now - 61 }), 401, "stale_request"],
    [signed({ timestamp: now + 61 }), 401, "stale_request"],
    [signed({ extra: true }), 400, "invalid_request"],
    [signed({ network: "PUBLIC" }), 400, "invalid_request"],
    [signed({ pool: donor.publicKey() }), 400, "invalid_request"],
    [signed({ action: "sweep" }), 400, "invalid_request"],
    [signed({ payload: { ...payload, destination: donor.publicKey() } }), 400, "invalid_request"],
    [
      new Request("http://127.0.0.1/functions/v1/d1-custody/prepare", {
        method: "POST",
        body: JSON.stringify(tamperedBody),
      }),
      401,
      "invalid_signature",
    ],
  ];
  for (const [request, status, error] of cases) {
    const response = await handler(request);
    assert(response.status === status, "Authentication rejection status");
    assert(
      JSON.stringify(await response.json()) === JSON.stringify({ error }),
      "Exact authentication error",
    );
  }
  assert(effects === 0, "Authentication rejects without reads or writes");
});

Deno.test("signed HTTP never retries a serialization failure or claims uncertain success", async () => {
  let calls = 0;
  const handler = createCustodyHandler({
    poolSigner: pool,
    now: () => now,
    ledger: {
      payment: async () => ({
        transaction_hash: "a".repeat(64),
        operation_id: "123",
        donor: donor.publicKey(),
        pool: pool.publicKey(),
        asset: { type: "native" },
        amount: "2.0000000",
        confirmed_at: now - 10,
        ledger: 900,
        memo_hash: hash(Buffer.from("vaca.d1.donation.v1\nincident-full-identity-1")).toString(
          "hex",
        ),
      }),
    },
    database: new CustodyDatabase({
      rpc: async () => {
        calls++;
        return { data: null, error: { code: "40001", message: "must not disclose diagnostics" } };
      },
    }),
  });
  const response = await handler(signed());
  assert(response.status === 503, "Serialization failure must not be successful");
  assert(
    JSON.stringify(await response.json()) === '{"error":"serialization_failure"}',
    "Only safe error is exposed",
  );
  assert(calls === 1, "SQL serialization failures must not silently retry");
});

Deno.test("unknown ledger outcomes and unsupported payments never reach accounting", async () => {
  const memo = hash(Buffer.from("vaca.d1.donation.v1\nincident-full-identity-1")).toString(
    "base64",
  );
  const operation = {
    id: "123",
    type: "payment",
    transaction_hash: "a".repeat(64),
    transaction_successful: true,
    from: donor.publicKey(),
    source_account: donor.publicKey(),
    to: pool.publicKey(),
    asset_type: "native",
    amount: "2.0000000",
  };
  const transaction = {
    hash: "a".repeat(64),
    successful: true,
    operation_count: 1,
    ledger: 900,
    created_at: "2026-10-27T11:59:50Z",
    memo_type: "hash",
    memo,
  };
  const cases = [
    { op: operation, tx: transaction, http: 404, status: 503, error: "ledger_unavailable" },
    {
      op: { ...operation, transaction_successful: false },
      tx: transaction,
      http: 200,
      status: 422,
      error: "unsupported_payment",
    },
    {
      op: operation,
      tx: { ...transaction, successful: false },
      http: 200,
      status: 422,
      error: "unsupported_payment",
    },
    {
      op: operation,
      tx: { ...transaction, operation_count: 2 },
      http: 200,
      status: 422,
      error: "unsupported_payment",
    },
    {
      op: { ...operation, type: "path_payment_strict_receive" },
      tx: transaction,
      http: 200,
      status: 422,
      error: "unsupported_payment",
    },
    {
      op: { ...operation, to: donor.publicKey() },
      tx: transaction,
      http: 200,
      status: 422,
      error: "payment_mismatch",
    },
    {
      op: operation,
      tx: { ...transaction, memo: Buffer.alloc(32).toString("base64") },
      http: 200,
      status: 422,
      error: "payment_mismatch",
    },
    {
      op: operation,
      tx: { ...transaction, memo_type: "text", memo: "vq:incident" },
      http: 200,
      status: 422,
      error: "unsupported_payment",
    },
  ];
  let writes = 0;
  for (const example of cases) {
    const handler = createCustodyHandler({
      poolSigner: pool,
      now: () => now,
      ledger: new TestnetPayments(async (input) =>
        Response.json(
          String(input).includes("/operations/") ? example.op : example.tx,
          { status: example.http },
        )
      ),
      database: {
        prepare: async () => {
          writes++;
          return {};
        },
      },
    });
    const response = await handler(signed());
    assert(response.status === example.status, "Payment rejection status");
    assert(
      JSON.stringify(await response.json()) === JSON.stringify({ error: example.error }),
      "Exact ledger rejection",
    );
  }
  assert(writes === 0, "No unsupported or unknown payment can mutate accounting");
});

Deno.test("issued assets and the inclusive signature freshness boundary preserve preparation", async () => {
  for (const offset of [-60, 60]) {
    const handler = createCustodyHandler({
      poolSigner: pool,
      now: () => now,
      ledger: new TestnetPayments(async (input) =>
        Response.json(
          String(input).includes("/operations/")
            ? {
              id: "123",
              type: "payment",
              transaction_hash: "a".repeat(64),
              transaction_successful: true,
              from: donor.publicKey(),
              source_account: donor.publicKey(),
              to: pool.publicKey(),
              asset_type: "credit_alphanum4",
              asset_code: "USD",
              asset_issuer: donor.publicKey(),
              amount: "2.0000000",
            }
            : {
              hash: "a".repeat(64),
              successful: true,
              operation_count: 1,
              ledger: 900,
              created_at: "2026-10-27T11:59:50Z",
              memo_type: "hash",
              memo: hash(Buffer.from("vaca.d1.donation.v1\nincident-full-identity-1")).toString(
                "base64",
              ),
            },
        )
      ),
      database: {
        prepare: async (input) => {
          assert(
            JSON.stringify(input.payment.asset) ===
              JSON.stringify({ type: "issued", code: "USD", issuer: donor.publicKey() }),
            "Issued asset shape must match retained validator",
          );
          return { revision: 1, state: "allocated" };
        },
      },
    });
    const response = await handler(signed({ timestamp: now + offset }));
    assert(response.status === 200, "Exactly sixty seconds skew remains eligible");
    assert(
      JSON.stringify(await response.json()) === '{"revision":1,"state":"allocated"}',
      "Exact receipt",
    );
  }
});

Deno.test("membership and replay SQL failures expose exact HTTP errors without a second call", async () => {
  for (
    const [message, status, code] of [
      ["unauthorized_admin_wallet", 403, "unauthorized_admin_wallet"],
      ["idempotency_conflict", 409, "idempotency_conflict"],
      ["donation_binding_conflict", 409, "donation_binding_conflict"],
      ["donation_payment_conflict", 409, "donation_payment_conflict"],
      ["historical_request", 409, "historical_request"],
      ["historical_payment", 409, "historical_payment"],
      ["deadline_expired", 410, "deadline_expired"],
      ...[
        "payment_binding_mismatch", "payment_before_activation", "pool_not_activated",
        "donation_capacity_exceeded", "donation_request_mismatch", "beneficiary_mismatch",
        "incident_not_promoted", "invalid_preparation", "invalid_release_request",
        "invalid_donation_payment",
      ].map((message) => [message, 422, message] as const),
      ["constructor", 503, "dependency_unavailable"],
    ] as const
  ) {
    let writes = 0;
    const handler = createCustodyHandler({
      poolSigner: pool,
      now: () => now,
      ledger: {
        payment: async () => ({
          transaction_hash: "a".repeat(64),
          operation_id: "123",
          donor: donor.publicKey(),
          pool: pool.publicKey(),
          asset: { type: "native" },
          amount: "2.0000000",
          confirmed_at: now - 10,
          ledger: 900,
          memo_hash: hash(Buffer.from("vaca.d1.donation.v1\nincident-full-identity-1")).toString(
            "hex",
          ),
        }),
      },
      database: new CustodyDatabase({
        rpc: async () => {
          writes++;
          return { data: null, error: { code: "23505", message } };
        },
      }),
    });
    const response = await handler(signed());
    assert(response.status === status, "Exact SQL rejection status");
    assert(
      JSON.stringify(await response.json()) === JSON.stringify({ error: code }),
      "Exact safe SQL error",
    );
    assert(writes === 1, "SQL failure must never retry");
  }
});

for (const [label, message] of [
  ["array resembling a known code", ["deadline_expired"]],
  ["noncoercible JSON object", { toString: null }],
  ["ordinary JSON object", {}],
  ["null", null],
  ["missing message", undefined],
] as const) {
  Deno.test(`prepare sanitizes ${label} at adapter and HTTP boundaries without retry`, async () => {
    const payment = {
      transaction_hash: payload.transaction_hash, operation_id: payload.operation_id,
      donor: donor.publicKey(), pool: pool.publicKey(), asset: { type: "native" } as const,
      amount: "2.0000000", confirmed_at: now - 10, ledger: 900,
      memo_hash: hash(Buffer.from("vaca.d1.donation.v1\n" + payload.incident_id)).toString("hex"),
    };
    const { confirmed_at, ledger, memo_hash, ...verified } = payment;
    const input: Preparation = {
      request_id: "00000000-0000-4000-8000-000000000001", authorized_by: admin.publicKey(),
      payment: verified, confirmed_at, ledger, memo_hash,
      request: {
        version: 1, incident_id: payload.incident_id, donor: donor.publicKey(),
        beneficiary: beneficiary.publicKey(), asset: verified.asset, amount: payload.amount,
        deadline: "2026-10-27T12:04:50Z",
      },
    };
    const unchanged = JSON.stringify(input);
    let calls = 0;
    const database = new CustodyDatabase({
      rpc: async (name, args) => {
        calls++;
        assert(name === "d1_prepare", "No alternate or compensating RPC");
        assert(JSON.stringify(args) === JSON.stringify({ p_input: input }), "Exact RPC input");
        // Deliberately model a malformed runtime RPC response outside its declared type.
        return { data: null, error: { code: "XX000", message: message as unknown as string } };
      },
    });
    let failure: unknown;
    try { await database.prepare(input); } catch (error) { failure = error; }
    assert(failure instanceof CustodyError, "Malformed dependency errors must not escape raw");
    assert(failure.code === "dependency_unavailable", "Error code must be an exact safe string");
    assert(failure.message === "dependency_unavailable" && failure.status === 503, "Exact safe error");
    assert(calls === 1 && JSON.stringify(input) === unchanged, "One call, input unchanged");
    const response = await createCustodyHandler({
      poolSigner: pool, now: () => now, ledger: { payment: async () => payment }, database,
    })(signed());
    assert(response.status === 503, "Exact HTTP rejection status");
    assert(await response.text() === '{"error":"dependency_unavailable"}', "No raw diagnostics or arrays");
    assert(Number(calls) === 2 && JSON.stringify(input) === unchanged, "One RPC per explicit invocation");
  });
}
