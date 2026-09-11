import { assertEquals } from 'jsr:@std/assert@1.0.14';
import { ed25519 } from 'npm:@noble/curves@2.3.0/ed25519.js';
import { authenticateDeviceRequest } from './device-auth.ts';

function encodeBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

Deno.test('accepts one valid signed request and rejects nonce replay', async () => {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = encodeBase64(ed25519.getPublicKey(privateKey));
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const canonical = ['POST', 'account-deletion', publicKey, timestamp, nonce].join('\n');
  const signature = encodeBase64(
    ed25519.sign(new TextEncoder().encode(canonical), privateKey),
  );
  const request = new Request('https://example.test/account-deletion', {
    method: 'POST',
    headers: {
      'x-device-public-key': publicKey,
      'x-device-signature': signature,
      'x-device-timestamp': timestamp,
      'x-device-nonce': nonce,
    },
  });
  const consumed = new Set<string>();
  const supabase = {
    from: () => ({
      insert: ({ nonce: value }: { nonce: string }) => {
        if (consumed.has(value)) return { error: { code: 'duplicate' } };
        consumed.add(value);
        return { error: null };
      },
    }),
  };

  assertEquals(
    await authenticateDeviceRequest(
      request,
      supabase,
      'account-deletion',
      [publicKey],
    ),
    publicKey,
  );
  assertEquals(
    await authenticateDeviceRequest(
      request,
      supabase,
      'account-deletion',
      [publicKey],
    ),
    null,
  );
});
