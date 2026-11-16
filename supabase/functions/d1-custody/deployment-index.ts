import { createClient } from "@supabase/supabase-js";
import { createDeploymentRuntime } from "./deployment-runtime.ts";

let handler: ReturnType<typeof createDeploymentRuntime> | undefined;
try {
  handler = createDeploymentRuntime({ getEnv: name => Deno.env.get(name),
    clientFactory: (url, key) => createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }), fetcher: globalThis.fetch.bind(globalThis), now: () => Math.floor(Date.now() / 1000) });
} catch { /* Preserve the deployed startup failure without exposing configuration. */ }
Deno.serve(request => handler ? handler(request) : Response.json({ error: "custody_unavailable" }, {
  status: 503, headers: { "cache-control": "no-store" },
}));
