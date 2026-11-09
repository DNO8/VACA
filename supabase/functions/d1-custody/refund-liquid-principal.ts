import { StrKey } from "@stellar/stellar-sdk";
import { CustodyError } from "./handler.ts";

export type PrincipalAsset =
  | { readonly type: "native" }
  | { readonly type: "issued"; readonly code: string; readonly issuer: string };
export interface PrincipalDonation {
  readonly operationId: string;
  readonly transactionHash: string;
  readonly donor: string;
  readonly asset: PrincipalAsset;
  readonly amountStroops: string;
}
export interface PrincipalEncumbrance {
  readonly operationId: string;
  readonly paymentTransactionHash: string;
  readonly donor: string;
  readonly asset: PrincipalAsset;
  readonly amountStroops: string;
  readonly claimableBalanceId: string;
}
export interface RefundLiquidPrincipalInput {
  readonly donations: readonly PrincipalDonation[];
  readonly encumbrances: readonly PrincipalEncumbrance[];
  readonly currentClaimableBalanceIds: readonly string[];
  readonly native: Readonly<{ balance: string; sellingLiabilities: string; excludedHistorical: string }>;
  readonly issuedBalances: readonly Readonly<{ code: string; issuer: string; balance: string; sellingLiabilities: string }>[];
  readonly issuedExclusions: readonly Readonly<{ code: string; issuer: string; excludedHistorical: string }>[];
}
export interface RefundLiquidPrincipal {
  readonly donations: readonly Readonly<PrincipalDonation & { encumberedStroops: string; liquidPrincipalStroops: string }>[];
  readonly nativeLiquidPrincipalStroops: string;
  readonly issuedLiquidPrincipal: readonly Readonly<{ code: string; issuer: string; amountStroops: string }>[];
  readonly physicalOperatingCap: string;
}

