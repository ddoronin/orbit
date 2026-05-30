import { describe, it, expect, vi } from 'vitest';
import { QueueProducer, createQueueProducerToken } from './producer.js';

function makeQueue() {
  const sent: any[] = [];
  const batched: any[] = [];
  return {
    sent,
    batched,
    queue: {
      send: vi.fn(async (body: any, options?: any) => { sent.push({ body, options }); }),
      sendBatch: vi.fn(async (msgs: any[]) => { batched.push(msgs); }),
    },
  };
}

describe('QueueProducer', () => {
  it('send() forwards body + options', async () => {
    const { queue, sent } = makeQueue();
    const p = new QueueProducer<{ ok: boolean }>(queue);
    await p.send({ ok: true }, { delaySeconds: 30 });
    expect(sent).toEqual([{ body: { ok: true }, options: { delaySeconds: 30 } }]);
  });

  it('sendBatch() spreads options into each entry', async () => {
    const { queue, batched } = makeQueue();
    const p = new QueueProducer<{ id: number }>(queue);
    await p.sendBatch([
      { body: { id: 1 }, options: { delaySeconds: 1 } },
      { body: { id: 2 } },
    ]);
    expect(batched[0]).toEqual([
      { body: { id: 1 }, delaySeconds: 1 },
      { body: { id: 2 } },
    ]);
  });
});

describe('createQueueProducerToken', () => {
  it('produces unique symbol tokens per queue name', () => {
    const a = createQueueProducerToken('a');
    const b = createQueueProducerToken('a');
    expect(typeof a).toBe('symbol');
    expect(a).not.toBe(b); // each call produces a new token
  });
});
