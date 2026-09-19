// @ts-nocheck
// Supabase Edge Function: vaquita-admin
// Curaduria Vaquita autenticada por wallet Stellar (Freighter u otra).
//
// Flujo: el admin firma un challenge canonico con su wallet; el servidor
// verifica la firma Ed25519 contra la clave publica y comprueba que la clave
// exista en public.admin_wallets. Solo entonces ejecuta la accion.
//
// Acciones:
//   check      → {admin: true} si la wallet tiene rol
//   set_status → UPDATE incidents.donation_status

import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { ed25519 } from 'npm:@noble/curves@2.3.0/ed25519.js';
import { StrKey } from 'npm:@stellar/stellar-sdk@13.3.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ACTIONS = new Set(['check', 'set_status']);
const STATUSES = new Set(['signal', 'community', 'vaquita']);
const MAX_SKEW_S = 300;

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'server_not_configured' }, 503);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const action = String(body.action ?? '');
  const publicKey = String(body.public_key ?? '');
  const signature = String(body.signature ?? '');
  const timestamp = Number(body.timestamp ?? 0);
  const incidentId = String(body.incident_id ?? '');
  const donationStatus = String(body.donation_status ?? '');

  if (!ACTIONS.has(action)) return jsonResponse({ error: 'bad_action' }, 400);
  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    return jsonResponse({ error: 'bad_public_key' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > MAX_SKEW_S) {
    return jsonResponse({ error: 'timestamp_skew' }, 401);
  }
  if (action === 'set_status') {
    if (!incidentId) return jsonResponse({ error: 'missing_incident' }, 400);
    if (!STATUSES.has(donationStatus)) {
      return jsonResponse({ error: 'bad_status' }, 400);
    }
  }

  // Challenge canonico — lo que la wallet firmo.
  const canonical = [
    'vaca-admin',
    action,
    incidentId,
    donationStatus,
    String(timestamp),
  ].join('\n');

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = decodeBase64(signature);
    if (signatureBytes.length !== 64) throw new Error('bad length');
  } catch {
    return jsonResponse({ error: 'bad_signature' }, 400);
  }

  // SEP-53: las wallets firman sha256(prefix + mensaje), no el mensaje crudo.
  const preimage = new TextEncoder().encode(
    `Stellar Signed Message:\n${canonical}`,
  );
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', preimage),
  );
  const keyBytes = StrKey.decodeEd25519PublicKey(publicKey);
  const valid = ed25519.verify(signatureBytes, digest, keyBytes);
  if (!valid) return jsonResponse({ error: 'signature_invalid' }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: admin } = await supabase
    .from('admin_wallets')
    .select('public_key, role')
    .eq('public_key', publicKey)
    .maybeSingle();
  if (!admin) return jsonResponse({ error: 'not_admin' }, 403);

  if (action === 'check') {
    return jsonResponse({ admin: true, role: admin.role }, 200);
  }

  const { error } = await supabase
    .from('incidents')
    .update({ donation_status: donationStatus })
    .eq('incident_id', incidentId);
  if (error) return jsonResponse({ error: 'update_failed' }, 500);

  return jsonResponse({ ok: true, incident_id: incidentId, donation_status: donationStatus }, 200);
});
