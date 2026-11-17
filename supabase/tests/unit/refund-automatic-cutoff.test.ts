import { createRefundAutomaticPage, type RefundAutomaticPageDependencies } from "../../functions/d1-custody/refund-automatic-page.ts";
import { createRefundAutomaticHttp } from "../../functions/d1-custody/refund-automatic-http.ts";
import { automaticFixture, equal, closedAt, cutoff, requestId, namespace, pool, admin, token, responseIs } from "../fixtures/automatic-refund.ts";

type Fixture = Awaited<ReturnType<typeof automaticFixture>>;
// Structural caller type lets the pre-implementation runner exercise runtime
// factory behavior, rather than stopping at an unknown-property compile error.
type WithPolicy = RefundAutomaticPageDependencies & { originalConfirmationPolicy: unknown };
const configured = (f: Fixture, policy: unknown = { confirmedAtOrAfter: closedAt }) =>
  ({ ...f.pageDependencies, originalConfirmationPolicy: policy }) as WithPolicy;
async function executable(remainder: boolean) {
  const f = await automaticFixture(false, remainder, !remainder);
  f.control.executeRefund = !remainder; f.control.saveRemainderCandidate = remainder; f.control.executeRemainder = remainder;
  return f;
}
async function heldWithoutEffects(f: Fixture, dependencies: RefundAutomaticPageDependencies,
  expectedCalls = ["d1_list_due_refund_originals", "d1_load_refund_lane_fence", "d1_load_unsigned_transaction"]) {
  const before = await f.stored(), counts = { ...f.counters }; f.calls.length = 0;
  equal(await createRefundAutomaticPage(dependencies)(null, 2),
    { processed: 1, held: 1, nextAfterRequestId: f.control.next });
  equal(f.calls, expectedCalls); equal(f.counters, counts); equal(await f.stored(), before);
}
for (const remainder of [false, true]) {
  const lane = remainder ? "v2" : "v1";
  Deno.test(`automatic cutoff ${lane}: just before holds; equality and after genuinely sign and submit`, async () => {
    // Keep genuine original/XDR/history timestamps intact; move only host policy.
    const held = await executable(remainder); held.control.next = requestId;
    await heldWithoutEffects(held, configured(held, { confirmedAtOrAfter: closedAt + 1 }));
    for (const lowerBound of [closedAt, closedAt - 1]) {
      const f = await executable(remainder);
      equal(await createRefundAutomaticPage(configured(f, { confirmedAtOrAfter: lowerBound }))(null, 2),
        { processed: 1, held: 1, nextAfterRequestId: null });
      equal([f.counters.signer, f.counters.transport], [1, remainder ? 9 : 1]);
      equal(f.calls.includes(remainder ? "d1_claim_remainder_submission_attempt" : "d1_claim_refund_submission_attempt"), true);
    }
  });
  Deno.test(`automatic cutoff ${lane}: candidate, submitted, expired, settled and partial recovery remain untouched`, async () => {
    for (const stage of ["candidate", "submitted", "expired", "settled", "partial-discovery", "partial-history"]) {
      const f = await executable(remainder);
      const client = { async rpc(name: string, args: Record<string, unknown>) {
        const reply = await f.client.rpc(name, args);
        // Lost candidate ACK leaves a genuine saved candidate, without signing.
        if (stage === "candidate" && name === (remainder ? "d1_record_remainder_candidate" : "d1_record_refund_candidate"))
          throw Error("test lost candidate acknowledgement");
        return reply;
      } };
      const legacy = createRefundAutomaticPage({ ...f.pageDependencies, client });
      equal(await legacy(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
      equal(f.counters.signer, stage === "candidate" ? 0 : 1);
      if (stage === "settled") {
        await f.ingestPosted();
        equal(await legacy(null, 2), { processed: 1, held: 0, nextAfterRequestId: null });
      }
      if (stage.startsWith("partial")) {
        f.control.includePosted = true; f.control.now = cutoff + 61;
        equal(await legacy(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
        if (stage === "partial-history") equal(await legacy(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
      }
      if (stage === "expired") f.control.now = cutoff + 61;
      await heldWithoutEffects(f, configured(f, { confirmedAtOrAfter: closedAt + 1 }));
    }
  });
  Deno.test(`automatic cutoff ${lane}: missing, malformed and inconsistent originals fail closed for new and existing work`, async () => {
    for (const existing of [false, true]) for (const fault of ["missing", "denied", "timestamp", "fraction", "scope", "intent", "reservation", "deadline"]) {
      const f = await executable(remainder);
      if (existing) await createRefundAutomaticPage(f.pageDependencies)(null, 2);
      const client = { async rpc(name: string, args: Record<string, unknown>) {
        const reply = await f.client.rpc(name, args);
        if (name === "d1_load_unsigned_transaction") {
          if (fault === "denied") return { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
          const data = reply.data as Record<string, any>, saved = data.transaction;
          if (fault === "missing") data.transaction = null;
          if (fault === "timestamp") saved.reservation.intent.preparation_input.confirmed_at = "not-a-time";
          if (fault === "fraction") saved.reservation.intent.preparation_input.confirmed_at = closedAt + 0.5;
          if (fault === "scope") saved.namespace = requestId;
          if (fault === "intent") saved.reservation.intent.request_id = namespace;
          if (["timestamp", "fraction", "intent"].includes(fault)) data.reservation = structuredClone(saved.reservation);
          if (fault === "reservation") data.reservation = null;
          if (fault === "deadline") saved.deadline = "2026-10-27T12:06:00Z";
        }
        return reply;
      } };
      await heldWithoutEffects(f, { ...configured(f), client });
    }
  });
  Deno.test(`automatic cutoff ${lane}: original +300 deadline still governs, not the policy or new lifetime`, async () => {
    const f = await executable(remainder); f.control.now = cutoff - 1;
    await heldWithoutEffects(f, configured(f));
  });
}
Deno.test("automatic cutoff: foreign fence rejection stays before original lookup", async () => {
  const f = await executable(false);
  f.model.d1_load_refund_lane_fence.fence = { kind: "d1_refund_lane_fence", revision: 1,
    namespace, request_id: namespace, network: "TESTNET", pool, authorized_by: admin, lane: "full_gross_v1", candidate_hash: "a".repeat(64) };
  await heldWithoutEffects(f, configured(f), ["d1_list_due_refund_originals", "d1_load_refund_lane_fence"]);
});
Deno.test("automatic cutoff: held original does not stop enumeration or lose continuation", async () => {
  const f = await executable(false), other = "33333333-3333-4333-8333-333333333333", reads: string[] = [];
  f.control.due = [requestId, other]; f.control.next = other;
  const client = { async rpc(name: string, args: Record<string, unknown>) {
    if (name === "d1_load_refund_lane_fence") {
      reads.push(args.p_request_id as string);
      if (args.p_request_id === other) return { data: null, error: { code: "42501" } };
    }
    return await f.client.rpc(name, args);
  } };
  const before = await f.stored(), counts = { ...f.counters }; f.calls.length = 0;
  const run = createRefundAutomaticPage({ ...configured(f, { confirmedAtOrAfter: closedAt + 1 }), client });
  equal(await run(null, 2), { processed: 2, held: 2, nextAfterRequestId: other });
  equal(reads, [requestId, other]); equal(f.counters, counts); equal(await f.stored(), before);
  f.control.after = other; f.control.due = []; f.control.next = null; f.calls.length = 0;
  equal(await run(other, 2), { processed: 0, held: 0, nextAfterRequestId: null });
  equal(f.calls, ["d1_list_due_refund_originals"]); equal(f.counters, counts); equal(await f.stored(), before);
});
Deno.test("automatic cutoff: present invalid policy fails at inert factory without getters or effects", async () => {
  const f = await executable(false); let getters = 0;
  const accessor = { get confirmedAtOrAfter() { getters++; return closedAt; } };
  const invalid = [undefined, null, 0, [], {}, { confirmedAtOrAfter: "2026-11-15T03:00:00Z" },
    ...[-1, 0.5, NaN, Infinity, 253402300500].map(confirmedAtOrAfter => ({ confirmedAtOrAfter })),
    { confirmedAtOrAfter: closedAt, extra: true }, Object.create({ confirmedAtOrAfter: closedAt }), accessor,
    { confirmedAtOrAfter: closedAt, [Symbol("extra")]: true }];
  const before = await f.stored(), counts = { ...f.counters }; f.calls.length = 0;
  for (const policy of invalid) {
    let error: unknown;
    try { createRefundAutomaticPage({ ...f.pageDependencies, originalConfirmationPolicy: policy } as WithPolicy); }
    catch (e) { error = e; }
    equal((error as Error)?.message, "refund_tick_unavailable");
  }
  equal(getters, 0); equal(f.calls, []); equal(f.counters, counts); equal(await f.stored(), before);
});
Deno.test("automatic cutoff: policy captured by value and HTTP body cannot override it", async () => {
  const f = await executable(false), policy = { confirmedAtOrAfter: closedAt + 1 };
  const run = createRefundAutomaticPage(configured(f, policy)); policy.confirmedAtOrAfter = 0;
  const handler = createRefundAutomaticHttp({ token, maxBatchSize: 2, runPage: after => run(after, 2) });
  const before = await f.stored(), counts = { ...f.counters }; f.calls.length = 0;
  const request = (body: unknown) => new Request("https://offline.invalid/functions/v1/d1-custody/internal-refund-tick",
    { method: "POST", headers: { "x-d1-refund-token": token }, body: JSON.stringify(body) });
  await responseIs(await handler(request({ afterRequestId: null, originalConfirmationPolicy: { confirmedAtOrAfter: 0 } })),
    400, { error: "invalid_request" });
  equal(f.calls, []);
  await responseIs(await handler(request({ afterRequestId: null })), 200, { processed: 1, held: 1, nextAfterRequestId: null });
  equal(f.counters, counts); equal(await f.stored(), before);
});
Deno.test("automatic cutoff: omitted policy preserves genuine legacy execution in both lanes", async () => {
  for (const remainder of [false, true]) {
    const f = await executable(remainder);
    equal(await createRefundAutomaticPage(f.pageDependencies)(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
    equal([f.counters.signer, f.counters.transport], [1, remainder ? 9 : 1]);
  }
});
