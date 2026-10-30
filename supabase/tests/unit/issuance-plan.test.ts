import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import type { Preparation } from "../../functions/d1-custody/handler.ts";
import { type IssuanceContext, planIssuance } from "../../functions/d1-custody/issuance-plan.ts";

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Public-only synthetic identities; no secrets, environment or ledger clients.
const [pool, donor, beneficiary, issuer] = [1, 2, 3, 4].map((byte) =>
  Keypair.fromRawEd25519Seed(Buffer.alloc(32, byte)).publicKey()
);
const confirmed = 1793102400;
const deadline = confirmed + 300;
function fixture(): { prepared: Preparation; context: IssuanceContext } {
  return {
    prepared: {
      request_id: "00000000-0000-4000-8000-000000000001",
      authorized_by: donor,
      payment: {
        transaction_hash: "a".repeat(64), operation_id: "123", donor, pool,
        asset: { type: "native" }, amount: "2.0000000",
      },
      request: {
        version: 1, incident_id: "incident-1", donor, beneficiary,
        asset: { type: "native" }, amount: "1.0000001",
        deadline: "2026-10-27T12:05:00Z",
      },
      confirmed_at: confirmed, ledger: 900, memo_hash: "b".repeat(64),
    },
    context: {
      networkPassphrase: Networks.TESTNET, pool, sequence: "9007199254740993",
      fee: "100", now: confirmed + 10,
    },
  };
}

function decode(prepared: Preparation, context: IssuanceContext) {
  const before = JSON.stringify({ prepared, context });
  const result = planIssuance(prepared, context);
  equal(JSON.stringify({ prepared, context }), before);
  equal(Object.keys(result), ["unsignedXdr"]);
  const tx = TransactionBuilder.fromXDR(result.unsignedXdr, Networks.TESTNET);
  if (!(tx instanceof Transaction)) throw new Error("Expected ordinary transaction");
  equal(tx.signatures.length, 0);
  equal(tx.source, pool);
  equal(tx.sequence, "9007199254740994");
  equal(tx.fee, "100");
  equal(tx.timeBounds, { minTime: String(context.now), maxTime: String(deadline - 1) });
  equal(tx.operations.length, 1);
  const op = tx.operations[0];
  if (op.type !== "createClaimableBalance") throw new Error("Expected claimable balance");
  equal(op.source, undefined);
  equal(op.amount, prepared.request.amount);
  equal(op.claimants.map((c) => c.destination), [beneficiary, pool]);
  const beneficiaryPredicate = op.claimants[0].predicate;
  equal(beneficiaryPredicate.switch().name, "claimPredicateBeforeAbsoluteTime");
  equal(beneficiaryPredicate.absBefore().toString(), String(deadline));
  const recovery = op.claimants[1].predicate;
  equal(recovery.switch().name, "claimPredicateNot");
  const notBefore = recovery.notPredicate();
  if (!notBefore) throw new Error("Expected complementary recovery predicate");
  equal(notBefore.switch().name, "claimPredicateBeforeAbsoluteTime");
  equal(notBefore.absBefore().toString(), String(deadline));
  return { tx, op, result };
}

Deno.test("planner preserves native allocation and immutable complementary expiry in unsigned XDR", () => {
  const { prepared, context } = fixture();
  const { op, result } = decode(prepared, context);
  equal(op.asset.isNative(), true);
  equal(planIssuance(prepared, context), result);
});

Deno.test("planner preserves verified issued asset identity and seven-decimal precision", () => {
  for (const code of ["USD", "ABCDEFGHIJKL"]) {
    const { prepared, context } = fixture();
    prepared.payment.asset = prepared.request.asset = { type: "issued", code, issuer };
    const { op } = decode(prepared, context);
    equal(op.asset.getCode(), code);
    equal(op.asset.getIssuer(), issuer);
  }
});

function rejects(prepared: Preparation, context: IssuanceContext, message = "invalid_issuance_plan") {
  const before = JSON.stringify({ prepared, context });
  let observed = "no error";
  try {
    planIssuance(prepared, context);
  } catch (error) {
    observed = (error as Error).message;
  }
  equal(observed, message);
  equal(JSON.stringify({ prepared, context }), before);
}

Deno.test("planner cutoff is payment-based: before accepted, at and after rejected without mutation", () => {
  const { prepared, context } = fixture();
  decode(prepared, { ...context, now: deadline - 1 });
  for (const now of [deadline, deadline + 1]) {
    rejects(prepared, { ...context, now }, "issuance_window_exhausted");
  }
  prepared.request.deadline = "2026-10-27T12:05:01Z";
  rejects(prepared, context);
});

Deno.test("planner rejects unsupported network, sequence, fee, address and clock shapes unchanged", () => {
  const { prepared, context } = fixture();
  for (const patch of [
    { networkPassphrase: Networks.PUBLIC }, { networkPassphrase: "TESTNET" },
    { pool: donor }, { pool: "invalid" },
    ...["-1", "01", "1.0", "9223372036854775807", "9223372036854775808", 1]
      .map((sequence) => ({ sequence })),
    ...["0", "99", "4294967296", "1.5", 100].map((fee) => ({ fee })),
    ...[confirmed - 1, confirmed + 0.5, NaN, Infinity].map((now) => ({ now })),
  ]) {
    rejects(prepared, { ...context, ...patch } as IssuanceContext);
  }
  for (const field of ["beneficiary", "donor"] as const) {
    const copy = structuredClone(prepared);
    copy.request[field] = "invalid";
    rejects(copy, context);
  }
  prepared.request.beneficiary = pool;
  rejects(prepared, context);
});

Deno.test("planner rejects invalid monetary and asset bindings without rounding or mutation", () => {
  const { prepared, context } = fixture();
  for (const amount of ["0.0000000", "-1.0000000", "1", "1.00000001", "01.0000000", "1e0", 1]) {
    const copy = structuredClone(prepared);
    copy.request.amount = amount as string;
    rejects(copy, context);
  }
  for (const amount of ["3.0000000", "922337203685.4775808"]) {
    const copy = structuredClone(prepared);
    copy.request.amount = amount;
    rejects(copy, context);
  }
  for (const asset of [
    { type: "issued", code: "USD", issuer }, { type: "unknown" },
    { type: "issued", code: "TOO-LONG-CODE!", issuer },
    { type: "issued", code: "USD", issuer: "invalid" },
  ]) {
    const copy = structuredClone(prepared);
    copy.request.asset = asset as Preparation["request"]["asset"];
    rejects(copy, context);
  }
});

Deno.test("planner rejects malformed prepared deadline and confirmation instead of resetting TTL", () => {
  for (const deadlineText of ["invalid", "2026-10-27T12:05:00.000Z", "2026-10-27T12:10:00Z"]) {
    const { prepared, context } = fixture();
    prepared.request.deadline = deadlineText;
    rejects(prepared, context);
  }
  for (const confirmation of [-1, confirmed + 0.5, NaN, Infinity]) {
    const { prepared, context } = fixture();
    prepared.confirmed_at = confirmation;
    rejects(prepared, context);
  }
});
