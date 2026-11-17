import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRefundAutomaticPage } from "../../functions/d1-custody/refund-automatic-page.ts";
import { createCustodyDeploymentHost } from "../../functions/d1-custody/deployment-host.ts";
import { automaticFixture, manualRequest, scope, poolKey, closedAt, cutoff } from "../fixtures/automatic-refund.ts";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
Deno.test("independent compatibility: omitted policy execution/recovery and all manual routes", async () => {
  // Same synthetic entropy at both commits, not normalization of observed data.
  let nonce = 0;
  const oldUUID = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  Object.defineProperty(crypto, "randomUUID", {configurable: true, value: () =>
    `77777777-7777-4777-8777-${String(++nonce).padStart(12, "0")}`});
  try {
    for (const remainder of [false, true]) {
      const f = await automaticFixture(false, remainder, !remainder);
      Object.assign(f.control, {executeRefund: !remainder, executeRemainder: remainder, saveRemainderCandidate: remainder});
      assert.ok(closedAt < 1794711600);
      const measure = async (label: string, action: () => Promise<unknown>) => {
        const beforeReadStart = f.calls.length;
        const beforeBytes = await f.stored(), beforeCounters = {...f.counters};
        const beforeMeasurementCalls = f.calls.slice(beforeReadStart);
        const start = f.calls.length;
        let result: unknown = null, error: unknown = null;
        try { result = await action(); }
        catch (e) {error = e instanceof Error ? {name: e.name, message: e.message} : String(e);}
        // Capture action calls BEFORE any subsequent measuring reads. Never clear traces.
        const calls = f.calls.slice(start), afterCounters = {...f.counters};
        const afterReadStart = f.calls.length;
        const afterBytes = await f.stored(), afterMeasurementCalls = f.calls.slice(afterReadStart);
        const record = {label, remainder, result, error, calls, beforeCounters, afterCounters,
          beforeDurableSHA: sha(beforeBytes), afterDurableSHA: sha(afterBytes),
          beforeMeasurementCalls, afterMeasurementCalls};
        console.log(JSON.stringify(record));
        assert.equal(error, null, `unexpected thrown error in ${label}`);
        assert.ok(calls.length > 0, `${label} must actually reach public RPC interface`);
        return {result, beforeBytes, afterBytes, beforeCounters, afterCounters, calls};
      };
      const run = createRefundAutomaticPage(f.pageDependencies);
      const first = await measure("omitted-new", () => run(null, 2));
      assert.deepEqual(first.result, {processed: 1, held: 1, nextAfterRequestId: null});
      assert.deepEqual([f.counters.signer, f.counters.transport], [1, remainder ? 9 : 1]);
      assert.ok(first.calls.includes(remainder ? "d1_claim_remainder_submission_attempt" : "d1_claim_refund_submission_attempt"));
      assert.notEqual(first.beforeBytes, first.afterBytes);
      const pending = await measure("omitted-existing", () => run(null, 2));
      assert.deepEqual(pending.result, first.result);assert.equal(pending.afterBytes, pending.beforeBytes);
      assert.equal(pending.afterCounters.signer, pending.beforeCounters.signer);
      assert.equal(pending.afterCounters.transport, pending.beforeCounters.transport);
      const client = {async rpc(name: string, args: Record<string, unknown>) {
        const reply = await f.client.rpc(name, args);assert.equal(reply.error, null);return {data: reply.data, error: null};
      }};
      let secretReads = 0;
      const handler = createCustodyDeploymentHost({client, pool: scope.pool, namespace: scope.namespace,
        firstLedger: 10, creationOperationId: "42949672961", teamFunders: [scope.authenticatedAdmin],
        fetcher: f.fetcher, now: () => f.control.now, readSecret: () => {secretReads++;return poolKey.secret();}});
      const actions = remainder ? ["refund_remainder_status", "refund_remainder", "refund_remainder_reconcile"] as const :
        ["refund_status", "refund", "refund_reconcile"] as const;
      for (const action of actions) {
        await measure(action, async () => {
          const beforeSecretReads = secretReads;
          const response = await handler(manualRequest(action, f.control.now));
          const body = await response.text();
          const result = {status: response.status, headers: [...response.headers], body,
            beforeSecretReads, afterSecretReads: secretReads};
          // Record exact status/body/effects. The baseline, not an invented success
          // status or inertness assumption, defines the compatibility expectation.
          assert.equal(response.headers.get("cache-control"), "no-store");
          const dto = JSON.parse(body);
          if (typeof dto.state === "string") {
            assert.ok(Array.isArray(dto.safeActions));
            const isStatus = action.endsWith("_status"), isExecute = action === "refund" || action === "refund_remainder";
            const expectedStatus = isStatus ? 200 : ["pending", "unknown"].includes(dto.state) ? 202 :
              isExecute && ["not_due", "blocked"].includes(dto.state) ? 409 : 200;
            assert.equal(response.status, expectedStatus);
          } else assert.equal(typeof dto.error, "string");
          return result;
        });
      }
      // Genuine tick-only incomplete discovery/history recovery, no test-side journal edits.
      const financialCountsBeforeRecovery = [f.counters.signer, f.counters.transport];
      f.control.includePosted = true;f.control.now = cutoff + 61;
      for (let page = 0; page < 3; page++) {
        const recovery = await measure(`omitted-recovery-${page}`, () => run(null, 2));
        assert.deepEqual(recovery.result, {processed: 1, held: page === 2 ? 0 : 1, nextAfterRequestId: null});
        assert.equal(recovery.afterCounters.signer, recovery.beforeCounters.signer);
        assert.equal(recovery.afterCounters.transport, recovery.beforeCounters.transport);
      }
      const settled = await measure("omitted-settlement", () => run(null, 2));
      assert.deepEqual(settled.result, {processed: 1, held: 0, nextAfterRequestId: null});
      assert.deepEqual([f.counters.signer, f.counters.transport], financialCountsBeforeRecovery);
      assert.equal(settled.afterBytes, settled.beforeBytes);
      assert.deepEqual(settled.afterCounters, settled.beforeCounters);
    }
  } finally {
    if (oldUUID) Object.defineProperty(crypto, "randomUUID", oldUUID);
    else Reflect.deleteProperty(crypto, "randomUUID");
  }
});
