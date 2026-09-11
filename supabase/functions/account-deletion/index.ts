// @ts-nocheck
// Supabase Edge Function: account-deletion
// Recibe una solicitud de borrado de cuenta, valida el portador y programa
// la eliminacion de la identidad y los incidentes asociados.

import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { authenticateDeviceRequest } from '../_shared/device-auth.ts';

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse({ error: 'server_not_configured' }, 503);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const devicePublicKey = String(body.device_public_key ?? '');
  if (!devicePublicKey) {
    return jsonResponse({ error: 'missing_device_public_key' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  const authenticatedKey = await authenticateDeviceRequest(
    req,
    supabase,
    'account-deletion',
    [devicePublicKey],
  );
  if (authenticatedKey !== devicePublicKey) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const { data: identity, error: identityError } = await supabase
    .from('identities')
    .select('id')
    .eq('device_public_key', devicePublicKey)
    .maybeSingle();
  if (identityError) return jsonResponse({ error: 'lookup_failed' }, 500);
  if (!identity) return jsonResponse({ deleted: false, reason: 'not_found' }, 404);

  const { error: deleteError } = await supabase.rpc('delete_identity_data', {
    p_device_public_key: devicePublicKey,
  });
  if (deleteError) {
    console.error('deletion_error', deleteError);
    return jsonResponse({ error: 'deletion_failed' }, 500);
  }

  return jsonResponse({ deleted: true }, 200);
});
