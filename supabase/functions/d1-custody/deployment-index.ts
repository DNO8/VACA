import { createClient } from "@supabase/supabase-js";
import { createDeploymentRuntime, createVideoAutoRuntime } from "./deployment-runtime.ts";
import { createDeploymentRpcClient } from "./deployment-rpc-client.ts";
import { createIndependentCustodyRouter } from "./deployment-routing.ts";

const dependencies = { getEnv: (name: string) => Deno.env.get(name),
  clientFactory: (url: string, key: string) => createDeploymentRpcClient(createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })), fetcher: globalThis.fetch.bind(globalThis), now: () => Math.floor(Date.now() / 1000) };
Deno.serve(createIndependentCustodyRouter(
  () => createDeploymentRuntime(dependencies), () => createVideoAutoRuntime(dependencies),
));
