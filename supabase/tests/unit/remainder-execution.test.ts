import { createRefundLaneSelector } from "../../functions/d1-custody/refund-lane-selection.ts";
import { requestId } from "../fixtures/automatic-refund.ts";
import { createRemainderExecutor } from "../../functions/d1-custody/remainder-execution.ts";
import { createRemainderHttpHandler } from "../../functions/d1-custody/remainder-http.ts";
import { automaticFixture, equal, responseIs, manualRequest, scope, cutoff } from "../fixtures/automatic-refund.ts";
Deno.test("manual v2: genuine wallet signature and core preserve not-due13-field financial DTO", async () => {
  const f = await automaticFixture(); f.control.now = cutoff - 1; const before = await f.stored();
  const core = await createRemainderExecutor(f.executionDependencies)(scope, "refund_remainder_status");
  if (core.kind !== "state") throw Error(JSON.stringify(core));
  equal(Object.keys(core.state).length, 13); equal(core.state.state, "not_due"); equal(core.state.donation.grossAmount, "10.0000000");
  equal(core.state.refund, null); equal(core.state.settlement, { beneficiaryClaimedAmount: null, donorRefundedAmount: null, remainingPrincipalAmount: null });
  equal(core.state.safeActions, ["refund_remainder_status"]);
  await responseIs(await createRemainderHttpHandler({ client: f.client, configuration: f.configuration })(manualRequest("refund_remainder_status", cutoff - 1)), 200, core.state);
  equal(f.counters, { discovery: 0, history: 0, balance: 0, account: 0, signer: 0, transport: 0, writes: 0 }); equal(await f.stored(), before);
});
Deno.test("manual v2: included failed issuance remains protected with409 and no invented claim", async () => {
  const f = await automaticFixture(true), before = await f.stored();
  const core = await createRemainderExecutor(f.executionDependencies)(scope, "refund_remainder");
  if (core.kind !== "state") throw Error(JSON.stringify(core)); equal(core.state.state, "blocked");
  equal(core.state.reason, "remainder_protected");
  await responseIs(await createRemainderHttpHandler({ client: f.client, configuration: f.configuration })(manualRequest("refund_remainder")), 409, core.state);
  equal(f.counters.writes, 0); equal(await f.stored(), before);
});
Deno.test("manual v2: authentic positive claim has exact manual/core principal status parity without new effects", async () => {
  const f = await automaticFixture(false, true);
  equal((await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source, { fetcher: f.fetcher })(requestId)).kind, "proposed");
  const before = await f.stored(), counts = { ...f.counters };
  const core = await createRemainderExecutor(f.executionDependencies)(scope, "refund_remainder_status");
  if (core.kind !== "state") throw Error(JSON.stringify(core));
  equal(core.state.state, "not_started"); equal(core.state.version, 2);
  equal(core.state.donation.grossAmount, "10.0000000"); equal(core.state.refund, null);
  equal(core.state.settlement, { beneficiaryClaimedAmount: "1.0000000", donorRefundedAmount: null, remainingPrincipalAmount: null });
  equal(core.state.safeActions, ["refund_remainder", "refund_remainder_status"]);
  await responseIs(await createRemainderHttpHandler({ client: f.client, configuration: f.configuration })(manualRequest("refund_remainder_status")), 200, core.state);
  equal(f.counters, counts); equal(await f.stored(), before);
});
Deno.test("manual v2: real signed payment and submission match private core financial result exactly", async () => {
  const fixtures = await Promise.all([automaticFixture(false, true), automaticFixture(false, true)]);
  for (const f of fixtures) {
    f.control.saveRemainderCandidate = true; f.control.executeRemainder = true;
    equal((await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source, { fetcher: f.fetcher })(requestId)).kind, "proposed");
  }
  const [a, b] = fixtures;
  const options = (f: typeof a) => ({ client: f.client, source: f.source, financial: f.financial, fetcher: f.fetcher,
    construction: { feePerOperationStroops: "100", validUntil: cutoff + 60 } });
  const core = await createRemainderExecutor({ ...options(a), now: a.configuration.now })(scope, "refund_remainder");
  if (core.kind !== "state") throw Error(JSON.stringify(core));
  equal(core.state.state, "pending"); equal(core.state.refund?.amount, "9.0000000"); equal(core.state.verification, "unverified");
  equal(core.state.settlement, { beneficiaryClaimedAmount: "1.0000000", donorRefundedAmount: null, remainingPrincipalAmount: null });
  await responseIs(await createRemainderHttpHandler({ ...options(b), configuration: b.configuration })(manualRequest("refund_remainder")), 202, core.state);
  equal([a.counters.signer, b.counters.signer, a.counters.transport, b.counters.transport], [1, 1, 9, 9]);
});
Deno.test("manual v2: real included remainder persists047 and settles gross minus authentic claim", async () => {
  const f = await automaticFixture(false, true); f.control.saveRemainderCandidate = true; f.control.executeRemainder = true;
  equal((await createRefundLaneSelector(f.client, f.selectorConfiguration, f.source, { fetcher: f.fetcher })(requestId)).kind, "proposed");
  const options = { client: f.client, source: f.source, financial: f.financial, fetcher: f.fetcher,
    construction: { feePerOperationStroops: "100", validUntil: cutoff + 60 } };
  const execute = createRemainderExecutor({ ...options, now: f.configuration.now });
  const submitted = await execute(scope, "refund_remainder");
  if (submitted.kind !== "state") throw Error(JSON.stringify({ submitted, calls: f.calls }));
  equal(submitted.state.state, "pending"); await f.ingestPosted(); f.calls.length = 0;
  const settled = await execute(scope, "refund_remainder_reconcile");
  if (settled.kind !== "state") throw Error(JSON.stringify({ settled, calls: f.calls }));
  equal(settled.state.state, "settled"); equal(settled.state.verification, "persisted_sdk_observation");
  equal(settled.state.settlement, { beneficiaryClaimedAmount: "1.0000000", donorRefundedAmount: "9.0000000", remainingPrincipalAmount: "0.0000000" });
  equal(settled.state.safeActions, ["refund_remainder_status"]); equal(settled.state.donation, submitted.state.donation);
  equal(settled.state.refund?.amount, "9.0000000"); equal([f.counters.signer, f.counters.transport], [1, 9]);
  equal(f.calls.filter(n => n === "d1_record_remainder_outcome").length, 1);
  const before = await f.stored(), counts = { ...f.counters };
  await responseIs(await createRemainderHttpHandler({ ...options, configuration: f.configuration })(manualRequest("refund_remainder_status", cutoff + 1)), 200, settled.state);
  equal(f.counters, counts); equal(await f.stored(), before);
});
Deno.test("manual v2: invalid proof cannot reach018 or any provider/sign/send", async () => {
  const f = await automaticFixture(), before = await f.stored(); f.calls.length = 0;
  await responseIs(await createRemainderHttpHandler({ client: f.client, configuration: f.configuration })(manualRequest("refund_remainder", cutoff, true)), 401, { error: "invalid_signature" });
  equal(f.calls, []); equal(f.counters, { discovery: 0, history: 0, balance: 0, account: 0, signer: 0, transport: 0, writes: 0 }); equal(await f.stored(), before);
});
Deno.test("manual v2: genuine proof still requires database membership with exact403 parity", async () => {
  const f = await automaticFixture(), before = await f.stored(); f.control.deny = true; f.calls.length = 0;
  equal(await createRemainderExecutor(f.executionDependencies)(scope, "refund_remainder"), { kind: "error", error: "unauthorized_admin_wallet" });
  await responseIs(await createRemainderHttpHandler({ client: f.client, configuration: f.configuration })(manualRequest("refund_remainder")), 403, { error: "unauthorized_admin_wallet" });
  equal(f.calls, ["d1_load_unsigned_transaction", "d1_load_unsigned_transaction"]); equal(f.counters.writes, 0);
  f.control.deny = false; equal(await f.stored(), before);
});
Deno.test("manual v2: missing original preserves request_not_found404 without effects", async () => {
  const f = await automaticFixture(); f.model.d1_load_unsigned_transaction.transaction = null; const before = await f.stored(); f.calls.length = 0;
  await responseIs(await createRemainderHttpHandler({ client: f.client, configuration: f.configuration })(manualRequest("refund_remainder_status")), 404, { error: "request_not_found" });
  equal(f.calls, ["d1_load_unsigned_transaction"]); equal(f.counters.writes, 0); equal(await f.stored(), before);
});
