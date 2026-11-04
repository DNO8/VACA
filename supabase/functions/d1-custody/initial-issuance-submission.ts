import { withInitialSubmissionAuthorization } from "./initial-submission-authorization.ts";

type Client = Parameters<typeof withInitialSubmissionAuthorization>[0];
type Configuration = Parameters<typeof withInitialSubmissionAuthorization>[1];
export interface InitialSubmissionResponse {
  readonly kind: "d1_initial_submission_response"; readonly revision: 1;
  readonly verification: "unverified"; readonly transactionHash: string;
  readonly response: Readonly<Record<string, unknown>>;
}
function valid(value: unknown): asserts value { if (!value) throw new Error("unavailable"); }
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Backend-only composition. No raw-envelope or reusable-grant submission API.
 * HTTP acknowledgement is deliberately NOT an included/terminal outcome. */
export function submitInitialIssuance(client: Client, configuration: Configuration, fetcher: typeof fetch = fetch) {
  return withInitialSubmissionAuthorization(client, configuration, async artifact => {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("unavailable")); }, 10000);
    });
    try {
      const work = async (): Promise<InitialSubmissionResponse> => {
        const response = await fetcher("https://horizon-testnet.stellar.org/transactions", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body: new URLSearchParams({ tx: artifact.signedXdr }).toString(),
          redirect: "error", credentials: "omit", signal: controller.signal,
        });
        valid(response instanceof Response);
        if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new Error("unavailable"); }
        valid(response.status === 200 && response.body &&
          response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json");
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true }); let bytes = 0, text = "";
        while (true) {
          const { done, value } = await reader.read(); valid(!controller.signal.aborted); if (done) break;
          valid(value instanceof Uint8Array && (bytes += value.byteLength) <= 131072);
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode(); const body: unknown = JSON.parse(text); let nodes = 0;
        const inspect = (value: unknown, depth: number) => {
          valid(++nodes <= 20000 && depth <= 28);
          if (value === null || typeof value === "boolean") return;
          if (typeof value === "number") { valid(Number.isSafeInteger(value)); return; }
          if (typeof value === "string") {
            valid(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)); return;
          }
          valid(value !== null && typeof value === "object");
          for (const [key, nested] of Object.entries(value)) { inspect(key, depth + 1); inspect(nested, depth + 1); }
        };
        inspect(body, 0);
        valid(body !== null && typeof body === "object" && !Array.isArray(body) &&
          Object.hasOwn(body, "hash") && (body as Record<string, unknown>).hash === artifact.transactionHash);
        return freeze({ kind: "d1_initial_submission_response", revision: 1, verification: "unverified",
          transactionHash: artifact.transactionHash, response: body as Record<string, unknown> });
      };
      return await Promise.race([work(), deadline]);
    } finally {
      clearTimeout(timer); controller.abort();
      // Cancellation must not turn a known timeout into an unbounded await.
      try { void reader?.cancel().catch(() => {}); } catch { /* gate sanitizes transport failures */ }
    }
  });
}
