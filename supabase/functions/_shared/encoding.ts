// @ts-nocheck
// Helpers de codificacion/decodificacion para funciones Edge (Deno).
// No dependen de librerias externas para evitar problemas de red en entornos
// restrictivos.

const base64abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const base64codes = new Uint8Array(256);
for (let i = 0; i < base64abc.length; i++) {
  base64codes[base64abc.charCodeAt(i)] = i;
}

export function encodeBase64(bytes: Uint8Array): string {
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

export function decodeBase64(value: string): Uint8Array {
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
