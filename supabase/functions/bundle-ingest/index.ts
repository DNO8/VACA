// @ts-nocheck
// Supabase Edge Function: bundle-ingest
// Ingesta un bundle VACA firmado por un dispositivo, valida, persiste y
// devuelve un recibo firmado por el servidor.
//
// Los helpers de _shared/ estan inliniados porque el editor web de Supabase
// no soporta imports relativos; se mantienen en _shared para deploy por CLI.

import { createClient } from "npm:@supabase/supabase-js@2.115.0";
import { Decoder, Encoder } from "npm:cbor-x@1.6.5";
import { ed25519, x25519 } from "npm:@noble/curves@2.3.0/ed25519.js";
import { gcm } from "npm:@noble/ciphers@2.3.0/aes.js";
import {
  maxBundleBytes,
  validateIngest,
} from "../_shared/ingest-validation.ts";

// Helpers de codificacion/decodificacion base64.

const base64abc =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const base64codes = new Uint8Array(256);
for (let i = 0; i < base64abc.length; i++) {
  base64codes[base64abc.charCodeAt(i)] = i;
}

function encodeBase64(bytes: Uint8Array): string {
  let result = "";
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const b1 = bytes[i++];
    const b2 = i < len ? bytes[i++] : 0;
    const b3 = i < len ? bytes[i++] : 0;
    result += base64abc[b1 >> 2];
    result += base64abc[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += i - 1 < len ? base64abc[((b2 & 0x0f) << 2) | (b3 >> 6)] : "=";
    result += i < len ? base64abc[b3 & 0x3f] : "=";
  }
  return result;
}

function decodeBase64(value: string): Uint8Array {
  const len = value.length;
  let groups = 0;
  for (let i = 0; i < len; i++) {
    if (value[i] === "=") break;
    groups++;
  }
  const pad = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const outLen = Math.floor((groups + pad) / 4) * 3 - pad;
  const out = new Uint8Array(outLen);
  let j = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const c = value[i];
    if (c === "=") break;
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
): {
  version: number;
  header: Map<unknown, unknown>;
  ciphertext: Uint8Array;
  wrappedKey: Uint8Array;
} {
  const map = decoder.decode(bytes) as Map<unknown, unknown>;
  if (!(map instanceof Map)) {
    throw new Error("bundle_no_es_mapa");
  }

  const version = map.get("v") as number;
  const header = map.get("h") as Map<unknown, unknown>;
  const ciphertext = map.get("c") as Uint8Array;
  const wrappedKey = map.get("w") as Uint8Array;

  if (!header || !(header instanceof Map)) {
    throw new Error("header_invalido");
  }
  if (!ciphertext || !(ciphertext instanceof Uint8Array)) {
    throw new Error("ciphertext_invalido");
  }
  if (!wrappedKey || !(wrappedKey instanceof Uint8Array)) {
    throw new Error("wrapped_key_invalido");
  }

  return { version, header, ciphertext, wrappedKey };
}

function getHeaderBytes(header: Map<unknown, unknown>): Uint8Array {
  const payloadHash = header.get("H") as Uint8Array;
  if (!payloadHash) throw new Error("payload_hash_missing");

  const protectedHeader = new Map(header);
  protectedHeader.delete("s");
  const protectedCbor = encoder.encode(protectedHeader);

  return concatBytes(protectedCbor, payloadHash);
}

function verifyBundleSignature(
  header: Map<unknown, unknown>,
  originPublicKey: Uint8Array,
): boolean {
  const signature = header.get("s") as Uint8Array;
  if (!signature) throw new Error("signature_missing");

  const signedMessage = getHeaderBytes(header);
  return ed25519.verify(signature, signedMessage, originPublicKey);
}

async function decryptBundlePayload(
  header: Map<unknown, unknown>,
  ciphertext: Uint8Array,
  wrappedKey: Uint8Array,
  recipientPrivateKey: Uint8Array,
): Promise<Uint8Array> {
  const nonce = header.get("n") as Uint8Array;
  const wrapNonce = header.get("N") as Uint8Array;
  const ephemeralPublicKey = header.get("K") as Uint8Array;
  if (!nonce || nonce.length !== 12) throw new Error("nonce_invalido");
  if (!wrapNonce || wrapNonce.length !== 12) {
    throw new Error("wrap_nonce_invalido");
  }
  if (!ephemeralPublicKey || ephemeralPublicKey.length !== 32) {
    throw new Error("ephemeral_key_invalida");
  }

  const sharedSecret = x25519.getSharedSecret(
    recipientPrivateKey,
    ephemeralPublicKey,
  );
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const wrapKey = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: wrapNonce,
        info: new TextEncoder().encode("vaca:bundle-wrap:v2"),
      },
      hkdfKey,
      256,
    ),
  );
  const contentKey = gcm(wrapKey, wrapNonce, new Uint8Array(0)).decrypt(
    wrappedKey,
  );
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
  attachmentManifest: Array<
    { contentHash: string; sizeBytes: number; kindIndex: number }
  >;
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
    accuracyMeters: raw.accuracyMeters == null
      ? undefined
      : Number(raw.accuracyMeters),
    locationSourceIndex: Number(raw.locationSourceIndex),
    identityAssuranceIndex: Number(raw.identityAssuranceIndex),
    attachmentManifest: manifest,
    replacesMessageId: raw.replacesMessageId == null
      ? undefined
      : String(raw.replacesMessageId),
  };
}

