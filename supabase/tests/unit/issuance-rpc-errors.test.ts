import { CustodyDatabase } from "../../functions/d1-custody/adapters.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("assertion failed");
}
const requestId = "00000000-0000-4000-8000-000000000001";
const malformed = [
  ["noncoercible object", { toString: null }],
  ["array resembling known code", ["deadline_expired"]],
  ["null", null], ["missing", undefined],
  ["prototype name", "toString"], ["constructor name", "constructor"],
  ["prototype accessor", "__proto__"], ["unknown string", "SECRET diagnostics"],
] as const;

for (const method of ["registerIssuanceIntent", "reserveIssuanceSequence"] as const) {
  for (const [label, message] of malformed) {
    Deno.test(`${method} sanitizes ${label} without retry`, async () => {
      const calls: unknown[] = [];
      const database = new CustodyDatabase({ rpc(name, args) {
        calls.push([name, args]);
        return Promise.resolve({ data: null, error: { code: "XX000", message } }) as never;
      } });
      let observed: unknown;
      try {
        await database[method](requestId, "trusted-backend-admin", "9007199254740993");
      } catch (error) {
        observed = error instanceof CustodyError
          ? [error.code, error.status, error.message] : "unsafe error";
      }
      equal(observed, ["dependency_unavailable", 503, "dependency_unavailable"]);
      equal(calls, [[method === "registerIssuanceIntent"
        ? "d1_register_issuance_intent" : "d1_reserve_issuance_sequence", {
        p_request_id: requestId, p_authorized_by: "trusted-backend-admin",
        ...(method === "reserveIssuanceSequence"
          ? { p_observed_account_sequence: "9007199254740993" } : {}),
      }]]);
    });
  }
}
