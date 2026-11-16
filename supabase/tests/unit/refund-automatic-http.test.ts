import { createRefundAutomaticHttp } from "../../functions/d1-custody/refund-automatic-http.ts";
import { equal, responseIs, token, requestId } from "../fixtures/automatic-refund.ts";
const route = "https://offline.invalid/functions/v1/d1-custody/internal-refund-tick";
function fixture(result: unknown = { processed: 1, held: 1, nextAfterRequestId: null }) {
  const calls: unknown[] = [];
  const handler = createRefundAutomaticHttp({ token, maxBatchSize: 2, async runPage(after) {
    calls.push(after); if (result instanceof Error) throw result; return result;
  } });
  const request = (body = '{"afterRequestId":null}', url = route, method = "POST", secret = token) =>
    new Request(url, { method, headers: { "x-d1-refund-token": secret }, ...(method === "POST" ? { body } : {}) });
  return { handler, calls, request };
}
Deno.test("automatic HTTP: exact route rejects aliases before execution", async () => {
  const f = fixture();
  for (const url of [route + "/", route.replace("internal-refund-tick", "refund-tick")])
    await responseIs(await f.handler(f.request(undefined, url)), 404, { error: "not_found" });
  equal(f.calls, []);
});
Deno.test("automatic HTTP: POST only preserves Allow and no-store", async () => {
  const f = fixture(), r = await f.handler(f.request(undefined, route, "GET"));
  equal(r.headers.get("allow"), "POST"); await responseIs(r, 405, { error: "method_not_allowed" }); equal(f.calls, []);
});
Deno.test("automatic HTTP: queries including bare question mark and fragments reject", async () => {
  const f = fixture();
  for (const suffix of ["?", "?afterRequestId=" + requestId, "#fragment"])
    await responseIs(await f.handler(f.request(undefined, route + suffix)), 400, { error: "invalid_request" });
  equal(f.calls, []);
});
Deno.test("automatic HTTP: authentication precedes streamed body and execution", async () => {
  const f = fixture(); let pulls = 0;
  for (const secret of ["", token.slice(1), "A".repeat(43), token + ", " + token]) {
    const body = new ReadableStream<Uint8Array>({ pull() { pulls++; throw Error("body must not be read"); } }, { highWaterMark: 0 });
    const r = new Request(route, { method: "POST", headers: { "x-d1-refund-token": secret }, body });
    await responseIs(await f.handler(r), 401, { error: "unauthorized" }); equal(r.bodyUsed, false);
  }
  equal(pulls, 0); equal(f.calls, []);
});
Deno.test("automatic HTTP: duplicate keys and extra financial input reject without execution", async () => {
  const f = fixture();
  for (const body of ['{"afterRequestId":null,"afterRequestId":null}', '{"afterRequestId":null,"actor":"x"}',
    '{"afterRequestId":null,"amount":"1"}', '{"after\\u0052equestId":null}', '{}', '{"afterRequestId":"bad"}'])
    await responseIs(await f.handler(f.request(body)), 400, { error: "invalid_request" });
  equal(f.calls, []);
});
Deno.test("automatic HTTP: exact1024-byte boundary accepted;1025 rejected", async () => {
  const f = fixture(), body = '{"afterRequestId":null}';
  await responseIs(await f.handler(f.request(body.padEnd(1024))), 200, { processed: 1, held: 1, nextAfterRequestId: null });
  await responseIs(await f.handler(f.request(body.padEnd(1025))), 413, { error: "request_too_large" }); equal(f.calls, [null]);
});
Deno.test("automatic HTTP: canonical cursor and sanitized counts only", async () => {
  const f = fixture({ processed: 2, held: 1, nextAfterRequestId: requestId });
  await responseIs(await f.handler(f.request(JSON.stringify({ afterRequestId: requestId }))), 200,
    { processed: 2, held: 1, nextAfterRequestId: requestId }); equal(f.calls, [requestId]);
});
Deno.test("automatic HTTP: ambiguous execution never retries or echoes private failure", async () => {
  const f = fixture(Error("private RPC details"));
  await responseIs(await f.handler(f.request()), 503, { error: "refund_tick_unavailable" }); equal(f.calls, [null]);
});
Deno.test("automatic HTTP: invalid counts or extra results fail after exactly one call", async () => {
  for (const result of [{ processed: 3, held: 0, nextAfterRequestId: null }, { processed: 1, held: 2, nextAfterRequestId: null },
    { processed: 0.5, held: 0, nextAfterRequestId: null }, { processed: 0, held: 0, nextAfterRequestId: null, private: "secret" }]) {
    const f = fixture(result); await responseIs(await f.handler(f.request()), 503, { error: "refund_tick_unavailable" }); equal(f.calls, [null]);
  }
});
Deno.test("automatic HTTP: absent configuration remains unavailable", async () => {
  const f = fixture(); await responseIs(await createRefundAutomaticHttp()(f.request()), 503, { error: "refund_tick_unavailable" }); equal(f.calls, []);
});
