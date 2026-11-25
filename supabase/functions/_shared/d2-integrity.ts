export const MIN_WALLET_AGE_S = 86400;

/** Geohash6 interleaves 30 bits: 15 longitude bits and 15 latitude bits. */
export function publicCellCenter(latitude: number | null, longitude: number | null) {
  function axisCenter(value: number | null, low: number, high: number): number | null {
    if (value == null || !Number.isFinite(value) || value < low || value > high) return null;
    for (let bit = 0; bit < 15; bit++) {
      const middle = (low + high) / 2;
      if (value >= middle) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  }
  return {
    latitude: axisCenter(latitude, -90, 90),
    longitude: axisCenter(longitude, -180, 180),
  };
}

type Eligibility =
  | { status: 'eligible' }
  | { status: 'too_new'; retryAfter: number; eligibleAt: string }
  | { status: 'unavailable' };

/** Use the latest creation, never the latest funding or an earlier incarnation. */
export async function walletEligibility(
  voter: string,
  nowMs: number,
  fetcher: typeof fetch,
): Promise<Eligibility> {
  const url = new URL(`https://horizon-testnet.stellar.org/accounts/${encodeURIComponent(voter)}/effects`);
  url.searchParams.set('order', 'desc');
  url.searchParams.set('limit', '200');
  const signal = AbortSignal.timeout(10000);
  try {
    for (let page = 0; page < 10; page++) {
      const response = await fetcher(url.href, { signal });
      if (!response.ok) return { status: 'unavailable' };
      const body = await response.json();
      const records = body?._embedded?.records;
      if (!Array.isArray(records) || records.length === 0) return { status: 'unavailable' };
      for (const effect of records) {
        if (effect.account !== voter) continue;
        if (effect.type === 'account_removed') return { status: 'unavailable' };
        if (effect.type !== 'account_created') continue;
        const createdMs = Date.parse(effect.created_at);
        if (!Number.isFinite(createdMs) || createdMs > nowMs) return { status: 'unavailable' };
        const eligibleMs = createdMs + MIN_WALLET_AGE_S * 1000;
        return nowMs >= eligibleMs
          ? { status: 'eligible' }
          : {
            status: 'too_new',
            retryAfter: Math.ceil((eligibleMs - nowMs) / 1000),
            eligibleAt: new Date(eligibleMs).toISOString(),
          };
      }
      const cursor = records.at(-1)?.paging_token;
      if (records.length < 200 || typeof cursor !== 'string' || !cursor || cursor === url.searchParams.get('cursor')) {
        return { status: 'unavailable' };
      }
      url.searchParams.set('cursor', cursor);
    }
  } catch {
    // An outage, pruned history or incomplete evidence never admits a vote.
  }
  return { status: 'unavailable' };
}
