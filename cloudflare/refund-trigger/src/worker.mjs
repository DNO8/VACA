import { boundedText, runTick } from './runner.mjs';

const INTERNAL = 'https://refund-trigger.internal/scheduled';
const notFound = () => new Response(null, { status: 404 });

export class RefundTrigger {
  constructor(ctx, env) { this.storage = ctx.storage; this.env = env; }
  async fetch(request) {
    if (request.url !== INTERNAL || request.method !== 'POST') return notFound();
    try {
      const text = await boundedText(request, AbortSignal.timeout(1000));
      const match = /^\{"slot":(0|[1-9][0-9]{0,15})\}$/.exec(text);
      if (!match) return notFound();
      const result = await runTick(this.storage, this.env, Number(match[1]));
      return Response.json(result, { headers: { 'cache-control': 'no-store' } });
    } catch { return notFound(); }
  }
}

export default {
  fetch() { return notFound(); },
  async scheduled(controller, env) {
    if (env.ENABLED !== 'true' || controller.cron !== '* * * * *' ||
        !Number.isSafeInteger(controller.scheduledTime) || controller.scheduledTime < 0) return;
    try {
      const object = env.REFUND_TRIGGER.get(env.REFUND_TRIGGER.idFromName('refund-trigger-v1'));
      const response = await object.fetch(new Request(INTERNAL, { method: 'POST',
        body: JSON.stringify({ slot: Math.floor(controller.scheduledTime / 60000) * 60000 }) }));
      // Sanitized operational signal only. Never log a response, token, cursor or thrown diagnostic.
      const value = response.status === 200 ? JSON.parse(await boundedText(response)) : null;
      const status = ['disabled', 'completed', 'paused', 'blocked', 'duplicate', 'unavailable'].includes(value?.status)
        ? value.status : 'unavailable';
      console.log(JSON.stringify({ event: 'refund_trigger', status }));
    } catch { console.log(JSON.stringify({ event: 'refund_trigger', status: 'unavailable' })); }
  },
};
