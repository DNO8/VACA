import { ed25519 } from 'npm:@noble/curves@2.3.0/ed25519.js';

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function authenticateDeviceRequest(
  req: Request,
  supabase: { from: (table: string) => any },
  operation: string,
  fields: string[],
): Promise<string | null> {
  const publicKey = req.headers.get('x-device-public-key') ?? '';
  const signature = req.headers.get('x-device-signature') ?? '';
  const nonce = req.headers.get('x-device-nonce') ?? '';
  const timestamp = req.headers.get('x-device-timestamp') ?? '';
  const parsedTimestamp = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (
    !publicKey ||
    !signature ||
    !nonce ||
    !Number.isInteger(parsedTimestamp) ||
    Math.abs(now - parsedTimestamp) > 300
  ) {
    return null;
  }

  try {
    const keyBytes = decodeBase64(publicKey);
    const signatureBytes = decodeBase64(signature);
    if (keyBytes.length !== 32 || signatureBytes.length !== 64) return null;
    const canonical = ['POST', operation, ...fields, timestamp, nonce].join('\n');
    if (!ed25519.verify(signatureBytes, new TextEncoder().encode(canonical), keyBytes)) {
      return null;
    }
    const { error } = await supabase.from('request_nonces').insert({
      nonce,
      device_public_key: publicKey,
      expires_at: new Date((parsedTimestamp + 600) * 1000).toISOString(),
    });
    return error ? null : publicKey;
  } catch (_error) {
    return null;
  }
}
