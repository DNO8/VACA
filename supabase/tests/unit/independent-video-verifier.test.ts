import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { Keypair, hash } from "@stellar/stellar-sdk";
import { createIndependentCustodyRouter } from "../../functions/d1-custody/deployment-routing.ts";
import {
  createVideoAutoRuntime,
  DEPLOYED_SCOPE as A,
  VIDEO_AUTO_SCOPE as B,
} from "../../functions/d1-custody/deployment-runtime.ts";

const root = "https://offline.invalid/functions/v1/d1-custody";
const key = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 29));
const now = 1794711600;
const id = "01234567-89ab-cdef-0123-456789abcdef";

function settings(): Record<string, string> {
  return {
    SUPABASE_URL: A.url,
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
    D1_POOL_PUBLIC_KEY: A.pool,
    D1_NAMESPACE: A.namespace,
    D1_FIRST_LEDGER: String(A.firstLedger),
    D1_VIDEO_AUTO_ENABLED: "true",
    D1_VIDEO_AUTO_POOL_PUBLIC_KEY: B.pool,
    D1_VIDEO_AUTO_NAMESPACE: B.namespace,
    D1_VIDEO_AUTO_FIRST_LEDGER: String(B.firstLedger),
    D1_VIDEO_AUTO_OPERATING_FUNDER: A.funder,
    D1_VIDEO_AUTO_OPERATING_OPERATION_ID:
      String(((BigInt(B.firstLedger) + 1n) << 32n) + 4097n),
  };
}

async function error(r: Response, status: number, code: string) {
  assert.equal(r.status, status);
  assert.deepEqual(await r.json(), { error: code });
  assert.equal(r.headers.get("cache-control"), "no-store");
}

function signed(
  action: string,
  pool: string = B.pool,
  namespace: string = B.namespace,
  stale = false,
) {
  const m: Record<string, unknown> = {
    version: 1,
    network: "TESTNET",
    pool,
    action,
    request_id: id,
    timestamp: now - (stale ? 61 : 0),
    wallet: key.publicKey(),
    payload: action === "prepare"
      ? {
        incident_id: "routing-probe",
        transaction_hash: "a".repeat(64),
        operation_id: "25013979726221313",
        beneficiary: A.funder,
        amount: "1.0000000",
      }
      : {},
  };
  if (action !== "prepare") m.namespace = namespace;

  const canonical = (v: unknown): string =>
    v !== null && typeof v === "object"
      ? "{" +
        Object.keys(v).sort().map((k) =>
          JSON.stringify(k) + ":" +
          canonical((v as Record<string, unknown>)[k])
        ).join(",") + "}"
      : JSON.stringify(v);

  return JSON.stringify({
    ...m,
    signature: key.sign(
      hash(Buffer.from("Stellar Signed Message:\n" + canonical(m))),
    ).toString("base64"),
  });
}

Deno.test(
  "verifier S1/S3: inert translation preserves binary proofs and exact routes",
  async () => {
    let a = 0;
    let b = 0;
    const routes = [
      "config",
      "prepare",
      "issue",
      "reconcile",
      "status",
      "donor-payment-status",
      "refund",
      "refund-status",
      "refund-reconcile",
      "refund-remainder",
      "refund-remainder-status",
      "refund-remainder-reconcile",
      "internal-refund-tick",
    ];
    const bytes = new Uint8Array([0, 255, 13, 10, 195, 169]);
    const h = createIndependentCustodyRouter(
      () => async () => {
        a++;
        return new Response("A");
      },
      () => async (r) => {
        b++;
        assert.equal(r.method, "PATCH");
        assert.equal(r.headers.get("authorization"), "Bearer inert");
        assert.deepEqual(
          new Uint8Array(await r.arrayBuffer()),
          bytes,
        );
        return new Response(r.url);
      },
    );

    for (const route of routes) {
      const u = root + "/video-auto/" + route +
        "?x=%2f&x=+&pool=" + A.pool + "#";
      const response = await h(new Request(u, {
        method: "PATCH",
        body: bytes,
        headers: { authorization: "Bearer inert" },
      }));
      assert.equal(
        await response.text(),
        u.replace("/video-auto/", "/"),
      );
    }

    for (
      const path of [
        "/video-auto",
        "/video-auto/",
        "/video-auto/config/",
        "/video-auto//config",
        "/video-auto/%63onfig",
        "/%76ideo-auto/config",
        "/video%2dauto/nested/d1-custody/config",
        "/video-auto/config%00",
        "/video-auto/nested/d1-custody/config",
      ]
    ) {
      await error(
        await h(new Request(root + path)),
        404,
        "not_found",
      );
    }
    assert.equal(a, 0);
    assert.equal(b, 13);
  },
);

