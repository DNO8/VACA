// Executes the real HTTP entrypoints with external database/SDK/time doubles.
// This does not replace Deno compilation, package resolution or live evidence.
import { existsSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

export const NOW = Date.parse('2026-10-27T12:00:00Z');
export const VOTER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
export const INCIDENT = 'test-incident';

export async function edge(slug, options = {}) {
  const state = structuredClone({
    incidents: options.incidents ?? [{
      incident_id: INCIDENT, category: 'sos', priority: 1, people_count: 2,
      latitude: -33.4489, longitude: -70.6693, status: 'received',
      donation_status: 'signal', votes: 0, created_at: '2026-10-26T12:00:00Z',
      claim_tx_hash: null,
    }],
    vaquita_votes: options.votes ?? [],
  });
  const initialState = JSON.stringify(state);
  const requests = [];
  const calls = [];
  function from(table) {
    let filters = [], maximum = Infinity, columns, update;
    const result = () => {
      const rows = state[table].filter(row => filters.every(([key, value]) => row[key] === value))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, maximum);
      if (update) rows.forEach(row => Object.assign(row, update));
      return rows.map(row => columns
        ? Object.fromEntries(columns.split(',').map(key => key.trim()).map(key => [key, row[key]]))
        : structuredClone(row));
    };
    return {
      select(value) { columns = value; return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      order() { return this; },
      limit(value) { maximum = value; return this; },
      update(value) { update = value; return this; },
      async maybeSingle() { return { data: result()[0] ?? null, error: null }; },
      async insert(value) {
        if (state[table].some(row => row.voter_key === value.voter_key && row.incident_id === value.incident_id)) {
          return { error: { code: '23505' } };
        }
        state[table].push({ ...value, created_at: new Date(NOW).toISOString() });
        return { error: null };
      },
      then(resolve, reject) { return Promise.resolve({ data: result(), error: null }).then(resolve, reject); },
    };
  }
  const db = {
    from,
    async rpc(name, args) {
      if (name !== 'increment_incident_votes') throw new Error(`Unexpected RPC: ${name}`);
      const row = state.incidents.find(row => row.incident_id === args.p_incident);
      row.votes += args.p_delta;
      return { data: row.votes, error: null };
    },
  };
  const Horizon = { Server: class {
    constructor() { calls.push('proof'); }
    transactions() { return { transaction: () => ({ call: async () => ({ source_account: options.invalidProof ? 'wrong' : VOTER }) }) }; }
    operations() { return { forTransaction: () => ({ call: async () => ({ records: [{ type: 'manage_data', name: 'vq-vote', value: INCIDENT }] }) }) }; }
  } };
  const fetcher = async (input) => {
    const url = new URL(input);
    if (url.origin !== 'https://horizon-testnet.stellar.org' || url.pathname !== `/accounts/${VOTER}/effects`) {
      throw new Error(`Unexpected external request: ${url}`);
    }
    requests.push(url);
    calls.push('age');
    if (options.unavailable) throw new Error('Horizon unavailable');
    const page = requests.length - 1;
    return Response.json({ _embedded: { records: options.effectsPages?.[page] ?? [{
      type: 'account_created', account: VOTER, paging_token: '1',
      created_at: new Date(options.createdAt ?? NOW - 172800000).toISOString(),
    }] } });
  };
  class Clock extends Date { static now() { return NOW; } }
  const helpersPath = new URL('../functions/_shared/d2-integrity.ts', import.meta.url);
  const helpers = existsSync(helpersPath) ? await import(helpersPath.href) : {};
  let handler;
  const context = vm.createContext({
    ...helpers, createClient: () => { calls.push('database'); return db; }, Horizon, Date: Clock,
    Request, Response, URL, atob, AbortSignal, fetch: fetcher,
    Deno: { env: { get: () => options.unconfigured ? undefined : 'test-only-placeholder' }, serve: value => { handler = value; } },
  });
  const sourcePath = options.sourcePath ?? new URL(`../functions/${slug}/index.ts`, import.meta.url);
  const source = stripTypeScriptTypes(readFileSync(sourcePath, 'utf8'), { mode: 'strip' })
    .replace(/^import\s+.*?\s+from\s+['"].*?['"];?\r?$/gm, '');
  new vm.Script(source, { filename: `${slug}/index.ts` }).runInContext(context);
  return {
    request: (method = 'POST', body = { incident_id: INCIDENT, public_key: VOTER, tx_hash: 'test-hash' }, query = `voter=${VOTER}`) =>
      handler(new Request(`https://edge.invalid/${slug}?${query}`, {
        method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      })),
    state, initialState, requests, calls,
  };
}
