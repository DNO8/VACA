// @ts-nocheck

import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { authenticateDeviceRequest } from '../_shared/device-auth.ts';

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const diditApiKey = Deno.env.get('DIDIT_API_KEY');
  const workflowId = Deno.env.get('DIDIT_WORKFLOW_ID');
  const callbackUrl = Deno.env.get('DIDIT_CALLBACK_URL');
  if (!supabaseUrl || !serviceRoleKey || !diditApiKey || !workflowId || !callbackUrl) {
    return jsonResponse({ error: 'server_not_configured' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }
  const devicePublicKey = String(body.device_public_key ?? '');
  const consentVersion = String(body.consent_version ?? '');
  if (!devicePublicKey || !consentVersion) {
    return jsonResponse({ error: 'missing_fields' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const authenticatedKey = await authenticateDeviceRequest(
    req,
    supabase,
    'kyc-session',
    [devicePublicKey, consentVersion],
  );
  if (authenticatedKey !== devicePublicKey) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const response = await fetch('https://verification.didit.me/v3/session/', {
    method: 'POST',
    headers: {
      'x-api-key': diditApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      workflow_id: workflowId,
      vendor_data: `${consentVersion}_${devicePublicKey.slice(0, 16)}`,
      callback: callbackUrl,
      callback_method: 'both',
      metadata: { device_public_key: devicePublicKey },
    }),
  });
  const payload = await response.json();
  if (!response.ok) return jsonResponse({ error: 'provider_error' }, 502);

  return jsonResponse(
    {
      session_id: payload.session_id,
      session_token: payload.session_token,
    },
    200,
  );
});