Deno.test(
  "verifier S1/S2/S3: B proof scope, preparation and preflight fail closed",
  async () => {
    const reads: string[] = [];
    const writes: unknown[] = [];
    const calls: string[] = [];
    const values = settings();
    const before = () =>
      hash(Buffer.from(JSON.stringify(writes))).toString("hex");

    const runtime = createVideoAutoRuntime({
      getEnv: (n) => {
        reads.push(n);
        return values[n];
      },
      now: () => now,
      clientFactory: () => ({
        async rpc(name, args) {
          calls.push(name);
          if (name === "d1_prepare") {
            writes.push(args);
            return {
              data: { synthetic: "prepared" },
              error: null,
            };
          }
          assert.equal(name, "d1_load_issuance_outcome");
          assert.equal(args.p_authorized_by, key.publicKey());
          return {
            data: {
              kind: "d1_issuance_outcome_lookup",
              revision: 1,
              network: "TESTNET",
              pool: A.pool,
              namespace: A.namespace,
              request_id: id,
              outcome: null,
            },
            error: null,
          };
        },
      }),
      fetcher: async (input) => {
        const u = new URL(String(input));
        assert.equal(
          u.origin,
          "https://horizon-testnet.stellar.org",
        );
        if (u.pathname.startsWith("/operations/")) {
          return Response.json({
            id: "25013979726221313",
            transaction_hash: "a".repeat(64),
            type: "payment",
            transaction_successful: true,
            from: key.publicKey(),
            source_account: key.publicKey(),
            to: B.pool,
            amount: "1.0000000",
            asset_type: "native",
          });
        }
        assert.equal(
          u.pathname,
          "/transactions/" + "a".repeat(64),
        );
        return Response.json({
          hash: "a".repeat(64),
          successful: true,
          operation_count: 1,
          ledger: 5824021,
          created_at: new Date((now - 10) * 1000)
            .toISOString().replace(".000Z", "Z"),
          memo_type: "hash",
          memo: hash(
            Buffer.from("vaca.d1.donation.v1\nrouting-probe"),
          ).toString("base64"),
        });
      },
    });

    const h = createIndependentCustodyRouter(
      () => async () => {
        throw Error("A forbidden");
      },
      () => runtime,
    );
    const post = (action: string, body: string) =>
      h(new Request(root + "/video-auto/" + action, {
        method: "POST",
        body,
      }));

    const snapshot = before();
    await error(
      await post("issue", signed("issue", A.pool, A.namespace)),
      400,
      "invalid_request",
    );
    await error(
      await post("issue", signed("issue", B.pool, A.namespace)),
      400,
      "invalid_request",
    );
    await error(
      await post(
        "issue",
        signed("issue", B.pool, B.namespace, true),
      ),
      401,
      "stale_request",
    );
    const tampered = JSON.parse(signed("issue"));
    tampered.wallet = A.funder;
    await error(
      await post("issue", JSON.stringify(tampered)),
      401,
      "invalid_signature",
    );
    assert.equal(calls.length, 0);
    assert.equal(before(), snapshot);

    await error(
      await post("issue", signed("issue")),
      503,
      "initial_submission_unavailable",
    );
    assert.deepEqual(calls, ["d1_load_issuance_outcome"]);
    assert.equal(before(), snapshot);

    const r = await post("prepare", signed("prepare"));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { synthetic: "prepared" });

    const prepared = (
      writes[0] as {
        p_input: {
          payment: { pool: string };
          request: { deadline: string };
        };
      }
    ).p_input;
    assert.equal(prepared.payment.pool, B.pool);
    assert.equal(
      prepared.request.deadline,
      new Date((now + 290) * 1000)
        .toISOString().replace(".000Z", "Z"),
    );
    assert(
      !reads.some((n) =>
        n.startsWith("D1_") && !n.startsWith("D1_VIDEO_AUTO_")
      ),
    );
    assert(
      !reads.some((n) =>
        n.endsWith("SECRET_SEED") || n.endsWith("SECRET_KEY")
      ),
    );
  },
);

Deno.test(
  "verifier S2/S3/S4/S5: deployment startup and automatic signing settings isolated",
  async () => {
    const oldGet = Deno.env.get;
    const oldServe = Deno.serve;
    const oldFetch = globalThis.fetch;
    const values = settings();
    const reads: string[] = [];
    delete values.D1_NAMESPACE;
    Object.assign(values, {
      D1_VIDEO_AUTO_AUTOMATIC_REFUNDS_ENABLED: "true",
      D1_VIDEO_AUTO_REFUND_SERVICE_ACTOR: A.funder,
      D1_VIDEO_AUTO_REFUND_TICK_TOKEN:
        Buffer.alloc(32, 7).toString("base64url"),
      D1_VIDEO_AUTO_REFUND_FEE_PER_OPERATION_STROOPS: "100",
      D1_VIDEO_AUTO_REFUND_TRANSACTION_LIFETIME_SECONDS: "60",
      D1_POOL_SECRET_SEED: "synthetic-forbidden",
      D1_REFUND_POOL_SECRET_KEY: "synthetic-forbidden",
    });

    let h!: (r: Request) => Promise<Response>;
    try {
      Deno.env.get = (n) => {
        reads.push(n);
        return values[n];
      };
      Deno.serve = ((handler: typeof h) => {
        h = handler;
        return {};
      }) as typeof Deno.serve;
      globalThis.fetch = () => {
        throw Error("transport forbidden");
      };

      await import(
        "../../functions/d1-custody/deployment-index.ts?verifier=isolated"
      );
      assert.equal(typeof h, "function");
      await error(
        await h(new Request(root + "/config")),
        503,
        "custody_unavailable",
      );

      const r = await h(
        new Request(root + "/video-auto/config?pool=" + A.pool),
      );
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), {
        network: "TESTNET",
        pool_public_key: B.pool,
        donation_ttl_seconds: 300,
      });
      await error(
        await h(new Request(
          root + "/video-auto/internal-refund-tick",
          { method: "POST", body: "{}" },
        )),
        503,
        "refund_tick_unavailable",
      );
      assert(
        reads.includes("D1_VIDEO_AUTO_REFUND_POOL_SECRET_KEY"),
      );
      assert(!reads.includes("D1_REFUND_POOL_SECRET_KEY"));
      assert(
        !reads.some((n) => n.endsWith("POOL_SECRET_SEED")),
      );
    } finally {
      Deno.env.get = oldGet;
      Deno.serve = oldServe;
      globalThis.fetch = oldFetch;
    }
  },
);
