import { CustodyError } from "./handler.ts";
import { authorizeRemainderSubmission, type RemainderSubmissionResult } from "./remainder-submission-authorization.ts";

type Client = Parameters<typeof authorizeRemainderSubmission>[0];
type Scope = Parameters<typeof authorizeRemainderSubmission>[1];
type Configuration = Parameters<typeof authorizeRemainderSubmission>[2];
export interface RemainderSubmissionResponse {
  readonly kind: "d1_remainder_submission_response";
  readonly revision: 2;
  readonly verification: "unverified";
  readonly transactionHash: string;
}
function check(value: unknown): asserts value { if (!value) throw new Error("unavailable"); }
/** Private one-POST transport. An acknowledgement is NEVER inclusion or settlement. */
export async function submitRemainder(client: Client, scope: Scope, signerConfiguration: Configuration,
  fetcher: typeof fetch = fetch): Promise<RemainderSubmissionResult<RemainderSubmissionResponse>> {
  let gateStarted = false;
  try {
    // Capture transport, timer and constructor capabilities before authorization's first await.
    const send = fetcher, receiver = globalThis, schedule = setTimeout, unschedule = clearTimeout;
    const Controller = AbortController, HttpResponse = Response, Decoder = TextDecoder, Form = URLSearchParams;
    check(typeof send === "function");
    gateStarted = true;
    return await authorizeRemainderSubmission(client, scope, signerConfiguration, async artifact => {
      const controller = new Controller();
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = schedule(() => { controller.abort(); reject(new Error("unavailable")); }, 10000);
      });
      try {
        const work = async (): Promise<RemainderSubmissionResponse> => {
          const response = await Reflect.apply(send, receiver, ["https://horizon-testnet.stellar.org/transactions", {
            method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
            body: new Form({ tx: artifact.signedXdr }).toString(),
            redirect: "error", credentials: "omit", signal: controller.signal,
          }]);
          check(response instanceof HttpResponse);
          if (controller.signal.aborted) {
            try { void response.body?.cancel().catch(() => {}); } catch { /* Late bodies cannot become ACKs. */ }
            throw new Error("unavailable");
          }
          check(response.status === 200 && response.body &&
            response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json");
          reader = response.body.getReader();
          const decoder = new Decoder("utf-8", { fatal: true }); let bytes = 0, text = "";
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
          check(body !== null && typeof body === "object" && !Array.isArray(body));
          const hash = Object.getOwnPropertyDescriptor(body, "hash");
          check(!hash || ("value" in hash && hash.value === artifact.transactionHash));
          check(!controller.signal.aborted);
          // Never return raw provider diagnostics, result codes or an inferred successful payment.
          return Object.freeze({ kind: "d1_remainder_submission_response", revision: 2, verification: "unverified",
            transactionHash: artifact.transactionHash });
        };
        return await Promise.race([work(), deadline]);
      } finally {
        unschedule(timer); controller.abort();
        // Never turn cleanup into an unbounded body/cancellation await.
        try { void reader?.cancel().catch(() => {}); } catch { /* Ownership remains held. */ }
      }
    });
  } catch (error) {
    // Only the gate's captured genuine RPC authentication flag can produce this error.
    if (gateStarted && error instanceof CustodyError && error.status === 403 && error.code === "unauthorized_admin_wallet") throw error;
    throw new CustodyError("remainder_submission_unavailable", 503);
  }
}
