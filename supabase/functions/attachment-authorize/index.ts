// @ts-nocheck
// Supabase Edge Function: attachment-authorize
// Genera una URL firmada de subida para un adjunto de un bundle.

import { createClient } from 'npm:@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

  const bundleId = String(body.bundle_id ?? '');
  const contentHash = String(body.content_hash ?? '');

  if (!bundleId || !contentHash) {
    return jsonResponse({ error: 'missing_bundle_or_content' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: bundle } = await supabase
    .from('origin_bundles')
    .select('incident_id')
    .eq('message_id', bundleId)
    .maybeSingle();

  const incidentId = bundle?.incident_id;
  if (!incidentId) {
    return jsonResponse({ error: 'bundle_not_found' }, 404);
  }

  const path = `${incidentId}/${contentHash}`;

  const { data: signed, error } = await supabase.storage
    .from('incident-attachments')
    .createSignedUploadUrl(path);

  if (error || !signed) {
    console.error('signed_url_error', error);
    return jsonResponse(
      { error: 'signed_url_failed', detail: error?.message },
      500,
    );
  }

  // Registra (o actualiza) el path de almacenamiento del adjunto.
  await supabase
    .from('attachments')
    .update({ storage_path: path })
    .eq('incident_id', incidentId)
    .eq('content_hash', contentHash);

  return jsonResponse({ upload_url: signed.signedUrl }, 200);
});
