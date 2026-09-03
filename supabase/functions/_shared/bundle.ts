// @ts-nocheck
// Helpers de CBOR, firma Ed25519 y descifrado AES-GCM para bundles VACA.
// Se ejecuta en Deno (Supabase Edge Functions).

import { Decoder, Encoder } from 'npm:cbor-x';
import { ed25519 } from 'npm:@noble/curves/ed25519';
import { gcm } from 'npm:@noble/ciphers/aes';
import { decodeBase64, encodeBase64 } from './encoding.ts';

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

export interface BundleShape {
  version: number;
  header: Map<unknown, unknown>;
  ciphertext: Uint8Array;
  wrappedKey: Uint8Array;
}

export interface DecryptedPayload {
  categoryIndex: number;
  priorityIndex: number;
  peopleCount?: number;
  shortNote?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  locationSourceIndex: number;
  identityAssuranceIndex: number;
  attachmentManifest: Array<{
    contentHash: string;
    sizeBytes: number;
    kindIndex: number;
  }>;
  replacesMessageId?: string;
}

export function decodeBundle(bytes: Uint8Array): BundleShape {
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

export function getHeaderBytes(header: Map<unknown, unknown>): Uint8Array {
  const payloadHash = header.get('H') as Uint8Array;
  if (!payloadHash) throw new Error('payload_hash_missing');

  // Copia protegida: elimina la firma ('s') y re-codifica deterministicamente.
  const protectedHeader = new Map(header);
  protectedHeader.delete('s');
  const protectedCbor = encoder.encode(protectedHeader);

  return concatBytes(protectedCbor, payloadHash);
}

export function verifyBundleSignature(
  header: Map<unknown, unknown>,
  originPublicKey: Uint8Array,
): boolean {
  const signature = header.get('s') as Uint8Array;
  if (!signature) throw new Error('signature_missing');

  const signedMessage = getHeaderBytes(header);
  return ed25519.verify(signature, signedMessage, originPublicKey);
}

export function decryptBundlePayload(
  header: Map<unknown, unknown>,
  ciphertext: Uint8Array,
  wrappedKey: Uint8Array,
  bundleKey: Uint8Array,
): Uint8Array {
  const nonce = header.get('n') as Uint8Array;
  if (!nonce || nonce.length !== 12) throw new Error('nonce_invalido');

  // Descifra la clave de contenido.
  const contentKey = gcm(bundleKey, nonce, new Uint8Array(0)).decrypt(wrappedKey);
  // Descifra el payload.
  return gcm(contentKey, nonce, new Uint8Array(0)).decrypt(ciphertext);
}

export function decodePayloadJson(bytes: Uint8Array): DecryptedPayload {
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

export function signReceipt(messageId: string, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(new TextEncoder().encode(messageId), privateKey);
}

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export { decodeBase64, encodeBase64 };
