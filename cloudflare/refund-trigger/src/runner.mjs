const TARGET = 'https://tgqxxnldwiqisopiclmk.supabase.co/functions/v1/d1-custody/internal-refund-tick';
const KEY = 'trigger-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const cursor = value => value === null || (typeof value === 'string' && uuid.test(value));
const slotValid = value => Number.isSafeInteger(value) && value >= 0 && value % 60000 === 0;
const status = value => ({ status: value });

function configuration(env) {
  if (env.TARGET_URL !== TARGET || !/^[a-zA-Z0-9_-]{1,64}$/.test(env.SCOPE_ID ?? '') ||
      !/^(?:[1-9]|[1-4][0-9]|50)$/.test(env.MAX_BATCH ?? '') ||
      typeof env.GATEWAY_JWT !== 'string' || env.GATEWAY_JWT.length > 4096 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(env.GATEWAY_JWT) ||
      !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(env.REFUND_TOKEN ?? '')) throw Error();
  return { target: TARGET, maximum: Number(env.MAX_BATCH),
    scope: JSON.stringify([TARGET, env.SCOPE_ID, env.MAX_BATCH]),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GATEWAY_JWT}`,
      'x-d1-refund-token': env.REFUND_TOKEN } };
}

export async function boundedText(response, signal) {
  const reader = response.body?.getReader();
  if (!reader) throw Error();
  const bytes = new Uint8Array(1024); let length = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw Error();
      const { done, value } = await reader.read();
      if (signal?.aborted) throw Error();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.length > bytes.length - length) { cancel(); throw Error(); }
      bytes.set(value, length); length += value.length;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
  } finally { signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
}

function page(text, config, after) {
  // JSON.parse alone silently accepts duplicate keys. This endpoint has three flat fields.
  const keys = text.match(/"(?:\\.|[^"\\])*"\s*:/g) ?? [];
  if (keys.length !== 3) throw Error();
  const value = JSON.parse(text);
  if (!value || Array.isArray(value) || Object.keys(value).length !== 3 ||
      !Object.keys(value).every(key => ['processed', 'held', 'nextAfterRequestId'].includes(key))) throw Error();
  const { processed, held, nextAfterRequestId } = value;
  if (!Number.isSafeInteger(processed) || processed < 0 || processed > config.maximum ||
      !Number.isSafeInteger(held) || held < 0 || held > processed || !cursor(nextAfterRequestId) ||
      (after !== null && nextAfterRequestId !== null && nextAfterRequestId <= after)) throw Error();
  return { processed, held, nextAfterRequestId };
}

/** One durable admission, one HTTP request. Never recover or resend a saved intent. */
export async function runTick(storage, env, slot, { fetch: transport = globalThis.fetch, timeoutMs = 30000 } = {}) {
  if (env.ENABLED !== 'true') return status('disabled');
  let config, intent;
  try {
    config = configuration(env);
    if (!slotValid(slot) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error();
    const admission = await storage.transaction(async txn => {
      const old = await txn.get(KEY);
      if (old !== undefined) {
        if (!old || old.v !== 1 || old.scope !== config.scope || old.phase !== 'idle' ||
            !slotValid(old.slot) || !cursor(old.cursor)) return { result: 'blocked' };
        if (slot <= old.slot) return { result: 'duplicate' };
      }
      const next = { v: 1, scope: config.scope, slot, phase: 'in_flight', cursor: old?.cursor ?? null };
      await txn.put(KEY, next);
      return { intent: next };
    });
    if (!admission.intent) return status(admission.result);
    intent = admission.intent;
    // Do not use allowUnconfirmed or perform network I/O inside a transaction callback.
    await storage.sync();
  } catch { return status('unavailable'); }

  const controller = new AbortController(); let timer, outcome = null;
  try {
    const request = async () => {
      const response = await transport(config.target, { method: 'POST', headers: config.headers,
        body: JSON.stringify({ afterRequestId: intent.cursor }), redirect: 'error', signal: controller.signal });
      if (response.status !== 200) { void response.body?.cancel().catch(() => {}); throw Error(); }
      return page(await boundedText(response, controller.signal), config, intent.cursor);
    };
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(Error()); }, timeoutMs);
    });
    outcome = await Promise.race([request(), deadline]);
  } catch { /* Never persist exceptions, response bodies or credentials. Abort is not proof of cancellation. */ }
  finally { clearTimeout(timer); }

  try {
    await storage.transaction(async txn => {
      const saved = await txn.get(KEY);
      if (saved?.phase !== 'in_flight' || saved.scope !== intent.scope || saved.slot !== intent.slot ||
          saved.cursor !== intent.cursor) throw Error();
      await txn.put(KEY, { ...intent, phase: outcome && outcome.held === 0 ? 'idle' : 'paused',
        cursor: outcome ? outcome.nextAfterRequestId : intent.cursor, outcome });
    });
    await storage.sync();
    return status(outcome && outcome.held === 0 ? 'completed' : 'paused');
  } catch {
    // If the outcome transaction did not commit, the original intent remains blocking.
    return status('unavailable');
  }
}
