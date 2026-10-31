import { CustodyDatabase } from "../../functions/d1-custody/adapters.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("assertion failed");
}
const requestId = "00000000-0000-4000-8000-000000000001";
const journalMethods = ["loadUnsignedTransaction", "saveUnsignedTransaction"] as const;
for (const method of journalMethods) {
  Deno.test(`${method} exact allowlist, typed result and method-scoped sanitized failures`, async () => {
    for (const error of [null, undefined, [], {}, { code: "40001", message: null },
      { message: null }, { message: ["deadline_expired"] },
      { message: { toString: null } }, ...["toString", "constructor", "__proto__", "SECRET",
        "unauthorized_admin_wallet", "deadline_expired", "unsigned_transaction_conflict",
        "invalid_unsigned_transaction", "d1_preparation_not_found", "d1_issuance_sequence_not_found",
        "issuance_source_busy"].map((message) => ({ message })),
      { code: "40001", message: "private" }]) {
      const calls: unknown[] = [], data = { receipt: true };
      const db = new CustodyDatabase({ rpc(name, args) {
        calls.push([name, args]); return Promise.resolve({ data, error }) as never;
      } });
      let observed;
      try { observed = method === "loadUnsignedTransaction" ? await db.loadUnsignedTransaction(requestId, "admin")
        : await db.saveUnsignedTransaction(requestId, "admin", "exact bytes", "exact hash"); }
      catch (e) { observed = e instanceof CustodyError ? [e.code, e.status, e.message] : "unsafe"; }
      const codes: Record<string, number> = { unauthorized_admin_wallet: 403, deadline_expired: 410,
        invalid_unsigned_transaction: 400, d1_preparation_not_found: 400,
        ...(method === "saveUnsignedTransaction" ? { unsigned_transaction_conflict: 409,
          d1_issuance_sequence_not_found: 400 } : {}) };
      const message = error && "message" in error ? error.message : undefined;
      const code = typeof message === "string" && error && "code" in error && error.code === "40001" ? "serialization_failure"
        : typeof message === "string" && Object.hasOwn(codes, message) ? message : "dependency_unavailable";
      equal(observed, error === null ? data : [code, codes[code] ?? 503, code]);
      equal(calls, [[method === "loadUnsignedTransaction" ? "d1_load_unsigned_transaction" : "d1_save_unsigned_transaction",
        { p_request_id: requestId, p_authorized_by: "admin", ...(method === "saveUnsignedTransaction"
          ? { p_unsigned_xdr: "exact bytes", p_transaction_hash: "exact hash" } : {}) }]]);
    }
  });
}
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
