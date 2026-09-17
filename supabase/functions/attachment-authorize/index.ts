// @ts-nocheck
// Supabase Edge Function: attachment-authorize
// Genera una URL firmada de subida para un adjunto de un bundle.

import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { authenticateDeviceRequestDetailed } from '../_shared/device-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-device-public-key, x-device-signature, x-device-timestamp, x-device-nonce',
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

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
  const bundleId = String(body.bundle_id ?? '');
  const contentHash = String(body.content_hash ?? '');
  if (!bundleId || !contentHash) {
    return jsonResponse({ error: 'missing_bundle_or_content' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  const auth = await authenticateDeviceRequestDetailed(
    req,
    supabase,
    'attachment-authorize',
    [bundleId, contentHash],
  );
  if (!auth.publicKey) {
    return jsonResponse({ error: 'unauthorized', reason: auth.reason }, 401);
  }
  const publicKey = auth.publicKey;

  const { data: bundle } = await supabase
    .from('origin_bundles')
    .select('incident_id, origin_public_key')
    .eq('message_id', bundleId)
    .maybeSingle();
  if (!bundle?.incident_id) return jsonResponse({ error: 'bundle_not_found' }, 404);
  if (bundle.origin_public_key !== publicKey) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  const { data: attachment } = await supabase
    .from('attachments')
    .select('content_hash')
    .eq('incident_id', bundle.incident_id)
    .eq('content_hash', contentHash)
    .maybeSingle();
  if (!attachment) return jsonResponse({ error: 'attachment_not_found' }, 404);

  const path = `${bundle.incident_id}/${contentHash}`;
  const { data: signed, error } = await supabase.storage
    .from('incident-attachments')
    .createSignedUploadUrl(path);
  if (error || !signed) return jsonResponse({ error: 'signed_url_failed' }, 500);

  await supabase
    .from('attachments')
    .update({ storage_path: path })
    .eq('incident_id', bundle.incident_id)
    .eq('content_hash', contentHash);

  // createSignedUploadUrl devuelve una ruta relativa (/storage/v1/...);
  // el cliente necesita la URL absoluta para el PUT.
  const uploadUrl = signed.signedUrl.startsWith('http')
    ? signed.signedUrl
    : `${supabaseUrl}${signed.signedUrl}`;
  return jsonResponse({ upload_url: uploadUrl }, 200);
});
