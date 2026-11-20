import type { CustodyHandler } from "./handler.ts";

const canonical = "/functions/v1/d1-custody";
export const VIDEO_AUTO_PREFIX = canonical + "/video-auto";
const routes = new Set([
  "config", "prepare", "issue", "reconcile", "status", "donor-payment-status",
  "refund", "refund-status", "refund-reconcile", "refund-remainder",
  "refund-remainder-status", "refund-remainder-reconcile", "internal-refund-tick",
]);
const unavailable = () => Response.json({ error: "custody_unavailable" }, {
  status: 503, headers: { "cache-control": "no-store" },
});
function construct(factory: () => CustodyHandler): CustodyHandler | undefined {
  try { return factory(); } catch { return undefined; }
}

/** Fixed route ownership, not a request-controlled pool selector. Factories run once. */
export function createIndependentCustodyRouter(
  manualFactory: () => CustodyHandler,
  videoFactory: () => CustodyHandler,
): CustodyHandler {
  const manual = construct(manualFactory), video = construct(videoFactory);
  return async request => {
    const url = new URL(request.url);
    let decoded = url.pathname;
    try { decoded = decodeURIComponent(decoded); } catch { /* No permissive decoding. */ }
    if (url.pathname.startsWith(VIDEO_AUTO_PREFIX) || decoded.startsWith(VIDEO_AUTO_PREFIX)) {
      const suffix = url.pathname.slice(VIDEO_AUTO_PREFIX.length + 1);
      if (!url.pathname.startsWith(VIDEO_AUTO_PREFIX + "/") || !routes.has(suffix)) return Response.json({ error: "not_found" }, {
        status: 404, headers: { "cache-control": "no-store" },
      });
      if (!video) return unavailable();
      // Setting pathname retains even empty query/fragment delimiters in href.
      // Forward the original bytes and headers; never parse or rewrite signed JSON.
      url.pathname = canonical + "/" + suffix;
      return video(new Request(url, request));
    }
    return manual ? manual(request) : unavailable();
  };
}