type DTO = Record<string, unknown>;
const MAX = 9223372036854775807n;
function valid(v: unknown): asserts v { if (!v) throw new CustodyError("refund_liquid_principal_unavailable", 503); }
function bounded(v: bigint): bigint { valid(v >= 0n && v <= MAX); return v; }
function money(v: unknown, positive = false): bigint {
  valid(typeof v === "string" && /^(0|[1-9][0-9]{0,18})$/.test(v));
  const n = bounded(BigInt(v)); valid(!positive || n > 0n); return n;
}
/** Copy descriptor values only. Shared references are legal; cycles are not. */
function copy(value: unknown, active = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  valid(typeof value === "object" && !active.has(value));
  const array = Array.isArray(value), ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  valid(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype));
  valid(keys.every(k => typeof k === "string" && "value" in ds[k] && (ds[k].enumerable || (array && k === "length"))));
  active.add(value); let result: unknown;
  if (array) {
    const length = ds.length.value;
    valid(keys.length === length + 1);
    result = Array.from({ length }, (_, i) => { valid(Object.hasOwn(ds, i)); return copy(ds[String(i)].value, active); });
  } else result = Object.fromEntries(Object.entries(ds).map(([k, d]) => [k, copy(d.value, active)]));
  active.delete(value); return result;
}
function exact(v: unknown, keys: string): DTO {
  valid(v !== null && typeof v === "object" && !Array.isArray(v));
  valid(Object.keys(v).sort().join(",") === keys.split(",").sort().join(",")); return v as DTO;
}
function address(v: unknown) { valid(typeof v === "string" && StrKey.isValidEd25519PublicKey(v)); }
function assetKey(code: unknown, issuer: unknown): string {
  valid(typeof code === "string" && /^[A-Za-z0-9]{1,12}$/.test(code)); address(issuer); return code + ":" + issuer;
}
function asset(v: unknown): string {
  const a = exact(v, (v as DTO)?.type === "native" ? "type" : "type,code,issuer");
  if (a.type === "native") return "native";
  valid(a.type === "issued"); return assetKey(a.code, a.issuer);
}
function operationId(v: unknown) {
  valid(typeof v === "string" && /^[1-9][0-9]{0,19}$/.test(v)); const n = BigInt(v);
  valid(n <= 18446744073709551615n && n >> 32n > 0n && ((n >> 12n) & 1048575n) > 0n && (n & 4095n) > 0n);
}
function hash(v: unknown) { valid(typeof v === "string" && /^[0-9a-f]{64}$/.test(v)); }
function cbId(v: unknown) { valid(typeof v === "string" && /^00000000[0-9a-f]{64}$/.test(v)); }
function freeze<T>(v: T): T {
  if (v !== null && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v;
}
/** Normalized projection only: current IDs need trusted, fresh bound evidence.
 * Gross debt is unchanged; missing positive presence never discharges principal. */
export function calculateRefundLiquidPrincipal(input: RefundLiquidPrincipalInput): RefundLiquidPrincipal {
  try {
    const data = exact(copy(input), "donations,encumbrances,currentClaimableBalanceIds,native,issuedBalances,issuedExclusions") as unknown as RefundLiquidPrincipalInput;
    valid(Array.isArray(data.donations) && Array.isArray(data.encumbrances) && Array.isArray(data.currentClaimableBalanceIds) &&
      Array.isArray(data.issuedBalances) && Array.isArray(data.issuedExclusions));
    const donations = new Map<string, { donation: PrincipalDonation; key: string; gross: bigint; all: bigint; current: bigint }>();
    const grossTotals = new Map<string, bigint>();
    for (const d of data.donations) {
      exact(d, "operationId,transactionHash,donor,asset,amountStroops"); operationId(d.operationId); hash(d.transactionHash); address(d.donor);
      const key = asset(d.asset), gross = money(d.amountStroops, true);
      valid(!donations.has(d.operationId)); grossTotals.set(key, bounded((grossTotals.get(key) ?? 0n) + gross));
      donations.set(d.operationId, { donation: d, key, gross, all: 0n, current: 0n });
    }
    const balances = new Map<string, { code: string; issuer: string; available: bigint }>();
    for (const b of data.issuedBalances) {
      exact(b, "code,issuer,balance,sellingLiabilities"); const key = assetKey(b.code, b.issuer);
      valid(!balances.has(key)); balances.set(key, { code: b.code, issuer: b.issuer, available: bounded(money(b.balance) - money(b.sellingLiabilities)) });
    }
    const exclusions = new Map<string, bigint>();
    for (const e of data.issuedExclusions) {
      exact(e, "code,issuer,excludedHistorical"); const key = assetKey(e.code, e.issuer);
      valid(!exclusions.has(key) && balances.has(key)); exclusions.set(key, money(e.excludedHistorical));
    }
    valid(balances.size === exclusions.size);
    for (const d of donations.values()) valid(d.key === "native" || balances.has(d.key));
    const encumbrances = new Map<string, { operationId: string; amount: bigint }>();
    for (const e of data.encumbrances) {
      exact(e, "operationId,paymentTransactionHash,donor,asset,amountStroops,claimableBalanceId"); cbId(e.claimableBalanceId);
      const d = donations.get(e.operationId);
      valid(d && e.paymentTransactionHash === d.donation.transactionHash && e.donor === d.donation.donor && asset(e.asset) === d.key);
      const amount = money(e.amountStroops, true); d.all = bounded(d.all + amount); valid(d.all <= d.gross);
      valid(!encumbrances.has(e.claimableBalanceId)); encumbrances.set(e.claimableBalanceId, { operationId: e.operationId, amount });
    }
    const present = new Set<string>();
    for (const id of data.currentClaimableBalanceIds) {
      cbId(id); const e = encumbrances.get(id); valid(e && !present.has(id)); present.add(id);
      const d = donations.get(e.operationId)!; d.current = bounded(d.current + e.amount);
    }
    const liquid = new Map<string, bigint>([...balances.keys()].map(k => [k, 0n]));
    liquid.set("native", 0n);
    const projected = [...donations.values()].map(d => {
      const amount = bounded(d.gross - d.current); liquid.set(d.key, bounded((liquid.get(d.key) ?? 0n) + amount));
      return { ...d.donation, encumberedStroops: d.current.toString(), liquidPrincipalStroops: amount.toString() };
    });
    const issuedLiquidPrincipal = [...balances.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, b]) => {
      const amount = liquid.get(key)!; valid(b.available >= bounded(amount + exclusions.get(key)!));
      return { code: b.code, issuer: b.issuer, amountStroops: amount.toString() };
    });
    const n = exact(data.native, "balance,sellingLiabilities,excludedHistorical"), nativeLiquid = liquid.get("native")!;
    const protectedNative = bounded(money(n.sellingLiabilities) + nativeLiquid + money(n.excludedHistorical));
    const physicalOperatingCap = bounded(money(n.balance) - protectedNative);
    return freeze({ donations: projected, nativeLiquidPrincipalStroops: nativeLiquid.toString(), issuedLiquidPrincipal,
      physicalOperatingCap: physicalOperatingCap.toString() });
  } catch {
    throw new CustodyError("refund_liquid_principal_unavailable", 503);
  }
}
