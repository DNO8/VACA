import type { CustodyDatabase } from "./adapters.ts";

type RpcClient = ConstructorParameters<typeof CustodyDatabase>[0];

/** Strip SDK transport metadata, never financial DTO fields or database errors. */
export function createDeploymentRpcClient(client: RpcClient): RpcClient {
  const invoke = client.rpc.bind(client);
  return Object.freeze({
    async rpc(name: string, args: Record<string, unknown>) {
      const reply = await invoke(name, args);
      if (reply === null || typeof reply !== "object" || Array.isArray(reply)) {
        throw new Error("invalid_rpc_response");
      }
      const data = Object.getOwnPropertyDescriptor(reply, "data");
      const error = Object.getOwnPropertyDescriptor(reply, "error");
      if (!data || !("value" in data) || !error || !("value" in error)) {
        throw new Error("invalid_rpc_response");
      }
      // Downstream validators retain ownership of exact domain shape validation.
      return Object.freeze({ data: data.value, error: error.value });
    },
  });
}
