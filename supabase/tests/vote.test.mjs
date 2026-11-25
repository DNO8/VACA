import test from 'node:test';
import assert from 'node:assert/strict';
import { edge, INCIDENT, NOW, VOTER } from './edge-harness.mjs';

test('a wallet younger than 24 hours cannot record or promote a vote', async () => {
  const app = await edge('vaquita-vote', { createdAt: NOW - 86399000 });
  const response = await app.request();
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, 'wallet_too_new');
  assert.equal(body.min_age_s, 86400);
  assert.equal(body.retry_after, 1);
  assert.match(body.message, /24 hours/);
  assert.equal(JSON.stringify(app.state), app.initialState);
  const cooldown = await app.request('GET');
  assert.deepEqual(await cooldown.json(), { retry_after: 0, cooldown_s: 300 });
});

test('a wallet exactly 24 hours old retains the accepted-vote response and cooldown', async () => {
  const app = await edge('vaquita-vote', { createdAt: NOW - 86400000 });
  const response = await app.request();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true, votes: 20, threshold: 20, donation_status: 'community', cooldown_s: 300,
  });
  const cooldown = await app.request('GET');
  assert.equal(cooldown.status, 200);
  assert.deepEqual(await cooldown.json(), { retry_after: 300, cooldown_s: 300 });
});

test('an aged wallet retains the existing cooldown rejection without mutation', async () => {
  const app = await edge('vaquita-vote', { votes: [{
    incident_id: 'other', voter_key: VOTER, created_at: new Date(NOW - 2000).toISOString(),
  }] });
  const response = await app.request();
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'cooldown', retry_after: 298 });
  assert.equal(JSON.stringify(app.state), app.initialState);
});

test('an aged wallet retains duplicate-vote rejection without mutation', async () => {
  const app = await edge('vaquita-vote', { votes: [{
    incident_id: INCIDENT, voter_key: VOTER, created_at: new Date(NOW - 301000).toISOString(),
  }] });
  const response = await app.request();
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'already_voted' });
  assert.equal(JSON.stringify(app.state), app.initialState);
});

test('invalid proof retains its existing response without mutation', async () => {
  const app = await edge('vaquita-vote', { invalidProof: true });
  const response = await app.request();
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'tx_invalid' });
  assert.equal(JSON.stringify(app.state), app.initialState);
});

test('unavailable account-age evidence fails closed without mutation', async () => {
  const app = await edge('vaquita-vote', { unavailable: true });
  const response = await app.request();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'wallet_age_unavailable');
  assert.equal(JSON.stringify(app.state), app.initialState);
});

test('recreating an old account does not inherit its previous voting age', async () => {
  const app = await edge('vaquita-vote', { effectsPages: [[
    { type: 'account_created', account: VOTER, created_at: new Date(NOW - 1000).toISOString(), paging_token: '3' },
    { type: 'account_removed', account: VOTER, paging_token: '2' },
    { type: 'account_created', account: VOTER, created_at: '2026-09-01T00:00:00Z', paging_token: '1' },
  ]] });
  const response = await app.request();
  assert.equal(response.status, 403);
  assert.equal((await response.json()).retry_after, 86399);
  assert.equal(JSON.stringify(app.state), app.initialState);
});

test('recent funding and paginated activity do not reset an old account age', async () => {
  const activity = Array.from({ length: 200 }, (_, index) => ({
    type: 'account_credited', account: VOTER, paging_token: String(400 - index),
    created_at: new Date(NOW - 1000).toISOString(),
  }));
  const app = await edge('vaquita-vote', { effectsPages: [activity, [{
    type: 'account_created', account: VOTER, paging_token: '1',
    created_at: '2026-09-01T00:00:00Z',
  }]] });
  const response = await app.request();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).votes, 20);
});

test('history beyond the documented lookup bound cannot admit a vote', async () => {
  const pages = Array.from({ length: 10 }, (_, page) => Array.from({ length: 200 }, (_, index) => ({
    type: 'account_credited', account: VOTER,
    paging_token: String(3000 - page * 200 - index),
    created_at: new Date(NOW - 1000).toISOString(),
  })));
  const app = await edge('vaquita-vote', { effectsPages: pages });
  const response = await app.request();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'wallet_age_unavailable');
  assert.equal(JSON.stringify(app.state), app.initialState);
});
