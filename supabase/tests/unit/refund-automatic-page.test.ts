import { createRefundLaneSelector } from "../../functions/d1-custody/refund-lane-selection.ts";
import { createRefundExecutor } from "../../functions/d1-custody/refund-execution.ts";
import { createRemainderExecutor } from "../../functions/d1-custody/remainder-execution.ts";
import { ensureRemainderCandidate } from "../../functions/d1-custody/remainder-candidate-journal.ts";
import { createRefundAutomaticHttp } from "../../functions/d1-custody/refund-automatic-http.ts";
import { scope, token, responseIs } from "../fixtures/automatic-refund.ts";
import { createRefundAutomaticPage } from "../../functions/d1-custody/refund-automatic-page.ts";
import { automaticFixture, equal, requestId, namespace, pool, admin, cutoff } from "../fixtures/automatic-refund.ts";
Deno.test("automatic page: empty due window preserves scanned cursor and touches no providers", async () => {
  const f = await automaticFixture(); f.control.due = []; f.control.next = requestId; const before = await f.stored(); f.calls.length = 0;
  equal(await createRefundAutomaticPage(f.pageDependencies)(null, 2), { processed: 0, held: 0, nextAfterRequestId: requestId });
  equal(f.calls, ["d1_list_due_refund_originals"]);
  equal(f.counters, { discovery: 0, history: 0, balance: 0, account: 0, signer: 0, transport: 0, writes: 0 }); equal(await f.stored(), before);
});
Deno.test("automatic page: invalid batch bounds reject before enumeration", async () => {
  const f = await automaticFixture(), before = await f.stored(); f.calls.length = 0;
  const run = createRefundAutomaticPage(f.pageDependencies);
  for (const n of [0, 3]) { let error: unknown; try { await run(null, n); } catch (e) { error = e; } equal((error as Error).message, "refund_tick_unavailable"); }
  equal(f.calls, []); equal(f.counters.writes, 0); equal(await f.stored(), before);
});
Deno.test("automatic page: foreign fence holds before any neutral refresh", async () => {
  const f = await automaticFixture(); f.model.d1_load_refund_lane_fence.fence = { kind: "d1_refund_lane_fence", revision: 1,
    namespace, request_id: namespace, network: "TESTNET", pool, authorized_by: admin, lane: "full_gross_v1", candidate_hash: "a".repeat(64) };
  const before = await f.stored(); f.calls.length = 0;
  equal(await createRefundAutomaticPage(f.pageDependencies)(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  equal(f.calls, ["d1_list_due_refund_originals", "d1_load_refund_lane_fence"]);
  equal(f.counters, { discovery: 0, history: 0, balance: 0, account: 0, signer: 0, transport: 0, writes: 0 }); equal(await f.stored(), before);
});
Deno.test("automatic page: immutable saved+300 deadline holds before providers", async () => {
  for (const inconsistent of [false, true]) {
    const f = await automaticFixture(); if (inconsistent) f.model.d1_load_unsigned_transaction.transaction.deadline = "2026-10-27T12:06:00Z";
    else f.control.now = cutoff - 1;
    const before = await f.stored(); f.calls.length = 0;
    equal(await createRefundAutomaticPage(f.pageDependencies)(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
    equal(f.calls, ["d1_list_due_refund_originals", "d1_load_refund_lane_fence", "d1_load_unsigned_transaction"]);
    equal(f.counters.writes, 0); equal(f.counters.discovery, 0); equal(await f.stored(), before);
  }
});
Deno.test("automatic page: real019/024 and032 validation precede selector and real core status", async () => {
  const f = await automaticFixture(); const before = await f.stored(); f.calls.length = 0;
  equal(await createRefundAutomaticPage(f.pageDependencies)(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  equal(f.counters.discovery, 1); equal(f.counters.history, 1); equal(f.counters.balance, 1);
  equal(f.calls.filter(n => n === "d1_record_discovery_page").length, 1);
  equal(f.calls.filter(n => n === "d1_record_transaction_page").length, 1);
  equal(f.calls.includes("d1_load_issuance_outcome"), true);
  // Genuine status advertises refund; its subsequent real candidate construction
  // reaches the external write. This fixture refuses it, never fabricates a permit.
  equal(f.calls.filter(n => n === "d1_record_refund_candidate").length, 1);
  equal(f.calls.at(-1), "d1_record_refund_candidate");
  equal([f.counters.signer, f.counters.transport], [0, 0]); equal(await f.stored(), before);
});
Deno.test("automatic page: positive v2 acquisition reaches real status and exactly one candidate attempt", async () => {
  const f = await automaticFixture(false, true);
  equal(await createRefundAutomaticPage(f.pageDependencies)(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  equal(f.calls.filter(n => n.startsWith("d1_record_") || n.startsWith("d1_claim_")),
    ["d1_record_discovery_page", "d1_record_transaction_page", "d1_record_beneficiary_claim", "d1_record_remainder_candidate"]);
  equal(f.calls.at(-1), "d1_record_remainder_candidate");
  equal([f.counters.discovery, f.counters.history, f.counters.signer, f.counters.transport], [1, 1, 0, 8]);
});
Deno.test("automatic page: existing expired v2 candidate reconciles once without executing, renewal or fallback", async () => {
  const f = await automaticFixture(false, true);
  equal((await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source, { fetcher: f.fetcher })(requestId)).kind, "proposed");
  f.control.saveRemainderCandidate = true;
  await ensureRemainderCandidate(f.client, scope, { funding: { source: f.source, now: f.configuration.now,
    maximumAgeSeconds: 15, futureToleranceSeconds: 0 }, feePerOperationStroops: "100", validUntil: cutoff + 60 });
  f.control.now = cutoff + 61;
  const before = await f.stored(), counts = { ...f.counters }; f.calls.length = 0;
  equal(await createRefundAutomaticPage(f.pageDependencies)(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  equal(f.calls.filter(n => n.startsWith("d1_record_") || n.startsWith("d1_claim_")), ["d1_record_discovery_page", "d1_record_transaction_page"]);
  equal([f.counters.discovery, f.counters.history, f.counters.account, f.counters.signer, f.counters.transport],
    [counts.discovery + 1, counts.history + 1, counts.account, counts.signer, counts.transport]);
  equal(await f.stored(), before);
});
Deno.test("automatic page: real v2 signs and sends once; ACK remains held and next tick never resends", async () => {
  const f = await automaticFixture(false, true); f.control.saveRemainderCandidate = true; f.control.executeRemainder = true;
  const page = createRefundAutomaticPage(f.pageDependencies);
  const handler = createRefundAutomaticHttp({ token, maxBatchSize: 2, runPage: after => page(after, 2) });
  const request = (secret: string) => new Request("https://offline.invalid/functions/v1/d1-custody/internal-refund-tick",
    { method: "POST", headers: { "x-d1-refund-token": secret }, body: '{"afterRequestId":null}' });
  const untouched = await f.stored(); f.calls.length = 0;
  await responseIs(await handler(request("bad")), 401, { error: "unauthorized" });
  equal(f.calls, []); equal(f.counters, { discovery: 0, history: 0, balance: 0, account: 0, signer: 0, transport: 0, writes: 0 });
  equal(await f.stored(), untouched); f.calls.length = 0;
  await responseIs(await handler(request(token)), 200, { processed: 1, held: 1, nextAfterRequestId: null });
  equal(f.calls.filter(n => n.startsWith("d1_record_") || n.startsWith("d1_claim_")), [
    "d1_record_discovery_page", "d1_record_transaction_page", "d1_record_beneficiary_claim", "d1_record_remainder_candidate",
    "d1_record_remainder_financial_observation", "d1_claim_remainder_signing", "d1_record_signed_remainder",
    "d1_record_remainder_financial_observation", "d1_claim_remainder_submission_attempt"]);
  equal([f.counters.signer, f.counters.transport], [1, 9]);
  const before = await f.stored(), counts = { ...f.counters }; f.calls.length = 0;
  await responseIs(await handler(request(token)), 200, { processed: 1, held: 1, nextAfterRequestId: null });
  equal(f.calls.filter(n => n.startsWith("d1_record_") || n.startsWith("d1_claim_")), ["d1_record_discovery_page", "d1_record_transaction_page"]);
  equal([f.counters.signer, f.counters.transport, f.counters.account], [counts.signer, counts.transport, counts.account]); equal(await f.stored(), before);
});
Deno.test("automatic page: ambiguous real v2 POST stops without readback and cannot be resent", async () => {
  const f = await automaticFixture(false, true); f.control.saveRemainderCandidate = true; f.control.executeRemainder = true; f.control.ambiguousSend = true;
  let callsAtSend: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    if (init && "method" in init && init.method === "POST") callsAtSend = [...f.calls];
    return await f.fetcher(input, init);
  };
  const run = createRefundAutomaticPage({ ...f.pageDependencies, fetcher: transport });
  equal(await run(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  equal(f.calls, callsAtSend); equal([f.counters.signer, f.counters.transport], [1, 9]);
  const before = await f.stored();
  equal(await run(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  equal([f.counters.signer, f.counters.transport], [1, 9]); equal(await f.stored(), before);
});
Deno.test("automatic page: existing v2 fence hash mismatch cannot reach any financial action", async () => {
  const f = await automaticFixture(false, true);
  equal((await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source, { fetcher: f.fetcher })(requestId)).kind, "proposed");
  f.control.saveRemainderCandidate = true;
  await ensureRemainderCandidate(f.client, scope, { funding: { source: f.source, now: f.configuration.now,
    maximumAgeSeconds: 15, futureToleranceSeconds: 0 }, feePerOperationStroops: "100", validUntil: cutoff + 60 });
  f.model.d1_load_refund_lane_fence.fence.candidate_hash = "a".repeat(64);
  const before = await f.stored(), counts = { ...f.counters }; f.calls.length = 0;
  equal(await createRefundAutomaticPage(f.pageDependencies)(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  equal(f.calls.every(n => n.startsWith("d1_load_") || n.startsWith("d1_list_")), true);
  equal(f.counters, counts); equal(await f.stored(), before);
});
Deno.test("automatic page: real v1 and v2 inclusion reconcile to settled count without repeat execution", async () => {
  for (const remainder of [false, true]) {
    const f = await automaticFixture(false, remainder, !remainder);
    f.control.executeRefund = !remainder; f.control.saveRemainderCandidate = remainder; f.control.executeRemainder = remainder;
    const run = createRefundAutomaticPage(f.pageDependencies);
    equal(await run(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
    equal([f.counters.signer, f.counters.transport], [1, remainder ? 9 : 1]);
    await f.ingestPosted(); f.calls.length = 0;
    equal(await run(null, 2), { processed: 1, held: 0, nextAfterRequestId: null });
    equal(f.calls.filter(n => n.startsWith("d1_record_") || n.startsWith("d1_claim_")),
      ["d1_record_discovery_page", "d1_record_transaction_page", remainder ? "d1_record_remainder_outcome" : "d1_record_refund_outcome"]);
    const before = await f.stored(), counts = { ...f.counters }; f.calls.length = 0;
    equal(await run(null, 2), { processed: 1, held: 0, nextAfterRequestId: null });
    equal(f.calls.every(n => n.startsWith("d1_load_") || n.startsWith("d1_list_")), true);
    equal(f.counters, counts); equal(await f.stored(), before);
  }
});
Deno.test("automatic page: nonempty discovery is one bounded partial save, never a second financial action", async () => {
  const f = await automaticFixture(false, false, true); f.control.executeRefund = true;
  const run = createRefundAutomaticPage(f.pageDependencies);
  equal(await run(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  equal([f.counters.signer, f.counters.transport], [1, 1]);
  f.control.includePosted = true; f.control.now = cutoff + 1;
  const counts = { ...f.counters }; f.calls.length = 0;
  equal(await run(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  equal(f.calls.at(-1), "d1_record_discovery_page");
  equal([f.counters.discovery, f.counters.history, f.counters.signer, f.counters.transport],
    [counts.discovery + 1, counts.history, counts.signer, counts.transport]);
});
for (const remainder of [false, true]) Deno.test(`automatic tick-only catch-up: ${remainder ? "v2" : "v1"} resumes partial discovery and history without new authority`, async () => {
  const f = await automaticFixture(false, remainder, !remainder);
  f.control.executeRefund = !remainder; f.control.saveRemainderCandidate = remainder; f.control.executeRemainder = remainder;
  const run = createRefundAutomaticPage(f.pageDependencies);
  const handler = createRefundAutomaticHttp({ token, maxBatchSize: 2, runPage: after => run(after, 2) });
  const tick = () => handler(new Request("https://offline.invalid/functions/v1/d1-custody/internal-refund-tick",
    { method: "POST", headers: { "x-d1-refund-token": token }, body: '{"afterRequestId":null}' }));
  await responseIs(await tick(), 200, { processed: 1, held: 1, nextAfterRequestId: null });
  const prefix = remainder ? "remainder" : "refund", args = { p_request_id: requestId, p_authorized_by: admin };
  const protectedState = async () => [await f.client.rpc("d1_load_refund_lane_fence", args),
    await f.client.rpc(`d1_load_${prefix}_submission_attempt`, args)];
  const ownership = await protectedState();
  equal([f.counters.signer, f.counters.transport], [1, remainder ? 9 : 1]);
  // ONLY the provider now exposes the posted transaction. No test-side journal
  // writes or ingestion helpers between ticks. Resume after original authority
  // expires to prove that evidence catch-up neither renews nor reuses it to send.
  f.control.includePosted = true; f.control.now = cutoff + 61;
  for (let page = 0; page < 3; page++) {
    const counts = { ...f.counters }; f.calls.length = 0;
    await responseIs(await tick(), 200, { processed: 1, held: page === 2 ? 0 : 1, nextAfterRequestId: null });
    equal(f.calls.filter(n => n.startsWith("d1_record_") || n.startsWith("d1_claim_")), ["d1_record_discovery_page",
      ...(page === 0 ? [] : ["d1_record_transaction_page"]), ...(page === 2 ? [`d1_record_${prefix}_outcome`] : [])]);
    equal([f.counters.discovery - counts.discovery, f.counters.history - counts.history], [1, page === 0 ? 0 : 1]);
    equal([f.counters.signer, f.counters.transport, f.counters.account], [counts.signer, counts.transport, counts.account]);
    equal(await protectedState(), ownership);
    const state = await f.client.rpc("d1_load_transaction_history_state", { p_namespace: namespace, p_authorized_by: admin });
    const h = state.data as Record<string, any>;
    equal([h.income_state.coverage_complete, h.coverage_complete], [page !== 0, page === 2]);
    equal(h.income_state.checkpoint.cursor, ((14n << 32n) + (remainder ? 4097n : 4098n)).toString());
    equal(h.checkpoint.cursor, ((BigInt(page === 0 ? 11 : 14) << 32n) + 4096n).toString());
  }
  const outcome = await f.client.rpc(`d1_load_${prefix}_outcome`, args);
  equal((outcome.data as Record<string, any>).outcome.observed_outcome.outcome, "success");
  const state = remainder ? await createRemainderExecutor(f.executionDependencies)(scope, "refund_remainder_status") :
    await createRefundExecutor(f.executionDependencies)(scope, "refund_status");
  if (state.kind !== "state") throw Error(JSON.stringify(state));
  equal(state.state.state, "settled"); equal(state.state.verification, "persisted_sdk_observation");
  equal(state.state.settlement, { beneficiaryClaimedAmount: remainder ? "1.0000000" : "0.0000000",
    donorRefundedAmount: remainder ? "9.0000000" : "10.0000000", remainingPrincipalAmount: "0.0000000" });
  equal(state.state.safeActions, [remainder ? "refund_remainder_status" : "refund_status"]);
  const before = await f.stored(), counts = { ...f.counters }; f.calls.length = 0;
  await responseIs(await tick(), 200, { processed: 1, held: 0, nextAfterRequestId: null });
  equal(f.calls.every(n => n.startsWith("d1_load_") || n.startsWith("d1_list_")), true);
  equal(f.counters, counts); equal(await f.stored(), before);
});
Deno.test("automatic partial catch-up: foreign or mismatched fence, denial and unknown coverage cannot authorize ingestion", async () => {
  for (const fault of ["foreign", "hash", "denied", "coverage"]) {
    const f = await automaticFixture(false, false, true); f.control.executeRefund = true;
    const run = createRefundAutomaticPage(f.pageDependencies);
    equal(await run(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
    f.control.includePosted = true; f.control.now = cutoff + 1;
    equal(await run(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
    const before = await f.stored(), counts = { ...f.counters };
    const client = { async rpc(name: string, args: Record<string, unknown>) {
      const reply = await f.client.rpc(name, args);
      if (name === "d1_load_refund_lane_fence") {
        const data = reply.data as Record<string, any>;
        if (fault === "foreign") data.fence.request_id = namespace;
        if (fault === "hash") data.fence.candidate_hash = "a".repeat(64);
      }
      if (fault === "denied" && name === "d1_load_unsigned_transaction")
        return { data: null, error: { code: "42501", message: "unauthorized_admin_wallet" } };
      if (fault === "coverage" && name === "d1_load_discovery_state")
        (reply.data as Record<string, any>).coverage_complete = null;
      return reply;
    } };
    f.calls.length = 0;
    equal(await createRefundAutomaticPage({ ...f.pageDependencies, client })(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
    equal(f.calls.every(n => n.startsWith("d1_load_") || n.startsWith("d1_list_")), true);
    equal(f.counters, counts); equal(await f.stored(), before);
  }
});
Deno.test("automatic partial catch-up: ambiguous save stops this tick without readback or another action", async () => {
  const f = await automaticFixture(false, false, true); f.control.executeRefund = true;
  const run = createRefundAutomaticPage(f.pageDependencies);
  equal(await run(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  f.control.includePosted = true; f.control.now = cutoff + 1;
  equal(await run(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  f.control.ambiguous = "d1_record_discovery_page";
  const counts = { ...f.counters }, args = { p_request_id: requestId, p_authorized_by: admin };
  const attempt = await f.client.rpc("d1_load_refund_submission_attempt", args); f.calls.length = 0;
  equal(await run(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
  equal(f.calls.at(-1), "d1_record_discovery_page");
  equal(f.calls.filter(n => n.startsWith("d1_record_") || n.startsWith("d1_claim_")), ["d1_record_discovery_page"]);
  equal([f.counters.discovery, f.counters.history, f.counters.signer, f.counters.transport],
    [counts.discovery + 1, counts.history, counts.signer, counts.transport]);
  equal(await f.client.rpc("d1_load_refund_submission_attempt", args), attempt);
});
Deno.test("automatic page: ordered multi-original window continues after held original and preserves cursor", async () => {
  const f = await automaticFixture(), other = "33333333-3333-4333-8333-333333333333";
  f.control.due = [requestId, other]; f.control.next = other;
  const reads: string[] = [];
  const client = { async rpc(name: string, args: Record<string, unknown>) {
    if (name === "d1_load_refund_lane_fence") reads.push(args.p_request_id as string);
    if (name === "d1_load_refund_lane_fence" && args.p_request_id === other) {
      equal(args.p_authorized_by, admin);
      return { data: { kind: "d1_refund_lane_fence_lookup", revision: 1, namespace, network: "TESTNET", pool, request_id: other,
        fence: { kind: "d1_refund_lane_fence", revision: 1, namespace, network: "TESTNET", pool, request_id: requestId,
          authorized_by: admin, lane: "full_gross_v1", candidate_hash: "a".repeat(64) } }, error: null };
    }
    return await f.client.rpc(name, args);
  } };
  const before = await f.stored(); f.calls.length = 0;
  const run = createRefundAutomaticPage({ ...f.pageDependencies, client });
  equal(await run(null, 2), { processed: 2, held: 2, nextAfterRequestId: other });
  equal(reads.at(-1), other); equal(reads.slice(0, -1).every(id => id === requestId), true);
  equal(f.calls.filter(n => n === "d1_list_due_refund_originals").length, 1);
  equal([f.counters.discovery, f.counters.history, f.counters.signer, f.counters.transport], [1, 1, 0, 0]);
  equal(await f.stored(), before);
  f.control.after = other; f.control.due = []; f.control.next = null; const counts = { ...f.counters }; f.calls.length = 0;
  equal(await run(other, 2), { processed: 0, held: 0, nextAfterRequestId: null });
  equal(f.calls, ["d1_list_due_refund_originals"]); equal(f.counters, counts); equal(await f.stored(), before);
});
Deno.test("automatic page: ambiguous neutral save stops without retry, readback, opposite lane or signing", async () => {
  for (const name of ["d1_record_discovery_page", "d1_record_transaction_page", "d1_record_issuance_outcome"]) {
    const f = await automaticFixture(); f.control.ambiguous = name;
    if (name === "d1_record_issuance_outcome") f.model.d1_load_issuance_outcome.outcome = null;
    f.calls.length = 0;
    equal(await createRefundAutomaticPage(f.pageDependencies)(null, 2), { processed: 1, held: 1, nextAfterRequestId: null });
    equal(f.calls.at(-1), name); equal(f.calls.filter(n => n === name).length, 1);
    equal(f.calls.some(n => n.includes("remainder") || n === "d1_record_refund_candidate"), false);
    equal([f.counters.discovery, f.counters.history, f.counters.balance, f.counters.signer, f.counters.transport],
      [1, name === "d1_record_discovery_page" ? 0 : 1, 0, 0, 0]);
    if (name === "d1_record_issuance_outcome") {
      const stored = await f.client.rpc("d1_load_issuance_outcome", { p_request_id: requestId, p_authorized_by: admin });
      equal(stored.data, f.model.d1_load_issuance_outcome); equal(f.model.d1_load_issuance_outcome.outcome, f.outcome);
    }
  }
});
