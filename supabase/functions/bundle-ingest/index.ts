// @ts-nocheck
// Supabase Edge Function: bundle-ingest
// Ingesta un bundle VACA firmado por un dispositivo, valida, persiste y
// devuelve un recibo firmado por el servidor.
//
// Los helpers de _shared/ estan inliniados porque el editor web de Supabase
// no soporta imports relativos; se mantienen en _shared para deploy por CLI.

import { createClient } from 'npm:@supabase/supabase-js';
import { Decoder, Encoder } from 'npm:cbor-x';
import { ed25519 } from 'npm:@noble/curves/ed25519';
import { gcm } from 'npm:@noble/ciphers/aes';

// Helpers de codificacion/decodificacion base64.

const base64abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const base64codes = new Uint8Array(256);
for (let i = 0; i < base64abc.length; i++) {
  base64codes[base64abc.charCodeAt(i)] = i;
}

function encodeBase64(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const b1 = bytes[i++];
    const b2 = i < len ? bytes[i++] : 0;
    const b3 = i < len ? bytes[i++] : 0;
    result += base64abc[b1 >> 2];
    result += base64abc[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += i - 1 < len ? base64abc[((b2 & 0x0f) << 2) | (b3 >> 6)] : '=';
    result += i < len ? base64abc[b3 & 0x3f] : '=';
  }
  return result;
}

function decodeBase64(value: string): Uint8Array {
  const len = value.length;
  let groups = 0;
  for (let i = 0; i < len; i++) {
    if (value[i] === '=') break;
    groups++;
  }
  const pad = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const outLen = Math.floor((groups + pad) / 4) * 3 - pad;
  const out = new Uint8Array(outLen);
  let j = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const c = value[i];
    if (c === '=') break;
    const code = base64codes[c.charCodeAt(0)];
    buffer = (buffer << 6) | code;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buffer >> bits) & 0xff;
      buffer = buffer & ((1 << bits) - 1);
    }
  }
  return out;
}

// Helpers de CBOR, firma Ed25519 y descifrado AES-GCM para bundles VACA.

function decodeBundle(
  bytes: Uint8Array,
): { version: number; header: Map<unknown, unknown>; ciphertext: Uint8Array; wrappedKey: Uint8Array } {
  const map = decoder.decode(bytes) as Map<unknown, unknown>;
  if (!(map instanceof Map)) {
    throw new Error('bundle_no_es_mapa');
  }

  const version = map.get('v') as number;
  const header = map.get('h') as Map<unknown, unknown>;
  const ciphertext = map.get('c') as Uint8Array;
  const wrappedKey = map.get('w') as Uint8Array;

  if (!header || !(header instanceof Map)) {
    throw new Error('header_invalido');
  }
  if (!ciphertext || !(ciphertext instanceof Uint8Array)) {
    throw new Error('ciphertext_invalido');
  }
  if (!wrappedKey || !(wrappedKey instanceof Uint8Array)) {
    throw new Error('wrapped_key_invalido');
  }

  return { version, header, ciphertext, wrappedKey };
}

function getHeaderBytes(header: Map<unknown, unknown>): Uint8Array {
  const payloadHash = header.get('H') as Uint8Array;
  if (!payloadHash) throw new Error('payload_hash_missing');

  const protectedHeader = new Map(header);
  protectedHeader.delete('s');
  const protectedCbor = encoder.encode(protectedHeader);

  return concatBytes(protectedCbor, payloadHash);
}

function verifyBundleSignature(
  header: Map<unknown, unknown>,
  originPublicKey: Uint8Array,
): boolean {
  const signature = header.get('s') as Uint8Array;
  if (!signature) throw new Error('signature_missing');

  const signedMessage = getHeaderBytes(header);
  return ed25519.verify(signature, signedMessage, originPublicKey);
}

function decryptBundlePayload(
  header: Map<unknown, unknown>,
  ciphertext: Uint8Array,
  wrappedKey: Uint8Array,
  bundleKey: Uint8Array,
): Uint8Array {
  const nonce = header.get('n') as Uint8Array;
  if (!nonce || nonce.length !== 12) throw new Error('nonce_invalido');

  const contentKey = gcm(bundleKey, nonce, new Uint8Array(0)).decrypt(wrappedKey);
  return gcm(contentKey, nonce, new Uint8Array(0)).decrypt(ciphertext);
}

