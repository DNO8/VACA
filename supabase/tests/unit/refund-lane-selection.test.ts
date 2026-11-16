import { createRefundLaneSelector } from "../../functions/d1-custody/refund-lane-selection.ts";
import { automaticFixture, equal, requestId, namespace, pool, admin } from "../fixtures/automatic-refund.ts";
function fence(request = requestId, lane = "verified_remainder_v2", hash = "a".repeat(64)) {
  return { kind: "d1_refund_lane_fence", revision: 1, namespace, request_id: request, network: "TESTNET", pool,
    authorized_by: admin, lane, candidate_hash: hash };
}
Deno.test("lane selector: genuine included success plus positive current CB proposes full gross without financial writes", async () => {
  const f = await automaticFixture(), before = await f.stored(); f.calls.length = 0;
  equal(await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source)(requestId), { kind: "proposed", lane: "full_gross_v1" });
  equal(f.counters, { discovery: 0, history: 0, balance: 1, account: 0, signer: 0, transport: 0, writes: 0 });
  equal(f.calls.filter(n => n === "d1_load_refund_lane_fence").length, 2); equal(await f.stored(), before);
});
Deno.test("lane selector: genuine failed included issuance proposes full gross without assuming never issued", async () => {
  const f = await automaticFixture(true), before = await f.stored();
  equal(await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source)(requestId), { kind: "proposed", lane: "full_gross_v1" });
  equal(f.counters, { discovery: 0, history: 0, balance: 0, account: 0, signer: 0, transport: 0, writes: 0 }); equal(await f.stored(), before);
});
Deno.test("lane selector: foreign permanent owner holds before lifecycle/provider", async () => {
  const f = await automaticFixture(); f.model.d1_load_refund_lane_fence.fence = fence(namespace);
  const before = await f.stored(); f.calls.length = 0;
  equal(await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source)(requestId), { kind: "held", reason: "foreign_owner" });
  equal(f.calls, ["d1_load_refund_lane_fence"]); equal(f.counters.balance, 0); equal(f.counters.writes, 0); equal(await f.stored(), before);
});
Deno.test("lane selector: existing v2 returns only immutable routing hash, not execution permission", async () => {
  const f = await automaticFixture(); f.model.d1_load_refund_lane_fence.fence = fence();
  const before = await f.stored(); f.calls.length = 0;
  equal(await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source)(requestId),
    { kind: "existing", lane: "verified_remainder_v2", candidateHash: "a".repeat(64) });
  equal(f.calls, ["d1_load_refund_lane_fence"]); equal(f.counters.writes, 0); equal(await f.stored(), before);
});
Deno.test("lane selector: full-gross fence without matching candidate holds", async () => {
  const f = await automaticFixture(); f.model.d1_load_refund_lane_fence.fence = fence(requestId, "full_gross_v1");
  const before = await f.stored();
  equal(await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source)(requestId), { kind: "held", reason: "ownership_unresolved" });
  equal(f.counters.balance, 0); equal(f.counters.writes, 0); equal(await f.stored(), before);
});
Deno.test("lane selector: missing032 or missing039 plus404 never proposes either lane", async () => {
  for (const missing of [true, false]) {
    const f = await automaticFixture(); if (missing) f.model.d1_load_issuance_outcome.outcome = null;
    else f.control.balanceUnavailable = true;
    const before = await f.stored();
    const result = await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source)(requestId);
    equal(result.kind, "held"); equal(f.counters.writes, 0); equal(f.counters.signer, 0); equal(f.counters.transport, 0); equal(await f.stored(), before);
  }
});
Deno.test("lane selector: genuine beneficiary claim acquisition plus current remainder proposes v2 without candidate writes", async () => {
  const f = await automaticFixture(false, true);
  equal(await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source, { fetcher: f.fetcher })(requestId),
    { kind: "proposed", lane: "verified_remainder_v2" });
  equal(f.calls.filter(n => n.startsWith("d1_record_") || n.startsWith("d1_claim_")), ["d1_record_beneficiary_claim"]);
  equal([f.counters.balance, f.counters.account, f.counters.signer, f.counters.transport, f.counters.writes], [1, 3, 0, 8, 1]);
  const reply = await f.client.rpc("d1_load_beneficiary_claim", { p_request_id: requestId, p_authorized_by: admin });
  const receipt = reply.data as Record<string, any>;
  equal(receipt.claim.acquisition.claim.claimedPrincipalStroops, "10000000");
  equal(receipt.claim.acquisition.claim.grossLessThisClaimStroops, "90000000");
});
Deno.test("lane selector: authentic claim contradicting positive CB presence holds without further writes", async () => {
  const f = await automaticFixture(false, true);
  const select = createRefundLaneSelector(f.client, f.selectorConfiguration, f.source, { fetcher: f.fetcher });
  equal((await select(requestId)).kind, "proposed"); f.control.balanceUnavailable = false;
  const before = await f.stored(), writes = f.counters.writes, transport = f.counters.transport;
  equal(await select(requestId), { kind: "held", reason: "evidence_unavailable" });
  equal(f.counters.writes, writes); equal(f.counters.transport, transport); equal(f.counters.signer, 0); equal(await f.stored(), before);
});
Deno.test("lane selector: ambiguous039 acquisition stops without readback, second acquisition or candidate", async () => {
  const f = await automaticFixture(false, true); f.control.ambiguous = "d1_record_beneficiary_claim";
  equal(await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source, { fetcher: f.fetcher })(requestId),
    { kind: "held", reason: "evidence_unavailable" });
  equal(f.calls.at(-1), "d1_record_beneficiary_claim");
  equal([f.counters.account, f.counters.signer, f.counters.transport, f.counters.writes], [0, 0, 8, 1]);
  const reply = await f.client.rpc("d1_load_beneficiary_claim", { p_request_id: requestId, p_authorized_by: admin });
  equal((reply.data as Record<string, any>).claim.acquisition.claim.claimedPrincipalStroops, "10000000");
});
Deno.test("lane selector: malformed claim cannot contradict positive presence into a proposal", async () => {
  const f = await automaticFixture(); f.model.d1_load_beneficiary_claim.claim = { claimedPrincipalStroops: "10000000" };
  const before = await f.stored();
  equal(await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source)(requestId), { kind: "held", reason: "evidence_unavailable" });
  equal(f.counters.writes, 0); equal(f.counters.transport, 0); equal(await f.stored(), before);
});
