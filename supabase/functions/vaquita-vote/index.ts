// @ts-nocheck
// Recovered from deployed vaquita-vote v7; original Git history is unavailable.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { Horizon } from 'npm:@stellar/stellar-sdk@13.3.0';
import { MIN_WALLET_AGE_S, walletEligibility } from '../_shared/d2-integrity.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const VOTE_DATA_NAME = 'vq-vote';
const VOTE_WEIGHT = 20;
const VOTE_THRESHOLD = 20;
const COOLDOWN_S = 300;

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

async function verifyVoteTx(txHash: string, voter: string, incidentId: string): Promise<boolean> {
  const server = new Horizon.Server(HORIZON_URL);
  try {
    const tx = await server.transactions().transaction(txHash).call();
    if (tx.source_account !== voter) return false;
    const ops = await server.operations().forTransaction(txHash).call();
    return ops.records.some(
      (op: any) =>
        op.type === 'manage_data' &&
        op.name === VOTE_DATA_NAME &&
        (op.value === incidentId ||
          (() => {
            try { return atob(op.value) === incidentId; } catch { return false; }
          })()),
    );
  } catch { return false; }
}

/** Advisory age check only: never verify a transaction or access the vote database. */
async function walletAgeResponse(voter: string): Promise<Response> {
  if (!voter) return jsonResponse({ error: 'bad_public_key' }, 400);
  const eligibility = await walletEligibility(voter, Date.now(), fetch);
  if (eligibility.status === 'unavailable') {
    return jsonResponse({
      error: 'wallet_age_unavailable',
      message: 'Wallet age could not be verified. Please try again later.',
    }, 503);
  }
  if (eligibility.status === 'too_new') {
    return jsonResponse({
      error: 'wallet_too_new',
      message: 'Your Stellar account must be at least 24 hours old to vote.',
      min_age_s: MIN_WALLET_AGE_S,
      retry_after: eligibility.retryAfter,
      eligible_at: eligibility.eligibleAt,
    }, 403);
  }
  return jsonResponse({ wallet_age_eligible: true }, 200);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return jsonResponse({ error: 'server_not_configured' }, 503);
  }
  if (req.method === 'GET') {
    const voter = new URL(req.url).searchParams.get('voter') ?? '';
    if (new URL(req.url).searchParams.get('check') === 'wallet_age') {
      const response = await walletAgeResponse(voter);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
    if (!voter) return jsonResponse({ error: 'bad_public_key' }, 400);
    const { data: lastVote } = await serviceClient()
      .from('vaquita_votes').select('created_at').eq('voter_key', voter)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    let retryAfter = 0;
    if (lastVote) {
      const elapsed = Math.floor(Date.now() / 1000) -
        Math.floor(new Date(lastVote.created_at).getTime() / 1000);
      retryAfter = Math.max(0, COOLDOWN_S - elapsed);
    }
    return jsonResponse({ retry_after: retryAfter, cooldown_s: COOLDOWN_S }, 200);
  }
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }
  const incidentId = String(body.incident_id ?? '');
  const voter = String(body.public_key ?? '');
  const txHash = String(body.tx_hash ?? '');
  if (!incidentId) return jsonResponse({ error: 'missing_incident' }, 400);
  if (!voter || !txHash) return jsonResponse({ error: 'missing_proof' }, 400);
  if (!(await verifyVoteTx(txHash, voter, incidentId))) {
    return jsonResponse({ error: 'tx_invalid' }, 401);
  }
  const nowMs = Date.now();
  const eligibility = await walletEligibility(voter, nowMs, fetch);
  if (eligibility.status === 'unavailable') {
    return jsonResponse({
      error: 'wallet_age_unavailable',
      message: 'Wallet age could not be verified. Please try again later.',
    }, 503);
  }
  if (eligibility.status === 'too_new') {
    return jsonResponse({
      error: 'wallet_too_new',
      message: 'Your Stellar account must be at least 24 hours old to vote.',
      min_age_s: MIN_WALLET_AGE_S,
      retry_after: eligibility.retryAfter,
      eligible_at: eligibility.eligibleAt,
    }, 403);
  }
  const supabase = serviceClient();
  const now = Math.floor(Date.now() / 1000);
  const { data: lastVote } = await supabase
    .from('vaquita_votes').select('created_at').eq('voter_key', voter)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (lastVote) {
    const elapsed = now - Math.floor(new Date(lastVote.created_at).getTime() / 1000);
    if (elapsed < COOLDOWN_S) {
      return jsonResponse({ error: 'cooldown', retry_after: COOLDOWN_S - elapsed }, 429);
    }
  }
  const { error: insertError } = await supabase.from('vaquita_votes')
    .insert({ incident_id: incidentId, voter_key: voter, tx_hash: txHash });
  if (insertError) {
    if (insertError.code === '23505') return jsonResponse({ error: 'already_voted' }, 409);
    return jsonResponse({ error: 'vote_failed' }, 500);
  }
  const { data: votes, error: rpcError } = await supabase.rpc(
    'increment_incident_votes', { p_incident: incidentId, p_delta: VOTE_WEIGHT },
  );
  if (rpcError) return jsonResponse({ error: 'count_failed' }, 500);
  let donationStatus: string | null = null;
  if (votes >= VOTE_THRESHOLD) {
    const { data: updated } = await supabase.from('incidents')
      .update({ donation_status: 'community' }).eq('incident_id', incidentId)
      .eq('donation_status', 'signal').select('donation_status').maybeSingle();
    donationStatus = updated?.donation_status ?? null;
  }
  return jsonResponse({
    ok: true, votes, threshold: VOTE_THRESHOLD,
    donation_status: donationStatus, cooldown_s: COOLDOWN_S,
  }, 200);
});