function decodePayloadJson(bytes: Uint8Array): {
  categoryIndex: number;
  priorityIndex: number;
  peopleCount?: number;
  shortNote?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  locationSourceIndex: number;
  identityAssuranceIndex: number;
  attachmentManifest: Array<{ contentHash: string; sizeBytes: number; kindIndex: number }>;
  replacesMessageId?: string;
} {
  const text = new TextDecoder().decode(bytes);
  const raw = JSON.parse(text);

  const manifest = (raw.attachmentManifest || []).map((entry: unknown) => {
    const e = entry as Record<string, unknown>;
    return {
      contentHash: String(e.contentHash),
      sizeBytes: Number(e.sizeBytes),
      kindIndex: Number(e.kindIndex),
    };
  });

  return {
    categoryIndex: Number(raw.categoryIndex),
    priorityIndex: Number(raw.priorityIndex),
    peopleCount: raw.peopleCount == null ? undefined : Number(raw.peopleCount),
    shortNote: raw.shortNote == null ? undefined : String(raw.shortNote),
    latitude: raw.latitude == null ? undefined : Number(raw.latitude),
    longitude: raw.longitude == null ? undefined : Number(raw.longitude),
    accuracyMeters: raw.accuracyMeters == null ? undefined : Number(raw.accuracyMeters),
    locationSourceIndex: Number(raw.locationSourceIndex),
    identityAssuranceIndex: Number(raw.identityAssuranceIndex),
    attachmentManifest: manifest,
    replacesMessageId: raw.replacesMessageId == null ? undefined : String(raw.replacesMessageId),
  };
}

