import { CustodyError } from "./handler.ts";
import { withRefundSubmissionAuthorization } from "./refund-submission-authorization.ts";

type Client = Parameters<typeof withRefundSubmissionAuthorization>[0];
type Scope = Parameters<typeof withRefundSubmissionAuthorization>[1];
type Configuration = Parameters<typeof withRefundSubmissionAuthorization>[2];
export interface RefundSubmissionResponse {
  readonly kind: "d1_refund_submission_response"; readonly revision: 1;
  readonly verification: "unverified"; readonly transactionHash: string;
  readonly response: Readonly<Record<string, unknown>>;
}
function check(value: unknown): asserts value { if (!value) throw new Error("unavailable"); }
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
/** Internal one-POST transport, never inclusion, failure reconciliation or settlement proof. */
export function submitRefund(client: Client, scope: Scope, configuration: Configuration, fetcher: typeof fetch = fetch) {
  // Capture once before the authorization gate's first await; no dynamic replacement.
  const send = fetcher;
  if (typeof send !== "function") throw new CustodyError("refund_submission_unavailable", 503);
  return withRefundSubmissionAuthorization(client, scope, configuration, async artifact => {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("unavailable")); }, 10000);
    });
    try {
      const work = async (): Promise<RefundSubmissionResponse> => {
        const response = await send("https://horizon-testnet.stellar.org/transactions", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body: new URLSearchParams({ tx: artifact.signedXdr }).toString(),
          redirect: "error", credentials: "omit", signal: controller.signal,
        });
        check(response instanceof Response);
        if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new Error("unavailable"); }
        check(response.status === 200 && response.body &&
          response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json");
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true }); let bytes = 0, text = "";
        while (true) {
          const { done, value } = await reader.read(); check(!controller.signal.aborted); if (done) break;
          check(value instanceof Uint8Array && (bytes += value.byteLength) <= 131072);
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode(); const body: unknown = JSON.parse(text); let nodes = 0;
        const inspect = (value: unknown, depth: number): void => {
          check(++nodes <= 20000 && depth <= 28);
          if (value === null || typeof value === "boolean") return;
          if (typeof value === "number") { check(Number.isSafeInteger(value)); return; }
          if (typeof value === "string") {
            check(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)); return;
          }
          check(value !== null && typeof value === "object");
          for (const [key, nested] of Object.entries(value)) { inspect(key, depth + 1); inspect(nested, depth + 1); }
        };
        inspect(body, 0);
        check(body !== null && typeof body === "object" && !Array.isArray(body) &&
          Object.hasOwn(body, "hash") && (body as Record<string, unknown>).hash === artifact.transactionHash);
        return freeze({ kind: "d1_refund_submission_response", revision: 1, verification: "unverified",
          transactionHash: artifact.transactionHash, response: body as Record<string, unknown> });
      };
      return await Promise.race([work(), deadline]);
    } finally {
      clearTimeout(timer); controller.abort();
      // Cleanup must not replace the ten-second bound with an unbounded await.
      try { void reader?.cancel().catch(() => {}); } catch { /* gate sanitizes transport errors */ }
    }
  });
}
