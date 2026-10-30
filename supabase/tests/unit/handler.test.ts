import { Keypair } from "@stellar/stellar-sdk";
import { createCustodyHandler } from "../../functions/d1-custody/handler.ts";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("public pool routing exposes Testnet policy without signing material", async () => {
  const poolSigner = Keypair.random();
  const handler = createCustodyHandler({ poolSigner });
  const response = await handler(
    new Request("http://127.0.0.1/functions/v1/d1-custody/config"),
  );

  assert(response.status === 200, "Public configuration must succeed");
  assert(
    response.headers.get("content-type")?.startsWith("application/json") === true,
    "Public configuration must be JSON",
  );

  const body = await response.json();
  assert(
    !JSON.stringify(body).includes(poolSigner.secret()),
    "Pool signing material must remain server-side",
  );
  assert(
    Object.keys(body).sort().join(",") === "donation_ttl_seconds,network,pool_public_key",
    "Public configuration must expose only its documented fields",
  );
  assert(body.network === "TESTNET", "D1 must route only to Testnet");
  assert(body.pool_public_key === poolSigner.publicKey(), "Routing must use the backend pool");
  assert(body.donation_ttl_seconds === 300, "The accepted five-minute duration must be explicit");
});