function signReceipt(
  receiptId: string,
  messageId: string,
  payloadHash: string,
  serverReceivedAt: string,
  serverKeyId: string,
  privateKey: Uint8Array,
): Uint8Array {
  const canonical = [
    receiptId,
    messageId,
    payloadHash,
    serverReceivedAt,
    serverKeyId,
  ].join("\n");
  return ed25519.sign(new TextEncoder().encode(canonical), privateKey);
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
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

const categoryByIndex = ["sos", "medical", "person", "hazard", "coordination"];
const locationSourceByIndex = ["gps", "manual", "unavailable"];
const identityAssuranceByIndex = [
  "unverified",
  "verified",
  "expired",
  "revoked",
];
const eventTypeByIndex = ["created", "updated", "cancelled", "receipt"];
const attachmentKindByIndex = ["photo", "thumbnail"];

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBundleBytes) {
    return jsonResponse({ error: "body_too_large" }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bundlePrivateKeyB64 = Deno.env.get("SERVER_BUNDLE_PRIVATE_KEY");
  const receiptPrivateKeyB64 = Deno.env.get("SERVER_RECEIPT_PRIVATE_KEY");
  const receiptKeyId = Deno.env.get("SERVER_RECEIPT_KEY_ID");

  if (
    !supabaseUrl ||
    !supabaseServiceRoleKey ||
    !bundlePrivateKeyB64 ||
    !receiptPrivateKeyB64 ||
    !receiptKeyId
  ) {
    return jsonResponse({ error: "server_not_configured" }, 503);
  }

  const originPublicKeyB64 = req.headers.get("x-origin-public-key");
  if (!originPublicKeyB64) {
    return jsonResponse({ error: "origin_public_key_missing" }, 400);
  }

  let bundlePrivateKey: Uint8Array;
  let receiptPrivateKey: Uint8Array;
  let originPublicKey: Uint8Array;

  try {
    bundlePrivateKey = decodeBase64(bundlePrivateKeyB64);
    receiptPrivateKey = decodeBase64(receiptPrivateKeyB64);
    originPublicKey = decodeBase64(originPublicKeyB64);
  } catch (_e) {
    return jsonResponse({ error: "invalid_base64_key" }, 400);
  }
  if (
    bundlePrivateKey.length !== 32 || receiptPrivateKey.length !== 32 ||
    originPublicKey.length !== 32
  ) {
    return jsonResponse({ error: "invalid_key_length" }, 400);
  }

  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length === 0) {
    return jsonResponse({ error: "empty_body" }, 400);
  }
  if (body.length > maxBundleBytes) {
    return jsonResponse({ error: "body_too_large" }, 413);
  }

  let bundle;
  try {
    bundle = decodeBundle(body);
  } catch (e) {
    return jsonResponse(
      { error: "bundle_decode_failed", detail: String(e) },
      400,
    );
  }

  if (bundle.version !== 2) {
    return jsonResponse({
      error: "unsupported_protocol_version",
      version: bundle.version,
    }, 400);
  }

  let signatureValid = false;
  try {
    signatureValid = verifyBundleSignature(bundle.header, originPublicKey);
  } catch (_e) {
    signatureValid = false;
  }
  if (!signatureValid) {
    return jsonResponse({ error: "signature_verification_failed" }, 401);
  }

  let payload;
  try {
    const plaintext = await decryptBundlePayload(
      bundle.header,
      bundle.ciphertext,
      bundle.wrappedKey,
      bundlePrivateKey,
    );
    const expectedPayloadHash = bundle.header.get("H") as Uint8Array;
    const actualPayloadHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", plaintext),
    );
    if (
      !expectedPayloadHash ||
      !equalBytes(expectedPayloadHash, actualPayloadHash)
    ) {
      throw new Error("payload_hash_invalido");
    }
    payload = decodePayloadJson(plaintext);
  } catch (e) {
    return jsonResponse({ error: "decryption_failed", detail: String(e) }, 400);
  }

  const header = bundle.header;
  const messageId = String(header.get("m"));
  const incidentId = String(header.get("i"));
  const eventTypeIndex = Number(header.get("e"));
  const originCredentialRef = header.get("o") as Uint8Array;
  const payloadHash = header.get("H") as Uint8Array;
  const timestampMs = Number(header.get("c"));
  const expiresAtMs = Number(header.get("x"));

  const validationError = validateIngest({
    messageId,
    incidentId,
    eventTypeIndex,
    createdAtMs: timestampMs,
    expiresAtMs,
    payloadLength: Number(header.get("l")),
    ciphertextLength: bundle.ciphertext.length,
    payload,
  });
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  // Idempotencia: si ya existe el message_id, devolvemos el recibo anterior.
  const { data: existingReceipt } = await supabase
    .from("server_receipts")
    .select(
      "id, message_id, payload_hash, server_received_at, server_key_id, receipt_signature",
    )
    .eq("message_id", messageId)
    .maybeSingle();

  if (existingReceipt) {
    if (existingReceipt.payload_hash !== encodeBase64(payloadHash)) {
      return jsonResponse({ error: "idempotency_conflict" }, 409);
    }
    const sig = typeof existingReceipt.receipt_signature === "string"
      ? existingReceipt.receipt_signature
      : encodeBase64(existingReceipt.receipt_signature);
    return jsonResponse(
      {
        receipt_id: existingReceipt.id,
        message_id: existingReceipt.message_id,
        payload_hash: existingReceipt.payload_hash,
        server_received_at: existingReceipt.server_received_at,
        server_key_id: existingReceipt.server_key_id,
        signature: sig,
      },
      200,
    );
  }

  const category = categoryByIndex[payload.categoryIndex] ?? "other";
  const priority = payload.priorityIndex ?? 0;
  const locationSource = locationSourceByIndex[payload.locationSourceIndex] ??
    "unknown";
  const identityAssurance =
    identityAssuranceByIndex[payload.identityAssuranceIndex] ?? "unverified";
  const eventType = eventTypeByIndex[eventTypeIndex] ?? "create";

  const timestamp = timestampMs
    ? new Date(timestampMs).toISOString()
    : new Date().toISOString();
  const expiresAt = expiresAtMs
    ? new Date(expiresAtMs).toISOString()
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const now = new Date().toISOString();
  const receiptId = crypto.randomUUID();
  const payloadHashB64 = encodeBase64(payloadHash);
  const serverReceivedAt = new Date().toISOString();
  const receiptSignatureB64 = encodeBase64(
    signReceipt(
      receiptId,
      messageId,
      payloadHashB64,
      serverReceivedAt,
      receiptKeyId,
      receiptPrivateKey,
    ),
  );

  try {
    // Upsert identidad opaca vinculada a la clave publica.
    // Crea o actualiza el incidente.
    // Registra el evento append-only.
    // Registra adjuntos pendientes.
    // Almacena el bundle origen para auditoria.
    // Marca idempotencia.
    // Firma y devuelve recibo.
    const { data, error } = await supabase.rpc("accept_bundle", {
      p_origin_public_key: originPublicKeyB64,
      p_incident: {
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
        status: eventType === "cancelled" ? "cancellationReceived" : "received",
        updated_at: now,
      },
      p_event: {
        incident_id: incidentId,
        event_type: eventType,
        message_id: messageId,
        payload_hash: payloadHashB64,
        signer: originPublicKeyB64,
        signature: encodeBase64(header.get("s") as Uint8Array),
        timestamp,
      },
      p_bundle: {
        protocol_version: bundle.version,
        canonical_header: encodeBase64(encoder.encode(header)),
        ciphertext: encodeBase64(bundle.ciphertext),
        wrapped_key: encodeBase64(bundle.wrappedKey),
        expires_at: expiresAt,
      },
      p_attachments: payload.attachmentManifest.map((attachment) => ({
        content_hash: attachment.contentHash,
        size_bytes: attachment.sizeBytes,
        kind: attachmentKindByIndex[attachment.kindIndex],
      })),
      p_receipt: {
        receipt_id: receiptId,
        server_received_at: serverReceivedAt,
        server_key_id: receiptKeyId,
        receipt_signature: receiptSignatureB64,
      },
    });
    if (error) {
      if (String(error.message).includes("idempotency_conflict")) {
        return jsonResponse({ error: "idempotency_conflict" }, 409);
      }
      if (String(error.message).includes("incident_origin_conflict")) {
        return jsonResponse({ error: "incident_origin_conflict" }, 403);
      }
      throw error;
    }
    const accepted = Array.isArray(data) ? data[0] : data;
    if (!accepted) throw new Error("acceptance_missing");
    return jsonResponse(
      {
        receipt_id: accepted.receipt_id,
        message_id: accepted.message_id,
        payload_hash: accepted.payload_hash,
        server_received_at: accepted.server_received_at,
        server_key_id: accepted.server_key_id,
        signature: accepted.receipt_signature,
      },
      200,
    );
  } catch (e) {
    console.error("ingest_error", e);
    return jsonResponse({ error: "ingest_failed", detail: String(e) }, 500);
  }
});
