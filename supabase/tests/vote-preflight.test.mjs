import test from 'node:test';
import assert from 'node:assert/strict';
import { edge, NOW, VOTER } from './edge-harness.mjs';

const query = `voter=${VOTER}&check=wallet_age`;
function unchanged(app, response, calls = ['age']) {
  assert.equal(JSON.stringify(app.state), app.initialState);
  assert.deepEqual(app.calls, calls);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
}

test('preflight rejects one millisecond before 24h without proof or database access', async () => {
  const app = await edge('vaquita-vote', { createdAt: NOW - 86400000 + 1 });
  const response = await app.request('GET', undefined, query);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'wallet_too_new', message: 'Your Stellar account must be at least 24 hours old to vote.',
    min_age_s: 86400, retry_after: 1, eligible_at: '2026-10-27T12:00:00.001Z',
  });
  unchanged(app, response);
});

test('preflight explicitly clears age at and after 24h without recording a vote', async () => {
  for (const age of [86400000, 172800000]) {
    const app = await edge('vaquita-vote', { createdAt: NOW - age });
    const response = await app.request('GET', undefined, query);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { wallet_age_eligible: true });
    unchanged(app, response);
  }
});

test('preflight refuses unverifiable age and missing voter without writes', async () => {
  const app = await edge('vaquita-vote', { unavailable: true });
  const response = await app.request('GET', undefined, query);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'wallet_age_unavailable', message: 'Wallet age could not be verified. Please try again later.',
  });
  unchanged(app, response);
  const missing = await edge('vaquita-vote');
  const bad = await missing.request('GET', undefined, 'check=wallet_age');
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'bad_public_key' });
  unchanged(missing, bad, []);
});

test('legacy cooldown GET still does not consult age', async () => {
  const app = await edge('vaquita-vote', { unavailable: true, votes: [{
    incident_id: 'other', voter_key: VOTER, created_at: new Date(NOW - 2000).toISOString(),
  }] });
  const response = await app.request('GET');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { retry_after: 298, cooldown_s: 300 });
  assert.deepEqual(app.calls, ['database']);
  assert.equal(JSON.stringify(app.state), app.initialState);
});

test('final POST still validates proof and age even after a preflight', async () => {
  const app = await edge('vaquita-vote', { createdAt: NOW - 86400000 });
  assert.equal((await app.request('GET', undefined, query)).status, 200);
  const response = await app.request();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true, votes: 20, threshold: 20, donation_status: 'community', cooldown_s: 300,
  });
  assert.deepEqual(app.calls, ['age', 'proof', 'age', 'database']);
});