function signReceipt(messageId: string, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(new TextEncoder().encode(messageId), privateKey);
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

const decoder = new Decoder({
  useMaps: true,
  useRecords: false,
  tagUint8Array: false,
});

const encoder = new Encoder({
  useMaps: true,
  useRecords: false,
  tagUint8Array: false,
});

const categoryByIndex = ['sos', 'medical', 'person', 'hazard', 'coordination'];
const locationSourceByIndex = ['gps', 'manual', 'unavailable'];
const identityAssuranceByIndex = ['unverified', 'verified', 'expired'];
const eventTypeByIndex = ['created', 'updated', 'cancelled', 'receipt'];
const attachmentKindByIndex = ['photo', 'thumbnail'];

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
  const bundleKeyB64 = Deno.env.get('SERVER_BUNDLE_KEY');
  const receiptPrivateKeyB64 = Deno.env.get('SERVER_RECEIPT_PRIVATE_KEY');

  if (!supabaseUrl || !supabaseServiceRoleKey || !bundleKeyB64 || !receiptPrivateKeyB64) {
    return jsonResponse({ error: 'server_not_configured' }, 503);
  }

  const originPublicKeyB64 = req.headers.get('x-origin-public-key');
  if (!originPublicKeyB64) {
    return jsonResponse({ error: 'origin_public_key_missing' }, 400);
  }

  let bundleKey: Uint8Array;
  let receiptPrivateKey: Uint8Array;
  let originPublicKey: Uint8Array;

  try {
    bundleKey = decodeBase64(bundleKeyB64);
    receiptPrivateKey = decodeBase64(receiptPrivateKeyB64);
    originPublicKey = decodeBase64(originPublicKeyB64);
  } catch (_e) {
    return jsonResponse({ error: 'invalid_base64_key' }, 400);
  }

  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length === 0) {
    return jsonResponse({ error: 'empty_body' }, 400);
  }

  let bundle;
  try {
    bundle = decodeBundle(body);
  } catch (e) {
    return jsonResponse({ error: 'bundle_decode_failed', detail: String(e) }, 400);
  }

  if (bundle.version !== 1) {
    return jsonResponse({ error: 'unsupported_protocol_version', version: bundle.version }, 400);
  }

  let signatureValid = false;
  try {
    signatureValid = verifyBundleSignature(bundle.header, originPublicKey);
  } catch (_e) {
    signatureValid = false;
  }
  if (!signatureValid) {
    return jsonResponse({ error: 'signature_verification_failed' }, 401);
  }

  let payload;
  try {
    const plaintext = decryptBundlePayload(bundle.header, bundle.ciphertext, bundle.wrappedKey, bundleKey);
    payload = decodePayloadJson(plaintext);
  } catch (e) {
    return jsonResponse({ error: 'decryption_failed', detail: String(e) }, 400);
  }

  const header = bundle.header;
  const messageId = String(header.get('m'));
  const incidentId = String(header.get('i'));
  const eventTypeIndex = Number(header.get('e'));
  const originCredentialRef = header.get('o') as Uint8Array;
  const payloadHash = header.get('H') as Uint8Array;
  const timestampMs = Number(header.get('c'));
  const expiresAtMs = Number(header.get('x'));

  if (!messageId || !incidentId) {
    return jsonResponse({ error: 'missing_message_or_incident_id' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  // Idempotencia: si ya existe el message_id, devolvemos el recibo anterior.
  const { data: existingReceipt } = await supabase
    .from('server_receipts')
    .select('message_id, receipt_signature')
    .eq('message_id', messageId)
    .maybeSingle();

  if (existingReceipt) {
    const sig = typeof existingReceipt.receipt_signature === 'string'
      ? existingReceipt.receipt_signature
      : encodeBase64(existingReceipt.receipt_signature);
    return jsonResponse({ message_id: messageId, signature: sig }, 200);
  }

  const category = categoryByIndex[payload.categoryIndex] ?? 'other';
  const priority = payload.priorityIndex ?? 0;
  const locationSource = locationSourceByIndex[payload.locationSourceIndex] ?? 'unknown';
  const identityAssurance = identityAssuranceByIndex[payload.identityAssuranceIndex] ?? 'unverified';
  const eventType = eventTypeByIndex[eventTypeIndex] ?? 'create';

  const timestamp = timestampMs ? new Date(timestampMs).toISOString() : new Date().toISOString();
  const expiresAt = expiresAtMs
    ? new Date(expiresAtMs).toISOString()
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const now = new Date().toISOString();

  try {
    // Upsert identidad opaca vinculada a la clave publica.
    await supabase.from('identities').upsert(
      {
        device_public_key: originPublicKeyB64,
      },
      { onConflict: 'device_public_key', ignoreDuplicates: true },
    );

    // Crea o actualiza el incidente.
    await supabase.from('incidents').upsert(
      {
        incident_id: incidentId,
        reporter_credential_ref: encodeBase64(originCredentialRef),
        category,
        priority,
        people_count: payload.peopleCount,
        short_note: payload.shortNote,
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy_meters: payload.accuracyMeters,
        location_source: locationSource,
        identity_assurance: identityAssurance,
        status: eventType === 'cancelled' ? 'cancellationReceived' : 'received',
        updated_at: now,
      },
      { onConflict: 'incident_id' },
    );

    // Registra el evento append-only.
    await supabase.from('incident_events').upsert(
      {
        incident_id: incidentId,
        event_type: eventType,
        message_id: messageId,
        payload_hash: encodeBase64(payloadHash),
        signer: originPublicKeyB64,
        signature: encodeBase64(header.get('s') as Uint8Array),
        timestamp,
      },
      { onConflict: 'message_id' },
    );

    // Registra adjuntos pendientes.
    for (const attachment of payload.attachmentManifest) {
      await supabase.from('attachments').upsert(
        {
          incident_id: incidentId,
          content_hash: attachment.contentHash,
          size_bytes: attachment.sizeBytes,
          kind: attachmentKindByIndex[attachment.kindIndex] ?? 'unknown',
        },
        { onConflict: 'incident_id, content_hash', ignoreDuplicates: true },
      );
    }

    // Almacena el bundle origen para auditoria.
    await supabase.from('origin_bundles').upsert(
      {
        message_id: messageId,
        incident_id: incidentId,
        event_id: messageId,
        protocol_version: bundle.version,
        canonical_header: encodeBase64(encoder.encode(header)),
        ciphertext: encodeBase64(bundle.ciphertext),
        wrapped_key: encodeBase64(bundle.wrappedKey),
        payload_hash: encodeBase64(payloadHash),
        origin_public_key: originPublicKeyB64,
        expires_at: expiresAt,
        state: 'received',
      },
      { onConflict: 'message_id' },
    );

    // Marca idempotencia.
    await supabase.from('idempotency_keys').upsert(
      {
        message_id: messageId,
        payload_hash: encodeBase64(payloadHash),
        status: 'received',
      },
      { onConflict: 'message_id' },
    );

    // Firma y devuelve recibo.
    const receiptSignature = signReceipt(messageId, receiptPrivateKey);
    const receiptSignatureB64 = encodeBase64(receiptSignature);

    await supabase.from('server_receipts').insert({
      message_id: messageId,
      receipt_signature: receiptSignatureB64,
    });

    return jsonResponse({ message_id: messageId, signature: receiptSignatureB64 }, 200);
  } catch (e) {
    console.error('ingest_error', e);
    return jsonResponse({ error: 'ingest_failed', detail: String(e) }, 500);
  }
});
