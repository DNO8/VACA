// @ts-nocheck
// Supabase Edge Function: kyc-webhook
// Recibe webhooks de Didit (https://didit.me) v3.0 y actualiza la identidad
// opaca del dispositivo. La clave publica del dispositivo viaja en
// metadata.device_public_key.

import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function shortenFloats(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(shortenFloats);
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = shortenFloats(value);
    }
    return result;
  }
  if (typeof obj === 'number' && Number.isInteger(obj)) {
    return Math.trunc(obj);
  }
  return obj;
}

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

function mapAssurance(status: string): string {
  if (status === 'Approved') return 'verified';
  if (status === 'Kyc Expired') return 'expired';
  return 'unverified';
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['verify'],
  );
}

async function verifySignatureV2(
  secret: string,
  rawBody: string,
  signature: string,
  timestamp: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(now - ts) > 300) return false;

  try {
    const parsed = JSON.parse(rawBody);
    const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));
    const key = await importHmacKey(secret);
    return await crypto.subtle.verify(
      'HMAC',
      key,
      hexToBytes(signature),
      new TextEncoder().encode(canonical),
    );
  } catch (_e) {
    return false;
  }
}

async function verifySignatureSimple(
  body: Record<string, unknown>,
  signature: string,
  timestamp: string,
  secret: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(now - ts) > 300) return false;

  const canonical = [
    String(body.timestamp ?? ''),
    String(body.session_id ?? ''),
    String(body.status ?? ''),
    String(body.webhook_type ?? ''),
  ].join(':');

  const key = await importHmacKey(secret);
  return await crypto.subtle.verify(
    'HMAC',
    key,
    hexToBytes(signature),
    new TextEncoder().encode(canonical),
  );
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('KYC_WEBHOOK_SECRET');

  if (!supabaseUrl || !supabaseServiceRoleKey || !webhookSecret) {
    return jsonResponse({ error: 'server_not_configured' }, 503);
  }

  const rawBody = await req.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(rawBody);
  } catch (_e) {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const signatureV2 = req.headers.get('x-signature-v2') || '';
  const signatureSimple = req.headers.get('x-signature-simple') || '';
  const timestamp = req.headers.get('x-timestamp') || '';

  if (signatureV2 || signatureSimple) {
    let verified = false;
    if (signatureV2) {
      verified = await verifySignatureV2(webhookSecret, rawBody, signatureV2, timestamp);
    }
    if (!verified && signatureSimple) {
      verified = await verifySignatureSimple(body, signatureSimple, timestamp, webhookSecret);
    }
    if (!verified) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }
  } else if (webhookSecret && !signatureV2 && !signatureSimple) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const eventType = String(body.webhook_type ?? '');

  // Solo procesamos eventos de sesion de KYC/KYB.
  if (!['status.updated', 'data.updated'].includes(eventType)) {
    return jsonResponse({ ignored: true, webhook_type: eventType }, 200);
  }

  // El cliente debe enviar la clave publica del dispositivo en
  // metadata.device_public_key al crear la sesion Didit.
  const metadata = body.metadata as Record<string, unknown> | undefined;
  const devicePublicKey = String(
    metadata?.device_public_key ?? metadata?.publicKey ?? body.device_public_key ?? ''
  );
  const provider = String(body.provider ?? 'didit');
  const externalId = String(body.session_id ?? body.external_id ?? '');
  const status = String(body.status ?? '');
  const assurance = mapAssurance(status);

  let verifiedAt: string | null = null;
  if (status === 'Approved' || status === 'Kyc Expired') {
    const decision = body.decision as Record<string, unknown> | undefined;
    const decisionCreatedAt = decision?.created_at;
    if (typeof decisionCreatedAt === 'string') {
      verifiedAt = decisionCreatedAt;
    } else {
      const ts = body.created_at ?? body.timestamp;
      verifiedAt = ts ? new Date(Number(ts) * 1000).toISOString() : new Date().toISOString();
    }
  }

  if (!devicePublicKey || !externalId || !status) {
    return jsonResponse({ error: 'missing_fields' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from('identities').upsert(
    {
      device_public_key: devicePublicKey,
      kyc_provider: provider,
      kyc_external_id: externalId,
      kyc_assurance: assurance,
      kyc_verified_at: verifiedAt,
    },
    { onConflict: 'device_public_key' },
  );

  if (error) {
    console.error('kyc_webhook_error', error);
    return jsonResponse({ error: 'update_failed', detail: error.message }, 500);
  }

  return jsonResponse({ updated: true, device_public_key: devicePublicKey }, 200);
});
