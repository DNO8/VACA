// Preparation plus private donor historical reads; NOT a complete D1 lifecycle.
import { Keypair } from "@stellar/stellar-sdk";
import { createClient } from "@supabase/supabase-js";
import { createCustodyRuntime } from "./runtime.ts";
import { CustodyDatabase, TestnetPayments } from "./adapters.ts";

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing custody configuration");
  return value;
}

// Public-only key intentionally makes this incomplete foundation unable to sign.
// The durable intent/reconciliation lifecycle must precede adding a secret signer.
const pool = Keypair.fromPublicKey(required("D1_POOL_PUBLIC_KEY"));
const database = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
Deno.serve(createCustodyRuntime({
  poolSigner: pool,
  ledger: new TestnetPayments(),
  database: new CustodyDatabase(database),
}, undefined, {
  // Reuse the actual server-created client, privately. No administrator adapter,
  // extra grant, signer or lifecycle activation is needed for this read mount.
  client: database,
  configuration: {
    // Resolve only inside the donor verifier: absent/invalid namespace yields
    // donor 503 without preventing startup or disabling existing routes.
    // There is no default namespace and no request-derived configuration.
    get namespace() { return required("D1_NAMESPACE"); },
    pool: pool.publicKey(),
    now: () => Math.floor(Date.now() / 1000),
  },
}));
