// Preparation, donor reads and opt-in automatic refunds; not initial-issuance activation.
import { Keypair } from "@stellar/stellar-sdk";
import { createClient } from "@supabase/supabase-js";
import { createCustodyRuntime } from "./runtime.ts";
import { CustodyDatabase, TestnetPayments } from "./adapters.ts";
import { HorizonDiscoverySource } from "./discovery-source.ts";
import { readRefundAutomaticConfiguration } from "./refund-automatic-configuration.ts";
import { createRefundAutomaticPage } from "./refund-automatic-page.ts";
import { createRefundAutomaticHttp } from "./refund-automatic-http.ts";

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing custody configuration");
  return value;
}

// Keep the foundation public-only. The optional refund signer below is never
// supplied to preparation, donor reads or the initial-issuance lifecycle.
const pool = Keypair.fromPublicKey(required("D1_POOL_PUBLIC_KEY"));
const database = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const base = createCustodyRuntime({
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
});

// Disabled or malformed private configuration must not break existing routes.
// This default has no execution capability and answers the exact tick route503.
let automatic = createRefundAutomaticHttp();
try {
  const configuration = readRefundAutomaticConfiguration(name => Deno.env.get(name), pool.publicKey());
  if (configuration !== null) {
    const { token, ...pageConfiguration } = configuration;
    const fetcher = globalThis.fetch.bind(globalThis);
    const runPage = createRefundAutomaticPage({
      ...pageConfiguration,
      client: database,
      now: () => Math.floor(Date.now() / 1000),
      source: new HorizonDiscoverySource(fetcher),
      fetcher,
    });
    automatic = createRefundAutomaticHttp({
      token,
      maxBatchSize: configuration.maxBatchSize,
      runPage: after => runPage(after, configuration.maxBatchSize),
    });
  }
} catch { /* Never expose configuration values, SDK diagnostics or private keys. */ }
const internalRefund = automatic;
Deno.serve(request => new URL(request.url).pathname === "/functions/v1/d1-custody/internal-refund-tick"
  ? internalRefund(request)
  : base(request));
