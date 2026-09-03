// @ts-nocheck
// Supabase Edge Function: account-deletion
// Recibe una solicitud de borrado de cuenta, valida el portador y programa
// la eliminacion de la identidad y los incidentes asociados.

import { createClient } from 'npm:@supabase/supabase-js';

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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseServiceRoleKey || !anonKey) {
    return jsonResponse({ error: 'server_not_configured' }, 503);
  }

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== anonKey) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const devicePublicKey = String(body.device_public_key ?? '');
  if (!devicePublicKey) {
    return jsonResponse({ error: 'missing_device_public_key' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  // Eliminacion en cascada controlada: primero incidentes, luego identidad.
  // Las FK con on delete cascade se encargan del resto.
  const { data: identity, error: identityError } = await supabase
    .from('identities')
    .select('id')
    .eq('device_public_key', devicePublicKey)
    .maybeSingle();

  if (identityError) {
    return jsonResponse({ error: 'lookup_failed' }, 500);
  }
  if (!identity) {
    return jsonResponse({ deleted: false, reason: 'not_found' }, 404);
  }

  // Borra incidentes asociados a eventos firmados con esta clave.
  const { error: deleteError } = await supabase.rpc('delete_identity_data', {
    p_device_public_key: devicePublicKey,
  });

  if (deleteError) {
    console.error('deletion_error', deleteError);
    return jsonResponse(
      { error: 'deletion_failed', detail: deleteError.message },
      500,
    );
  }

  return jsonResponse({ deleted: true, device_public_key: devicePublicKey }, 200);
});
