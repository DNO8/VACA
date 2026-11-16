import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { readRefundAutomaticConfiguration } from "../../functions/d1-custody/refund-automatic-configuration.ts";
import { equal, pool, poolKey, adminKey, admin, namespace, token } from "../fixtures/automatic-refund.ts";
function environment(): Record<string, string | undefined> {
  return { D1_AUTOMATIC_REFUNDS_ENABLED: "true", D1_NAMESPACE: namespace, D1_REFUND_SERVICE_ACTOR: admin,
    D1_REFUND_TICK_TOKEN: token, D1_REFUND_FEE_PER_OPERATION_STROOPS: "100", D1_REFUND_TRANSACTION_LIFETIME_SECONDS: "60",
    D1_REFUND_POOL_SECRET_KEY: poolKey.secret() };
}
function rejects(env: Record<string, string | undefined>) {
  let caught: unknown;
  try { readRefundAutomaticConfiguration(k => env[k], pool); } catch (error) { caught = error; }
  equal(caught instanceof Error, true); equal((caught as Error).message, "automatic_refund_configuration_unavailable");
  equal(Object.hasOwn(caught as Error, "cause"), false);
}
Deno.test("automatic configuration: disabled reads flag only and never needs keys", () => {
  for (const flag of [undefined, "false"]) {
    const reads: string[] = [];
    equal(readRefundAutomaticConfiguration(k => { reads.push(k); if (k !== "D1_AUTOMATIC_REFUNDS_ENABLED") throw Error("secret access"); return flag; }, "invalid pool"), null);
    equal(reads, ["D1_AUTOMATIC_REFUNDS_ENABLED"]);
  }
});
Deno.test("automatic configuration: strict enabled flag and required scope", () => {
  for (const patch of [{ D1_AUTOMATIC_REFUNDS_ENABLED: "TRUE" }, { D1_NAMESPACE: namespace.toUpperCase().replace("1", "A") },
    { D1_NAMESPACE: undefined }, { D1_REFUND_SERVICE_ACTOR: "bad" }, { D1_REFUND_TICK_TOKEN: "A".repeat(42) }]) rejects({ ...environment(), ...patch });
});
Deno.test("automatic configuration: numeric policy boundaries and canonical decimals", () => {
  for (const [key, bad] of Object.entries({ D1_REFUND_MAX_BATCH_SIZE: ["0", "51", "01", "1\n"],
    D1_REFUND_FEE_PER_OPERATION_STROOPS: ["0", "4294967296"], D1_REFUND_TRANSACTION_LIFETIME_SECONDS: ["0", "601"],
    D1_REFUND_MAX_AGE_SECONDS: ["0", "31"], D1_REFUND_FUTURE_TOLERANCE_SECONDS: ["-1", "3"] }))
    for (const value of bad) rejects({ ...environment(), [key]: value });
  for (const max of ["1", "50"]) {
    const env: Record<string, string | undefined> = { ...environment(), D1_REFUND_MAX_BATCH_SIZE: max };
    equal(readRefundAutomaticConfiguration(k => env[k], pool)?.maxBatchSize, Number(max));
  }
});
Deno.test("automatic configuration: signer is bound to pool with no substitute key or later environment lookup", () => {
  const env = environment(), reads: string[] = [];
  const config = readRefundAutomaticConfiguration(k => { reads.push(k); return env[k]; }, pool)!;
  equal([config.namespace, config.actor, config.pool, config.network, config.maxBatchSize], [namespace, admin, pool, "TESTNET", 1]);
  equal(Object.isFrozen(config), true); equal(Object.isFrozen(config.financial), true);
  const count = reads.length; env.D1_REFUND_POOL_SECRET_KEY = adminKey.secret();
  const first = config.financial.loadPoolSigner(pool) as Keypair, second = config.financial.loadPoolSigner(pool) as Keypair;
  equal([first.publicKey(), second.publicKey(), first === second, reads.length], [pool, pool, false, count]);
  const message = Buffer.from([1, 2, 3]); equal(Keypair.fromPublicKey(pool).verify(message, first.sign(message)), true);
  let caught: unknown; try { config.financial.loadPoolSigner(admin); } catch (error) { caught = error; }
  equal((caught as Error).message, "automatic_refund_configuration_unavailable"); equal(reads.length, count);
});
Deno.test("automatic configuration: malformed or foreign secret never echoes SDK diagnostics or substitutes", () => {
  for (const secret of [undefined, "private secret sentinel", "S".repeat(56), adminKey.secret()])
    rejects({ ...environment(), D1_REFUND_POOL_SECRET_KEY: secret });
});
