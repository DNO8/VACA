import { createRefundExecutor } from "../../functions/d1-custody/refund-execution.ts";
import { observeRefundSettlement } from "../../functions/d1-custody/refund-settlement-observation.ts";
import { issuer } from "../fixtures/initial-financial-authorization.ts";
import { createRefundHttpHandler } from "../../functions/d1-custody/refund-http.ts";
import { ensureRecoveryRefundCandidate } from "../../functions/d1-custody/refund-candidate-journal.ts";
import { createRefundLaneSelector } from "../../functions/d1-custody/refund-lane-selection.ts";
import { DiscoveryDatabase, ingestDiscoveryPage } from "../../functions/d1-custody/discovery-ingestion.ts";
import { automaticFixture, equal, responseIs, manualRequest, scope, cutoff, requestId, namespace, admin } from "../fixtures/automatic-refund.ts";
Deno.test("manual v1: genuine wallet signature and private core preserve exact13-field financial status", async () => {
  for (const failed of [false, true]) {
    const f = await automaticFixture(failed), before = await f.stored();
    const core = await createRefundExecutor(f.executionDependencies)(scope, "refund_status");
    if (core.kind !== "state") throw Error(JSON.stringify(core));
    equal(Object.keys(core.state).length, 13); equal(core.state.state, "not_started");
    equal(core.state.donation.grossAmount, "10.0000000"); equal(core.state.refund, null);
    equal(core.state.settlement, { beneficiaryClaimedAmount: null, donorRefundedAmount: null, remainingPrincipalAmount: null });
    equal(core.state.safeActions, ["refund", "refund_status"]);
    const handler = createRefundHttpHandler({ client: f.client, configuration: f.configuration });
    await responseIs(await handler(manualRequest("refund_status")), 200, core.state);
    equal(f.counters, { discovery: 0, history: 0, balance: 0, account: 0, signer: 0, transport: 0, writes: 0 }); equal(await f.stored(), before);
  }
});
Deno.test("manual v1: not-due command preserves409 DTO and no effects", async () => {
  const f = await automaticFixture(); f.control.now = cutoff - 1; const before = await f.stored();
  const core = await createRefundExecutor(f.executionDependencies)(scope, "refund");
  if (core.kind !== "state") throw Error(JSON.stringify(core)); equal(core.state.state, "not_due");
  await responseIs(await createRefundHttpHandler({ client: f.client, configuration: f.configuration })(manualRequest("refund", cutoff - 1)), 409, core.state);
  equal(f.counters.writes, 0); equal(await f.stored(), before);
});
Deno.test("manual v1: invalid wallet proof stops before any RPC/provider/sign/send", async () => {
  const f = await automaticFixture(), before = await f.stored(); f.calls.length = 0;
  await responseIs(await createRefundHttpHandler({ client: f.client, configuration: f.configuration })(manualRequest("refund", cutoff, true)), 401, { error: "invalid_signature" });
  equal(f.calls, []); equal(f.counters, { discovery: 0, history: 0, balance: 0, account: 0, signer: 0, transport: 0, writes: 0 }); equal(await f.stored(), before);
});
Deno.test("manual v1: genuine full-gross signing and POST preserve manual/core financial parity", async () => {
  for (const failed of [false, true]) {
    const fixtures = await Promise.all([automaticFixture(failed, false, true), automaticFixture(failed, false, true)]);
    for (const f of fixtures) f.control.executeRefund = true;
    const options = (f: typeof fixtures[0]) => ({ client: f.client, source: f.source, financial: f.financial, fetcher: f.fetcher,
      construction: { feePerOperationStroops: "100", validUntil: cutoff + 60 } });
    const [a, b] = fixtures;
    const core = await createRefundExecutor({ ...options(a), now: a.configuration.now })(scope, "refund");
    if (core.kind !== "state") throw Error(JSON.stringify({ core, calls: a.calls }));
    equal(core.state.state, "unknown"); equal(core.state.refund?.amount, "10.0000000"); equal(core.state.verification, "unverified");
    equal(core.state.settlement, { beneficiaryClaimedAmount: null, donorRefundedAmount: null, remainingPrincipalAmount: null });
    await responseIs(await createRefundHttpHandler({ ...options(b), configuration: b.configuration })(manualRequest("refund")), 202, core.state);
    equal([a.counters.signer, b.counters.signer, a.counters.transport, b.counters.transport], [1, 1, 1, 1]);
    const saved = await a.client.rpc("d1_load_refund_submission_attempt", { p_request_id: requestId, p_authorized_by: admin });
    equal((saved.data as Record<string, any>).attempt.transaction_hash, core.state.refund?.transactionHash);
  }
});
Deno.test("full-gross existing fence: genuine saved candidate routes exact hash without another write", async () => {
  const f = await automaticFixture(false, false, true); f.control.executeRefund = true;
  const candidate = await ensureRecoveryRefundCandidate(f.client, scope, { sourceSequence: "3", feePerOperationStroops: "100", now: cutoff, validUntil: cutoff + 60 });
  const before = await f.stored(), counts = { ...f.counters };
  equal(await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source)(requestId),
    { kind: "existing", lane: "full_gross_v1", candidateHash: candidate.transaction_hash });
  equal(f.counters, counts); equal(await f.stored(), before);
});
Deno.test("full-gross reconciliation: SDK inclusion persists038 and settles actual principal with manual parity", async () => {
  for (const failed of [false, true]) {
    const f = await automaticFixture(failed, false, true); f.control.executeRefund = true;
    const options = { client: f.client, source: f.source, financial: f.financial, fetcher: f.fetcher,
      construction: { feePerOperationStroops: "100", validUntil: cutoff + 60 } };
    const execute = createRefundExecutor({ ...options, now: f.configuration.now });
    const submitted = await execute(scope, "refund");
    if (submitted.kind !== "state") throw Error(JSON.stringify({ submitted, calls: f.calls }));
    equal([f.counters.signer, f.counters.transport], [1, 1]);
    await f.ingestPosted(); f.calls.length = 0;
    const settled = await execute(scope, "refund_reconcile");
    if (settled.kind !== "state") throw Error(JSON.stringify({ settled, calls: f.calls }));
    equal(settled.state.state, "settled"); equal(settled.state.verification, "persisted_sdk_observation");
    equal(settled.state.settlement, { beneficiaryClaimedAmount: "0.0000000", donorRefundedAmount: "10.0000000", remainingPrincipalAmount: "0.0000000" });
    equal(settled.state.safeActions, ["refund_status"]); equal(settled.state.donation, submitted.state.donation);
    equal(settled.state.refund?.amount, "10.0000000"); equal([f.counters.signer, f.counters.transport], [1, 1]);
    equal(f.calls.filter(n => n === "d1_record_refund_outcome").length, 1);
    const receipt = await f.client.rpc("d1_load_refund_outcome", { p_request_id: requestId, p_authorized_by: admin });
    equal((receipt.data as Record<string, any>).outcome.observed_outcome.donorRefundedAmount, "10.0000000");
    const before = await f.stored(), counts = { ...f.counters };
    await responseIs(await createRefundHttpHandler({ ...options, configuration: f.configuration })(manualRequest("refund_status", cutoff + 1)), 200, settled.state);
    equal(f.counters, counts); equal(await f.stored(), before);
  }
});
Deno.test("full-gross reconcile: nonempty discovery page stops after one save before history/sign/send", async () => {
  const f = await automaticFixture(false, false, true); f.control.executeRefund = true;
  const execute = createRefundExecutor({ ...f.pageDependencies, construction: { feePerOperationStroops: "100", validUntil: cutoff + 60 } });
  equal((await execute(scope, "refund")).kind, "state"); f.control.includePosted = true; f.control.now = cutoff + 1;
  const before = await f.client.rpc("d1_load_refund_submission_attempt", { p_request_id: requestId, p_authorized_by: admin });
  f.calls.length = 0;
  equal(await execute(scope, "refund_reconcile"), { kind: "error", error: "refund_unavailable" });
  equal(f.calls.at(-1), "d1_record_discovery_page"); equal(f.counters.discovery, 1); equal(f.counters.history, 0);
  equal([f.counters.signer, f.counters.transport], [1, 1]);
  equal(await f.client.rpc("d1_load_refund_submission_attempt", { p_request_id: requestId, p_authorized_by: admin }), before);
});
Deno.test("full-gross reconcile: nonempty transaction page stops before outcome and financial actions", async () => {
  const f = await automaticFixture(false, false, true); f.control.executeRefund = true;
  const execute = createRefundExecutor({ ...f.pageDependencies, construction: { feePerOperationStroops: "100", validUntil: cutoff + 60 } });
  equal((await execute(scope, "refund")).kind, "state"); f.control.includePosted = true; f.control.now = cutoff + 1;
  const db = new DiscoveryDatabase(f.client, namespace, admin);
  equal((await ingestDiscoveryPage(db, f.source)).completeAtAnchor, false);
  equal((await ingestDiscoveryPage(db, f.source)).completeAtAnchor, true);
  const before = await f.client.rpc("d1_load_refund_submission_attempt", { p_request_id: requestId, p_authorized_by: admin });
  f.calls.length = 0;
  equal(await execute(scope, "refund_reconcile"), { kind: "error", error: "refund_unavailable" });
  equal(f.calls.at(-1), "d1_record_transaction_page"); equal(f.counters.history, 1);
  equal(f.calls.filter(n => n.startsWith("d1_record_")).length, 2); equal([f.counters.signer, f.counters.transport], [1, 1]);
  equal(await f.client.rpc("d1_load_refund_submission_attempt", { p_request_id: requestId, p_authorized_by: admin }), before);
});
for (const failed of [false, true]) Deno.test(`issued full-gross: ${failed ? "failed" : "successful"} original signs, submits and settles with manual parity`, async () => {
  const fixtures = await Promise.all([automaticFixture(failed, false, true, true), automaticFixture(failed, false, true, true)]);
  const [a, b] = fixtures;
  for (const f of fixtures) f.control.executeRefund = true;
  const options = (f: typeof a) => ({ client: f.client, source: f.source, financial: f.financial, fetcher: f.fetcher,
    construction: { feePerOperationStroops: "100", validUntil: cutoff + 60 } });
  const execute = createRefundExecutor({ ...options(a), now: a.configuration.now });
  const handler = createRefundHttpHandler({ ...options(b), configuration: b.configuration });
  const submitted = await execute(scope, "refund");
  if (submitted.kind !== "state") throw Error(JSON.stringify({ submitted, calls: a.calls }));
  equal(submitted.state.state, "unknown"); equal(submitted.state.verification, "unverified");
  equal(submitted.state.donation.asset, { type: "issued", code: "USD", issuer });
  equal(submitted.state.refund?.amount, "10.0000000");
  equal(submitted.state.settlement, { beneficiaryClaimedAmount: null, donorRefundedAmount: null, remainingPrincipalAmount: null });
  await responseIs(await handler(manualRequest("refund")), 202, submitted.state);
  for (const f of fixtures) { equal([f.counters.signer, f.counters.transport], [1, 1]); f.control.includePosted = true; f.control.now = cutoff + 1; }
  // Only genuine explicit core/manual reconciliation advances the external
  // pages here. The automatic catch-up tests separately prohibit manual calls.
  for (let page = 0; page < 2; page++) {
    equal(await execute(scope, "refund_reconcile"), { kind: "error", error: "refund_unavailable" });
    await responseIs(await handler(manualRequest("refund_reconcile", cutoff + 1)), 503, { error: "refund_unavailable" });
  }
  const settled = await execute(scope, "refund_reconcile");
  if (settled.kind !== "state") throw Error(JSON.stringify({ settled, calls: a.calls }));
  await responseIs(await handler(manualRequest("refund_reconcile", cutoff + 1)), 200, settled.state);
  for (const f of fixtures) {
    equal([f.counters.signer, f.counters.transport], [1, 1]);
    const receipt = await f.client.rpc("d1_load_refund_outcome", { p_request_id: requestId, p_authorized_by: admin });
    equal((receipt.data as Record<string, any>).outcome.observed_outcome.outcome, "success");
    equal((receipt.data as Record<string, any>).outcome.observed_outcome.donorRefundedAmount, "10.0000000");
  }
  const observed = await observeRefundSettlement(a.client, scope, { now: a.configuration.now });
  equal({ state: settled.state.state, unresolved: observed.unresolved }, { state: "settled", unresolved: null });
  equal(settled.state.verification, "persisted_sdk_observation");
  equal(settled.state.donation, submitted.state.donation); equal(settled.state.safeActions, ["refund_status"]);
  equal(settled.state.settlement, { beneficiaryClaimedAmount: "0.0000000", donorRefundedAmount: "10.0000000", remainingPrincipalAmount: "0.0000000" });
  const before = await b.stored(), counts = { ...b.counters };
  await responseIs(await handler(manualRequest("refund_status", cutoff + 1)), 200, settled.state);
  await responseIs(await handler(manualRequest("refund", cutoff + 1)), 200, settled.state);
  equal(b.counters, counts); equal(await b.stored(), before);
});
Deno.test("manual v1: genuine proof is not admin membership; core denial maps exact403", async () => {
  const f = await automaticFixture(), before = await f.stored(); f.control.deny = true; f.calls.length = 0;
  equal(await createRefundExecutor(f.executionDependencies)(scope, "refund"), { kind: "error", error: "unauthorized_admin_wallet" });
  await responseIs(await createRefundHttpHandler({ client: f.client, configuration: f.configuration })(manualRequest("refund")), 403, { error: "unauthorized_admin_wallet" });
  equal(f.calls, ["d1_load_refund_outcome", "d1_load_refund_outcome"]); equal(f.counters.writes, 0); f.control.deny = false; equal(await f.stored(), before);
});
